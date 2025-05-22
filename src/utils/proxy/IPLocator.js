import { logger } from '../index.js';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

const defaultLogger = logger?.defaultLogger || console;

/**
 * IP地址定位器，用于获取IP地址的地理位置信息
 */
export class IPLocator {
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger.child({ component: 'IPLocator' });
    
    // 配置多个备选API
    this.apiProviders = [
      // 1. IP-API.com - 每分钟150次请求的免费API
      {
        name: 'ip-api',
        url: 'http://ip-api.com/json/{ip}?lang=zh-CN',
        needsKey: false,
        rateLimit: 145, // 保守估计为每分钟145次
        parser: this.parseIpApiResponse,
        status: 'ready' // ready, limited, failed
      },
      // 2. IP.CN
      {
        name: 'ip.cn',
        url: 'https://www.ip.cn/api/index?ip={ip}&type=0',
        needsKey: false,
        rateLimit: 30, // 保守估计每分钟30次(每日限额500次)
        parser: this.parseIpCnResponse,
        status: 'ready'
      },
      // 3. 36IP.cn
      {
        name: '36ip',
        url: 'https://www.36ip.cn/?type=json&ip={ip}',
        needsKey: false,
        rateLimit: 40, // 保守估计每分钟40次
        parser: this.parse36ipResponse,
        status: 'ready'
      },
      // 4. api.vore.top
      {
        name: 'vore',
        url: 'https://api.vore.top/api/IPdata?ip={ip}',
        needsKey: false,
        rateLimit: 50, // 无频率限制，保守设置
        parser: this.parseVoreResponse,
        status: 'ready'
      },
      // 保留原有的备选API
      {
        name: 'freeipapi',
        url: 'https://freeipapi.com/api/json/{ip}',
        needsKey: false,
        rateLimit: 30,
        parser: this.parseGenericResponse,
        status: 'ready'
      },
      {
        name: 'iplocation.net',
        url: 'https://api.iplocation.net/?ip={ip}',
        needsKey: false,
        rateLimit: 30,
        parser: this.parseIplocationNetResponse,
        status: 'ready'
      }
    ];
    
    // 读取环境变量或传入的API URL
    const apiUrl = process.env.IP_API_URL || options.apiUrl;
    if (apiUrl) {
      // 找到匹配的已配置提供商或添加新的自定义提供商
      const matchedProvider = this.apiProviders.find(p => apiUrl.includes(p.name));
      if (matchedProvider) {
        matchedProvider.url = apiUrl;
        this.logger.info(`使用配置的API URL: ${apiUrl} (${matchedProvider.name})`);
        this.currentProvider = matchedProvider;
      } else {
        // 添加自定义API提供商
        const customProvider = {
          name: 'custom',
          url: apiUrl,
          needsKey: options.apiKey ? true : false,
          rateLimit: 15, // 默认的保守限制
          parser: this.parseGenericResponse,
          status: 'ready'
        };
        this.apiProviders.unshift(customProvider);
        this.currentProvider = customProvider;
        this.logger.info(`使用自定义API: ${apiUrl}`);
      }
    } else {
      // 默认使用第一个提供商(ip-api.com)
      this.currentProvider = this.apiProviders[0];
      this.logger.info(`使用默认API提供商: ${this.currentProvider.name}`);
    }
    
    this.apiKey = process.env.IP_API_KEY || options.apiKey || '';
    this.timeout = options.timeout || 5000;
    this.cacheDir = options.cacheDir || 'data/ip_cache';
    this.cacheTime = options.cacheTime || 7 * 24 * 60 * 60 * 1000; // 默认缓存7天
    
    // 请求计数器，用于限流
    this.requestCounter = {};
    this.counterResetTime = Date.now();
    
    // 确保缓存目录存在
    if (!fs.existsSync(this.cacheDir)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        this.logger.info(`创建IP缓存目录: ${this.cacheDir}`);
      } catch (e) {
        this.logger.error(`创建IP缓存目录失败: ${e.message}`);
      }
    }
    
    // 内存缓存
    this.memoryCache = {};
    
    // 地区缓存文件
    this.regionCacheFile = path.join(this.cacheDir, 'region_cache.json');
    this.loadRegionCache();
    
    // 加载国家代码映射
    this.countryCodeMap = {
      'CN': '中国',
      'HK': '香港',
      'TW': '台湾',
      'JP': '日本',
      'US': '美国',
      'KR': '韩国',
      'SG': '新加坡',
      'UK': '英国',
      'GB': '英国',
      'CA': '加拿大',
      'AU': '澳大利亚',
      'DE': '德国',
      'FR': '法国',
      'RU': '俄罗斯',
      'IN': '印度',
      'NL': '荷兰',
      'IT': '意大利',
      'BR': '巴西',
      'CH': '瑞士',
      'SE': '瑞典',
      'NO': '挪威',
      'FI': '芬兰',
      'DK': '丹麦',
      'PL': '波兰',
      'TR': '土耳其',
      'TH': '泰国',
      'VN': '越南',
      'ID': '印度尼西亚',
      'MY': '马来西亚',
      'PH': '菲律宾',
      'AE': '阿联酋',
      'SA': '沙特阿拉伯',
      'ZA': '南非'
      // 可以根据需要添加更多国家/地区代码
    };
  }

  /**
   * 加载地区缓存
   */
  loadRegionCache() {
    this.regionCache = {};
    
    if (fs.existsSync(this.regionCacheFile)) {
      try {
        this.regionCache = JSON.parse(fs.readFileSync(this.regionCacheFile, 'utf-8'));
        this.logger.info(`已加载IP地区缓存文件: ${Object.keys(this.regionCache).length} 个区域`);
      } catch (e) {
        this.logger.error(`加载IP地区缓存文件失败: ${e.message}`);
        // 如果文件损坏，创建新的缓存文件
        this.regionCache = {};
        this.saveRegionCache();
      }
    } else {
      // 创建新的缓存文件
      this.saveRegionCache();
    }
  }
  
  /**
   * 保存地区缓存
   */
  saveRegionCache() {
    try {
      fs.writeFileSync(this.regionCacheFile, JSON.stringify(this.regionCache, null, 2));
      this.logger.debug(`IP地区缓存已保存: ${Object.keys(this.regionCache).length} 个区域`);
    } catch (e) {
      this.logger.error(`保存IP地区缓存失败: ${e.message}`);
    }
  }

  /**
   * 获取IP地址的地理位置信息
   * @param {string} ip IP地址或域名
   * @returns {Promise<Object>} 地理位置信息
   */
  async locate(ip) {
    // 检查是否是域名而非IP
    const isDomain = !this.isIPAddress(ip);
    if (isDomain) {
      this.logger.debug(`获取IP地址位置: ${ip}`);
      // 对于域名，提供基本信息而不进行IP查询
      return {
        ip: ip,
        country: null,
        countryName: '其他',
        region: '',
        city: '',
        org: '',
        loc: '',
        timezone: '',
        timestamp: new Date().toISOString()
      };
    }
    
    // 优先检查内存缓存
    if (this.memoryCache[ip]) {
      const cacheEntry = this.memoryCache[ip];
      const now = new Date().getTime();
      
      // 检查缓存是否过期
      if (now - new Date(cacheEntry.timestamp).getTime() < this.cacheTime) {
        this.logger.debug(`使用内存缓存的IP信息: ${ip}`);
        return cacheEntry;
      } else {
        // 删除过期缓存
        delete this.memoryCache[ip];
      }
    }
    
    // 检查地区缓存文件
    const cachedInfo = this.getFromCache(ip);
    if (cachedInfo) {
      // 更新内存缓存
      this.memoryCache[ip] = cachedInfo;
      this.logger.debug(`使用地区缓存的IP信息: ${ip}`);
      return cachedInfo;
    }
    
    // 尝试最多3次不同的API
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        this.logger.debug(`获取IP地址位置: ${ip} (尝试 ${attempts}/${maxAttempts}, 使用提供商: ${this.currentProvider.name})`);
        
        // 检查是否需要重置计数器
        this.checkAndResetCounter();
        
        // 检查当前提供商是否达到限制
        if (this.isProviderLimited(this.currentProvider)) {
          this.logger.warn(`当前提供商 ${this.currentProvider.name} 已达到请求限制，尝试切换`);
          const switched = this.switchToNextProvider();
          if (!switched) {
            this.logger.error("无可用的API提供商，所有API均达到限制或失败");
            throw new Error("所有API提供商均不可用");
          }
          continue; // 切换后重试
        }
        
        // 增加当前提供商的请求计数
        this.incrementRequestCounter(this.currentProvider.name);
        
        // 构建请求URL
        let url;
        if (this.currentProvider.url.includes('{ip}')) {
          url = this.currentProvider.url.replace('{ip}', ip);
        } else {
          const urlObj = new URL(this.currentProvider.url);
          urlObj.searchParams.append('ip', ip);
          url = urlObj.toString();
        }
        
        // 添加API密钥（如果需要）
        if (this.currentProvider.needsKey && this.apiKey) {
          // 根据不同的提供商添加不同的参数名
          if (url.includes('?')) {
            if (this.currentProvider.name === 'ipinfo') {
              url += `&token=${this.apiKey}`;
            } else if (this.currentProvider.name === 'ipgeolocation') {
              url += `&apiKey=${this.apiKey}`;
            } else {
              url += `&key=${this.apiKey}`;
            }
          } else {
            if (this.currentProvider.name === 'ipinfo') {
              url += `?token=${this.apiKey}`;
            } else if (this.currentProvider.name === 'ipgeolocation') {
              url += `?apiKey=${this.apiKey}`;
            } else {
              url += `?key=${this.apiKey}`;
            }
          }
        }
        
        // 超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.timeout);
        
        // 发起请求
        const response = await this.makeRequest(url, controller.signal);
        clearTimeout(timeoutId);
        
        // 使用对应的解析器处理响应
        const parsedData = this.currentProvider.parser.call(this, response, ip);
        
        // 添加来源信息
        if (!parsedData.source) {
          parsedData.source = this.currentProvider.name;
        }
        
        // 保存到缓存
        this.saveToCache(ip, parsedData);
        
        // 更新内存缓存
        this.memoryCache[ip] = parsedData;
        
        return parsedData;
      } catch (error) {
        this.logger.error(`获取IP地址位置失败 (${this.currentProvider.name}): ${ip}, 错误: ${error.message}`);
        lastError = error;
        
        // 标记当前提供商状态
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          this.currentProvider.status = 'limited';
          this.logger.warn(`提供商 ${this.currentProvider.name} 已达到请求限制`);
        } else if (error.message.includes('timeout') || error.name === 'AbortError') {
          this.currentProvider.status = 'timeout';
          this.logger.warn(`提供商 ${this.currentProvider.name} 请求超时`);
        } else if (error.message.includes('404')) {
          this.currentProvider.status = 'failed';
          this.logger.warn(`提供商 ${this.currentProvider.name} 返回 404 错误，可能API已变更`);
        } else {
          this.currentProvider.status = 'failed';
          this.logger.warn(`提供商 ${this.currentProvider.name} 请求失败: ${error.message}`);
        }
        
        // 尝试切换到下一个提供商
        const switched = this.switchToNextProvider();
        if (!switched) {
          this.logger.error("无可用的API提供商，所有API均达到限制或失败");
          break; // 无法切换，退出循环
        }
      }
    }
    
    // 所有尝试都失败了，返回一个基本结果
    this.logger.error(`所有API提供商尝试都失败: ${ip}, 尝试次数: ${attempts}`);
    return {
      ip: ip,
      error: lastError?.message || "所有API提供商均失败",
      country: null,
      countryName: '其他',
      region: '',
      city: '',
      org: '',
      loc: '',
      timezone: '',
      timestamp: new Date().toISOString(),
      source: 'fallback'
    };
  }
  
  /**
   * 发起HTTP/HTTPS请求
   * @param {string} url 请求URL
   * @param {AbortSignal} signal 中止信号
   * @returns {Promise<Object>} 解析后的JSON数据
   */
  async makeRequest(url, signal) {
    return new Promise((resolve, reject) => {
      try {
        const isHttps = url.startsWith('https');
        const requestFn = isHttps ? https.get : http.get;
        
        // 设置请求选项
        const options = { 
          signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
          },
          timeout: this.timeout // 显式设置超时
        };
        
        const req = requestFn(url, options, (res) => {
          // 处理HTTP状态码
          if (res.statusCode === 429) {
            reject(new Error('请求频率限制 (429)'));
            return;
          } else if (res.statusCode === 404) {
            reject(new Error('HTTP error: 404'));
            return;
          } else if (res.statusCode === 403) {
            reject(new Error('访问被禁止 (403)'));
            return;
          } else if (res.statusCode >= 400) {
            reject(new Error(`HTTP错误: ${res.statusCode}`));
            return;
          }
          
          // 收集响应数据
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              // 尝试解析JSON数据
              let jsonData;
              try {
                jsonData = JSON.parse(data);
              } catch (e) {
                // 如果解析失败，可能是非JSON响应
                this.logger.warn(`JSON解析失败: ${e.message}, 响应内容: ${data.substring(0, 100)}...`);
                reject(new Error(`解析响应失败: ${e.message}`));
                return;
              }
              
              // 成功解析，返回数据
              resolve(jsonData);
            } catch (e) {
              reject(new Error(`处理响应失败: ${e.message}`));
            }
          });
        });
        
        // 设置请求错误处理
        req.on('error', (err) => {
          if (err.name === 'AbortError') {
            reject(new Error('请求超时'));
          } else {
            reject(new Error(`请求失败: ${err.message}`));
          }
        });
        
        // 设置超时处理
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('请求超时'));
        });
      } catch (error) {
        reject(new Error(`创建请求失败: ${error.message}`));
      }
    });
  }
  
  /**
   * 解析ip-api.com的响应
   */
  parseIpApiResponse(data, ip) {
    // 检查是否有错误响应
    if (data.status === 'fail') {
      throw new Error(`ip-api错误: ${data.message}`);
    }
    
    // 如果没有国家代码，设置为null以便触发"其他"分类
    const countryCode = data.countryCode || null;
    
    return {
      ip: data.query || ip,
      country: countryCode,
      countryName: this.getCountryName(countryCode) || data.country || '其他',
      region: data.regionName,
      city: data.city,
      org: data.isp || data.org,
      loc: data.lat && data.lon ? `${data.lat},${data.lon}` : '',
      timezone: data.timezone,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 解析ipinfo.io的响应
   */
  parseIpinfoResponse(data, ip) {
    // 检查是否有错误
    if (data.error) {
      throw new Error(`ipinfo错误: ${data.error.title}`);
    }
    
    // 如果没有国家代码，设置为null以便触发"其他"分类
    const countryCode = data.country || null;
    
    return {
      ip: data.ip || ip,
      country: countryCode,
      countryName: this.getCountryName(countryCode) || '其他',
      region: data.region,
      city: data.city,
      org: data.org,
      loc: data.loc,
      timezone: data.timezone,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 解析ipgeolocation.io的响应
   */
  parseIpgeolocationResponse(data, ip) {
    // 检查是否有错误
    if (data.message) {
      throw new Error(`ipgeolocation错误: ${data.message}`);
    }
    
    // 如果没有国家代码，设置为null以便触发"其他"分类
    const countryCode = data.country_code2 || null;
    
    return {
      ip: data.ip || ip,
      country: countryCode,
      countryName: this.getCountryName(countryCode) || data.country_name || '其他',
      region: data.state_prov,
      city: data.city,
      org: data.isp,
      loc: data.latitude && data.longitude ? `${data.latitude},${data.longitude}` : '',
      timezone: data.time_zone && data.time_zone.name ? data.time_zone.name : '',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 解析freeipapi.com的响应
   */
  parseGenericResponse(data, ip) {
    // 尝试智能识别字段
    const result = {
      ip: data.ip || data.query || ip,
      timestamp: new Date().toISOString()
    };
    
    // 尝试识别国家代码
    if (data.country_code || data.countryCode || data.country_code2 || data.country) {
      const countryCode = data.country_code || data.countryCode || data.country_code2 || data.country;
      result.country = countryCode;
      result.countryName = this.getCountryName(countryCode) || data.country_name || data.countryName || '其他';
    } else {
      // 没有国家信息，设置为null以触发"其他"分类
      result.country = null;
      result.countryName = '其他';
    }
    
    // 尝试识别地区
    result.region = data.region_name || data.regionName || data.region || data.state_prov || '';
    
    // 尝试识别城市
    result.city = data.city || '';
    
    // 尝试识别组织
    result.org = data.org || data.isp || data.as || '';
    
    // 尝试识别地理坐标
    if (data.latitude && data.longitude) {
      result.loc = `${data.latitude},${data.longitude}`;
    } else if (data.lat && data.lon) {
      result.loc = `${data.lat},${data.lon}`;
    } else if (data.loc) {
      result.loc = data.loc;
    } else {
      result.loc = '';
    }
    
    // 尝试识别时区
    result.timezone = data.timezone || data.time_zone || (data.time_zone && data.time_zone.name) || '';
    
    // 针对 freeipapi 可能的字段
    if (!result.country && data.countryCode) {
        result.country = data.countryCode;
        result.countryName = this.getCountryName(data.countryCode) || data.countryName || '其他';
    }
     if (!result.region && data.regionName) {
        result.region = data.regionName;
    }
     if (!result.city && data.cityName) {
        result.city = data.cityName;
    }
    if (!result.org && data.asn && data.asnOwner) {
       result.org = `${data.asn} ${data.asnOwner}`;
    }
     if (!result.loc && data.latitude && data.longitude) {
        result.loc = `${data.latitude},${data.longitude}`;
    }
    if (!result.timezone && data.timeZone) {
       result.timezone = data.timeZone;
    }

    // 再次检查 countryName，确保有默认值
    if (!result.countryName) {
        result.countryName = '其他';
    }

    return result;
  }
  
  /**
   * 检查是否需要重置计数器
   */
  checkAndResetCounter() {
    const now = Date.now();
    // 如果上次重置时间超过1分钟，则重置计数器并重置 limited 状态
    if (now - this.counterResetTime > 60000) {
      this.logger.debug('重置API请求计数器和限制状态');
      this.requestCounter = {};
      this.apiProviders.forEach(p => {
         // 只重置 limited 状态，failed 和 timeout 可能需要更长时间恢复
         if (p.status === 'limited') {
            p.status = 'ready';
         }
      });
      this.counterResetTime = now;
    }
  }
  
  /**
   * 增加请求计数
   */
  incrementRequestCounter(providerName) {
    this.requestCounter[providerName] = (this.requestCounter[providerName] || 0) + 1;
  }
  
  /**
   * 检查提供商是否达到限制
   */
  isProviderLimited(provider) {
    // 如果状态不是 ready，则认为受限/不可用
    if (provider.status !== 'ready') {
      return true;
    }
    // 如果需要 Key 但没有提供，则不可用
    if (provider.needsKey && !this.apiKey) {
       this.logger.warn(`提供商 ${provider.name} 需要 API Key，但未配置`);
       provider.status = 'no_key'; // 标记为特殊状态
       return true;
    }
    const count = this.requestCounter[provider.name] || 0;
    // 检查是否超过速率限制
    if (count >= provider.rateLimit) {
       provider.status = 'limited'; // 显式标记状态
       return true;
    }
    return false;
  }
  
  /**
   * 切换到下一个可用的提供商
   */
  switchToNextProvider() {
    const currentIndex = this.apiProviders.findIndex(p => p === this.currentProvider);
    let nextIndex = (currentIndex + 1) % this.apiProviders.length;

    // 循环查找下一个状态为 'ready' 且满足 Key 条件的提供商
    for (let i = 0; i < this.apiProviders.length; i++) {
      const nextProvider = this.apiProviders[nextIndex];
      // 检查状态是否 ready 并且 Key 条件满足
      if (nextProvider.status === 'ready' && (!nextProvider.needsKey || this.apiKey)) {
        this.currentProvider = nextProvider;
        return true; // 成功找到并切换
      }
       // 检查是否是因没key导致不可用
       if (nextProvider.needsKey && !this.apiKey && nextProvider.status !== 'no_key') {
           this.logger.debug(`跳过需要Key的提供商 ${nextProvider.name}`);
           nextProvider.status = 'no_key'; // 标记一下避免重复日志
       }

      nextIndex = (nextIndex + 1) % this.apiProviders.length;
       // 如果绕了一圈回到原来的，说明没有可用的了
       if (nextIndex === (currentIndex + 1) % this.apiProviders.length && i > 0) break;
    }

    // 如果循环一圈都找不到可用的 'ready' 提供商
    this.logger.error('没有找到其他可用的API提供商');
    // 可以考虑在这里尝试重置 'failed' 或 'timeout' 的状态，给它们一个机会
    // 例如： this.apiProviders.forEach(p => { if (p.status !== 'limited' && p.status !== 'no_key') p.status = 'ready'; });
    // 但现在暂时不加这个逻辑，避免潜在问题

    return false; // 未能切换
  }

  /**
   * 从缓存中获取IP信息
   * @param {string} ip IP地址
   * @returns {Object|null} 缓存的IP信息或null
   */
  getFromCache(ip) {
    // 按国家/地区分区缓存，使用第一个字节作为分区键
    const ipFirstPart = ip.split('.')[0] || 'unknown';
    
    // 检查该区域的缓存是否存在
    if (this.regionCache[ipFirstPart] && this.regionCache[ipFirstPart][ip]) {
      const cachedData = this.regionCache[ipFirstPart][ip];
      
      // 检查缓存是否过期
      const cacheTime = new Date(cachedData.timestamp).getTime();
      const now = new Date().getTime();
      
      if (now - cacheTime < this.cacheTime) {
        return cachedData;
      } else {
        // 删除过期缓存
        delete this.regionCache[ipFirstPart][ip];
        
        // 如果该区域已空，删除该区域
        if (Object.keys(this.regionCache[ipFirstPart]).length === 0) {
          delete this.regionCache[ipFirstPart];
        }
        
        // 保存更新后的缓存
        this.saveRegionCache();
      }
    }
    
    return null;
  }
  
  /**
   * 保存IP信息到缓存
   * @param {string} ip IP地址
   * @param {Object} data IP信息
   */
  saveToCache(ip, data) {
    // 按国家/地区分区缓存，使用第一个字节作为分区键
    const ipFirstPart = ip.split('.')[0] || 'unknown';
    
    // 如果该区域缓存不存在，创建一个新的
    if (!this.regionCache[ipFirstPart]) {
      this.regionCache[ipFirstPart] = {};
    }
    
    // 保存到区域缓存
    this.regionCache[ipFirstPart][ip] = data;
    
    // 保存更新后的缓存
    // 为了减少I/O操作，可以在这里实现批量保存或延迟保存
    // 这里为简单起见，每次都保存
    this.saveRegionCache();
  }
  
  /**
   * 获取国家/地区名称
   * @param {string} countryCode 国家/地区代码
   * @returns {string} 国家/地区名称
   */
  getCountryName(countryCode) {
    if (!countryCode) return '其他';
    
    // 尝试从映射中获取国家/地区名称
    const countryName = this.countryCodeMap[countryCode];
    return countryName || countryCode;
  }
  
  /**
   * 清理过期缓存
   */
  cleanExpiredCache() {
    try {
      // 清理内存缓存
      const now = new Date().getTime();
      Object.keys(this.memoryCache).forEach(ip => {
        const cacheTime = new Date(this.memoryCache[ip].timestamp).getTime();
        if (now - cacheTime >= this.cacheTime) {
          delete this.memoryCache[ip];
        }
      });
      
      // 清理地区缓存
      let cleaned = 0;
      Object.keys(this.regionCache).forEach(region => {
        Object.keys(this.regionCache[region]).forEach(ip => {
          const cacheTime = new Date(this.regionCache[region][ip].timestamp).getTime();
          if (now - cacheTime >= this.cacheTime) {
            delete this.regionCache[region][ip];
            cleaned++;
          }
        });
        
        // 如果该区域已空，删除该区域
        if (Object.keys(this.regionCache[region]).length === 0) {
          delete this.regionCache[region];
        }
      });
      
      // 保存更新后的缓存
      this.saveRegionCache();
      
      this.logger.info(`已清理过期缓存: ${cleaned} 个`);
    } catch (e) {
      this.logger.error(`清理过期缓存失败: ${e.message}`);
    }
  }

  /**
   * 判断字符串是否为有效的IP地址
   * @param {string} str 要检查的字符串
   * @returns {boolean} 是否为IP地址
   */
  isIPAddress(str) {
    // IPv4地址正则表达式
    const ipv4Pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    // IPv6地址正则表达式(简化版)
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)$/;
    
    return ipv4Pattern.test(str) || ipv6Pattern.test(str);
  }

  /**
   * 解析 api.iplocation.net 的响应
   */
  parseIplocationNetResponse(data, ip) {
    // {
    //   "ip": "8.8.8.8",
    //   "ip_number": "134744072",
    //   "ip_version": 4,
    //   "country_name": "United States",
    //   "country_code2": "US",
    //   "isp": "Google LLC",
    //   "response_code": "200",
    //   "response_message": "OK"
    // }
    if (data.response_code !== "200") {
       throw new Error(`iplocation.net错误: ${data.response_message} (Code: ${data.response_code})`);
    }
    const countryCode = data.country_code2 || null;
    return {
      ip: data.ip || ip,
      country: countryCode,
      countryName: this.getCountryName(countryCode) || data.country_name || '其他',
      region: '', // 这个API不提供region/city
      city: '',
      org: data.isp || '',
      loc: '', // 不提供坐标
      timezone: '', // 不提供时区
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 解析 ip.cn 的响应
   */
  parseIpCnResponse(data, ip) {
    // 检查响应格式
    if (!data.code || data.code !== 0) {
      throw new Error(`ip.cn 错误: ${data.msg || '未知错误'}`);
    }
    
    // 从响应中提取数据
    const info = data.data || {};
    
    // 尝试提取国家代码
    let countryCode = null;
    let countryName = info.country || '其他';
    
    // 如果是中国，设置country为CN
    if (countryName.includes('中国') || countryName.includes('China')) {
      countryCode = 'CN';
    } else if (countryName.includes('香港') || countryName.includes('Hong Kong')) {
      countryCode = 'HK';
    } else if (countryName.includes('台湾') || countryName.includes('Taiwan')) {
      countryCode = 'TW';
    }
    
    return {
      ip: info.ip || ip,
      country: countryCode,
      countryName: this.getCountryName(countryCode) || countryName,
      region: info.province || '',
      city: info.city || '',
      org: info.isp || '',
      loc: '',
      timezone: '',
      timestamp: new Date().toISOString(),
      source: 'ip.cn'
    };
  }
  
  /**
   * 解析 36ip.cn 的响应
   */
  parse36ipResponse(data, ip) {
    // 检查响应格式
    if (!data.ip) {
      throw new Error('36ip.cn 返回了无效的数据');
    }
    
    // 尝试提取国家代码
    let countryCode = null;
    let countryName = data.area || data.address || '其他';
    
    // 如果是中国，设置country为CN
    if (countryName.includes('中国') || countryName.includes('China')) {
      countryCode = 'CN';
    } else if (countryName.includes('香港') || countryName.includes('Hong Kong')) {
      countryCode = 'HK';
    } else if (countryName.includes('台湾') || countryName.includes('Taiwan')) {
      countryCode = 'TW';
    }
    
    return {
      ip: data.ip || ip,
      country: countryCode,
      countryName: this.getCountryName(countryCode) || countryName,
      region: data.province || '',
      city: data.city || '',
      org: data.isp || '',
      loc: '',
      timezone: '',
      timestamp: new Date().toISOString(),
      source: '36ip.cn'
    };
  }
  
  /**
   * 解析 api.vore.top 的响应
   */
  parseVoreResponse(data, ip) {
    // 检查响应格式
    if (!data.ipinfo) {
      throw new Error('api.vore.top 返回了无效的数据');
    }
    
    const info = data.ipinfo || {};
    
    // 尝试提取国家代码
    let countryCode = null;
    let countryName = info.country || info.address || '其他';
    
    // 如果是中国，设置country为CN
    if (countryName.includes('中国') || countryName.includes('China')) {
      countryCode = 'CN';
    } else if (countryName.includes('香港') || countryName.includes('Hong Kong')) {
      countryCode = 'HK';
    } else if (countryName.includes('台湾') || countryName.includes('Taiwan')) {
      countryCode = 'TW';
    }
    
    return {
      ip: info.ip || ip,
      country: countryCode,
      countryName: this.getCountryName(countryCode) || countryName,
      region: info.region || '',
      city: info.city || '',
      org: info.isp || '',
      loc: '',
      timezone: '',
      timestamp: new Date().toISOString(),
      source: 'vore.top'
    };
  }
}

export default IPLocator;
