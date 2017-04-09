var uuid = require('uuid')
var moment = require('moment')
var config = require('./config.js')
var AWSMqtt = require('aws-mqtt')

var webIdentityToken = null;
var lambda = null;
var chatUpdateId = null;
var displayedMessages = [];
var username = 'Anonymous';

function SigV4Utils() {}

SigV4Utils.sign = function (key, msg) {
    var hash = CryptoJS.HmacSHA256(msg, key);
    return hash.toString(CryptoJS.enc.Hex);
};

SigV4Utils.sha256 = function (msg) {
    var hash = CryptoJS.SHA256(msg);
    return hash.toString(CryptoJS.enc.Hex);
};

SigV4Utils.getSignatureKey = function (key, dateStamp, regionName, serviceName) {
    var kDate = CryptoJS.HmacSHA256(dateStamp, 'AWS4' + key);
    var kRegion = CryptoJS.HmacSHA256(regionName, kDate);
    var kService = CryptoJS.HmacSHA256(serviceName, kRegion);
    var kSigning = CryptoJS.HmacSHA256('aws4_request', kService);
    return kSigning;
};

SigV4Utils.getSignedUrl = function(protocol, host, uri, service, region, accessKey, secretKey, sessionToken) {
    var time = moment().utc();
    var dateStamp = time.format('YYYYMMDD');
    var amzdate = dateStamp + 'T' + time.format('HHmmss') + 'Z';
    var algorithm = 'AWS4-HMAC-SHA256';
    var method = 'GET';

    var credentialScope = dateStamp + '/' + region + '/' + service + '/' + 'aws4_request';
    var canonicalQuerystring = 'X-Amz-Algorithm=AWS4-HMAC-SHA256';
    canonicalQuerystring += '&X-Amz-Credential=' + encodeURIComponent(accessKey + '/' + credentialScope);
    canonicalQuerystring += '&X-Amz-Date=' + amzdate;
    canonicalQuerystring += '&X-Amz-SignedHeaders=host';

    var canonicalHeaders = 'host:' + host + '\n';
    var payloadHash = SigV4Utils.sha256('');
    var canonicalRequest = method + '\n' + uri + '\n' + canonicalQuerystring + '\n' + canonicalHeaders + '\nhost\n' + payloadHash;


    var stringToSign = algorithm + '\n' + amzdate + '\n' + credentialScope + '\n' + SigV4Utils.sha256(canonicalRequest);
    var signingKey = SigV4Utils.getSignatureKey(secretKey, dateStamp, region, service);
    var signature = SigV4Utils.sign(signingKey, stringToSign);

    canonicalQuerystring += '&X-Amz-Signature=' + signature;
    if (sessionToken) {
        canonicalQuerystring += '&X-Amz-Security-Token=' + encodeURIComponent(sessionToken);
    }
    
    var requestUrl = protocol + '://' + host + uri + '?' + canonicalQuerystring;
    return requestUrl;
}

function initClient(requestUrl, callback) {
    console.log("INIT CLIENT", requestUrl)
    var clientId = String(Math.random()).replace('.', '');
    var client = new Paho.MQTT.Client(requestUrl, clientId);
    var connectOptions = {
        onSuccess: function () {
            console.log('connected');

            // subscribe to the drawing
            client.subscribe("/chat");

            try {
                // publish a lifecycle event
                message = new Paho.MQTT.Message('{"id":"' + AWS.config.credentials.identityId + '"}');
                message.destinationName = '/chat';
                console.log("MESSAGE", message);
                client.send(message);
                callback()
            } catch(err) {
                console.log("CAUGHT ERROR", err)
                callback(err)
            }
        },
        useSSL: true,
        timeout: 3,
        mqttVersion: 4,
        onFailure: function (err) {
            console.error('connect failed', err);
            callback(err)
        }
    };
    client.connect(connectOptions);

    client.onMessageArrived = function (message) {
        try {
            App.handleNewMessage(message.payloadString)
        } catch(err) {
            console.log("MESSAGE HANDLING ERR", err)
        }
    };
}

var App = {
    setStateSignedOut: function() {
        // Toggle state to signed out
        $('#signout-button').addClass('hidden');
        $('#signed-out').show();
        $('#signed-in').hide();

        // Stop reading chat messages
        if (chatUpdateId) {
            clearInterval(chatUpdateId)
            chatUpdateId = null;
        }
    },

    setStateSignedIn: function() {
        // Toggle state to signed in
        $('#signout-button').removeClass('hidden');
        $('#signed-out').hide();
        $('#signed-in').show();

        // Start reading the chat messages
        // chatUpdateId = setInterval(App.updateChat, 1000);
    },

    showSigninButton: function() {
        var options = {
            'callback' : App.signinCallback,
            'approvalprompt' : 'force',
            'scope' : 'profile',
            'cookiepolicy' : 'single_host_origin',
            'clientid' : config.google_oauth_client_id,
        };
        gapi.signin.render('renderMe', options);
    },

    signinCallback: function(authResult) {
        console.log("AUTH RESULT", authResult)
        if (authResult.status.signed_in) {
            console.log('User is signed in!');

            // Toggle state to signed in
            App.setStateSignedIn();

            // Get the profile details about the user
            gapi.client.load('plus', 'v1', App.getUserProfile)

            // Save the token
            webIdentityToken = authResult.id_token

            App.setAwsConfig()
        } else {
            console.log('Sign-in state: ' + authResult.error);
            console.log('User is signed out');

            // Toggle state to signed out
            App.setStateSignedOut();
        }
    },

    setupWsClient: function() {
        console.log("SETUP WS CLIENT", config.endpoints.iot)

        var client = AWSMqtt.connect({
            region: AWS.config.region,
            credentials: AWS.config.credentials,
            endpoint: config.endpoints.iot,
            clientId: 'mqtt-client-' + uuid.v1(),
        })

        client.on('connect', () => {
            console.log("MQTT CLIENT CONNECTED")
            client.subscribe('/chat')
        })
        
        client.on('message', (topic, message) => {
            console.log("GOT MESSAGE", topic, message)
        })
    },

    signOut: function() {
        gapi.auth.signOut();

        App.setStateSignedOut();
    },

    setAwsConfig: function() {
        AWS.config.region = config.region
        AWS.config.credentials = new AWS.WebIdentityCredentials({
            RoleArn: config.website_iam_role_arn,
            RoleSessionName: 'attak-chat',
            WebIdentityToken: webIdentityToken
        });

        AWS.config.credentials.get(function(err) {
            console.log("GOT FULL CREDS", err, AWS.config.credentials)

            var credentials = AWS.config.credentials
            
            var requestUrl = SigV4Utils.getSignedUrl('wss', 'data.iot.us-east-1.amazonaws.com', '/mqtt',
                'iotdevicegateway', 'us-east-1', 
                credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken)

            lambda = new AWS.Lambda({
                endpoint: window.location.hostname == 'localhost' ? 'http://localhost:12368' : undefined
            });

            initClient(requestUrl, function(err) {
                console.log("INIT DONE", err)
                App.updateChat()
            })
            // App.setupWsClient()
        })
    },

    getUserProfile: function() {
        gapi.client.plus.people.get({userId: 'me'}).execute(function(resp) {
            console.log('Got user details')
            console.log(resp);
            username = resp.displayName;
            App.setStatusBar('Welcome ' + username);
        });
    },

    sendMessage: function(input) {
        message = input.val();
        if (message.length > 0) {
            var payload = {
                author: username,
                message: message,
            }

            App.setStatusBar('Sending message');

            var params = {
                Payload: JSON.stringify(payload),
                FunctionName: 'chatHandler-development',
                InvocationType: 'Event'
            }

            lambda.invoke(params, function(err, results) {
                console.log("SEND MESSAGE RESULTS", err, results)
            })
        }

        // Reset the input box for the next message
        input.val('');
    },

    updateChat: function() {
        App.getData(function(data) {
            var messageList = data.messages;
            console.log("GOT MESSAGE LIST", messageList)

            // Get the last message displayed
            if (displayedMessages.length > 0) {
                lastMessage = displayedMessages[displayedMessages.length - 1];
                console.log('The last message is: ');
                console.log(lastMessage);
            } else {
                lastMessage = {};
            }

            // Figure out which messages from the data to add
            msgsToAdd = [];
            for (var i = messageList.length - 1; i >= 0; i--) {
                var message = messageList[i];
                if (App.areMessagesEqual(message, lastMessage)) {
                    break;
                }

                msgsToAdd.unshift(message);
            }

            // Now actually display the messages
            chatBody = $('#chat-body');
            for (var i = 0; i < msgsToAdd.length; i++) {
                message = msgsToAdd[i];

                var msgHtml  = '<div class="row">';
                msgHtml += '  <div class="col-xs-2 text-right">';
                msgHtml += '    <b>' + message.author + '</b>';
                msgHtml += '  </div>';
                msgHtml += '  <div class="col-xs-10">' + message.message + '</div>';
                msgHtml += '</div>';

                chatBody.append(msgHtml);
                chatBody.animate({
                    scrollTop: "+=" + 20 + "px"
                });

                displayedMessages.push(message);
            }
        });
    },

    handleNewMessage: function(message) {
        console.log("HANDLING NEW MESSAGE", message)
        if (message === undefined || message === null) {
            return
        }

        var data = JSON.parse(message)
        var msgHtml = '<div class="row">';
        msgHtml += '  <div class="col-xs-2 text-right">';
        msgHtml += '    <b>' + data.author + '</b>';
        msgHtml += '  </div>';
        msgHtml += '  <div class="col-xs-10">' + data.message + '</div>';
        msgHtml += '</div>';

        console.log("APPENDING", msgHtml)

        $('#chat-body').append(msgHtml);
        $('#chat-body').animate({
            scrollTop: "+=" + 20 + "px"
        });
    },

    areMessagesEqual: function(msg1, msg2) {
        return msg1.author == msg2.author
            && msg1.message == msg2.message;
    },

    getData: function(callback) {
        var params = {
            FunctionName: 'recentChats-development',
            InvocationType: 'Event'
        }

        lambda.invoke(params, function(err, results) {
            console.log("GET DATA RESULTS", err, results)
            if (results && results.Payload) {
                callback({messages: JSON.parse(results.Payload || '')})
            } else {
                callback({messages: []})
            }
        })
    },

    setStatusBar: function(text) {
        $('#status-bar').text(text);
    },

    start: function() {
        // Set initial state to signed out
        App.setStateSignedOut();

        // Add listener for signout button clicks
        $('#signout-button').click(App.signOut);

        // Show the sign in button
        App.showSigninButton();

        // Add a listener for the ENTER key on the chat message box
        $('#chat-message').keypress(function(e) {
            if (e.which == 13) {
                App.sendMessage($('#chat-message'));
            }
        });
    }
}

module.exports = App