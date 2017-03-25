var AWS = require('aws-sdk')

module.exports = function(topology, config, callback) {
  console.log("DYNAMODB ENDPOINT", config.aws.endpoints.dynamodb)

  var dynamo = new AWS.DynamoDB({
    endpoint: config.aws.endpoints.dynamodb,
    region: 'us-east-1'
  })

  dynamo.listTables({}, function(err, results) {
    if (results.TableNames.includes('attak-chat')) {
      console.log("TABLE EXISTS", results.TableNames, results.TableNames.includes('attak-chat'))
      return callback()
    } else {
      var params = {
        "TableName": "attak-chat", 
        "AttributeDefinitions": [
          {
            "AttributeName": "channel",
            "AttributeType": "S"
          },
          {
            "AttributeName": "timestamp",
            "AttributeType": "N"
          },
          // {
          //   "AttributeName": "id", 
          //   "AttributeType": "S"
          // }
        ], 
        "KeySchema": [
          {
            "AttributeName": "channel", 
            "KeyType": "HASH"
          },
          {
            "AttributeName": "timestamp", 
            "KeyType": "RANGE"
          }
        ],
        "ProvisionedThroughput": {
          "ReadCapacityUnits": 5, 
          "WriteCapacityUnits": 5
        }
      }

      dynamo.createTable(params, function(err, results) {    
        console.log("CREATE RESULTS", err, JSON.stringify(results, null, 2))
        // The table will spend some time in a 'CREATED' state,
        // so wait until it's likely to be done
        setTimeout(function() {
          callback()
        }, 600)
      })
    }
  })
}