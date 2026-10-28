// Unit tests for the password hashing service (Node's built-in scrypt; no dependency, no database).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('@pos-cafe/shared/password');

test('hashPassword: salted scrypt string that never contains the password', async () => {
  const hash = await hashPassword('Abc@1234');
  assert.match(hash, /^scrypt\$65536\$8\$2\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(!hash.includes('Abc@1234'));
  assert.notEqual(hash, await hashPassword('Abc@1234'), 'a random salt makes every hash different');
});

test('verifyPassword: accepts the right password only', async () => {
  const hash = await hashPassword('Abc@1234');
  assert.equal(await verifyPassword('Abc@1234', hash), true);
  assert.equal(await verifyPassword('abc@1234', hash), false);
  assert.equal(await verifyPassword('', hash), false);
  assert.equal(await verifyPassword(' Abc@1234', hash), false, 'passwords are never trimmed');
});

test('verifyPassword: unusable input is simply false', async () => {
  const hash = await hashPassword('x');
  for (const stored of [undefined, null, '', 'plaintext', 'bcrypt$1$2$3$4$5', 'scrypt$1$2$3', 'scrypt$x$y$z$@@$@@', hash.replace(/\$[^$]*$/, '$')]) {
    assert.equal(await verifyPassword('x', stored), false, String(stored));
  }
  assert.equal(await verifyPassword(undefined, hash), false);
  assert.equal(await verifyPassword(123, hash), false);
});
