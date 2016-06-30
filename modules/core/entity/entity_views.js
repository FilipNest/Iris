/**
 * @file Functions and handlers for rendering and displaying entities to the user.
 */

var fs = require("fs");

/**
 * Implements hook_frontend_embed
 * Process entity embeds
 */

iris.modules.entity.registerHook("hook_frontend_embed__entity", 0, function (thisHook, data) {

  iris.invokeHook("hook_entity_fetch", thisHook.authPass, thisHook.context, thisHook.context.embedOptions).then(function (result) {

    thisHook.context.vars[thisHook.context.embedID] = result;

    thisHook.context.vars.tags.headTags["socket.io"] = {
      type: "script",
      attributes: {
        "src": "/socket.io/socket.io.js"
      },
      rank: -1
    }

    thisHook.context.vars.tags.headTags["handlebars"] = {
      type: "script",
      attributes: {
        "src": "/modules/entity/handlebars.min.js"
      },
      rank: -1
    }

    thisHook.context.vars.tags.headTags["entity_fetch"] = {
      type: "script",
      attributes: {
        "src": "/modules/entity/templates.js"
      },
      rank: 0
    };

    var entityPackage = "\n" + "iris.entityPreFetch(" + JSON.stringify(result) + ", '" + thisHook.context.embedID + "'" + ", " + JSON.stringify(thisHook.context.embedOptions) + ")";

    var loader = entityPackage;

    thisHook.pass("<script>" + loader + "</script>");

  }, function (error) {

    thisHook.pass(data);

  });

});

/**
 * @member hook_entity_created
 * @memberof entity
 *
 * @desc Event handling for when entities are created
 *
 * This hook is run once an entity has been created; useful for live updates or keeping track of changes
 */
iris.modules.entity.registerHook("hook_entity_created", 0, function (thisHook, entity) {

  processUpdate(entity, "entityCreate", function () {

    thisHook.pass(entity);

  })

});

/**
 * @member hook_entity_updated
 * @memberof entity
 *
 * @desc Event handling for when entities are updated
 *
 * This hook is run when an entity is updated/edited; useful for live updates or keeping track of changes
 */
iris.modules.entity.registerHook("hook_entity_updated", 0, function (thisHook, entity) {

  processUpdate(entity, "entityUpdate", function () {

    thisHook.pass(entity);

  })

});

/**
 * @member hook_entity_deleted
 * @memberof entity
 *
 * @desc Event handling for when entities are deleted
 *
 * This hook is run when an entity is deleted; useful for live updates or keeping track of changes
 */
iris.modules.entity.registerHook("hook_entity_deleted", 0, function (thisHook, entity) {

  processUpdate(entity, "entityDelete", function () {

    thisHook.pass(entity);

  })

});

// Live update 

// Filter entities by checking auth

var processUpdate = function (entity, socketMessageName, callback) {

  feedCheck(entity, function (sockets) {

    if (!sockets) {

      callback();

    } else {

      var subscribers = [];

      Object.keys(sockets).forEach(function (socketID) {

        var socket = sockets[socketID];

        var authPass = socket.socket.authPass;

        if (!authPass) {

          authPass = "anon";

        }

        subscribers.push({
          authPass: authPass,
          socket: socketID,
          feeds: socket.feeds
        });

      })

      var pushCounter = 0;

      var done = function () {

        pushCounter += 1;

        if (pushCounter === subscribers.length) {

          callback();

        }

      }

      subscribers.forEach(function (subscriber) {

        checkEntity(entity, subscriber.authPass).then(function (entity) {

          var package = {
            entity: entity,
            feeds: subscriber.feeds
          }

          iris.socketServer.sockets.sockets[subscriber.socket].emit(socketMessageName, package);

          done();

        }, function (fail) {

          done();

        })

      })

    }

  })

}

var checkEntity = function (entity, authPass) {

  return new Promise(function (resolve, reject) {

    iris.invokeHook("hook_entity_view", authPass, null, entity).then(function (data) {

      resolve(data);

      if (!data) {

        reject(data);

      }

    }, function (fail) {

      reject(fail);

    });

  })

}

iris.modules.entity.globals.entityFeeds = {};

iris.modules.entity.registerSocketListener("entityfeeds", function (socket, data) {

  Object.keys(data).forEach(function (entityFeed) {
    
    var query = JSON.parse(entityFeed);
    
    var clientFeedVariable = query.variable;
    delete query.variable;
    
    entityFeed = JSON.stringify(query);

    if (!iris.modules.entity.globals.entityFeeds[entityFeed]) {

      iris.modules.entity.globals.entityFeeds[entityFeed] = {
        query: data[entityFeed],
        sockets: {}
      };

    }

    // Add socket userid

    iris.modules.entity.globals.entityFeeds[entityFeed].sockets[socket.id] = {
      connected: Date.now(),
      authPass: socket.authPass
    };

    // Add name of entity feed. Allow multiple

    if (!iris.modules.entity.globals.entityFeeds[entityFeed].sockets[socket.id].feedNames) {

      iris.modules.entity.globals.entityFeeds[entityFeed].sockets[socket.id].feedNames = {};

    }

    iris.modules.entity.globals.entityFeeds[entityFeed].sockets[socket.id].feedNames[clientFeedVariable] = {};

  })

})

iris.modules.entity.registerHook("hook_socket_disconnected", 0, function (thisHook, data) {

  Object.keys(iris.modules.entity.globals.entityFeeds).forEach(function (entityFeed) {

    var feed = iris.modules.entity.globals.entityFeeds[entityFeed];

    var sockets = feed.sockets;

    if (feed.sockets[thisHook.context.socket.id]) {

      delete feed.sockets[thisHook.context.socket.id];

    }

    if (!Object.keys(feed.sockets).length) {

      delete iris.modules.entity.globals.entityFeeds[entityFeed];

    }

  })

  thisHook.pass(data);

})

var feedCheck = function (entity, callback) {

  // Loop over entity feeds to see if it fits in any of them

  var entityFeeds = [],
    validFeeds = [];

  Object.keys(iris.modules.entity.globals.entityFeeds).forEach(function (entityFeed) {

    var feed = iris.modules.entity.globals.entityFeeds[entityFeed];

    if (feed.query.entities.indexOf(entity.entityType) !== -1) {

      entityFeeds.push(JSON.parse(JSON.stringify(feed)));

    }

  })

  var counter = 0;
  var complete = function () {

    counter += 1;

    if (counter === entityFeeds.length) {

      var sockets = {};

      // validFeeds contains all the fields

      validFeeds.forEach(function (entityFeed) {

        Object.keys(entityFeed.sockets).forEach(function (socketid) {

          if (!sockets[socketid]) {

            sockets[socketid] = {
              socket: entityFeed.sockets[socketid],
              feeds: []
            };

          }

          sockets[socketid].feeds.push(entityFeed.query);

        })

      })

      callback(sockets);

    }

  }

  entityFeeds.forEach(function (entityfeed) {

    if (!entityfeed.query.queries) {

      entityfeed.query.queries = [];

    }

    entityfeed.query.queries.push({
      "field": "eid",
      "operator": "is",
      "value": entity.eid
    })

    iris.invokeHook("hook_entity_fetch", "root", null, entityfeed.query).then(function (entities) {

      if (entities && entities.length) {

        validFeeds.push(entityfeed)

        complete();

      }

    }, function (fail) {

      complete();

    })

  });

}
