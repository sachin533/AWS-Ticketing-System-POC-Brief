'use strict';

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  };
}

function ok(body, statusCode = 200) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

function fail(message, statusCode = 400, extra) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({ message, ...(extra || {}) }),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(typeof event.body === 'string' ? event.body : JSON.stringify(event.body));
  } catch {
    const err = new Error('Invalid JSON body');
    err.statusCode = 400;
    throw err;
  }
}

module.exports = { ok, fail, parseBody, corsHeaders };
