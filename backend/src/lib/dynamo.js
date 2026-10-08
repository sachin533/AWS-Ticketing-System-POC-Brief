'use strict';

/**
 * Shared DynamoDB document client (AWS SDK v3).
 * Table names / region come from environment variables — never hard-coded.
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const region = process.env.AWS_REGION || 'us-east-1';

const ddb = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddb);

const TICKETS_TABLE = process.env.TICKETS_TABLE;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE;

function requireTables() {
  if (!TICKETS_TABLE || !COMMENTS_TABLE) {
    throw new Error('Missing env vars TICKETS_TABLE / COMMENTS_TABLE');
  }
}

module.exports = { docClient, TICKETS_TABLE, COMMENTS_TABLE, requireTables };
