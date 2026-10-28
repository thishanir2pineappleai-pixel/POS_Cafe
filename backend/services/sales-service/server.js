const { createApp } = require('./app');
const { env } = require('./config');

const server = createApp().listen(env.port, env.host, () => {
  console.log(`Sales Service listening on http://${env.host}:${env.port} (health: /health)`);
  console.log(env.repositoryDriver === 'prisma'
    ? `Storage: MySQL database "${env.database.database}" on ${env.database.host}:${env.database.port} through Prisma (data persists).`
    : 'Storage: IN MEMORY (REPOSITORY_DRIVER=memory): all data is lost on restart and no database is used.');
  console.log(`Sessions are confirmed with the Auth Service at ${env.authServiceUrl} (requests fail with 503 while it is unreachable).`);
  console.log(`Shops are read from the Settings Service at ${env.settingsServiceUrl}; prices and discounts from the Menu Service at ${env.menuServiceUrl}.`);
  if (env.jwtSecretIsEphemeral) console.warn('JWT_SECRET is not set: a temporary key is used, so every token from the Auth Service is rejected.');
  if (env.internalKeyIsEphemeral) console.warn('INTERNAL_SERVICE_KEY is not set: a temporary key is used, so sessions cannot be confirmed and internal calls are refused.');
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${env.port} is already in use. Stop the other process or set SALES_SERVICE_PORT.` : err);
  process.exit(1);
});
