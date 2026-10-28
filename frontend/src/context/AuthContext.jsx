import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../api/authApi.js';
import { configureClient } from '../api/client.js';
import { ApiError, messageFor } from '../api/errorHandler.js';

// Real authentication against the Auth Service (through the API Gateway).
//   * signIn sends the email and password; the server answers with a signed access token and the user.
//   * "Keep me signed in" keeps the token in localStorage (survives closing the browser); otherwise it lives in sessionStorage
//     (survives a reload, ends with the tab). ponytail: a token in web storage can be read by any script on the page, so the
//     app must never load third-party scripts; a httpOnly cookie would need backend changes.
//   * On start the stored token is checked with GET /auth/me. A 401 (expired, logged out elsewhere, password reset) clears it.
//   * Every other API call carries the token automatically (api/client.js); a 401 on any of them ends the session here.
//   * signOut ends the session on the server and forgets the token.
const KEY = 'poscafe.session';
const AuthContext = createContext({ signedIn: false, checking: false, user: null, token: null, loginAt: null, signIn: async () => ({ ok: false }), signOut: async () => {}, refreshUser: async () => {} });

// The token the API client attaches, and the function that ends the session when the server answers 401.
let currentToken = null;
let expireSession = () => {};
configureClient({ getToken: () => currentToken, onExpired: () => expireSession() });

const stores = () => [window.sessionStorage, window.localStorage];
const load = () => {
  for (const store of stores()) {
    try {
      const saved = JSON.parse(store.getItem(KEY));
      if (saved?.token) return { token: saved.token, loginAt: saved.loginAt ?? null };
    } catch { /* unreadable or blocked storage: treat as signed out */ }
  }
  return null;
};
const save = (token, loginAt, keep) => { try { (keep ? window.localStorage : window.sessionStorage).setItem(KEY, JSON.stringify({ token, loginAt })); } catch { /* storage blocked: the session lasts until reload */ } };
const clear = () => { for (const store of stores()) { try { store.removeItem(KEY); } catch { /* ignore */ } } };

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // { token, user, loginAt }
  const [checking, setChecking] = useState(() => load() !== null);

  const begin = (next) => { currentToken = next?.token ?? null; setSession(next); };

  useEffect(() => {
    expireSession = () => { clear(); begin(null); };
    const saved = load();
    if (!saved) return undefined;
    let cancelled = false;
    authApi.me(saved.token)
      .then((user) => { if (!cancelled) begin({ token: saved.token, user, loginAt: saved.loginAt }); })
      .catch((err) => { if (err instanceof ApiError && err.status === 401) clear(); }) // other failures: stay signed out, keep the token for the next try
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  const signIn = useCallback(async ({ email, password, keepSignedIn }) => {
    try {
      const { token, user } = await authApi.login({ email, password, keepSignedIn });
      const loginAt = new Date().toISOString();
      clear();
      save(token, loginAt, keepSignedIn);
      begin({ token, user, loginAt });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError && err.status === 401 ? 'Incorrect email or password.' : messageFor(err) };
    }
  }, []);

  const signOut = useCallback(async () => {
    const token = session?.token;
    clear();
    begin(null);
    if (token) await authApi.logout(token).catch(() => {}); // best effort: the token is already forgotten here, and expires on its own
  }, [session]);

  // Re-reads the signed-in user and their shops (after a shop or profile changed).
  const refreshUser = useCallback(async () => {
    if (!currentToken) return;
    const user = await authApi.me(currentToken).catch(() => null);
    if (user) setSession((s) => (s ? { ...s, user } : s));
  }, []);

  const value = useMemo(() => ({
    signedIn: session !== null, checking, user: session?.user ?? null, token: session?.token ?? null, loginAt: session?.loginAt ?? null, signIn, signOut, refreshUser,
  }), [session, checking, signIn, signOut, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
