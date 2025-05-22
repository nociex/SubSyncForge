/**
 * 日志工具
 * 提供统一的日志记录功能
 */

// 日志级别
export const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

// 日志级别优先级
const LogLevelPriority = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

export class Logger {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.level = options.level || LogLevel.INFO;
    this.prefix = options.prefix || '';
    this.outputFile = options.outputFile || null;
    this.useColors = options.useColors !== false;
    this.logToConsole = options.logToConsole !== false;
  }

  /**
   * 设置日志级别
   * @param {string} level 日志级别
   */
  setLevel(level) {
    if (Object.values(LogLevel).includes(level)) {
      this.level = level;
    } else {
      this.warn(`无效的日志级别: ${level}，使用默认级别: ${this.level}`);
    }
  }

  /**
   * 检查给定级别是否应该被记录
   * @param {string} level 要检查的级别
   * @returns {boolean} 是否应该记录
   */
  shouldLog(level) {
    return LogLevelPriority[level] >= LogLevelPriority[this.level];
  }

  /**
   * 格式化日志消息
   * @param {string} level 日志级别
   * @param {Array} args 日志参数
   * @returns {string} 格式化后的日志消息
   */
  formatMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    const levelFormatted = level.toUpperCase().padEnd(5);
    
    // 处理参数
    const formattedArgs = args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return arg.toString();
        }
      }
      return arg;
    }).join(' ');
    
    return `${timestamp} ${levelFormatted} ${prefix}${formattedArgs}`;
  }

  /**
   * 输出日志消息
   * @param {string} level 日志级别
   * @param  {...any} args 日志参数
   */
  log(level, ...args) {
    if (!this.shouldLog(level)) return;
    
    const message = this.formatMessage(level, ...args);
    
    if (this.logToConsole) {
      switch (level) {
        case LogLevel.ERROR:
          console.error(message);
          break;
        case LogLevel.WARN:
          console.warn(message);
          break;
        case LogLevel.DEBUG:
          console.debug(message);
          break;
        default:
          console.log(message);
      }
    }
    
    // 将日志写入文件（如果配置了输出文件）
    // 这里可以添加将日志写入文件的逻辑
  }

  /**
   * 记录调试级别日志
   * @param  {...any} args 日志参数
   */
  debug(...args) {
    this.log(LogLevel.DEBUG, ...args);
  }

  /**
   * 记录信息级别日志
   * @param  {...any} args 日志参数
   */
  info(...args) {
    this.log(LogLevel.INFO, ...args);
  }

  /**
   * 记录警告级别日志
   * @param  {...any} args 日志参数
   */
  warn(...args) {
    this.log(LogLevel.WARN, ...args);
  }

  /**
   * 记录错误级别日志
   * @param  {...any} args 日志参数
   */
  error(...args) {
    this.log(LogLevel.ERROR, ...args);
  }
} 