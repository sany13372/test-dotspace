import 'dotenv/config';
import { app } from './app';
import { sequelize } from './models';

const port = Number(process.env.PORT ?? 3000);

async function start(): Promise<void> {
  await sequelize.authenticate();

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Event registration API is listening on port ${port}`);
  });

  const shutdown = () => {
    server.close(() => {
      void sequelize.close().finally(() => process.exit(0));
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});
