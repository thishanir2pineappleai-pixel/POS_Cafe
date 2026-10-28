const { createApp } = require('./app');
const { env } = require('./config');

const server = createApp().listen(env.port, env.host, () => {
  console.log(`Menu Service listening on http://${env.host}:${env.port} (health: /health)`);
  console.log(env.repositoryDriver === 'prisma'
    ? `Storage: MySQL database "${env.database.database}" on ${env.database.host}:${env.database.port} through Prisma (data persists).`
    : 'Storage: IN MEMORY (REPOSITORY_DRIVER=memory): all data is lost on restart and no database is used.');
  if (env.requireAuth) {
    console.log(`Menu API routes need a signed-in user; sessions are confirmed with the Auth Service at ${env.authServiceUrl} (503 while it is unreachable).`);
    if (env.jwtSecretIsEphemeral) console.warn('JWT_SECRET is not set: a temporary key is used, so every token from the Auth Service is rejected.');
    if (env.internalKeyIsEphemeral) console.warn('INTERNAL_SERVICE_KEY is not set: a temporary key is used, so sessions cannot be confirmed (503).');
  } else {
    console.warn('MENU_REQUIRE_AUTH is false: every Menu API route is OPEN (as in the old backend) and not shop-scoped. Do not expose it; set MENU_REQUIRE_AUTH=true before any deployment.');
  }
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${env.port} is already in use. Stop the other process or set MENU_SERVICE_PORT.` : err);
  process.exit(1);
});
