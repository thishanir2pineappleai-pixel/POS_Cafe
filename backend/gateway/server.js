const { createApp } = require('./app');
const { config } = require('./config');

const server = createApp(config).listen(config.port, config.host, () => {
  console.log(`API Gateway listening on http://${config.host}:${config.port} (health: /health, services: /health/services)`);
  for (const r of config.routes) console.log(`  ${r.prefix} -> ${r.name} at ${r.target}`);
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Stop the other process or set GATEWAY_PORT.` : err);
  process.exit(1);
});
