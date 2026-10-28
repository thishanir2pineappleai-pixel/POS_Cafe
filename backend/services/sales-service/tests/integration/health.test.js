const { test } = require('node:test');
const assert = require('node:assert/strict');
const { useTestServer } = require('./helpers');

const { api } = useTestServer();

test('GET /health answers ok without signing in', async () => {
  const res = await api('GET', '/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.service, 'sales-service');
  assert.equal(res.body.data.status, 'ok');
});

test('an unknown route answers 404 in the standard error envelope', async () => {
  const res = await api('GET', '/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'NOT_FOUND');
});
