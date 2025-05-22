/**
 * 时间限制工具
 * 用于控制脚本执行时间
 */

// 默认时间限制 - 5小时，留1小时的余量
const DEFAULT_MAX_EXECUTION_TIME = 5 * 60 * 60 * 1000; // 5小时(毫秒)

export class TimeLimit {
  /**
   * 构造函数
   * @param {number} maxExecutionTime 最大执行时间(毫秒)
   */
  constructor(maxExecutionTime = DEFAULT_MAX_EXECUTION_TIME) {
    this.maxExecutionTime = maxExecutionTime;
    this.startTime = Date.now();
    this.logger = console;
  }

  /**
   * 设置日志记录器
   * @param {Object} logger 日志记录器
   */
  setLogger(logger) {
    this.logger = logger;
  }

  /**
   * 检查是否接近时间限制
   * @param {number} warningThreshold 警告阈值(0-1之间的小数，表示最大时间的百分比)
   * @returns {boolean} 是否接近时间限制
   */
  isNearingLimit(warningThreshold = 0.8) {
    const elapsed = Date.now() - this.startTime;
    const warningTime = this.maxExecutionTime * warningThreshold;
    
    if (elapsed > warningTime) {
      const elapsedHours = (elapsed / 3600000).toFixed(1);
      this.logger.warn(`⚠️ 执行时间已达到${elapsedHours}小时，接近限制，考虑提前结束流程`);
      return true;
    }
    
    return false;
  }

  /**
   * 检查是否已超出时间限制
   * @returns {boolean} 是否已超出时间限制
   */
  isExceeded() {
    const elapsed = Date.now() - this.startTime;
    
    if (elapsed > this.maxExecutionTime) {
      const elapsedHours = (elapsed / 3600000).toFixed(1);
      this.logger.error(`🛑 执行时间已达到${elapsedHours}小时，超出限制，必须结束流程`);
      return true;
    }
    
    return false;
  }

  /**
   * 重置开始时间
   */
  reset() {
    this.startTime = Date.now();
    this.logger.log(`已重置时间计时器`);
  }

  /**
   * 获取已执行时间(毫秒)
   * @returns {number} 已执行时间
   */
  getElapsedTime() {
    return Date.now() - this.startTime;
  }

  /**
   * 获取已执行时间的格式化字符串
   * @returns {string} 格式化的时间字符串
   */
  getElapsedTimeFormatted() {
    const elapsed = this.getElapsedTime();
    
    // 格式化为时:分:秒
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
} 