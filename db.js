/*jshint nomen: true, node:true */
/* globals iris,mongoose,Promise */

/**
 * @file Manages the database connection and schemas for entity types.
 *
 * Uses Mongoose.
 */

var fs = require('fs');

//Connect to database

iris.invokeHook("hook_db_connect", "root", iris.config, null).then(function () {

  iris.dbPopulate();

  iris.status.ready = true;

  console.log("Ready on port " + iris.config.port + ".");

  iris.log("info", "Server started");

});

iris.dbPopulate = function () {

  iris.fieldTypes = {};

  iris.dbCollections = {};

  iris.entityTypes = {};

  iris.dbSchema = {};

  var glob = require("glob");

  var merge = require("merge");

  // Get field types

  Object.keys(iris.modules).forEach(function (moduleName) {

    var modulePath = iris.modules[moduleName].path;

    var fields = glob.sync(modulePath + "/**/*.iris.field");

    fields.forEach(function (fieldPath) {

      try {

        var field = fs.readFileSync(fieldPath, "utf8");

        field = JSON.parse(field);

        if (!iris.fieldTypes[field.name]) {

          iris.fieldTypes[field.name] = field;

        } else {

          // Merge field's properties

          var newObject = merge.recursive(true, iris.fieldTypes[field.name], field);

          iris.fieldTypes[field.name] = newObject;

        }

      } catch (e) {

        iris.log("error", e);

      }

    });


  });

  // Loop over all enabled modules and check for schema files

  Object.keys(iris.modules).forEach(function (moduleName) {

    try {
      fs.readdirSync(iris.modules[moduleName].path + "/schema").forEach(function (schemafile) {

        schemafile = schemafile.toLowerCase().replace(".json", "");

        //Check if schema already exists for entity type, if not, add it

        if (!iris.dbSchema[schemafile]) {

          iris.dbSchema[schemafile] = {};

        }

        var file = JSON.parse(fs.readFileSync(iris.modules[moduleName].path + "/schema/" + schemafile + ".json"));

        iris.dbSchema[schemafile] = merge.recursive(true, file, iris.dbSchema[schemafile]);

      });

    } catch (e) {

      // Catch errors if the file could be found (such as JSON errors)

      if (e.code !== "ENOENT") {

        iris.log("error", "Could not parse schema file in module " + moduleName);
        iris.log("error", e);

      }

    }


  });

  // See if site config has added any schema or schemafields

  fs.readdirSync(iris.sitePath + "/configurations/entity").forEach(function (schemafile) {

    var schemaName = schemafile.toLowerCase().replace(".json", "");

    var file;

    try {
      file = JSON.parse(fs.readFileSync(iris.sitePath + "/configurations/entity/" + schemafile, "UTF8"));
    } catch (e) {

      iris.log("error", schemaName + " failed db schema insertion valid JSON");
      iris.log("error", e);
      return false;

    }

    if (!iris.dbSchema[schemaName]) {

      iris.dbSchema[schemaName] = {};

    }

    Object.keys(file).forEach(function (field) {

      iris.dbSchema[schemaName][field] = file[field];

    });

  });

  Object.keys(iris.dbSchema).forEach(function (schema) {

    //Push in universal type fields if not already in.

    iris.dbSchema[schema].entityType = {
      type: String,
      description: "The type of entity this is",
      title: "Entity type",
      required: true
    };

    iris.dbSchema[schema].entityAuthor = {
      type: String,
      description: "The name of the author",
      title: "Author",
      required: true
    };

    iris.dbSchema[schema].eid = {
      type: Number,
      description: "Entity ID",
      title: "Unique ID",
      required: false
    };

    // Make JSON copy of complete schema and save to non mongoosed object for reference

    iris.entityTypes[schema] = JSON.parse(JSON.stringify(iris.dbSchema[schema]));

    // Sneaky shortcut way of saving of fieldtypes into the entityType list

    var stringySchema = JSON.stringify(iris.entityTypes[schema]);

    Object.keys(iris.fieldTypes).forEach(function (fieldType) {

      try {

        var fieldType = iris.fieldTypes[fieldType];
        var name = fieldType.name;
        var type = fieldType.type;

        var search = `"fieldType":"${name}",`;
        var replace = search + `"fieldTypeType":"${type}",`;

        stringySchema = stringySchema.split(search).join(replace);

      } catch (e) {

        iris.log("error", e);

      }

    })

    iris.entityTypes[schema] = JSON.parse(stringySchema);

  });

  var schemaCounter = 0;
  var schemaLoaded = function () {

    schemaCounter += 1;
    if (schemaCounter === Object.keys(iris.entityTypes).length) {

      process.emit("dbReady", true);

    }

  }

  Object.keys(iris.entityTypes).forEach(function (entityType) {

    iris.invokeHook("hook_db_schema", "root", {
      schema: entityType,
      schemaConfig: iris.entityTypes[entityType]
    }).then(function () {

      //Create permissions for this entity type

      iris.modules.auth.globals.registerPermission("can create " + entityType, "entity");
      iris.modules.auth.globals.registerPermission("can edit any " + entityType, "entity");
      iris.modules.auth.globals.registerPermission("can edit own " + entityType, "entity");
      iris.modules.auth.globals.registerPermission("can view any " + entityType, "entity");
      iris.modules.auth.globals.registerPermission("can view own " + entityType, "entity");
      iris.modules.auth.globals.registerPermission("can delete any " + entityType, "entity");
      iris.modules.auth.globals.registerPermission("can delete own " + entityType, "entity");
      iris.modules.auth.globals.registerPermission("can fetch " + entityType, "entity", "Can use the API to <b>fetch</b> entities.");
      iris.modules.auth.globals.registerPermission("can delete schema " + entityType, "entity", "Delete the entire schema. <strong>This includes the data</strong>.");

      schemaLoaded();

    })

  })

};
