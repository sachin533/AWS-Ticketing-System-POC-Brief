/**
 * Cognito Hosted UI auth (Authorization Code + PKCE, no SDK needed).
 * Flow: login() -> Hosted UI -> /login?code=... -> exchangeCode() -> store tokens.
 * API calls use the ID token as `Authorization: Bearer <idToken>`.
 */
const cfg = {
  domain: import.meta.env.VITE_COGNITO_DOMAIN,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI,
  logoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI,
};

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(digest);
}

function randomString(len = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let s = '';
  crypto.getRandomValues(new Uint8Array(len)).forEach((n) => { s += chars[n % chars.length]; });
  return s;
}

export function decodeJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch { return {}; }
}

export async function login() {
  const verifier = randomString(64);
  const challenge = await pkceChallenge(verifier);
  sessionStorage.setItem('pkce_verifier', verifier);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    scope: 'email openid phone',
    redirect_uri: cfg.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  window.location.href = `${cfg.domain}/oauth2/authorize?${params}`;
}

export async function handleCallback(code) {
  const verifier = sessionStorage.getItem('pkce_verifier');
  const res = await fetch(`${cfg.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      code,
      redirect_uri: cfg.redirectUri,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error('Token exchange failed');
  const tokens = await res.json();
  localStorage.setItem('id_token', tokens.id_token);
  localStorage.setItem('access_token', tokens.access_token);
  if (tokens.refresh_token) localStorage.setItem('refresh_token', tokens.refresh_token);
  sessionStorage.removeItem('pkce_verifier');
  return tokens.id_token;
}

export function logout() {
  localStorage.removeItem('id_token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  const params = new URLSearchParams({ client_id: cfg.clientId, logout_uri: cfg.logoutUri });
  window.location.href = `${cfg.domain}/logout?${params}`;
}

export function getIdToken() { return localStorage.getItem('id_token'); }
export function isAuthenticated() { return !!getIdToken(); }

export function currentUser() {
  const token = getIdToken();
  if (!token) return null;
  const claims = decodeJwt(token);
  const groups = claims['cognito:groups'] || [];
  return {
    sub: claims.sub,
    email: claims.email || claims['cognito:username'],
    groups,
    role: groups.includes('Agents') ? 'Agent' : 'Customer',
  };
}

export function isAgent() { return currentUser()?.role === 'Agent'; }
