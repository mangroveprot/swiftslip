import { createLogger, format, transports, Logger } from 'winston';
import { Format } from 'logform';

import { config } from '../../../core/config';

class LoggerService {
  private logger: Logger;

  constructor() {
    const logFormat: Format = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.printf(
        (info) => `[${info.timestamp}] (${info.level}): ${info.message}`,
      ),
    );

    // Production hosts (Render, Railway, Fly...) capture stdout and keep the
    // logs for you, and their disks are small and temporary. So in production
    // log to the console ONLY: log files would just grow until the disk fills.
    // In development, also write rotating files (5 MB each, 3 kept) to logs/.
    const loggerTransports: Logger['transports'] = [
      new transports.Console({
        format: config.runningProd
          ? logFormat
          : format.combine(format.colorize(), logFormat),
      }),
    ];
    if (!config.runningProd) {
      const rotation = { maxsize: 5 * 1024 * 1024, maxFiles: 3 };
      loggerTransports.push(
        new transports.File({
          filename: 'logs/error.log',
          level: 'error',
          ...rotation,
        }),
        new transports.File({ filename: 'logs/combined.log', ...rotation }),
      );
    }

    this.logger = createLogger({
      level: 'info',
      format: logFormat,
      transports: loggerTransports,
    });
  }

  log(level: string, message: string, metadata?: Record<string, unknown>) {
    this.logger.log({ level, message, ...metadata });
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.logger.info(message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.logger.warn(message, metadata);
  }

  error(message: string, error?: Error): void {
    const errorMessage = error ? `${message}\n${error.stack}` : message;
    this.logger.error(errorMessage);
  }
}

export const logger = new LoggerService();
