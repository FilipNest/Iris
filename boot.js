/*jslint nomen: true, node:true */
"use strict";

module.exports = function (config) {

  //Create global object for the application, remove existing

  global.iris = {};

  var path = require('path');

  //Store helper paths

  iris.rootPath = __dirname;
  iris.sitePath = process.cwd();

  //Make config folder

  var fs = require('fs');

  var mkdirSync = function (path) {
    try {
      fs.mkdirSync(path);
    } catch (e) {
      if (e.code != 'EEXIST') throw e;
    }
  }

  mkdirSync(iris.sitePath + "/" + "configurations");

  iris.configStore = {};

  iris.configPath = path.join(iris.sitePath, "/configurations");

  iris.saveConfig = function (contents, directory, filename, callback) {

    var current = iris.configStore;

    directory.split("/").forEach(function (path) {

      if (!current[path]) {

        current[path] = {};

      }

      current = current[path];

    });

    current[filename] = contents;

    var filePath = path.join(iris.sitePath, "/configurations", directory);

    var mkdirp = require('mkdirp');

    mkdirp(filePath, function (err) {
      if (err) {
        console.error(err)
      } else {
        fs.writeFile(filePath + "/" + filename + ".json", JSON.stringify(contents), "utf8", callback);
      }
    });

  };

  iris.deleteConfig = function (directory, filename, callback) {
    var splitDirectory = directory.split('/');

    // Get last parts of the directory, used as key in config store
    var configStoreCategory = splitDirectory[splitDirectory.length - 2];
    var configStoreInstance = splitDirectory[splitDirectory.length - 1];

    // Delete it from config store, if present
    if (iris.configStore[configStoreCategory][configStoreInstance][filename]) {

      delete iris.configStore[configStoreCategory][configStoreInstance][filename];

    }



    var filePath = path.join(iris.sitePath, "/configurations", directory);

    filePath = filePath + '/' + filename + '.json';

    fs.unlink(filePath, function (err) {

      if (err) {

        // Return err = true
        callback(true);

      } else {

        callback(false);

      }

    });

  };

  iris.readConfig = function (directory, filename) {

    return new Promise(function (yes, no) {

      function defined(ref, strNames) {
        var name;
        var arrNames = strNames.split('/');

        while (name = arrNames.shift()) {
          if (!ref.hasOwnProperty(name)) return false;
          ref = ref[name];
        }

        return ref;
      }

      var exists = defined(iris.configStore, directory + "/" + filename);

      if (exists) {

        yes(exists);

      } else {

        try {

          var contents = JSON.parse(fs.readFileSync(iris.sitePath + "/configurations" + "/" + directory + "/" + filename + ".json", "utf8"));

          iris.saveConfig(contents, directory, filename);

          yes(contents);

        } catch (e) {

          no("No such config exists");

        }

      }

    });

  };

  //Make files directory

  mkdirSync(iris.sitePath + "/" + "files");

  //Fetch command line parameters

  var parameters = {};

  process.argv.forEach(function (val, index, array) {

    if (val.indexOf("=") !== -1) {
      val = val.split("=");
      parameters[val[0]] = val[1];
    }

  });

  //Get any config parameters passed through via the command line and set them.

  if (Object.keys(parameters).length > 1) {

    console.log("Command line arguments: ");

    Object.keys(parameters).forEach(function (paramater) {

      if (paramater !== "site") {

        console.log(paramater, ":", parameters[paramater]);
        config[paramater] = parameters[paramater];

      }

    })

  }

  //Store config object for global use

  iris.config = config;

  console.log("\nLaunching server");

  //Hook system

  iris.hook = require('./hook');

  //Load in helper utilities

  require('./utils');

  //Require HTTP sever

  require('./server');

  //Require sockets

  require('./sockets');

  //Load in module system

  require('./modules');

  //Set up database

  require('./db');

  iris.status = {

    ready: false

  };

  // Create iris modules object

  iris.modules = {};

  mongoose.connection.once("open", function () {

    //Core modules

    require('./core_modules/auth/auth.js');

    iris.hook("hook_module_init_auth", "root", null, null).then(function (success) {

      console.log("Auth module loaded")

    }, function (fail) {

      if (fail === "No such hook exists") {

        console.log("Auth module loaded")

      } else {

        console.log("Failed to initialise auth module", fail)

      }

    });

    require('./core_modules/entity/entity.js');

    iris.hook("hook_module_init_entity", "root", null, null).then(function (success) {

      console.log("Auth module loaded")

    }, function (fail) {

      if (fail === "No such hook exists") {

        console.log("Entity module loaded")

      } else {

        console.log("Failed to initialise entity module", fail)

      }

    });

    require('./core_modules/frontend/frontend.js');

    require('./core_modules/forms/forms.js');

    require('./core_modules/entity2/entity2.js');

    require('./core_modules/filefield/filefield.js');

    require('./core_modules/menu/menu.js');

    require('./core_modules/admin_ui/admin_ui.js');

    require('./core_modules/user/user.js');

    require('./core_modules/paths/paths.js');

    //Load logging module

    require('./log');

    //Read enabled modules

    console.log("Loading modules.");

    iris.enabledModules = JSON.parse(fs.readFileSync(process.cwd() + '/enabled_modules.json'));

    console.log(" ");

    iris.enabledModules.forEach(function (enabledModule, index) {

      try {

        fs.readFileSync(__dirname + enabledModule.path + "/" + enabledModule.name + ".js");

      } catch (e) {

        console.log("can't find module " + enabledModule.name)
        return false;

      }

      require(__dirname + enabledModule.path + "/" + enabledModule.name + ".js");

      iris.hook("hook_module_init_" + enabledModule.name, "root", null, null).then(function (success) {

        console.log(enabledModule.name + " loaded")

      }, function (fail) {

        if (fail === "No such hook exists") {

          console.log(enabledModule.name + " loaded")

        } else {

          console.log(enabledModule.name + " failed to initialise", fail)

        }

      });

    });

    iris.status.ready = true;

    // Free C object, no longer extensible

    Object.freeze(iris);

    iris.log("info", "Server started");

    iris.app.use(function (req, res) {

      iris.hook("hook_catch_request", req.authPass, {
        req: req
      }, null).then(function (success) {

          if (typeof success === "function") {

            success(res).then(function () {

              if (!res.headersSent) {

                res.redirect(req.url);

              };

            }, function (fail) {

              res.send(fail);

            })

          } else {

            iris.hook("hook_display_error_page", req.authPass, {
              error: 404,
              req: req,
              res: res
            }).then(function (success) {

              res.status(404).send(success);

            }, function (fail) {

              res.status(404).send("404");

            });

          }

        },
        function (fail) {

          iris.hook("hook_display_error_page", req.authPass, {
            error: 404,
            req: req,
            res: res
          }).then(function (success) {

            res.status(404).send(success);

          }, function (fail) {

            res.status(404).send("404");

          });

        });

    });

    iris.app.use(function (err, req, res, next) {
      console.log(err);

      iris.hook("hook_display_error_page", req.authPass, {
        error: 500,
        req: req,
        res: res
      }).then(function (success) {

        res.status(500).send(success);

      }, function (fail) {

        res.status(500).send('Something went wrong');;

      });

    });

    iris.dbPopulate();

    // Send server ready message and get sessions

    process.send("started");

    process.on("message", function (m) {

      if (m.sessions) {

        Object.keys(m.sessions).forEach(function (user) {

          iris.modules.auth.globals.userList[user] = m.sessions[user];

        });

      }

    });

  });

};
