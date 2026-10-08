import { getIdToken } from './auth';

const BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '';

async function req(path, { method = 'GET', body, query } = {}) {
  let url = `${BASE}${path}`;
  if (query) {
    const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null));
    if ([...qs].length) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getIdToken() || ''}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Token expired/invalid: drop the session so the router guard sends the user to /login.
    localStorage.removeItem('id_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    throw new Error('Session expired — please sign in again.');
  }
  if (!res.ok) throw new Error(data.message || `API error ${res.status}`);
  return data;
}

export const api = {
  listTickets: (filters = {}) => req('/tickets', { query: filters }),
  /**
   * Pagination fix: the backend scans DynamoDB in pages (default 20 rows per
   * scan) and returns a base64 `nextKey` cursor (LastEvaluatedKey). Filters are
   * applied server-side per page, so a single call only returns the matches
   * found in the FIRST scan page. This helper follows `nextKey` until the
   * backend reports no further pages and returns the full accumulated list.
   * Guards: stops on absent/null/repeated cursor; hard cap of 100 pages.
   */
  listAllTickets: async (filters = {}, onProgress) => {
    const all = [];
    let nextKey = null;
    let pages = 0;
    const seen = new Set();
    for (;;) {
      const data = await req('/tickets', {
        query: { ...filters, ...(nextKey ? { nextKey } : {}) },
      });
      all.push(...(data.tickets || []));
      pages += 1;
      if (onProgress) onProgress({ pages, loaded: all.length });
      const cur = data.nextKey || null;
      // Stop safely: no cursor, repeated cursor (server quirk), or page cap.
      if (!cur || seen.has(cur) || pages >= 100) break;
      seen.add(cur);
      nextKey = cur;
    }
    return { tickets: all, pages, count: all.length };
  },
  getTicket: (id) => req(`/tickets/${id}`),
  createTicket: (payload) => req('/tickets', { method: 'POST', body: payload }),
  updateTicket: (id, payload) => req(`/tickets/${id}`, { method: 'PUT', body: payload }),
  listComments: (id) => req(`/tickets/${id}/comments`),
  addComment: (id, message) => req(`/tickets/${id}/comments`, { method: 'POST', body: { message } }),
  presignedUrl: (fileName, contentType) =>
    req('/tickets/presigned-url', { method: 'POST', body: { fileName, contentType } }),
  /** Upload bytes straight to S3 using the presigned PUT URL (bypasses Lambda — cheaper + faster). */
  uploadToS3: async (uploadUrl, file, contentType) => {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType || file.type || 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) throw new Error('S3 upload failed');
  },
};
