var fs = require('fs');

CM.admin_ui.globals.registerPath = function (path, templateName, prepFunction) {

  C.app.get(path, function (req, res) {

    // If not admin, present login page
    if (req.authPass.roles.indexOf('admin') === -1) {

      if (req.url.indexOf('/admin/login') !== 0) {

        res.redirect('/admin/login?return=' + req.url);
        return false;

      }

    }

    // If admin going to login page, redirect
    if (req.url.indexOf('/admin/login') === 0) {

      if (req.authPass.roles.indexOf('admin') !== -1) {

        if (req.query.return) {

          res.redirect(req.query.return);

        } else {

          res.redirect('/');

        }

      }

    }

    if (!prepFunction) {

      prepFunction = function (req, callback) {

        callback({test: 'tes'});

      }

    }

    prepFunction(req, function (variables) {

      // find specified template

      CM.frontend.globals.findTemplate([templateName], "html").then(function (html) {

        // Merge in admin wrapper (including admin menu)

        var admin_wrapper = fs.readFileSync(__dirname + '/templates/admin.html', "utf8");

        html = admin_wrapper.replace('[[[ADMINCONTENT]]]', html);

        // Parse using the templating system

        CM.frontend.globals.parseTemplate(html, req.authPass).then(function (page) {

          page.variables = Object.assign(variables, page.variables);

          // Parse with Mustache manually
          // ----------------------------
          // Does not use the hook to do this as admin_ui needs to work independently
          // of which templating system is used for the site frontend.

          var Mustache = require('mustache');

          try {

            page.html = Mustache.render(page.html, page.variables);

            res.send(page.html);

          } catch (e) {

            C.log("error", "Mustache rendering failed");

            C.hook("hook_display_error_page", req.authPass, {
              error: 500,
              req: req,
              res: res
            }).then(function (success) {

              res.status(500).send(success);

            }, function (fail) {

              res.status(500).send("Something went wrong");;

            });

          }

        });

      }, function () {

        var error = function (req, res) {

          res.send("Error loading template");

        };

      });

    });

  });

}

var prepareEntitylist = function (req, callback) {

  // Query for all entities of this type

  if (C.dbCollections[req.params.type]) {

    var fields = [];

//    Object.keys(C.dbCollections[req.params.type].schema.tree).forEach(function (fieldTitle) {
//
//      var field = C.dbCollections[req.params.type].schema.tree[fieldTitle];
//
//      if (fieldTitle !== "entityType" && field.type === String && field.long !== true) {
//
//        fields.push(fieldTitle);
//
//      };
//
//    });

    C.dbCollections[req.params.type].find({}, function (err, doc) {

      if (!err) {

        callback({entities: doc, fields: fields});

      } else {

        C.log("error", "Database error while fetching entities");

        callback({});

      }

    })

  } else {

    C.log("error", "Request for invalid entity type");

    callback({});

  }

}

CM.admin_ui.globals.registerPath("/admin/login", "admin_login");
CM.admin_ui.globals.registerPath("/admin", "admin_dashboard");
CM.admin_ui.globals.registerPath("/admin/permissions", "admin_permissions");
CM.admin_ui.globals.registerPath("/admin/entities", "admin_entity_types");
CM.admin_ui.globals.registerPath("/admin/entitylist/:type", "admin_entitylist", prepareEntitylist);
CM.admin_ui.globals.registerPath("/admin/schema/create", "admin_schema_create");
CM.admin_ui.globals.registerPath("/admin/schema/edit/:type", "admin_schema_edit");
CM.admin_ui.globals.registerPath("/admin/edit/:type/:_id", "admin_entity_edit");
CM.admin_ui.globals.registerPath("/admin/create/:type", "admin_entity_create");
CM.admin_ui.globals.registerPath("/admin/delete/:type/:id", "admin_entity_delete");
CM.admin_ui.globals.registerPath("/admin/logs", "admin_logs");
