'use strict'

var fs = require('fs')
var AWS = require('aws-sdk')
var uuid = require('uuid')
var Router = require('attak-router')
var AWSMqtt = require('aws-mqtt')
var nodePath = require('path')
var queryChats = require('./query_chats')

module.exports = {
  name: 'attak-chat',
  static: {
    dir: './build',
    permissions: {
      invoke: ['chatHandler', 'recentChats']
    },
    auth: {
      federated: {
        google: {
          // You should secure this key better in your projects. We're 
          // including it unsecured to make the example easier to use
          key: '376999432431-gqpt0ikktc9iveg0435tnk1ufj0j48st.apps.googleusercontent.com'
        }
      }
    }
  },
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
      console.log("CHAT HANDLER", context.aws.endpoints.iot, event)

      context.emit('messages', event)

      var dynamo = new AWS.DynamoDB({
        endpoint: context.aws.endpoints.dynamodb,
        params: {
          TableName: 'attak-chat'
        }
      })

      var itemParams = {
        Item: {
          id: {S: uuid.v1()},
          author: {S: event.author},
          channel: {S: 'default'},
          message: {S: event.message},
          timestamp: {N: new Date().getTime().toString()},
        }
      }

      console.log("PUT ITEM", itemParams)
      dynamo.putItem(itemParams, function(err, data) {
        console.log("PUT RESULTS", err, data)
        callback(err, data)
      })
    },

    chatEmitter: function(event, context, callback) {
      console.log("CHAT EMITTER", event)

      var iotData = new AWS.IotData({
        endpoint: 'a3cp5tc4mlo56h.iot.us-east-1.amazonaws.com'
      })

      var params = {
        topic: '/chat',
        payload: new Buffer(JSON.stringify(event.data)),
        qos: 0
      };

      iotData.publish(params, function(err, results) {
        console.log("EMITTED", err, results)
        callback(err, results)
      });
    },

    recentChats: function(event, context, callback) {
      console.log("RECENT CHATS", event)
      queryChats(context, 'default', new Date().getTime() - 200000, new Date().getTime(), function(err, results) {
        console.log("QUERY RESULTS", err, results)
        callback(err, results)
      })
    },

  },
  streams: [
    ['chatHandler', 'chatEmitter']
  ]
}