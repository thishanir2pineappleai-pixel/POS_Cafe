// TEST SUPPORT: runs a service as a REAL separate process (node server.js), so a test can stop it and start it again to
// prove that data survives a restart. The child gets only the environment given here on top of the current one.
const { spawn } = require('node:child_process');
const net = require('node:net');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
    server.on('error', reject);
  });
}

// serviceDir: the service folder (contains server.js). env: extra variables. Resolves once GET /health answers 200.
async function startServiceProcess({ serviceDir, env, port, timeoutMs = 30000 }) {
  const child = spawn(process.execPath, ['server.js'], { cwd: serviceDir, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (c) => { output += c; });
  child.stderr.on('data', (c) => { output += c; });
  let exited = false;
  child.on('exit', () => { exited = true; });

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (exited) throw new Error(`service exited while starting:\n${output.slice(0, 1500)}`);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) { child.kill(); throw new Error(`service did not become healthy in ${timeoutMs} ms:\n${output.slice(0, 1500)}`); }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return {
    url: `http://127.0.0.1:${port}`,
    output: () => output,
    async stop() {
      if (exited) return;
      await new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
    },
  };
}

module.exports = { startServiceProcess, freePort };
