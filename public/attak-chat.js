var webIdentityToken = null;
var lambda = null;
var chatUpdateId = null;
var displayedMessages = [];
var username = 'Anonymous';

function setStateSignedOut() {
    // Toggle state to signed out
    $('#signout-button').addClass('hidden');
    $('#signed-out').show();
    $('#signed-in').hide();

    // Stop reading chat messages
    if (chatUpdateId) {
        clearInterval(chatUpdateId)
        chatUpdateId = null;
    }
}

function setStateSignedIn() {
    // Toggle state to signed in
    $('#signout-button').removeClass('hidden');
    $('#signed-out').hide();
    $('#signed-in').show();

    // Start reading the chat messages
    chatUpdateId = setInterval(updateChat, 1000);
}

function showSigninButton() {
    var options = {
        'callback' : signinCallback,
        'approvalprompt' : 'force',
        'scope' : 'profile',
        'cookiepolicy' : 'single_host_origin',
        'clientid' : google_oauth_client_id,
    };
    gapi.signin.render('renderMe', options);
}

function signinCallback(authResult) {
    if (authResult['status']['signed_in']) {
        console.log('User is signed in!');

        // Toggle state to signed in
        setStateSignedIn();

        // Get the profile details about the user
        gapi.client.load('plus', 'v1', getUserProfile)

        // Save the token
        webIdentityToken = authResult['id_token']

        setAwsConfig();

    } else {
        console.log('Sign-in state: ' + authResult['error']);
        console.log('User is signed out');

        // Toggle state to signed out
        setStateSignedOut();
    }
}

function signOut() {
    gapi.auth.signOut();

    setStateSignedOut();
}

function setAwsConfig() {
    AWS.config.region = region
    AWS.config.credentials = new AWS.WebIdentityCredentials({
        RoleArn: website_iam_role_arn,
        RoleSessionName: 'attak-chat',
        WebIdentityToken: webIdentityToken
    });

    lambda = new AWS.Lambda({
        endpoint: 'http://' + window.location.hostname + ':12368'
    });

    // dynamo = new AWS.DynamoDB();

}

function getUserProfile() {
    gapi.client.plus.people.get({userId: 'me'}).execute(function(resp) {
        console.log('Got user details')
        console.log(resp);
        username = resp.displayName;
        setStatusBar('Welcome ' + username);
    });
}

function sendMessage(input) {
    message = input.val();
    if (message.length > 0) {
        var payload = {
            author: username,
            message: message,
        }

        setStatusBar('Sending message');

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
}


function updateChat() {
    getData(function(data) {
        var messageList = data['messages'];
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
            if (areMessagesEqual(message, lastMessage)) {
                break;
            }

            msgsToAdd.unshift(message);
        }

        // Now actually display the messages
        chatBody = $('#chat-body');
        for (var i = 0; i < msgsToAdd.length; i++) {
            message = msgsToAdd[i];

            msgHtml  = '<div class="row">';
            msgHtml += '  <div class="col-xs-2 text-right">';
            msgHtml += '    <b>' + message['author'] + '</b>';
            msgHtml += '  </div>';
            msgHtml += '  <div class="col-xs-10">' + message['message'] + '</div>';
            msgHtml += '</div>';

            chatBody.append(msgHtml);
            chatBody.animate({
                scrollTop: "+=" + 20 + "px"
            });

            displayedMessages.push(message);
        }
    });
}


function areMessagesEqual(msg1, msg2) {
    console.log("COMPARE MESSAGES", msg1, msg2)
    return msg1['author'] == msg2['author']
        && msg1['message'] == msg2['message'];
}


/**
 * Makes a call to a data file to set a data object for the chat
 * @return {JSON object}
 */
function getData(callback) {
    var params = {
        FunctionName: 'recentChats-development',
        InvocationType: 'Event'
    }

    lambda.invoke(params, function(err, results) {
        callback({messages: JSON.parse(results.Payload || '')})
    })
}


function setStatusBar(text) {
    $('#status-bar').text(text);
}

// Load
$(function() {
    // Set initial state to signed out
    setStateSignedOut();

    // Add listener for signout button clicks
    $('#signout-button').click(signOut);

    // Show the sign in button
    showSigninButton();

    // Add a listener for the ENTER key on the chat message box
    $('#chat-message').keypress(function(e) {
        if (e.which == 13) {
            sendMessage($('#chat-message'));
        }
    });

    // Always get the data
    $.ajaxSetup({ cache: false });
});
