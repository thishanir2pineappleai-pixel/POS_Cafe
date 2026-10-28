// TEST SUPPORT: a stand-in SMTP server on a random loopback port, so tests can exercise a real SMTP conversation (greeting, EHLO,
// STARTTLS, AUTH, MAIL/RCPT/DATA) without sending a real email. It records what it received. Nothing here leaves this machine.
//
//   const smtp = await startFakeSmtpServer({ mode: 'starttls', auth: { user: 'u', password: 'p' }, tlsMaterial });
//   ... sendMail({ host: '127.0.0.1', port: smtp.port, ca: tlsMaterial.cert, ... }) ...
//   smtp.messages  -> [{ from, to, headers, text (decoded body), secure }]
//   smtp.events    -> [{ command, secure }]  (AUTH is recorded WITHOUT its credentials)
//   await smtp.stop();
//
// TLS needs a certificate: makeTlsMaterial() creates a throw-away self-signed one with the `openssl` program (valid one day, never
// stored in the project) or returns null when openssl is not available, in which case the TLS tests report that they were skipped.
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const OPENSSL_CANDIDATES = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe'];

// `names` is the certificate's subjectAltName list (default: valid for localhost and 127.0.0.1).
function makeTlsMaterial(names = 'DNS:localhost,IP:127.0.0.1') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-smtp-test-'));
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  try {
    for (const openssl of OPENSSL_CANDIDATES) {
      try {
        execFileSync(openssl, [
          'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certFile, '-days', '1',
          '-subj', '/CN=localhost', '-addext', `subjectAltName=${names}`,
        ], { stdio: 'ignore' });
        return { key: fs.readFileSync(keyFile, 'utf8'), cert: fs.readFileSync(certFile, 'utf8') };
      } catch { /* try the next candidate */ }
    }
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// options:
//   mode             'plain' (no TLS at all), 'starttls' (offers STARTTLS), 'implicit' (TLS from the first byte)
//   tlsMaterial      { key, cert } for 'starttls' and 'implicit'
//   auth             { user, password } to require sign-in, or null. mechanisms: ['PLAIN', 'LOGIN'] by default
//   authOnlyAfterTls offer AUTH only on an encrypted connection (default true, like real providers)
//   rejectSender / rejectRecipient   an SMTP code to refuse MAIL FROM / RCPT TO with, e.g. 550
//   silent           accept the connection but never answer (to test timeouts)
//   offerStartTls    false: a 'plain' style server on an otherwise STARTTLS-less connection (default true for mode 'starttls')
async function startFakeSmtpServer(options = {}) {
  const {
    mode = 'plain', tlsMaterial = null, auth = null, mechanisms = ['PLAIN', 'LOGIN'], authOnlyAfterTls = true,
    rejectSender = null, rejectRecipient = null, silent = false,
  } = options;
  const messages = [];
  const events = [];
  const sockets = new Set();

  function session(socket, secure) {
    let buffer = '';
    let state = 'command'; // command | data | auth-login-user | auth-login-password
    let envelope = { from: null, to: [] };
    let loginUser = null;
    let data = '';
    const reply = (text) => socket.write(`${text}\r\n`);
    const record = (command) => events.push({ command, secure });

    const ehloReply = () => {
      const lines = ['localhost', '8BITMIME'];
      if (mode === 'starttls' && !secure) lines.push('STARTTLS');
      if (auth && (secure || mode === 'plain' || !authOnlyAfterTls)) lines.push(`AUTH ${mechanisms.join(' ')}`);
      return lines.map((l, i) => `250${i === lines.length - 1 ? ' ' : '-'}${l}`).join('\r\n');
    };
    const credentialsOk = (user, password) => Boolean(auth) && user === auth.user && password === auth.password;

    const finishMessage = () => {
      const [head, ...rest] = data.split('\r\n\r\n');
      const headers = {};
      for (const line of head.split('\r\n')) { const i = line.indexOf(':'); if (i > 0) headers[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim(); }
      const body = rest.join('\r\n\r\n').replace(/\r\n/g, '');
      const text = headers['content-transfer-encoding'] === 'base64' ? Buffer.from(body, 'base64').toString('utf8') : body;
      messages.push({ from: envelope.from, to: [...envelope.to], headers, text, secure });
      envelope = { from: null, to: [] };
      data = '';
      state = 'command';
      reply('250 OK queued');
    };

    const onLine = (line) => {
      if (state === 'data') return;
      if (state === 'auth-login-user') { loginUser = Buffer.from(line, 'base64').toString('utf8'); state = 'auth-login-password'; reply('334 UGFzc3dvcmQ6'); return; }
      if (state === 'auth-login-password') {
        state = 'command';
        const ok = credentialsOk(loginUser, Buffer.from(line, 'base64').toString('utf8'));
        reply(ok ? '235 Authentication successful' : '535 5.7.8 Authentication credentials invalid');
        return;
      }
      const upper = line.toUpperCase();
      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) { record('EHLO'); reply(ehloReply()); return; }
      if (upper === 'STARTTLS') {
        record('STARTTLS');
        if (!(mode === 'starttls' && !secure && tlsMaterial)) { reply('502 not offered'); return; }
        reply('220 Ready to start TLS');
        socket.removeAllListeners('data');
        const secured = new tls.TLSSocket(socket, { isServer: true, key: tlsMaterial.key, cert: tlsMaterial.cert });
        sockets.add(secured);
        session(secured, true);
        return;
      }
      if (upper.startsWith('AUTH')) {
        record('AUTH'); // the credentials are deliberately not recorded
        if (!auth) { reply('503 no authentication'); return; }
        const [, mechanism, initial] = line.split(' ');
        if (mechanism?.toUpperCase() === 'PLAIN' && mechanisms.includes('PLAIN') && initial) {
          const [, user, password] = Buffer.from(initial, 'base64').toString('utf8').split('\u0000');
          reply(credentialsOk(user, password) ? '235 Authentication successful' : '535 5.7.8 Authentication credentials invalid');
        } else if (mechanism?.toUpperCase() === 'LOGIN' && mechanisms.includes('LOGIN')) {
          state = 'auth-login-user';
          reply('334 VXNlcm5hbWU6');
        } else reply('504 mechanism not supported');
        return;
      }
      if (upper.startsWith('MAIL FROM:')) {
        record('MAIL');
        if (auth && !events.some((e) => e.command === 'AUTH')) { reply('530 Authentication required'); return; }
        if (rejectSender) { reply(`${rejectSender} sender refused`); return; }
        envelope.from = line.slice(10).replace(/^<|>$/g, '');
        reply('250 OK');
        return;
      }
      if (upper.startsWith('RCPT TO:')) {
        record('RCPT');
        if (rejectRecipient) { reply(`${rejectRecipient} no such user`); return; }
        envelope.to.push(line.slice(8).replace(/^<|>$/g, ''));
        reply('250 OK');
        return;
      }
      if (upper === 'DATA') { record('DATA'); state = 'data'; data = ''; reply('354 End data with <CR><LF>.<CR><LF>'); return; }
      if (upper === 'QUIT') { reply('221 Bye'); socket.end(); return; }
      reply('500 unrecognised command');
    };

    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      if (state === 'data') {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        data = buffer.slice(0, end).replace(/^\.\./gm, '.'); // undo dot-stuffing
        buffer = buffer.slice(end + 5);
        finishMessage();
      }
      let index;
      while (state !== 'data' && (index = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        onLine(line);
      }
    });
    socket.on('error', () => {});
  }

  const onConnection = (secure) => (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    if (silent) return;
    socket.write('220 localhost fake-smtp ready\r\n');
    session(socket, secure);
  };
  const server = mode === 'implicit'
    ? tls.createServer({ key: tlsMaterial.key, cert: tlsMaterial.cert }, onConnection(true))
    : net.createServer(onConnection(false));
  server.on('tlsClientError', () => {});
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    host: '127.0.0.1',
    port: server.address().port,
    messages,
    events,
    stop: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(resolve); }),
  };
}

module.exports = { startFakeSmtpServer, makeTlsMaterial };
