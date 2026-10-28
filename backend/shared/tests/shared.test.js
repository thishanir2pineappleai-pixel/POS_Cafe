// Checks for the domain-independent helpers every service relies on.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const clock = require('../clock');
const { AppError, sendError, ERROR_CODES } = require('../errors');
const { sendSuccess } = require('../responses');
const { parsePagination, buildMeta } = require('../pagination');
const { parseDateOnly, addDays, weekdayOf, shiftCovers } = require('../date');

const fakeRes = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

test('clock: advance moves time, reset puts it back', () => {
  const before = clock.now();
  clock.advance(60_000);
  assert.ok(clock.now() - before >= 60_000);
  clock.reset();
  assert.ok(clock.now() - before < 5_000);
});

test('error and success envelopes keep their shape', () => {
  const err = fakeRes();
  sendError(err, 404, ERROR_CODES.NOT_FOUND, 'nope');
  assert.deepEqual([err.code, err.body], [404, { success: false, code: 'NOT_FOUND', message: 'nope' }]);
  const ok = fakeRes();
  sendSuccess(ok, { status: 201, data: { id: 1 } });
  assert.deepEqual([ok.code, ok.body], [201, { success: true, data: { id: 1 } }]);
  assert.ok(new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'x') instanceof Error);
});

test('pagination: defaults, limits and meta', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 10, errors: [] });
  assert.equal(parsePagination({ page: '0', limit: '101' }).errors.length, 2);
  assert.deepEqual(buildMeta(25, 2, 10), { total: 25, page: 2, limit: 10, totalPages: 3 });
});

test('date-only helpers do not drift with the local time zone', () => {
  assert.equal(parseDateOnly('2026-02-30'), null);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(weekdayOf('2026-10-19'), 'mon');
  assert.equal(shiftCovers('22:00', '06:00', 23 * 60), true); // past-midnight shift
});

const { parseSecret, parseHost, parsePort, parseUrl } = require('../env');

test('env rules: secrets are required in production, hosts must be loopback, ports and URLs are validated', () => {
  assert.throws(() => parseSecret('JWT_SECRET', '', true), /required when NODE_ENV=production/);
  assert.throws(() => parseSecret('JWT_SECRET', 'short', false), /at least 32/);
  assert.deepEqual(parseSecret('JWT_SECRET', 'x'.repeat(32), true), { secret: 'x'.repeat(32), ephemeral: false });
  const dev = parseSecret('JWT_SECRET', '', false);
  assert.equal(dev.ephemeral, true);
  assert.equal(dev.secret.length, 64);
  assert.equal(parseHost(undefined), '127.0.0.1');
  assert.throws(() => parseHost('0.0.0.0'), /loopback/);
  assert.equal(parsePort(undefined, 4001), 4001);
  assert.throws(() => parsePort('70000', 4001), /PORT/);
  assert.equal(parseUrl('X', 'http://127.0.0.1:4001/ignored/path', 'http://a'), 'http://127.0.0.1:4001');
  assert.throws(() => parseUrl('X', 'not a url', 'http://a'), /full URL/);
});

test('database URL: the RSA key may be fetched only for a loopback database host', () => {
  const { parseDatabaseUrl } = require('../env');
  assert.deepEqual(parseDatabaseUrl('X', 'mysql://u:p%40ss@127.0.0.1:3399/db'), { host: '127.0.0.1', port: 3399, user: 'u', password: 'p@ss', database: 'db', allowPublicKeyRetrieval: true });
  assert.equal(parseDatabaseUrl('X', 'mysql://u:p@localhost/db').allowPublicKeyRetrieval, true);
  assert.equal('allowPublicKeyRetrieval' in parseDatabaseUrl('X', 'mysql://u:p@db.example.com:3306/db'), false);
});
