import { createLogger, format, transports, Logger as WinstonLogger } from "winston";
import dotenv from "dotenv";

// importing environment configurations
dotenv.config();

// Define types for the custom format
interface CustomFormatInfo {
  level: string;
  message: string;
  timestamp: string;
  functionName: string;
}

export default class Logger {
  private static shared: WinstonLogger;
  private logger: WinstonLogger;

  constructor() {
    this.logger = Logger.shared || (Logger.shared = this.initializeLogger());
  }

  // Custom format for console development logger
  private customFormat() {
    return format.printf(({ level, message, timestamp, functionName }: CustomFormatInfo) => {
      return `[${timestamp}] [${level}] (${functionName}): ${message}`;
    });
  }

  // Method to initialize the logger based on environment
  private initializeLogger(): WinstonLogger {
    const customFilter = format((info) => {
      if (info.level === 'error' || info.level === 'warn') {
        return info;
      }
      if(process.env.LOG_VERBOSE!=='true')return false;
      const msg = (info.message || '').toLowerCase();
      const funcName = (info.functionName || '').toLowerCase();
      if (
        msg.includes('irctc') || msg.includes('exception') || msg.includes('error') || 
        msg.includes('order') || msg.includes('wallet') ||
        funcName.includes('irctc') || funcName.includes('order') || funcName.includes('wallet')
      ) {
        return info;
      }
      return false;
    });

    const devLogger = createLogger({
      transports: [new transports.Console()],
      level: "info",
      format: format.combine(
        customFilter(),
        format.colorize(),
        format.timestamp({ format: "DD-MM-YYYY HH:mm:ss" }),
        format.errors({ stack: true }),
        this.customFormat()
      ),
    });

    const prodLogger = createLogger({
      transports: [new transports.Console()],
      level: "info",
      format: format.combine(
        customFilter(),
        format.timestamp(),
        format.errors({ stack: false }),
        format.prettyPrint()
      ),
    });

    if (process.env.ENVIRONMENT === "development") {
      return devLogger;
    } else {
      return prodLogger;
    }
  }

  // Additional methods for specific log levels
  info(message: string, functionName: string): void {
    this.logger.info({ message, functionName });
  }

  warn(message: string, functionName: string): void {
    this.logger.warn({ message, functionName });
  }

  error(message: string, functionName: string): void {
    this.logger.error({ message, functionName });
  }
}
