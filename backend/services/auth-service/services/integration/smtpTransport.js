// A small SMTP client for the Auth Service's verification emails, written on Node's built-in `net` and `tls` modules so that no
// mail library has to be installed. It sends ONE plain-text message per connection. If you would rather use `nodemailer`, replace
// `sendMail` below: emailProvider.js only needs `sendMail(options, message)` to resolve when the server accepted the message and
// to reject with a SmtpError otherwise.
//
// Safety rules (each one is covered by tests/unit/smtpTransport.test.js):
//   * Certificates are always verified. There is no switch that turns verification off.
//   * Credentials are sent only over an encrypted connection (implicit TLS, or STARTTLS), except when the server is on this
//     machine (loopback), which exists for local mail catchers such as MailHog.
//   * Addresses are checked before anything is sent, so a malicious address can never inject an SMTP command or a header.
//   * Errors carry only a CATEGORY and the SMTP reply code. They never carry the server's text, the password, the address or the
//     message, because those are the things that must not reach a log or an API response.
const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const crypto = require('node:crypto');

class SmtpError extends Error {
  // category: connection | timeout | tls | tls_required | auth_unsupported | auth_failed | sender_rejected | recipient_rejected
  //           | rejected | temporary | protocol | invalid_address
  constructor(category, smtpCode = null) {
    super(category);
    this.name = 'SmtpError';
    this.category = category;
    this.smtpCode = smtpCode;
  }
}

const MAX_BUFFER = 64 * 1024; // a reply longer than this is not SMTP
const isIp = (host) => net.isIP(host) !== 0;

// An address that is safe to put on an SMTP command line and in a header: no whitespace, control characters, angle brackets,
// quotes, commas, semicolons, colons or backslashes.
const SAFE_ADDRESS = /^[^\s<>"',;:\\\u0000-\u001f\u007f@]+@[^\s<>"',;:\\\u0000-\u001f\u007f@]+$/;
function assertSafeAddress(address) {
  if (typeof address !== 'string' || address.length > 254 || !SAFE_ADDRESS.test(address)) throw new SmtpError('invalid_address');
  return address;
}

const isAscii = (text) => /^[\x20-\x7e]*$/.test(text);
const encodedWord = (text) => `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
// A header value that may hold non-ASCII text (RFC 2047). Newlines are removed first so a value can never start a new header.
const headerText = (text) => {
  const clean = String(text).replace(/[\r\n\u0000]+/g, ' ').trim();
  return isAscii(clean) ? clean : encodedWord(clean);
};
const displayName = (name) => {
  const clean = String(name ?? '').replace(/[\r\n\u0000]+/g, ' ').trim();
  if (!clean) return '';
  return isAscii(clean) ? `"${clean.replace(/(["\\])/g, '\\$1')}" ` : `${encodedWord(clean)} `;
};
const wrap76 = (base64) => base64.replace(/.{1,76}/g, '$&\r\n');

// The complete message (headers, blank line, base64 body) with CRLF line ends.
function buildMessage({ from, fromName, to, subject, text, now = Date.now() }) {
  const domain = from.split('@')[1];
  const headers = [
    `From: ${displayName(fromName)}<${from}>`,
    `To: <${to}>`,
    `Subject: ${headerText(subject)}`,
    `Date: ${new Date(now).toUTCString()}`,
    `Message-ID: <${crypto.randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${wrap76(Buffer.from(String(text), 'utf8').toString('base64'))}`;
}

// Escapes a line that starts with "." (SMTP "dot-stuffing"), so it cannot end the message early.
const dotStuff = (data) => data.replace(/^\./gm, '..');

// Reads SMTP replies from a socket. A reply is one or more lines "250-text" ... "250 text"; it ends at the line with a space.
function createReader(socket, fail) {
  let buffer = '';
  let lines = [];
  const replies = [];
  let waiter = null;
  let failure = null;

  const settle = (reply) => {
    if (waiter) { const w = waiter; waiter = null; w.resolve(reply); } else replies.push(reply);
  };
  const onData = (chunk) => {
    buffer += chunk.toString('latin1');
    if (buffer.length > MAX_BUFFER) { fail(new SmtpError('protocol')); return; }
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index).replace(/\r$/, '');
      buffer = buffer.slice(index + 1);
      if (!/^\d{3}([ -]|$)/.test(line)) { fail(new SmtpError('protocol')); return; }
      lines.push(line);
      if (line.length === 3 || line[3] === ' ') {
        const reply = { code: Number(line.slice(0, 3)), lines };
        lines = [];
        settle(reply);
      }
    }
  };
  socket.on('data', onData);

  return {
    next() {
      if (failure) return Promise.reject(failure);
      if (replies.length) return Promise.resolve(replies.shift());
      return new Promise((resolve, reject) => { waiter = { resolve, reject }; });
    },
    break(error) { failure = error; if (waiter) { const w = waiter; waiter = null; w.reject(error); } },
    detach() { socket.removeListener('data', onData); },
  };
}

// Sends one message. options: { host, port, tls: 'implicit' | 'starttls-required' | 'starttls-optional', user?, password?, from,
//   fromName?, timeoutMs, ca? (TEST ONLY: extra trusted certificate), localName? }
// message: { to, subject, text }. Resolves when the server accepted the message for delivery.
function sendMail(options, message) {
  const { host, port, user, password, from, fromName, timeoutMs = 10000, ca } = options;
  return new Promise((resolve, reject) => {
    let socket = null;
    let reader = null;
    let finished = false;
    const done = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      if (socket) socket.destroy();
      if (error) reject(error instanceof SmtpError ? error : new SmtpError('connection')); else resolve();
    };
    const fail = (error) => { if (reader) reader.break(error); done(error); };
    // ONE deadline for the whole conversation, so a slow server can never hold a signup request longer than timeoutMs.
    const deadline = setTimeout(() => fail(new SmtpError('timeout')), timeoutMs);

    let to;
    try {
      assertSafeAddress(from);
      to = assertSafeAddress(message.to);
    } catch (err) { done(err); return; }

    // Certificates are ALWAYS verified. `host` is given explicitly so the name check also runs on a STARTTLS upgrade.
    const tlsOptions = () => ({ host, ca, ...(isIp(host) ? {} : { servername: host }), rejectUnauthorized: true });
    const failureOf = (err) => {
      if (err instanceof SmtpError) return err;
      if (err.code === 'ETIMEDOUT') return new SmtpError('timeout');
      return new SmtpError(/cert|tls|ssl|self.signed|hostname|altname|verify|signature|expired|issuer|chain/i.test(`${err.code} ${err.message}`) ? 'tls' : 'connection');
    };
    const attach = (s) => {
      socket = s;
      s.on('error', (err) => fail(failureOf(err)));
      s.on('close', () => fail(new SmtpError('connection')));
      reader = createReader(s, fail);
    };
    const write = (line) => socket.write(`${line}\r\n`);
    const command = (line) => { write(line); return reader.next(); };
    // The reply must be one of `expected`; otherwise a categorised error: 4xx is always "temporary", and any other refusal
    // takes the category the caller names (`onFail`).
    const expectReply = (reply, expected, onFail = 'rejected') => {
      if (expected.includes(reply.code)) return reply;
      throw new SmtpError(reply.code >= 400 && reply.code < 500 ? 'temporary' : onFail, reply.code);
    };
    const ehlo = async () => {
      const reply = expectReply(await command(`EHLO ${options.localName ?? localName()}`), [250]);
      return reply.lines.map((l) => l.slice(4).toUpperCase());
    };

    const run = async () => {
      const mode = options.tls ?? 'starttls-required';
      await new Promise((ready, refuse) => {
        const connection = mode === 'implicit'
          ? tls.connect({ port, ...tlsOptions() }, ready)
          : net.connect({ host, port }, ready);
        attach(connection);
        connection.once('error', refuse);
      });
      expectReply(await reader.next(), [220]);
      let capabilities = await ehlo();

      if (mode !== 'implicit') {
        if (capabilities.includes('STARTTLS')) {
          expectReply(await command('STARTTLS'), [220]);
          reader.detach();
          const plain = socket;
          plain.removeAllListeners('close'); // the plain socket is handed over to TLS and must not look like a lost connection
          const secure = await new Promise((ready, refuse) => {
            const upgraded = tls.connect({ socket: plain, ...tlsOptions() }, () => ready(upgraded));
            upgraded.once('error', (err) => refuse(failureOf(err)));
          });
          attach(secure);
          capabilities = await ehlo(); // the capabilities must be asked again after the upgrade
        } else if (mode === 'starttls-required') {
          throw new SmtpError('tls_required'); // never send credentials or a code over a plain connection
        }
      }

      if (user) {
        const mechanisms = (capabilities.find((c) => c.startsWith('AUTH ')) ?? '').slice(5).split(' ');
        if (mechanisms.includes('PLAIN')) {
          const token = Buffer.from(`\u0000${user}\u0000${password}`, 'utf8').toString('base64');
          expectReply(await command(`AUTH PLAIN ${token}`), [235], 'auth_failed');
        } else if (mechanisms.includes('LOGIN')) {
          expectReply(await command('AUTH LOGIN'), [334], 'auth_failed');
          expectReply(await command(Buffer.from(user, 'utf8').toString('base64')), [334], 'auth_failed');
          expectReply(await command(Buffer.from(password, 'utf8').toString('base64')), [235], 'auth_failed');
        } else {
          throw new SmtpError('auth_unsupported'); // credentials are configured but the server offers no method we support
        }
      }

      expectReply(await command(`MAIL FROM:<${from}>`), [250], 'sender_rejected');
      expectReply(await command(`RCPT TO:<${to}>`), [250, 251], 'recipient_rejected');
      expectReply(await command('DATA'), [354]);
      const body = buildMessage({ from, fromName, to, subject: message.subject, text: message.text });
      const stuffed = dotStuff(body);
      socket.write(stuffed.endsWith('\r\n') ? `${stuffed}.\r\n` : `${stuffed}\r\n.\r\n`);
      expectReply(await reader.next(), [250]);
      write('QUIT'); // best effort: the message is already accepted
    };

    run().then(() => done(), (err) => fail(err));
  });
}

// The name given in EHLO: this machine's host name restricted to characters every server accepts.
function localName() {
  const name = os.hostname().replace(/[^A-Za-z0-9.-]/g, '');
  return name || 'localhost';
}

module.exports = { sendMail, SmtpError, buildMessage, assertSafeAddress, dotStuff };
