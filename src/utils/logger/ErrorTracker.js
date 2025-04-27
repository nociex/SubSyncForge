import { Logger, LogLevel } from './Logger';

/**
 * 错误类型定义
 */
export const ErrorType = {
  FETCH: 'fetch_error',
  PARSE: 'parse_error',
  VALIDATION: 'validation_error',
  CONVERSION: 'conversion_error',
  SYSTEM: 'system_error',
  UNKNOWN: 'unknown_error'
};

/**
 * 自定义错误基类
 */
export class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.type = options.type || ErrorType.UNKNOWN;
    this.code = options.code || 'ERR_UNKNOWN';
    this.context = options.context || {};
    this.cause = options.cause;
    this.timestamp = Date.now();
    this.retryable = options.retryable !== undefined ? options.retryable : false;
    
    // 捕获堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * 获取错误详情
   */
  getDetails() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause ? (this.cause instanceof Error ? this.cause.message : this.cause) : undefined,
      retryable: this.retryable
    };
  }
  
  /**
   * 转换为字符串
   */
  toString() {
    return `${this.name}[${this.code}]: ${this.message}`;
  }
}

/**
 * 获取错误类
 */
export class FetchError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorType.FETCH,
      code: options.code || 'ERR_FETCH_FAILED',
      retryable: options.retryable !== undefined ? options.retryable : true,
      ...options
    });
  }
}

/**
 * 解析错误类
 */
export class ParseError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorType.PARSE,
      code: options.code || 'ERR_PARSE_FAILED',
      retryable: false,
      ...options
    });
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorType.VALIDATION,
      code: options.code || 'ERR_VALIDATION_FAILED',
      retryable: false,
      ...options
    });
  }
}

/**
 * 转换错误类
 */
export class ConversionError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      type: ErrorType.CONVERSION,
      code: options.code || 'ERR_CONVERSION_FAILED',
      retryable: options.retryable !== undefined ? options.retryable : false,
      ...options
    });
  }
}

/**
 * 错误追踪器
 */
export class ErrorTracker {
  constructor(options = {}) {
    this.logger = options.logger || new Logger({
      level: LogLevel.ERROR,
      context: { component: 'ErrorTracker' }
    });
    
    this.handlers = options.handlers || [];
  }
  
  /**
   * 捕获错误
   */
  captureError(error, additionalContext = {}) {
    let appError;
    
    // 转换为 AppError
    if (error instanceof AppError) {
      appError = error;
      // 合并额外上下文
      appError.context = { ...appError.context, ...additionalContext };
    } else {
      // 创建通用 AppError
      appError = new AppError(error.message || 'Unknown error', {
        cause: error,
        context: additionalContext
      });
    }
    
    // 记录错误
    this.logger.error(appError.message, appError.getDetails());
    
    // 调用错误处理器
    for (const handler of this.handlers) {
      try {
        handler(appError);
      } catch (handlerError) {
        this.logger.error('Error in error handler', { 
          handler: handler.name || 'anonymous',
          error: handlerError.message 
        });
      }
    }
    
    return appError;
  }
  
  /**
   * 添加错误处理器
   */
  addHandler(handler) {
    if (typeof handler === 'function') {
      this.handlers.push(handler);
    } else {
      throw new Error('Error handler must be a function');
    }
  }
  
  /**
   * 创建错误上下文
   */
  createContext(component, operation, details = {}) {
    return {
      component,
      operation,
      ...details,
      timestamp: Date.now()
    };
  }
}

/**
 * 创建默认错误追踪器
 */
export const createDefaultErrorTracker = (options = {}) => {
  return new ErrorTracker(options);
};

// 默认导出
export default {
  ErrorTracker,
  AppError,
  FetchError,
  ParseError,
  ValidationError,
  ConversionError,
  ErrorType,
  createDefaultErrorTracker
};
