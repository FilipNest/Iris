/*jslint node: true nomen: true*/

"use strict";

require('mongoose').Types;

C.registerModule("messages_replies");

/* ------- */

// Add parents to message schema
C.registerDbSchema("message", {
  parents: {
    type: Array,
    required: false
  },
  replyTo: {
    type: String
  }

});

/* ------- */

CM.messages_replies.registerHook("hook_entity_validate_message", 1, function (thisHook, data) {

  var entity = data;

  var pass = function (data) {

    thisHook.finish(true, data);

  }

  var fail = function (data) {

    thisHook.finish(false, data);

  }

  if (entity.replyTo) {

    var prepareReplies = C.promise(function (data, yes, no) {

      CM.messages.globals.fetchMessageById(entity.replyTo).then(function (fetchedMessage) {

        yes(data);

      }, function (fail) {

        no(C.error(400, "Cannot reply to a message that does not exist"));

      });

    });

    C.promiseChain([prepareReplies], entity, pass, fail);

  } else {
    pass(data);
  }

});

CM.messages_replies.registerHook("hook_entity_presave_message", 1, function (thisHook, data) {

  var entity = data;

  if (entity.replyTo) {

    CM.messages.globals.fetchMessageById(entity.replyTo).then(function (fetchedMessage) {

      if (fetchedMessage.parents.length > 0) {

        fetchedMessage.parents.push(fetchedMessage._id.toString());

        entity.parents = fetchedMessage.parents;

      } else {

        entity.parents = [fetchedMessage._id.toString()];

      }

      thisHook.finish(true, data);

    }, function (fail) {

      thisHook.finish(false, C.error(400, "Cannot reply to a message that does not exist"));

    });

  } else {

    thisHook.finish(true, data);

  }

});
