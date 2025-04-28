import { 
  Logger, 
  LogLevel, 
  LogHandler, 
  ConsoleLogHandler, 
  FileLogHandler, 
  createDefaultLogger 
} from './Logger.js';

import {
  ErrorTracker,
  AppError,
  FetchError,
  ParseError,
  ValidationError,
  ConversionError,
  ErrorType,
  createDefaultErrorTracker
} from './ErrorTracker.js';

// Determine log level from environment variable, default to INFO
// @ts-ignore - process is not defined in CF Worker global scope but might be in Actions Node env
const logLevelFromEnv = (typeof process !== 'undefined' && process.env.LOG_LEVEL && LogLevel.LEVEL_WEIGHT[process.env.LOG_LEVEL.toLowerCase()] !== undefined)
                        ? process.env.LOG_LEVEL.toLowerCase()
                        : LogLevel.INFO; // Default to INFO

console.log(`[Logger] Setting log level to: ${logLevelFromEnv}`); // Add log for confirmation

// 创建全局默认日志器实例
const defaultLogger = createDefaultLogger({ level: logLevelFromEnv });

// 创建全局默认错误追踪器实例
const defaultErrorTracker = createDefaultErrorTracker({ logger: defaultLogger });

export {
  // 日志类
  Logger,
  LogLevel,
  LogHandler,
  ConsoleLogHandler,
  FileLogHandler,
  createDefaultLogger,
  
  // 错误追踪类
  ErrorTracker,
  AppError,
  FetchError,
  ParseError,
  ValidationError,
  ConversionError,
  ErrorType,
  createDefaultErrorTracker,
  
  // 默认实例
  defaultLogger,
  defaultErrorTracker
};

// 默认导出
export default {
  Logger,
  LogLevel,
  ErrorTracker,
  AppError,
  defaultLogger,
  defaultErrorTracker
};
