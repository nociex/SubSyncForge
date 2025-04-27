/**
 * 日志级别定义
 */
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
  
  // 日志级别权重
  LEVEL_WEIGHT: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4
  }
};

/**
 * 日志处理器接口
 */
export class LogHandler {
  handle(entry) {
    throw new Error('LogHandler.handle() must be implemented by subclass');
  }
}

/**
 * 控制台日志处理器
 */
export class ConsoleLogHandler extends LogHandler {
  constructor(options = {}) {
    super();
    this.colorize = options.colorize !== false;
  }
  
  handle(entry) {
    const { level, message, timestamp, context } = entry;
    
    let logFn;
    let prefix = '';
    
    switch (level) {
      case LogLevel.DEBUG:
        logFn = console.debug;
        prefix = this.colorize ? '\x1b[36m[DEBUG]\x1b[0m' : '[DEBUG]';
        break;
      case LogLevel.INFO:
        logFn = console.info;
        prefix = this.colorize ? '\x1b[32m[INFO]\x1b[0m' : '[INFO]';
        break;
      case LogLevel.WARN:
        logFn = console.warn;
        prefix = this.colorize ? '\x1b[33m[WARN]\x1b[0m' : '[WARN]';
        break;
      case LogLevel.ERROR:
        logFn = console.error;
        prefix = this.colorize ? '\x1b[31m[ERROR]\x1b[0m' : '[ERROR]';
        break;
      case LogLevel.FATAL:
        logFn = console.error;
        prefix = this.colorize ? '\x1b[35m[FATAL]\x1b[0m' : '[FATAL]';
        break;
      default:
        logFn = console.log;
        prefix = `[${level.toUpperCase()}]`;
    }
    
    const formattedTime = new Date(timestamp).toISOString();
    const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    
    logFn(`${prefix} ${formattedTime}${contextStr}: ${message}`);
  }
}

/**
 * 文件日志处理器
 * 注意：在浏览器环境中不可用，仅在 Node.js 环境中使用
 */
export class FileLogHandler extends LogHandler {
  constructor(options = {}) {
    super();
    this.filePath = options.filePath || 'logs/app.log';
    this.fs = null;
    
    // 动态导入 fs 模块，避免在浏览器环境中报错
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      import('fs').then(fs => {
        this.fs = fs;
        this.ensureDirectoryExists();
      });
    }
  }
  
  ensureDirectoryExists() {
    if (!this.fs) return;
    
    const path = this.filePath.split('/');
    path.pop(); // 移除文件名
    const directory = path.join('/');
    
    if (directory && !this.fs.existsSync(directory)) {
      this.fs.mkdirSync(directory, { recursive: true });
    }
  }
  
  handle(entry) {
    if (!this.fs) {
      console.warn('FileLogHandler: fs module not available, log entry not written to file');
      return;
    }
    
    const { level, message, timestamp, context } = entry;
    const formattedTime = new Date(timestamp).toISOString();
    const contextStr = context ? ` [${JSON.stringify(context)}]` : '';
    const logLine = `[${level.toUpperCase()}] ${formattedTime}${contextStr}: ${message}\n`;
    
    try {
      this.fs.appendFileSync(this.filePath, logLine);
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }
}

/**
 * 主日志类
 */
export class Logger {
  constructor(options = {}) {
    this.level = options.level || LogLevel.INFO;
    this.handlers = options.handlers || [new ConsoleLogHandler()];
    this.context = options.context || {};
  }
  
  /**
   * 创建日志条目
   */
  createEntry(level, message, context = {}) {
    return {
      level,
      message,
      timestamp: Date.now(),
      context: { ...this.context, ...context }
    };
  }
  
  /**
   * 记录日志
   */
  log(level, message, context = {}) {
    // 检查日志级别
    if (LogLevel.LEVEL_WEIGHT[level] < LogLevel.LEVEL_WEIGHT[this.level]) {
      return;
    }
    
    const entry = this.createEntry(level, message, context);
    
    // 分发到所有处理器
    for (const handler of this.handlers) {
      try {
        handler.handle(entry);
      } catch (error) {
        console.error(`Error in log handler: ${error.message}`);
      }
    }
    
    return entry;
  }
  
  /**
   * 调试级别日志
   */
  debug(message, context = {}) {
    return this.log(LogLevel.DEBUG, message, context);
  }
  
  /**
   * 信息级别日志
   */
  info(message, context = {}) {
    return this.log(LogLevel.INFO, message, context);
  }
  
  /**
   * 警告级别日志
   */
  warn(message, context = {}) {
    return this.log(LogLevel.WARN, message, context);
  }
  
  /**
   * 错误级别日志
   */
  error(message, context = {}) {
    return this.log(LogLevel.ERROR, message, context);
  }
  
  /**
   * 致命错误级别日志
   */
  fatal(message, context = {}) {
    return this.log(LogLevel.FATAL, message, context);
  }
  
  /**
   * 创建子日志器，继承父日志器的配置但可以有自己的上下文
   */
  child(childContext = {}) {
    return new Logger({
      level: this.level,
      handlers: this.handlers,
      context: { ...this.context, ...childContext }
    });
  }
  
  /**
   * 添加日志处理器
   */
  addHandler(handler) {
    if (handler instanceof LogHandler) {
      this.handlers.push(handler);
    } else {
      throw new Error('Handler must be an instance of LogHandler');
    }
  }
  
  /**
   * 设置日志级别
   */
  setLevel(level) {
    if (LogLevel.LEVEL_WEIGHT[level] !== undefined) {
      this.level = level;
    } else {
      throw new Error(`Invalid log level: ${level}`);
    }
  }
}

/**
 * 创建默认日志器实例
 */
export const createDefaultLogger = (options = {}) => {
  return new Logger({
    level: options.level || LogLevel.INFO,
    handlers: options.handlers || [new ConsoleLogHandler()],
    context: options.context || {}
  });
};

// 默认导出
export default {
  Logger,
  LogLevel,
  LogHandler,
  ConsoleLogHandler,
  FileLogHandler,
  createDefaultLogger
};
