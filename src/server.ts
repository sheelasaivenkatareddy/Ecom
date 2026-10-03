import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/index.js';

const config = loadConfig();
const db = await createDatabase(config);
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`Ecom API running at http://localhost:${config.port}`);
  if (db.mode === 'memory') {
    console.log(
      `Using the in-memory demo database (data resets on restart). Admin login: ${config.admin.email}`,
    );
  }
});

function shutdown() {
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
