var AWS = require('aws-sdk')

module.exports = function(config, channel, from, to, callback) {
  AWS.config.update({
    region: "us-east-1",
    endpoint: config.aws.endpoints.dynamodb
  });

  var docClient = new AWS.DynamoDB.DocumentClient();

  var params = {
    TableName: 'attak-chat',
    KeyConditionExpression: '#channel = :channelValue and #timestamp BETWEEN :from AND :to',
    ExpressionAttributeNames: {
      '#channel': 'channel',
      '#timestamp': 'timestamp'
    },
    ExpressionAttributeValues: {
      ':channelValue': channel,
      ':from': from,
      ':to': to
    }
  }

  var items = []
  var queryExecute = function(callback) {
    docClient.query(params,function(err, result) {
      if (err) {
        callback(err)
      } else {
        console.log(result)
        items = items.concat(result.Items)

        if (result.LastEvaluatedKey) {
          params.ExclusiveStartKey = result.LastEvaluatedKey
          queryExecute(callback)
        } else {
          callback(err, items)
        }
      }
    })
  }

  queryExecute(callback);
}