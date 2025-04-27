export class SubscriptionFetcher {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000; // 默认30秒超时
    this.maxRetries = options.maxRetries || 3; // 默认最多重试3次
    this.logger = options.logger || console;
    
    // 默认请求配置
    this.defaultOptions = {
      headers: {
        // 使用v2rayN作为UA，很多订阅源都接受这个
        'User-Agent': options.userAgent || 'v2rayN/5.29',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    };
    
    // 备用UA列表，如果请求失败会尝试使用不同UA
    this.userAgents = [
      'v2rayN/5.29',
      'Clash/1.15.1',  // 部分订阅源会特别接受Clash UA
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'ShadowrocketNG/2.0'
    ];
  }

  async fetch(url, options = {}) {
    let lastError;
    
    this.logger.log(`开始获取订阅: ${url}`);
    
    // 合并默认选项和用户提供的选项
    const fetchOptions = this._mergeOptions(this.defaultOptions, options);
    let uaIndex = 0;
    
    for (let attempt = 0; attempt < this.maxRetries * this.userAgents.length; attempt++) {
      try {
        // 每次重试时可能尝试不同的UA
        if (attempt > 0 && attempt % this.maxRetries === 0) {
          uaIndex = (uaIndex + 1) % this.userAgents.length;
          fetchOptions.headers['User-Agent'] = this.userAgents[uaIndex];
          this.logger.log(`切换UA为: ${fetchOptions.headers['User-Agent']}`);
        }
        
        if (attempt > 0) {
          this.logger.log(`重试第${attempt}次获取: ${url}`);
          this.logger.log(`使用UA: ${fetchOptions.headers['User-Agent']}`);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        // 添加随机查询参数防止缓存
        const urlWithParam = this._addRandomParam(url);
        
        this.logger.log(`发送请求到: ${urlWithParam}`);
        this.logger.log(`请求头: ${JSON.stringify(fetchOptions.headers)}`);
        
        const response = await fetch(urlWithParam, {
          ...fetchOptions,
          signal: controller.signal
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
          url: url  // 返回原始URL（不带随机参数）
        };
      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          this.logger.error(`获取订阅超时: ${url}`);
          // 不立即抛出，允许尝试其他UA
        } else {
          this.logger.error(`获取订阅出错: ${error.message}`);
        }
        
        // 如果未尝试完所有可能性，继续尝试
        if (attempt < this.maxRetries * this.userAgents.length - 1) {
          const waitTime = 1000 * Math.pow(1.5, attempt % this.maxRetries); // 指数退避，但重置每种UA
          this.logger.log(`等待 ${waitTime}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
    }
    
    const errorMessage = `尝试 ${this.maxRetries * this.userAgents.length} 次后获取订阅失败: ${lastError.message}`;
    this.logger.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  /**
   * 合并请求选项
   */
  _mergeOptions(defaultOpts, userOpts) {
    const result = { ...defaultOpts, ...userOpts };
    // 特殊处理headers，确保两者合并而不是覆盖
    result.headers = { ...defaultOpts.headers, ...userOpts.headers };
    return result;
  }
  
  /**
   * 添加随机参数到URL以防止缓存
   */
  _addRandomParam(url) {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_t=${Date.now()}`;
  }
}