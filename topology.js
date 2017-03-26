'use strict'

var fs = require('fs')
var AWS = require('aws-sdk')
var uuid = require('uuid')
var Router = require('attak-router')
var AWSMqtt = require('aws-mqtt')
var queryChats = require('./query_chats')

module.exports = {
  name: 'attak-chat',
  // static: './public',
  api: 'endpoint',
  provision: require('./provision'),
  processors: {
    endpoint: new Router({
      routes: {
        'GET /': 'home',
        'GET /api/chats/recent': 'recentChats',
        'GET /bundle.js': 'bundle',
      }
    }),

    chatHandler: function(event, context, callback) {
      console.log("CHAT HANDLER", context.aws.endpoints.iot, event.body)

      context.emit('messages', event.body)

      var dynamo = new AWS.DynamoDB({
        endpoint: context.aws.endpoints.dynamodb,
        params: {
          TableName: 'attak-chat'
        }
      })

      var itemParams = {
        Item: {
          id: {S: uuid.v1()},
          author: {S: event.body.author},
          channel: {S: 'default'},
          message: {S: event.body.message},
          timestamp: {N: new Date().getTime().toString()},
        }
      };

      dynamo.putItem(itemParams, function(err, data) {
        callback(err, data)
      })
    },

    chatEmitter: function(event, context, callback) {
      console.log("CHAT EMITTER", event)
      var iotData = new AWS.IotData({
        endpoint: context.aws.endpoints.iot
      })

      var params = {
        topic: '/chat',
        payload: new Buffer(JSON.stringify(event)),
        qos: 0
      };

      iotData.publish(params, function(err, results) {
        callback(err, results)
      });
    },

    recentChats: function(event, context, callback) {
      queryChats(context, 'default', new Date().getTime() - 200000, new Date().getTime(), function(err, results) {
        console.log("QUERY RESULTS", err, results)
        callback(err, results)
      })
    },

    home: function(event, context, callback) {
      callback(null, fs.readFileSync('./build/index.html').toString())
    },

    bundle: function(event, context, callback) {
      callback(null, fs.readFileSync('./build/bundle.js').toString())
    },

    staticServer: function(event, context, callback) {
      var filePath = event.path

      try {
        callback(null, fs.readFileSync(`./build/${filePath}`).toString())
      } catch (err) {
        callback(null, {httpStatus: 404})
      }
    }
  },
  streams: [
    ['chatHandler', 'chatEmitter']
  ]
}