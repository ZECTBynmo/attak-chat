"use strict";
require('./attak-chat.css')

// var AWS = require('aws-sdk')
var App = require('./attak-chat')
var crypto = require('crypto')
var websocket = require('websocket-stream')
var MqttClient = require ('mqtt/lib/client')
var homeTemplate = require('./views/home.pug')

$('.main-container').html(homeTemplate())

App.start()