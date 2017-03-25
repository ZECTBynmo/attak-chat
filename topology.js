'use strict'

var fs = require('fs')
var AWS = require('aws-sdk')
var uuid = require('uuid')
var Router = require('attak-router')
var queryChats = require('./query_chats')

module.exports = {
  name: 'attak-chat',
  // static: './public',
  api: 'endpoint',
  provision: require('./provision'),
  processors: {
    endpoint: new Router({
      routes: {
        'GET /': 'homeRedirect',
        'GET /public*': 'staticServer',
        'GET /api/chats/recent': 'recentChats',
      }
    }),

    chatHandler: function(event, context, callback) {
      console.log("CHAT EVENT", event.body)

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
        console.log("DYNAMO RESULTS", err, data)
        callback(null, {ok: true})
      })
    },

    recentChats: function(event, context, callback) {
      queryChats(context, 'default', new Date().getTime() - 200000, new Date().getTime(), function(err, results) {
        console.log("QUERY RESULTS", err, results)
        callback(err, results)
      })
    },

    // Send users to the home page
    homeRedirect: function(event, context, callback) {
      callback(null, {
        httpStatus: 301,
        headers: {
          Location: 'http://localhost:12369/public/index.html'
        }
      })
    },

    staticServer: function(event, context, callback) {
      var filePath = event.path.split('public/')[1]

      try {
        callback(null, fs.readFileSync(`./public/${filePath}`).toString())
      } catch (err) {
        callback(null, {httpStatus: 404})
      }
    }
  },
  streams: [
    ['endpoint', 'testproc']
  ]
}