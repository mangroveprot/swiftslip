import { createLogger, format, transports, Logger } from 'winston';
import { Format } from 'logform';

class LoggerService {
  private logger: Logger;

  constructor() {
    const logFormat: Format = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.printf(
        (info) => `[${info.timestamp}] (${info.level}): ${info.message}`,
      ),
    );

    this.logger = createLogger({
      level: 'info',
      format: logFormat,
      transports: [
        new transports.Console({
          format: format.combine(format.colorize(), logFormat),
        }),
        new transports.File({ filename: 'logs/error.log', level: 'error' }),
        new transports.File({ filename: 'logs/combined.log' }),
      ],
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
