import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { seedDemo } from './seed.js';

await migrate();
if (config.seedDemo) await seedDemo();

const server = createApp().listen(config.port, () => {
  console.log(`HealthStack listening on :${config.port}`);
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
