// The wording shown to the person after the server tried to deliver an email, and where the sign-up goes after the owner step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailNotice, phoneNotice, screenAfterOwner, PHONE_SKIPPED_NOTICE } from '../src/api/deliveryNotice.js';

test('an email the mail server accepted needs no warning', () => {
  assert.equal(emailNotice({ channel: 'email', delivered: true }), '');
  assert.equal(emailNotice(undefined), '');
});

test('an email that was NOT sent always produces a warning: never silence, never "sent"', () => {
  for (const reason of ['not_configured', 'captured_in_dev_outbox', 'smtp_connection', 'smtp_timeout', 'smtp_tls', 'smtp_auth_failed', 'smtp_temporary', 'smtp_something_new']) {
    const text = emailNotice({ channel: 'email', delivered: false, reason });
    assert.ok(text.length > 20, `${reason} must explain itself`);
    assert.match(text, /\b(no code was sent|could not be sent|did not accept|cannot be used)\b/i, `${reason} must state plainly that nothing was delivered`);
    assert.ok(!/(?<!no code )(?<!not )\b(has been|have been|was|were) sent\b/i.test(text), `${reason} must not claim a message was sent`);
  }
  assert.match(emailNotice({ delivered: false, reason: 'smtp_recipient_rejected' }), /did not accept this email address/);
  assert.match(emailNotice({ delivered: false, reason: 'smtp_auth_failed' }), /Resend/, 'a send problem points to Resend');
});

test('the wording never leaks server internals (no SMTP codes, host names or passwords)', () => {
  for (const reason of ['smtp_auth_failed', 'smtp_connection', 'smtp_tls', 'not_configured']) {
    assert.ok(!/535|smtp|password|gmail|host/i.test(emailNotice({ delivered: false, reason })), reason);
  }
});

test('SMS: a phone code is never claimed to be sent', () => {
  assert.match(phoneNotice({ channel: 'sms', delivered: false, reason: 'not_configured' }), /no phone code was sent/);
  assert.equal(phoneNotice({ channel: 'sms', delivered: true }), '');
});

test('the skipped-phone notice says plainly that the number was NOT verified', () => {
  assert.match(PHONE_SKIPPED_NOTICE, /NOT verified/);
});

test('after the owner step the SERVER decides: phone code screen, or business details when it skipped the phone code', () => {
  assert.equal(screenAfterOwner({ nextStep: 'phone_verification' }), 'phoneVerify');
  assert.equal(screenAfterOwner({ nextStep: 'business_details', phoneVerification: 'skipped' }), 'business');
  assert.equal(screenAfterOwner(undefined), 'phoneVerify', 'when in doubt keep the verification step');
});
