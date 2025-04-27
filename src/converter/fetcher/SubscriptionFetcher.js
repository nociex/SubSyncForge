export class SubscriptionFetcher {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000; // 默认30秒超时
    this.maxRetries = options.maxRetries || 3; // 默认最多重试3次
    this.logger = options.logger || console;
  }

  async fetch(url, options = {}) {
    let lastError;
    
    this.logger.log(`开始获取订阅: ${url}`);
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.log(`重试第${attempt}次获取: ${url}`);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        this.logger.log(`发送请求到: ${url}`);
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            'User-Agent': 'SubSyncForge/1.0',
            ...options.headers,
          },
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorMessage = `HTTP错误! 状态码: ${response.status}, 状态文本: ${response.statusText}`;
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        }
        
        const data = await response.text();
        this.logger.log(`成功获取订阅，数据大小: ${data.length} 字节`);
        
        return {
          data,
          status: response.status,
          headers: Object.fromEntries(response.headers),
        };
      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          this.logger.error(`获取订阅超时: ${url}`);
          throw new Error(`请求超时: ${url}`);
        }
        
        this.logger.error(`获取订阅出错 (尝试 ${attempt + 1}/${this.maxRetries}): ${error.message}`);
        
        // 如果不是最后一次尝试，继续重试
        if (attempt < this.maxRetries - 1) {
          const waitTime = 1000 * Math.pow(2, attempt); // 指数退避
          this.logger.log(`等待 ${waitTime}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
    }
    
    const errorMessage = `尝试 ${this.maxRetries} 次后获取订阅失败: ${lastError.message}`;
    this.logger.error(errorMessage);
    throw new Error(errorMessage);
  }
}