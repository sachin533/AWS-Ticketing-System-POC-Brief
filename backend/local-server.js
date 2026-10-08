'use strict';
/**
 * DEV-ONLY local runner for the ticketing backend.
 * The real Lambda (src/index.js) needs DynamoDB + S3 + Cognito, so it cannot
 * run standalone. This file mirrors the SAME 7 routes with in-memory storage
 * so the Vue frontend can be developed end-to-end on localhost.
 *
 * Usage:  node backend/local-server.js [port]
 * Env:    PORT (default 3000)
 *
 * Auth (dev only, no verification): accepts any of
 *   - Authorization: Bearer <jwt>  -> decodes payload for sub/email/cognito:groups
 *   - x-test-role: Agent           -> acts as agent@local.dev
 *   - nothing                      -> acts as customer@local.dev
 */
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { validateCreateTicket, validateUpdateTicket, validateComment, validatePresigned } = require('./src/lib/validation');

const PORT = parseInt(process.argv[2] || process.env.PORT || '3000', 10);
const tickets = new Map(); // ticketId -> ticket
const comments = new Map(); // ticketId -> [comment]
const uploads = new Map(); // key -> { bytes, contentType }

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
  } catch { return {}; }
}

function callerFrom(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ') && auth.length > 20) {
    const claims = decodeJwtPayload(auth.slice(7));
    const groups = claims['cognito:groups'] || [];
    return {
      userId: claims.sub || 'local-user',
      email: claims.email || claims['cognito:username'] || 'customer@local.dev',
      role: groups.includes('Agents') ? 'Agent' : 'Customer',
    };
  }
  if (String(req.headers['x-test-role'] || '').toLowerCase() === 'agent') {
    return { userId: 'local-agent', email: 'agent@local.dev', role: 'Agent' };
  }
  return { userId: 'local-customer', email: 'customer@local.dev', role: 'Customer' };
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-test-role',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return resolve({});
      const ct = req.headers['content-type'] || '';
      if (ct.includes('application/json') || req.url.startsWith('/tickets')) {
        try { resolve(JSON.parse(buf.toString('utf8') || '{}')); }
        catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
      } else resolve(buf);
    });
    req.on('error', reject);
  });
}

// Seed one demo ticket so the dashboard is not empty
(function seed() {
  const id = uuidv4();
  const now = new Date().toISOString();
  tickets.set(id, {
    ticketId: id, title: 'Welcome — sample ticket', description: 'Created by the local dev server seed.',
    status: 'OPEN', priority: 'MEDIUM', category: 'GENERAL', customerId: 'local-customer',
    customerEmail: 'customer@local.dev', assignee: null, attachments: [],
    createdAt: now, updatedAt: now,
  });
})();

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const caller = callerFrom(req);

  // API index (so opening http://localhost:PORT in a browser shows help, not "No route")
  if ((path === '/' || path === '/health') && req.method === 'GET') {
    return send(res, 200, {
      message: 'Ticketing local backend (DEV ONLY, in-memory). Use the Vue app at http://localhost:5173 — this port is API-only.',
      endpoints: [
        'POST /tickets', 'GET /tickets', 'GET /tickets/{ticketId}', 'PUT /tickets/{ticketId}',
        'POST /tickets/{ticketId}/comments', 'GET /tickets/{ticketId}/comments', 'POST /tickets/presigned-url',
      ],
    });
  }

  // Raw file bytes served back for locally "uploaded" attachments
  if (path.startsWith('/local-uploads/') && req.method === 'GET') {
    const f = uploads.get(decodeURIComponent(path.slice('/local-uploads/'.length)));
    if (!f) return send(res, 404, { message: 'Not found' });
    res.writeHead(200, { 'Content-Type': f.contentType || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    return res.end(f.bytes);
  }
  // S3 PUT target (presigned-url stub points here)
  if (path.startsWith('/local-uploads/') && req.method === 'PUT') {
    const key = decodeURIComponent(path.slice('/local-uploads/'.length));
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      uploads.set(key, { bytes: Buffer.concat(chunks), contentType: req.headers['content-type'] });
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('OK');
    });
    return;
  }

  try {
    // POST /tickets/presigned-url (exact match BEFORE /tickets/:id)
    if (path === '/tickets/presigned-url' && req.method === 'POST') {
      const body = await readBody(req);
      validatePresigned(body);
      const safe = String(body.fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
      const key = `tickets/${caller.userId}/${Date.now()}-${safe}`;
      return send(res, 200, {
        uploadUrl: `http://localhost:${PORT}/local-uploads/${encodeURIComponent(key)}`,
        key, expiresIn: 300, fileName: safe,
      });
    }
    // POST /tickets
    if (path === '/tickets' && req.method === 'POST') {
      const body = await readBody(req);
      validateCreateTicket(body);
      const now = new Date().toISOString();
      const ticketId = uuidv4();
      const item = {
        ticketId, title: body.title.trim(), description: body.description.trim(),
        status: 'OPEN', priority: body.priority || 'MEDIUM',
        category: body.category || 'GENERAL',
        customerId: caller.userId, customerEmail: caller.email, assignee: null,
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        createdAt: now, updatedAt: now,
      };
      tickets.set(ticketId, item);
      return send(res, 201, { ticket: item });
    }
    // GET /tickets
    if (path === '/tickets' && req.method === 'GET') {
      let items = [...tickets.values()];
      if (caller.role !== 'Agent') items = items.filter((t) => t.customerId === caller.userId);
      else if (url.searchParams.get('mine') === 'true') {
        items = items.filter((t) => t.customerId === caller.userId || t.assignee === caller.email);
      }
      const status = url.searchParams.get('status');
      const priority = url.searchParams.get('priority');
      const search = (url.searchParams.get('search') || '').toLowerCase().trim();
      if (status) items = items.filter((t) => t.status === status.toUpperCase());
      if (priority) items = items.filter((t) => t.priority === priority.toUpperCase());
      if (search) items = items.filter((t) => `${t.title} ${t.description} ${t.ticketId}`.toLowerCase().includes(search));
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return send(res, 200, { tickets: items, nextKey: null, count: items.length });
    }

    const m = path.match(/^\/tickets\/([^/]+)(\/comments)?$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const t = tickets.get(id);
      if (!t) return send(res, 404, { message: 'Ticket not found' });
      if (caller.role !== 'Agent' && t.customerId !== caller.userId) {
        return send(res, 403, { message: 'Forbidden' });
      }
      // GET /tickets/:id
      if (!m[2] && req.method === 'GET') {
        const attachments = (t.attachments || []).map((a) => ({
          ...a,
          downloadUrl: a.key && uploads.has(a.key)
            ? `http://localhost:${PORT}/local-uploads/${encodeURIComponent(a.key)}` : a.downloadUrl,
        }));
        return send(res, 200, { ticket: { ...t, attachments } });
      }
      // PUT /tickets/:id
      if (!m[2] && req.method === 'PUT') {
        const body = await readBody(req);
        validateUpdateTicket(body);
        if (caller.role !== 'Agent') {
          const forbidden = ['status', 'assignee'].filter((k) => k in body);
          if (forbidden.length) return send(res, 403, { message: `Forbidden: customers cannot change ${forbidden.join(', ')}` });
          if (t.status !== 'OPEN') return send(res, 403, { message: 'Customers can only edit OPEN tickets' });
        }
        for (const f of ['status', 'assignee', 'priority', 'title', 'description', 'category']) {
          if (f in body) t[f] = body[f];
        }
        t.updatedAt = new Date().toISOString();
        return send(res, 200, { ticket: t });
      }
      // GET /tickets/:id/comments
      if (m[2] && req.method === 'GET') {
        const list = comments.get(id) || [];
        return send(res, 200, { comments: list, count: list.length });
      }
      // POST /tickets/:id/comments
      if (m[2] && req.method === 'POST') {
        const body = await readBody(req);
        validateComment(body);
        const now = new Date().toISOString();
        const comment = {
          ticketId: id, commentId: `${now}#${uuidv4()}`,
          authorId: caller.userId, authorEmail: caller.email, authorRole: caller.role,
          message: body.message.trim(), createdAt: now,
        };
        if (!comments.has(id)) comments.set(id, []);
        comments.get(id).push(comment);
        return send(res, 201, { comment });
      }
    }
    return send(res, 404, { message: `No route: ${req.method} ${path}` });
  } catch (e) {
    return send(res, e.status || e.statusCode || 500, { message: e.message || 'Internal server error' });
  }
});

server.listen(PORT, () => console.log(`Ticketing local backend on http://localhost:${PORT} (DEV ONLY, in-memory)`));
