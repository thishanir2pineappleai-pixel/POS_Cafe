// In-memory sessions (temporary, see store.js: every session ends when the server restarts).
// An access token carries a session id; the token only works while its session exists and is not revoked.
const crypto = require('node:crypto');
const { store, clone } = require('./store');

module.exports = {
  async create({ userId, accountId, expiresAt, createdAt }) {
    const session = { sid: crypto.randomUUID(), userId, accountId, expiresAt, createdAt, revokedAt: null };
    store.sessions.set(session.sid, session);
    return clone(session);
  },
  async find(sid) {
    const session = store.sessions.get(sid);
    return session ? clone(session) : null;
  },
  async revoke(sid, at) {
    const session = store.sessions.get(sid);
    if (session && !session.revokedAt) session.revokedAt = at;
  },
  // Ends every session of a user, optionally keeping one (the session that is making the change).
  async revokeAllForUser(userId, at, exceptSid = null) {
    let count = 0;
    for (const s of store.sessions.values()) {
      if (s.userId === userId && s.sid !== exceptSid && !s.revokedAt) { s.revokedAt = at; count += 1; }
    }
    return count;
  },
};
