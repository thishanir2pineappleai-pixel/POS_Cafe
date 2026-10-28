// One error type for every API call, built from the backend's standard error body
// { success: false, code, message, errors?: [{ field, message }] }.
export class ApiError extends Error {
  constructor(status, code, message, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // HTTP status, or 0 when the server could not be reached
    this.code = code;
    this.errors = errors;
  }
}

// A sentence a person can read, by cause (the backend's own message is kept for validation errors, which are written for people).
export function messageFor(err) {
  if (!(err instanceof ApiError)) return 'Something went wrong. Please try again.';
  if (err.status === 0) return 'Cannot reach the server. Check your connection and that the backend is running.';
  if (err.status === 429) return 'Too many attempts. Please try again later.';
  if (err.status === 503 || err.status === 504) return 'The service is temporarily unavailable. Please try again shortly.';
  if (err.status >= 500) return 'Something went wrong on the server. Please try again.';
  return err.message || 'The request was not accepted.';
}

// Runs an API call and turns the outcome into { ok: true, data } or { ok: false, error, fields } so a screen never has to
// catch. `fields` maps the server's per-field validation messages ({ field, message }) to { [field]: message }.
export async function attempt(call) {
  try {
    return { ok: true, data: await call() };
  } catch (err) {
    const fields = {};
    if (err instanceof ApiError) for (const e of err.errors ?? []) if (e.field && !fields[e.field]) fields[e.field] = e.message;
    // The server's generic "Validation failed" says nothing on its own: name the fields it refused.
    const named = Object.entries(fields).map(([field, message]) => `${field}: ${message}`).join('; ');
    const message = err instanceof ApiError && err.status === 400 && named ? `${messageFor(err)} (${named})` : messageFor(err);
    return { ok: false, error: message, fields, status: err instanceof ApiError ? err.status : 0 };
  }
}
