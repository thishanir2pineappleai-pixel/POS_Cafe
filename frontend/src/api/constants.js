// Where the API Gateway is. Set VITE_API_BASE_URL in frontend/.env to change it (no trailing slash needed).
// The frontend only ever talks to the Gateway, never to an individual service.
export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || 'http://127.0.0.1:4100/api/v1').replace(/\/+$/, '');

// How long a request may take before it is given up (the Gateway answers 504 after 15 s on its own).
export const REQUEST_TIMEOUT_MS = 20000;
