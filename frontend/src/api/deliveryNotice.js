// What to tell the person after the server tried to send a verification email or an access key. `delivery` is the Auth Service's
// answer: { channel, delivered, reason? }. Returns '' when the message was handed to the mail server (nothing to warn about).
// The wording never promises an inbox: "accepted by the mail server" is all the server knows.
const NOT_CONFIGURED = 'Email delivery is not set up on this server yet, so no code was sent. Ask the system administrator.';
const FAILED = 'The email could not be sent right now. Press Resend to try again. If it keeps failing, ask the system administrator to check the email settings.';

const BY_REASON = {
  not_configured: NOT_CONFIGURED,
  captured_in_dev_outbox: NOT_CONFIGURED, // a development setting that keeps messages on the server instead of sending them
  smtp_recipient_rejected: 'The mail server did not accept this email address. Check the address and try again.',
  smtp_invalid_address: 'This email address cannot be used. Check the address and try again.',
  smtp_blocked_in_tests: FAILED,
};

export function emailNotice(delivery) {
  if (!delivery || delivery.delivered) return '';
  return BY_REASON[delivery.reason] ?? FAILED; // any other smtp_* reason: a send problem on the server side
}

// SMS has no provider at all, so a phone code is never sent; the server's answer says so and the screen must not pretend otherwise.
export function phoneNotice(delivery) {
  if (!delivery || delivery.delivered) return '';
  return 'SMS delivery is not available on this server, so no phone code was sent.';
}

// Shown on the business-details step when the server skipped the phone code (a local-development setting).
export const PHONE_SKIPPED_NOTICE = 'Phone verification is switched off on this server (local development), so your phone number was saved but NOT verified.';

// The sign-up screen to show after the owner-details step, from the server's `nextStep`.
export const screenAfterOwner = (data) => (data?.nextStep === 'business_details' ? 'business' : 'phoneVerify');
