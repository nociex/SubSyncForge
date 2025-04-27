/**
 * 性能指标类型
 */
export const MetricType = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  TIMER: 'timer'
};

/**
 * 性能指标收集器
 */
export class Metrics {
  constructor(options = {}) {
    this.metrics = new Map();
    this.prefix = options.prefix || '';
    this.tags = options.tags || {};
    this.exporters = options.exporters || [];
  }
  
  /**
   * 创建指标名称
   */
  createMetricName(name) {
    return this.prefix ? `${this.prefix}.${name}` : name;
  }
  
  /**
   * 获取指标
   */
  getMetric(name, type) {
    const fullName = this.createMetricName(name);
    
    if (!this.metrics.has(fullName)) {
      this.metrics.set(fullName, {
        name: fullName,
        type,
        value: type === MetricType.COUNTER || type === MetricType.GAUGE ? 0 : [],
        tags: { ...this.tags },
        timestamp: Date.now()
      });
    }
    
    return this.metrics.get(fullName);
  }
  
  /**
   * 增加计数器
   */
  increment(name, value = 1, tags = {}) {
    const metric = this.getMetric(name, MetricType.COUNTER);
    metric.value += value;
    metric.timestamp = Date.now();
    Object.assign(metric.tags, tags);
    
    this.notifyExporters(metric);
    return metric.value;
  }
  
  /**
   * 设置仪表值
   */
  gauge(name, value, tags = {}) {
    const metric = this.getMetric(name, MetricType.GAUGE);
    metric.value = value;
    metric.timestamp = Date.now();
    Object.assign(metric.tags, tags);
    
    this.notifyExporters(metric);
    return metric.value;
  }
  
  /**
   * 记录直方图值
   */
  histogram(name, value, tags = {}) {
    const metric = this.getMetric(name, MetricType.HISTOGRAM);
    metric.value.push(value);
    metric.timestamp = Date.now();
    Object.assign(metric.tags, tags);
    
    this.notifyExporters(metric);
    return metric.value;
  }
  
  /**
   * 开始计时器
   */
  startTimer(name, tags = {}) {
    const startTime = Date.now();
    
    return {
      stop: () => {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        const metric = this.getMetric(name, MetricType.TIMER);
        metric.value.push(duration);
        metric.timestamp = endTime;
        Object.assign(metric.tags, tags);
        
        this.notifyExporters(metric);
        return duration;
      }
    };
  }
  
  /**
   * 记录函数执行时间
   */
  async timeAsync(name, fn, tags = {}) {
    const timer = this.startTimer(name, tags);
    try {
      return await fn();
    } finally {
      timer.stop();
    }
  }
  
  /**
   * 获取所有指标
   */
  getMetrics() {
    return Array.from(this.metrics.values());
  }
  
  /**
   * 重置指标
   */
  reset() {
    this.metrics.clear();
  }
  
  /**
   * 添加指标导出器
   */
  addExporter(exporter) {
    if (typeof exporter.export !== 'function') {
      throw new Error('Exporter must have an export method');
    }
    
    this.exporters.push(exporter);
  }
  
  /**
   * 通知所有导出器
   */
  notifyExporters(metric) {
    for (const exporter of this.exporters) {
      try {
        exporter.export(metric);
      } catch (error) {
        console.error(`Error in metrics exporter: ${error.message}`);
      }
    }
  }
  
  /**
   * 导出所有指标
   */
  export() {
    const metrics = this.getMetrics();
    
    for (const exporter of this.exporters) {
      try {
        exporter.exportBatch(metrics);
      } catch (error) {
        console.error(`Error in metrics exporter batch: ${error.message}`);
      }
    }
    
    return metrics;
  }
}

/**
 * 控制台指标导出器
 */
export class ConsoleMetricsExporter {
  constructor(options = {}) {
    this.batchOnly = options.batchOnly !== false;
  }
  
  export(metric) {
    if (this.batchOnly) return;
    
    console.log(`[Metric] ${metric.name} (${metric.type}): ${
      Array.isArray(metric.value) 
        ? `[${metric.value.join(', ')}]` 
        : metric.value
    } ${JSON.stringify(metric.tags)}`);
  }
  
  exportBatch(metrics) {
    console.log('--- Metrics Export ---');
    for (const metric of metrics) {
      console.log(`${metric.name} (${metric.type}): ${
        Array.isArray(metric.value) 
          ? `[${metric.value.join(', ')}]` 
          : metric.value
      } ${JSON.stringify(metric.tags)}`);
    }
    console.log('---------------------');
  }
}

/**
 * 创建默认指标收集器
 */
export const createDefaultMetrics = (options = {}) => {
  return new Metrics({
    prefix: options.prefix || 'subsyncforge',
    tags: options.tags || {},
    exporters: options.exporters || []
  });
};

export default {
  Metrics,
  MetricType,
  ConsoleMetricsExporter,
  createDefaultMetrics
};
