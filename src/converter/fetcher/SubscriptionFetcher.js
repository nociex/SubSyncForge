export class SubscriptionFetcher {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000; // 默认30秒超时
    this.maxRetries = options.maxRetries || 3; // 默认最多重试3次
  }

  async fetch(url, options = {}) {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
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
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.text();
        return {
          data,
          status: response.status,
          headers: Object.fromEntries(response.headers),
        };
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        // 如果不是最后一次尝试，继续重试
        if (attempt < this.maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
          continue;
        }
      }
    }
    
    throw new Error(`Failed to fetch after ${this.maxRetries} attempts: ${lastError.message}`);
  }
}