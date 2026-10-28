// The one place that sends requests to the API Gateway. Returns the `data` of the backend's success body and throws an
// ApiError otherwise (including when the server cannot be reached or does not answer in time).
// The signed-in token is attached automatically (AuthContext registers it with configureClient); a 401 on such a request
// means the session ended, and AuthContext is told so it can return to the login screen. An explicit `token` option (used by
// the login/logout/me calls) bypasses that.
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './constants.js';
import { ApiError } from './errorHandler.js';

let session = { getToken: () => null, onExpired: () => {} };
export const configureClient = (next) => { session = { ...session, ...next }; };

// { a: 1, b: '', c: undefined } -> "?a=1" (empty values are left out)
const queryString = (query) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : '';
};

async function send(method, path, { json, form, token, signal, query } = {}) {
  const explicit = token !== undefined; // an explicit token, or null for "send none" (login, signup, password reset), bypasses the session
  const bearer = explicit ? token : session.getToken();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}${queryString(query)}`, {
      method,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined), // FormData sets its own content type
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'The server could not be reached');
  }
  if (res.status === 401 && !explicit && bearer) session.onExpired();
  return res;
}

const failure = (res, body) => new ApiError(res.status, body?.code ?? 'UNKNOWN_ERROR', body?.message ?? `Request failed (${res.status})`, body?.errors ?? []);

export async function request(method, path, options) {
  const res = await send(method, path, options);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) throw failure(res, body);
  return body.data;
}

// Like request, but returns the whole body ({ data, meta, ... }): for paged lists.
export async function requestPage(method, path, options) {
  const res = await send(method, path, options);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) throw failure(res, body);
  return { data: body.data, meta: body.meta ?? null };
}

// A file the server generates (CSV export): -> { blob, filename } where filename is the server's suggestion or null.
export async function download(path, options) {
  const res = await send('GET', path, options);
  if (!res.ok) throw failure(res, await res.json().catch(() => null));
  const filename = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? null;
  return { blob: await res.blob(), filename };
}

// Saves a Blob through the browser's download mechanism.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Where uploaded pictures are served from. The Gateway routes /uploads/* to the owning service.
export const uploadUrl = (path) => {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE_URL.replace(/\/api\/v1$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
};
