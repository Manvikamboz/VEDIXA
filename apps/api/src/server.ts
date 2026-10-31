import { buildApp } from './app.js';
import { env } from './core/env.js';
import { logger } from './core/logger.js';

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`🚀 VEDIXA API Server listening on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
}

void start();
