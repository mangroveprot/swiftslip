process.on('uncaughtException', function (err) {
  console.error('Uncaught Exception:', err);
});

import { WebServer } from './core/framework';
import { logger } from './common/shared/services';
import { initServices } from './helpers';
import { config } from './core/config';

async function startServer() {
  try {
    await initServices();
    if (config.runningProd && config.trustProxy === 0) {
      logger.warn(
        'NODE_ENV=production with TRUST_PROXY=0: behind a reverse proxy every ' +
          'visitor shares the proxy IP, so the sign-in throttle and rate limit ' +
          'act on everyone at once. Set TRUST_PROXY=1 if a proxy is in front.',
      );
    }
    const server = WebServer.server;
    server.listen(config.port, () => {
      logger.info(`Server running on http://localhost:${config.port}/`);
    });

    const shutdown = () => {
      logger.warn('Shutting down...');
      server.close(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to initialize services', error as Error);
    process.exit(1);
  }
}

startServer();
