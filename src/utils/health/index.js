import { HealthCheck, HealthStatus, createDefaultHealthCheck } from './HealthCheck.js';

// 创建全局默认健康检查实例
export const healthCheck = createDefaultHealthCheck();

// 添加默认检查项
healthCheck.addCheck(async () => {
  return {
    name: 'system',
    status: HealthStatus.UP,
    message: 'System is running',
    details: {
      version: '1.1.0',
      environment: typeof process !== 'undefined' && process.env && process.env.NODE_ENV 
        ? process.env.NODE_ENV 
        : 'production'
    }
  };
});

// 内存检查
healthCheck.addCheck(async () => {
  let memoryUsage = {};
  let status = HealthStatus.UP;
  let message = 'Memory usage is normal';
  
  // 在 Node.js 环境中
  if (typeof process !== 'undefined' && process.memoryUsage) {
    memoryUsage = process.memoryUsage();
    
    // 如果堆内存使用超过 80%，则降级
    if (memoryUsage.heapUsed / memoryUsage.heapTotal > 0.8) {
      status = HealthStatus.DEGRADED;
      message = 'Memory usage is high';
    }
  }
  
  // 在浏览器环境中
  if (typeof window !== 'undefined' && window.performance && window.performance.memory) {
    memoryUsage = window.performance.memory;
    
    // 如果 JS 堆内存使用超过 80%，则降级
    if (memoryUsage.usedJSHeapSize / memoryUsage.jsHeapSizeLimit > 0.8) {
      status = HealthStatus.DEGRADED;
      message = 'Memory usage is high';
    }
  }
  
  return {
    name: 'memory',
    status,
    message,
    details: memoryUsage
  };
});

// 创建自定义健康检查
export const createHealthCheck = (name, checkFn, options = {}) => {
  const check = new HealthCheck({
    name,
    description: options.description || `${name} health check`,
    timeout: options.timeout || 5000
  });
  
  if (checkFn) {
    check.addCheck(checkFn);
  }
  
  return check;
};

// 添加订阅源检查
export const addSubscriptionCheck = (url) => {
  healthCheck.addCheck(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      return {
        name: `subscription-${new URL(url).hostname}`,
        status: response.ok ? HealthStatus.UP : HealthStatus.DOWN,
        message: response.ok ? 'Subscription source is available' : `Subscription source returned ${response.status}`,
        details: {
          url,
          status: response.status,
          statusText: response.statusText
        }
      };
    } catch (error) {
      return {
        name: `subscription-${new URL(url).hostname}`,
        status: HealthStatus.DOWN,
        message: `Failed to check subscription source: ${error.message}`,
        details: {
          url,
          error: error.message
        }
      };
    }
  });
};

export { HealthCheck, HealthStatus };
export default {
  HealthCheck,
  HealthStatus,
  healthCheck,
  createHealthCheck,
  addSubscriptionCheck
};
