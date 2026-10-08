'use strict';

/**
 * Extract caller identity from API Gateway HTTP API JWT authorizer (payload v2).
 * event.requestContext.authorizer.jwt.claims contains the verified Cognito ID token claims.
 * Falls back to a local-test header for `npm test` only (never used in AWS).
 */
function getCaller(event) {
  const claims =
    event?.requestContext?.authorizer?.jwt?.claims ||
    event?.requestContext?.authorizer?.claims ||
    null;

  if (claims) {
    const groupsRaw = claims['cognito:groups'];
    const groups = Array.isArray(groupsRaw)
      ? groupsRaw
      : typeof groupsRaw === 'string'
        ? groupsRaw.split(',').filter(Boolean)
        : [];
    const role = groups.includes('Agents') ? 'Agent' : 'Customer';
    // TEMPORARY DIAGNOSTIC (Agent 0-tickets investigation): logs ONLY non-sensitive
    // claim metadata — never tokens, headers, or secrets. Remove after diagnosis.
    try {
      console.info(JSON.stringify({
        diag: 'getCaller',
        hasGroupsClaim: groupsRaw !== undefined && groupsRaw !== null,
        groups: Array.isArray(groupsRaw) ? groupsRaw : groups,
        sub: claims.sub || null,
        username: claims['cognito:username'] || null,
        email: claims.email || null,
        role,
      }));
    } catch { /* logging must never break auth */ }
    return {
      userId: claims.sub,
      email: claims.email || claims['cognito:username'] || 'unknown',
      groups,
      role,
      claims,
    };
  }

  // Local testing escape hatch only
  if (process.env.ALLOW_TEST_CALLER === '1' && event?.headers?.['x-test-user']) {
    try {
      return JSON.parse(event.headers['x-test-user']);
    } catch { /* ignore */ }
  }

  const err = new Error('Unauthorized: missing JWT claims');
  err.statusCode = 401;
  throw err;
}

function requireAgent(caller) {
  if (caller.role !== 'Agent') {
    const err = new Error('Forbidden: Agents only');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = { getCaller, requireAgent };
