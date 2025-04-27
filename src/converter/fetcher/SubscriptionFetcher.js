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
      'ShadowrocketNG/2.0',
      'Stash/2.4.6',
      'Quantumult/1.0.0',
      'ClashForAndroid/2.5.12'
    ];
  }

  /**
   * 合并请求选项
   * @private
   */
  _mergeOptions(defaultOpts, customOpts) {
    const result = { ...defaultOpts };
    
    if (customOpts.headers) {
      result.headers = { ...result.headers, ...customOpts.headers };
    }
    
    return result;
  }

  /**
   * 添加随机参数到URL以防止缓存
   * @private
   */
  _addRandomParam(url) {
    try {
      const parsedUrl = new URL(url);
      parsedUrl.searchParams.set('_t', Date.now());
      return parsedUrl.toString();
    } catch (e) {
      this.logger.warn(`无法解析URL: ${url}, 错误: ${e.message}`);
      return url;
    }
  }

  /**
   * 尝试解析响应内容
   * @private
   */
  async _tryParseResponse(response) {
    // 获取内容类型
    const contentType = response.headers.get('content-type') || '';
    this.logger.log(`响应内容类型: ${contentType}`);
    
    // 获取文本内容
    const data = await response.text();
    
    if (data.length === 0) {
      throw new Error('服务器返回了空内容');
    }
    
    // 尝试检测内容格式
    if (data.length < 1000) {
      this.logger.log(`响应内容: ${data.substring(0, 200)}...`);
    } else {
      this.logger.log(`响应内容太长，只显示前200字符: ${data.substring(0, 200)}...`);
    }
    
    return data;
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
        
        // 记录请求开始时间
        const startTime = Date.now();
        
        // 发送请求
        let response;
        try {
          response = await fetch(urlWithParam, {
            ...fetchOptions,
            signal: controller.signal
          });
          
          // 记录请求完成和耗时
          const endTime = Date.now();
          this.logger.log(`请求完成，耗时: ${endTime - startTime}ms, 状态码: ${response.status}`);
          
        } catch (fetchError) {
          if (fetchError.name === 'AbortError') {
            throw new Error(`请求超时 (${this.timeout}ms)`);
          }
          throw fetchError;
        } finally {
          clearTimeout(timeoutId);
        }
        
        // 检查HTTP状态码
        if (!response.ok) {
          // 记录响应头以便调试
          const headers = {};
          for (const [key, value] of response.headers.entries()) {
            headers[key] = value;
          }
          
          const errorMessage = `HTTP错误! 状态码: ${response.status}, 状态文本: ${response.statusText}`;
          this.logger.error(errorMessage);
          this.logger.error(`响应头: ${JSON.stringify(headers)}`);
          
          if (response.status === 403) {
            this.logger.warn('收到403禁止访问，可能需要更换UA或添加特定请求头');
          } else if (response.status === 429) {
            this.logger.warn('收到429请求过多，需要等待后重试');
            // 对于429错误，增加更长的等待时间
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          // 尝试读取错误响应内容
          try {
            const errorBody = await response.text();
            this.logger.error(`错误响应内容: ${errorBody.substring(0, 500)}`);
          } catch (e) {
            this.logger.error(`无法读取错误响应内容: ${e.message}`);
          }
          
          throw new Error(errorMessage);
        }
        
        // 解析响应
        const data = await this._tryParseResponse(response);
        this.logger.log(`成功获取订阅，数据大小: ${data.length} 字节`);
        
        // 验证数据有效性
        if (!this._validateSubscriptionData(data)) {
          throw new Error(`无效的订阅数据格式，可能不是有效的订阅内容`);
        }
        
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
   * 验证订阅数据有效性
   * @private
   */
  _validateSubscriptionData(data) {
    // 检测空内容
    if (!data || data.trim().length === 0) {
      this.logger.error('订阅内容为空');
      return false;
    }
    
    // 尝试检测常见订阅格式
    try {
      // 检测是否Base64编码的内容
      if (/^[A-Za-z0-9+/=]+$/.test(data.trim())) {
        this.logger.log('检测到可能的Base64编码内容');
        try {
          const decoded = Buffer.from(data, 'base64').toString('utf-8');
          // 检查解码后内容是否包含常见协议
          if (decoded.includes('vmess://') || decoded.includes('ss://') || 
              decoded.includes('ssr://') || decoded.includes('trojan://')) {
            this.logger.log('Base64解码后发现有效协议前缀');
            return true;
          }
        } catch (e) {
          this.logger.warn(`Base64解码失败: ${e.message}`);
        }
      }
      
      // 检测是否YAML内容
      if (data.includes('proxies:') || data.includes('Proxy:') || 
          data.includes('proxy-groups:') || data.includes('rules:')) {
        this.logger.log('检测到可能的YAML/Clash配置');
        return true;
      }
      
      // 检测是否JSON内容
      if ((data.startsWith('{') && data.endsWith('}')) || 
          (data.startsWith('[') && data.endsWith(']'))) {
        this.logger.log('检测到可能的JSON内容');
        return true;
      }
      
      // 检测URI格式
      if (data.includes('vmess://') || data.includes('ss://') || 
          data.includes('ssr://') || data.includes('trojan://')) {
        this.logger.log('检测到直接的节点URI');
        return true;
      }
      
      // 没有匹配任何已知格式，但仍返回true让解析器去尝试
      this.logger.warn('未识别订阅格式，但将尝试解析');
      return true;
    } catch (error) {
      this.logger.error(`验证订阅内容失败: ${error.message}`);
      return false;
    }
  }
}