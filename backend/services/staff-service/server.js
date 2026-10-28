const { createApp } = require('./app');
const { env } = require('./config');

const server = createApp().listen(env.port, env.host, () => {
  console.log(`Staff Service listening on http://${env.host}:${env.port} (health: /health)`);
  console.log(env.repositoryDriver === 'prisma'
    ? `Storage: MySQL database "${env.database.database}" on ${env.database.host}:${env.database.port} through Prisma (data persists).`
    : 'Storage: IN MEMORY (REPOSITORY_DRIVER=memory): all data is lost on restart and no database is used.');
  console.log(`Sessions are confirmed with the Auth Service at ${env.authServiceUrl}; shops are asked from the Settings Service at ${env.settingsServiceUrl} (503 while either is unreachable).`);
  if (env.jwtSecretIsEphemeral) console.warn('JWT_SECRET is not set: a temporary key is used, so every token from the Auth Service is rejected.');
  if (env.internalKeyIsEphemeral) console.warn('INTERNAL_SERVICE_KEY is not set: a temporary key is used, so sessions and shops cannot be confirmed (503).');
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${env.port} is already in use. Stop the other process or set STAFF_SERVICE_PORT.` : err);
  process.exit(1);
});
