import { 
  Metrics, 
  MetricType, 
  ConsoleMetricsExporter, 
  createDefaultMetrics 
} from './Metrics.js';

// 创建全局默认指标收集器实例
export const metrics = createDefaultMetrics();

// 在开发环境添加 Console Exporter
// @ts-ignore - process is not defined in CF Worker global scope
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('Adding ConsoleMetricsExporter in development mode.'); // Add a log for confirmation
  metrics.addExporter(new ConsoleMetricsExporter());
}

// 预定义的指标名称
export const MetricName = {
  // 转换相关指标
  CONVERSION_COUNT: 'conversion.count',
  CONVERSION_ERROR_COUNT: 'conversion.error.count',
  CONVERSION_TIME: 'conversion.time',
  
  // 获取相关指标
  FETCH_COUNT: 'fetch.count',
  FETCH_ERROR_COUNT: 'fetch.error.count',
  FETCH_TIME: 'fetch.time',
  FETCH_SIZE: 'fetch.size',
  
  // 解析相关指标
  PARSE_COUNT: 'parse.count',
  PARSE_ERROR_COUNT: 'parse.error.count',
  PARSE_TIME: 'parse.time',
  PARSE_NODE_COUNT: 'parse.node.count',
  
  // 去重相关指标
  DEDUP_TIME: 'dedup.time',
  DEDUP_BEFORE_COUNT: 'dedup.before.count',
  DEDUP_AFTER_COUNT: 'dedup.after.count',
  
  // 系统相关指标
  SYSTEM_MEMORY: 'system.memory',
  SYSTEM_CPU: 'system.cpu',
  SYSTEM_ERROR_COUNT: 'system.error.count'
};

// 指标帮助函数
export const recordConversion = (format, success, time, nodeCount) => {
  metrics.increment(MetricName.CONVERSION_COUNT, 1, { format });
  
  if (!success) {
    metrics.increment(MetricName.CONVERSION_ERROR_COUNT, 1, { format });
  }
  
  if (time) {
    metrics.histogram(MetricName.CONVERSION_TIME, time, { format });
  }
  
  if (nodeCount) {
    metrics.gauge(MetricName.PARSE_NODE_COUNT, nodeCount, { format });
  }
};

export const recordFetch = (url, success, time, size) => {
  metrics.increment(MetricName.FETCH_COUNT, 1, { url });
  
  if (!success) {
    metrics.increment(MetricName.FETCH_ERROR_COUNT, 1, { url });
  }
  
  if (time) {
    metrics.histogram(MetricName.FETCH_TIME, time, { url });
  }
  
  if (size) {
    metrics.gauge(MetricName.FETCH_SIZE, size, { url });
  }
};

export const recordParse = (format, success, time, nodeCount) => {
  metrics.increment(MetricName.PARSE_COUNT, 1, { format });
  
  if (!success) {
    metrics.increment(MetricName.PARSE_ERROR_COUNT, 1, { format });
  }
  
  if (time) {
    metrics.histogram(MetricName.PARSE_TIME, time, { format });
  }
  
  if (nodeCount) {
    metrics.gauge(MetricName.PARSE_NODE_COUNT, nodeCount, { format });
  }
};

export const recordDedup = (beforeCount, afterCount, time) => {
  metrics.gauge(MetricName.DEDUP_BEFORE_COUNT, beforeCount);
  metrics.gauge(MetricName.DEDUP_AFTER_COUNT, afterCount);
  
  if (time) {
    metrics.histogram(MetricName.DEDUP_TIME, time);
  }
};

export const recordSystemMetrics = () => {
  // 在浏览器环境中
  if (typeof window !== 'undefined' && window.performance) {
    const memory = window.performance.memory;
    if (memory) {
      metrics.gauge(MetricName.SYSTEM_MEMORY, memory.usedJSHeapSize);
    }
  }
  
  // 在 Node.js 环境中
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memory = process.memoryUsage();
    metrics.gauge(MetricName.SYSTEM_MEMORY, memory.heapUsed);
  }
};

export { 
  Metrics, 
  MetricType, 
  ConsoleMetricsExporter, 
  createDefaultMetrics 
};

export default {
  Metrics,
  MetricType,
  MetricName,
  metrics,
  recordConversion,
  recordFetch,
  recordParse,
  recordDedup,
  recordSystemMetrics
};
