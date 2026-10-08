'use strict';

const { PutCommand, GetCommand, ScanCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const { docClient, TICKETS_TABLE, COMMENTS_TABLE, requireTables } = require('./lib/dynamo');
const { createUploadUrl, createDownloadUrl } = require('./lib/s3');
const { ok, fail, parseBody } = require('./lib/response');
const { getCaller, requireAgent } = require('./lib/auth');
const {
  validateCreateTicket,
  validateUpdateTicket,
  validateComment,
  validatePresigned,
} = require('./lib/validation');

// ---------- Tickets ----------

async function createTicket(event, caller) {
  const body = parseBody(event);
  validateCreateTicket(body);
  const now = new Date().toISOString();
  const ticketId = uuidv4();
  const item = {
    ticketId,
    title: body.title.trim(),
    description: body.description.trim(),
    status: 'OPEN',
    priority: body.priority || 'MEDIUM',
    category: body.category || 'GENERAL',
    customerId: caller.userId,
    customerEmail: caller.email,
    assignee: null,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    createdAt: now,
    updatedAt: now,
  };
  await docClient.send(new PutCommand({ TableName: TICKETS_TABLE, Item: item }));
  return ok({ ticket: item }, 201);
}

async function listTickets(event, caller) {
  const q = event.queryStringParameters || {};
  const status = q.status ? String(q.status).toUpperCase() : null;
  const priority = q.priority ? String(q.priority).toUpperCase() : null;
  const search = (q.search || '').toLowerCase().trim();
  const mine = q.mine === 'true';
  const limit = Math.min(parseInt(q.limit || '20', 10) || 20, 100);

  const params = { TableName: TICKETS_TABLE, Limit: limit };
  if (event.queryStringParameters?.nextKey) {
    try {
      params.ExclusiveStartKey = JSON.parse(Buffer.from(event.queryStringParameters.nextKey, 'base64').toString('utf8'));
    } catch { /* ignore bad cursor */ }
  }

  // NOTE: Scan is fine for a Free-Tier demo (< few thousand tickets).
  // At scale, add a GSI (e.g. status-createdAt or customerId-createdAt) and Query it instead.
  const out = await docClient.send(new ScanCommand(params));
  let items = out.Items || [];

  // Authorization: customers only see their own tickets unless ?mine=false by an agent.
  if (caller.role !== 'Agent' || mine || caller.role === 'Customer') {
    if (caller.role !== 'Agent') {
      items = items.filter((t) => t.customerId === caller.userId);
    } else if (mine) {
      items = items.filter((t) => t.customerId === caller.userId || t.assignee === caller.email);
    }
  }

  if (status) items = items.filter((t) => t.status === status);
  if (priority) items = items.filter((t) => t.priority === priority);
  if (search) {
    items = items.filter((t) =>
      `${t.title || ''} ${t.description || ''} ${t.ticketId || ''}`.toLowerCase().includes(search),
    );
  }

  items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  let nextKey = null;
  if (out.LastEvaluatedKey) {
    nextKey = Buffer.from(JSON.stringify(out.LastEvaluatedKey)).toString('base64');
  }
  return ok({ tickets: items.slice(0, limit), nextKey, count: items.slice(0, limit).length });
}

async function getTicket(event, caller, ticketId) {
  const out = await docClient.send(new GetCommand({ TableName: TICKETS_TABLE, Key: { ticketId } }));
  if (!out.Item) return fail('Ticket not found', 404);
  if (caller.role !== 'Agent' && out.Item.customerId !== caller.userId) {
    return fail('Forbidden', 403);
  }
  // Attach short-lived download URLs for each stored S3 key (never expose bucket layout otherwise)
  const attachments = [];
  for (const a of out.Item.attachments || []) {
    if (a.key) {
      try {
        attachments.push({ ...a, downloadUrl: await createDownloadUrl(a.key) });
      } catch {
        attachments.push(a);
      }
    } else {
      attachments.push(a);
    }
  }
  return ok({ ticket: { ...out.Item, attachments } });
}

async function updateTicket(event, caller, ticketId) {
  const body = parseBody(event);
  validateUpdateTicket(body);

  const existing = await docClient.send(new GetCommand({ TableName: TICKETS_TABLE, Key: { ticketId } }));
  if (!existing.Item) return fail('Ticket not found', 404);

  const isOwner = existing.Item.customerId === caller.userId;
  // Customers may only edit title/description of their own OPEN tickets.
  if (caller.role !== 'Agent') {
    if (!isOwner) return fail('Forbidden', 403);
    const forbidden = ['status', 'assignee'].filter((k) => k in body);
    if (forbidden.length) return fail(`Forbidden: customers cannot change ${forbidden.join(', ')}`, 403);
    if (existing.Item.status !== 'OPEN') return fail('Customers can only edit OPEN tickets', 403);
  }

  const names = {};
  const values = { ':now': new Date().toISOString() };
  const sets = ['#updatedAt = :now'];
  names['#updatedAt'] = 'updatedAt';

  for (const field of ['status', 'assignee', 'priority', 'title', 'description', 'category']) {
    if (field in body) {
      names[`#${field}`] = field;
      values[`:${field}`] = body[field];
      sets.push(`#${field} = :${field}`);
    }
  }

  await docClient.send(new UpdateCommand({
    TableName: TICKETS_TABLE,
    Key: { ticketId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  const updated = await docClient.send(new GetCommand({ TableName: TICKETS_TABLE, Key: { ticketId } }));
  return ok({ ticket: updated.Item });
}

// ---------- Comments (PK ticketId, SK commentId) ----------

async function addComment(event, caller, ticketId) {
  const body = parseBody(event);
  validateComment(body);

  const t = await docClient.send(new GetCommand({ TableName: TICKETS_TABLE, Key: { ticketId } }));
  if (!t.Item) return fail('Ticket not found', 404);
  if (caller.role !== 'Agent' && t.Item.customerId !== caller.userId) {
    return fail('Forbidden', 403);
  }

  const now = new Date().toISOString();
  const comment = {
    ticketId,
    commentId: `${now}#${uuidv4()}`,
    authorId: caller.userId,
    authorEmail: caller.email,
    authorRole: caller.role,
    message: body.message.trim(),
    createdAt: now,
  };
  await docClient.send(new PutCommand({ TableName: COMMENTS_TABLE, Item: comment }));
  return ok({ comment }, 201);
}

async function listComments(event, caller, ticketId) {
  const t = await docClient.send(new GetCommand({ TableName: TICKETS_TABLE, Key: { ticketId } }));
  if (!t.Item) return fail('Ticket not found', 404);
  if (caller.role !== 'Agent' && t.Item.customerId !== caller.userId) {
    return fail('Forbidden', 403);
  }
  const out = await docClient.send(new QueryCommand({
    TableName: COMMENTS_TABLE,
    KeyConditionExpression: 'ticketId = :t',
    ExpressionAttributeValues: { ':t': ticketId },
    ScanIndexForward: true,
    Limit: 100,
  }));
  return ok({ comments: out.Items || [], count: (out.Items || []).length });
}

// ---------- S3 presigned URL ----------

async function presignedUrl(event, caller) {
  const body = parseBody(event);
  validatePresigned(body);
  const safeName = String(body.fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  const key = `tickets/${caller.userId}/${Date.now()}-${safeName}`;
  const { uploadUrl, expiresIn } = await createUploadUrl({ key, contentType: body.contentType });
  return ok({ uploadUrl, key, expiresIn, fileName: safeName });
}

// ---------- Router (API Gateway HTTP API, payload v2) ----------

async function handler(event) {
  // CORS preflight (also handled by API Gateway CORS config; belt and suspenders)
  if (event?.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: require('./lib/response').corsHeaders(), body: '' };
  }
  try {
    requireTables();
    const caller = getCaller(event);
    const method = event?.requestContext?.http?.method || event.httpMethod;
    // Strip stage prefix: HTTP API passes full path including stage; routeKey is cleaner.
    const routeKey = event.routeKey || `${method} ${event.path}`;
    const pathParams = event.pathParameters || {};
    const rawPath = event.rawPath || event.path || '';

    // Exact routes first (important: /tickets/presigned-url must win over /tickets/{ticketId})
    if (routeKey === 'POST /tickets/presigned-url' || rawPath.endsWith('/tickets/presigned-url')) {
      return await presignedUrl(event, caller);
    }
    if (routeKey === 'POST /tickets') return await createTicket(event, caller);
    if (routeKey === 'GET /tickets') return await listTickets(event, caller);

    const ticketId = pathParams.ticketId || pathParams.proxy;
    if (ticketId && routeKey === 'GET /tickets/{ticketId}') return await getTicket(event, caller, ticketId);
    if (ticketId && routeKey === 'PUT /tickets/{ticketId}') return await updateTicket(event, caller, ticketId);
    if (ticketId && routeKey === 'POST /tickets/{ticketId}/comments') return await addComment(event, caller, ticketId);
    if (ticketId && routeKey === 'GET /tickets/{ticketId}/comments') return await listComments(event, caller, ticketId);

    // Fallback path-based routing (works when routeKey uses $default or different stage)
    const mTicket = rawPath.match(/\/tickets\/([^/]+)(\/comments)?$/);
    if (mTicket && mTicket[2] === '/comments' && method === 'POST') return await addComment(event, caller, mTicket[1]);
    if (mTicket && mTicket[2] === '/comments' && method === 'GET') return await listComments(event, caller, mTicket[1]);
    if (mTicket && !mTicket[2] && method === 'GET') return await getTicket(event, caller, mTicket[1]);
    if (mTicket && !mTicket[2] && method === 'PUT') return await updateTicket(event, caller, mTicket[1]);

    return fail(`No route: ${routeKey}`, 404);
  } catch (err) {
    console.error(err);
    const status = err.statusCode || 500;
    if (status === 500) return fail('Internal server error', 500);
    return fail(err.message, status);
  }
}

module.exports = {
  handler,
  // exported for unit tests
  createTicket, listTickets, getTicket, updateTicket, addComment, listComments, presignedUrl,
};
