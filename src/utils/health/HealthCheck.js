/**
 * 健康状态
 */
export const HealthStatus = {
  UP: 'up',
  DOWN: 'down',
  DEGRADED: 'degraded'
};

/**
 * 健康检查项
 */
export class HealthCheck {
  constructor(options = {}) {
    this.name = options.name || 'system';
    this.description = options.description || 'System health check';
    this.checks = options.checks || [];
    this.timeout = options.timeout || 5000;
  }
  
  /**
   * 添加检查项
   */
  addCheck(check) {
    if (typeof check !== 'function') {
      throw new Error('Health check must be a function');
    }
    
    this.checks.push(check);
    return this;
  }
  
  /**
   * 执行健康检查
   */
  async check() {
    const results = [];
    let overallStatus = HealthStatus.UP;
    
    for (const check of this.checks) {
      try {
        // 创建超时 Promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Health check timed out')), this.timeout);
        });
        
        // 执行检查
        const checkPromise = Promise.resolve().then(() => check());
        
        // 使用 Promise.race 实现超时
        const result = await Promise.race([checkPromise, timeoutPromise]);
        
        // 处理检查结果
        const status = result.status || HealthStatus.UP;
        
        // 更新整体状态
        if (status === HealthStatus.DOWN) {
          overallStatus = HealthStatus.DOWN;
        } else if (status === HealthStatus.DEGRADED && overallStatus !== HealthStatus.DOWN) {
          overallStatus = HealthStatus.DEGRADED;
        }
        
        results.push({
          name: result.name || 'unknown',
          status,
          message: result.message || '',
          details: result.details || {},
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        // 检查失败
        overallStatus = HealthStatus.DOWN;
        
        results.push({
          name: error.checkName || 'unknown',
          status: HealthStatus.DOWN,
          message: error.message || 'Health check failed',
          details: { error: error.stack },
          timestamp: new Date().toISOString()
        });
      }
    }
    
    return {
      name: this.name,
      description: this.description,
      status: overallStatus,
      checks: results,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 创建默认健康检查
 */
export const createDefaultHealthCheck = (options = {}) => {
  return new HealthCheck({
    name: options.name || 'subsyncforge',
    description: options.description || 'SubSyncForge Health Check',
    checks: options.checks || [],
    timeout: options.timeout || 5000
  });
};

export default {
  HealthCheck,
  HealthStatus,
  createDefaultHealthCheck
};
