import { logger } from '../index.js';
import https from 'https';
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
      {
        name: 'ip-api',
        url: 'http://ip-api.com/json/{ip}',
        needsKey: false,
        rateLimit: 45, // 每分钟请求次数限制
        parser: this.parseIpApiResponse,
        status: 'ready' // ready, limited, failed
      },
      {
        name: 'ipinfo',
        url: 'https://ipinfo.io/{ip}/json',
        needsKey: true,
        rateLimit: 50000 / (30 * 24 * 60), // 每月50000次，转换为每分钟
        parser: this.parseIpinfoResponse,
        status: 'ready'
      },
      {
        name: 'ipgeolocation',
        url: 'https://api.ipgeolocation.io/ipgeo',
        needsKey: true,
        rateLimit: 30000 / (30 * 24 * 60), // 每月30000次，转换为每分钟
        parser: this.parseIpgeolocationResponse,
        status: 'ready'
      },
      {
        name: 'freegeoip',
        url: 'https://freegeoip.app/json/{ip}',
        needsKey: false,
        rateLimit: 15, // 估计的每分钟限制
        parser: this.parseFreegeoipResponse,
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
   * 获取IP地址的地理位置信息
   * @param {string} ip IP地址
   * @returns {Promise<Object>} 地理位置信息
   */
  async locate(ip) {
    // 首先检查缓存
    const cachedInfo = this.getFromCache(ip);
    if (cachedInfo) {
      this.logger.debug(`使用缓存的IP信息: ${ip}`);
      return cachedInfo;
    }
    
    try {
      this.logger.debug(`获取IP地址位置: ${ip}`);
      
      // 检查是否需要重置计数器
      this.checkAndResetCounter();
      
      // 检查当前提供商是否达到限制
      if (this.isProviderLimited(this.currentProvider)) {
        this.logger.warn(`当前提供商 ${this.currentProvider.name} 已达到请求限制，尝试切换`);
        this.switchToNextProvider();
      }
      
      // 增加当前提供商的请求计数
      this.incrementRequestCounter(this.currentProvider.name);
      
      // 构建请求URL
      let url;
      if (this.currentProvider.url.includes('{ip}')) {
        url = new URL(this.currentProvider.url.replace('{ip}', ip));
      } else {
        url = new URL(this.currentProvider.url);
        url.searchParams.append('ip', ip);
      }
      
      // 添加API密钥（如果需要）
      if (this.currentProvider.needsKey && this.apiKey) {
        // 根据不同的提供商添加不同的参数名
        if (this.currentProvider.name === 'ipinfo') {
          url.searchParams.append('token', this.apiKey);
        } else if (this.currentProvider.name === 'ipgeolocation') {
          url.searchParams.append('apiKey', this.apiKey);
        } else {
          url.searchParams.append('key', this.apiKey);
        }
      }
      
      // 超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeout);
      
      // 发起请求
      const response = await this.makeRequest(url.toString(), controller.signal);
      clearTimeout(timeoutId);
      
      // 使用对应的解析器处理响应
      const parsedData = this.currentProvider.parser.call(this, response, ip);
      
      // 保存到缓存
      this.saveToCache(ip, parsedData);
      
      return parsedData;
    } catch (error) {
      this.logger.error(`获取IP地址位置失败: ${ip}, 错误: ${error.message}`);
      
      // 标记当前提供商为失败状态
      if (error.message.includes('429') || error.message.includes('rate limit')) {
        this.currentProvider.status = 'limited';
        this.logger.warn(`提供商 ${this.currentProvider.name} 已达到请求限制`);
        
        // 尝试下一个提供商
        this.switchToNextProvider();
        
        // 递归重试，但最多重试一次
        if (!error.retried) {
          error.retried = true;
          this.logger.info(`切换到 ${this.currentProvider.name} 并重试`);
          return this.locate(ip);
        }
      }
      
      // 返回一个带有错误信息的基本结果
      return {
        ip: ip,
        error: error.message,
        country: null,         // 确保国家代码为null
        countryName: '其他',    // 设置为"其他"，确保被归类到"其他节点"组
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * 发起HTTP/HTTPS请求
   * @param {string} url 请求URL
   * @param {AbortSignal} signal 中止信号
   * @returns {Promise<Object>} 解析后的JSON数据
   */
  async makeRequest(url, signal) {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const requestFn = isHttps ? https.get : require('http').get;
      
      requestFn(url, { signal }, (res) => {
        if (res.statusCode === 429) {
          reject(new Error('请求频率限制 (429)'));
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP错误: ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (e) {
            reject(new Error(`解析响应失败: ${e.message}`));
          }
        });
      }).on('error', (err) => {
        reject(new Error(`请求失败: ${err.message}`));
      });
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
   * 解析freegeoip.app的响应
   */
  parseFreegeoipResponse(data, ip) {
    // 如果没有国家代码，设置为null以便触发"其他"分类
    const countryCode = data.country_code || null;
    
    return {
      ip: data.ip || ip,
      country: countryCode,
      countryName: this.getCountryName(countryCode) || data.country_name || '其他',
      region: data.region_name,
      city: data.city,
      org: data.org || '',
      loc: data.latitude && data.longitude ? `${data.latitude},${data.longitude}` : '',
      timezone: data.time_zone || '',
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * 通用响应解析器
   */
  parseGenericResponse(data, ip) {
    // 尝试智能识别字段
    const result = {
      ip: data.ip || data.query || ip,
      timestamp: new Date().toISOString()
    };
    
    // 尝试识别国家代码
    if (data.country_code || data.countryCode || data.country) {
      const countryCode = data.country_code || data.countryCode || data.country;
      result.country = countryCode;
      result.countryName = this.getCountryName(countryCode) || data.country_name || data.countryName || '其他';
    } else {
      // 没有国家信息，设置为null以触发"其他"分类
      result.country = null;
      result.countryName = '其他';
    }
    
    // 尝试识别地区
    result.region = data.region_name || data.regionName || data.region || '';
    
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
    result.timezone = data.timezone || data.time_zone || '';
    
    return result;
  }
  
  /**
   * 检查是否需要重置计数器
   */
  checkAndResetCounter() {
    const now = Date.now();
    // 如果上次重置时间超过1分钟，则重置计数器
    if (now - this.counterResetTime > 60000) {
      this.requestCounter = {};
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
    if (provider.status === 'limited' || provider.status === 'failed') {
      return true;
    }
    
    const count = this.requestCounter[provider.name] || 0;
    return count >= provider.rateLimit;
  }
  
  /**
   * 切换到下一个可用的提供商
   */
  switchToNextProvider() {
    const availableProviders = this.apiProviders.filter(p => 
      p.status === 'ready' && 
      p !== this.currentProvider && 
      (!p.needsKey || this.apiKey)
    );
    
    if (availableProviders.length > 0) {
      this.currentProvider = availableProviders[0];
      this.logger.info(`切换到下一个可用提供商: ${this.currentProvider.name}`);
    } else {
      // 如果没有可用的提供商，重置所有提供商状态
      this.apiProviders.forEach(p => p.status = 'ready');
      
      // 重新选择第一个不需要密钥的提供商
      const noKeyProviders = this.apiProviders.filter(p => !p.needsKey);
      if (noKeyProviders.length > 0) {
        this.currentProvider = noKeyProviders[0];
      } else if (this.apiKey) {
        // 如果有API密钥，选择第一个需要密钥的提供商
        this.currentProvider = this.apiProviders.find(p => p.needsKey);
      } else {
        // 没办法了，只能用第一个
        this.currentProvider = this.apiProviders[0];
      }
      
      this.logger.warn(`所有提供商都已达到限制，重置状态并使用: ${this.currentProvider.name}`);
    }
  }

  /**
   * 从缓存中获取IP信息
   * @param {string} ip IP地址
   * @returns {Object|null} 缓存的IP信息或null
   */
  getFromCache(ip) {
    const cacheFile = path.join(this.cacheDir, `${ip.replace(/\./g, '_')}.json`);
    
    if (fs.existsSync(cacheFile)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        
        // 检查缓存是否过期
        const cacheTime = new Date(cacheData.timestamp).getTime();
        const now = new Date().getTime();
        
        if (now - cacheTime < this.cacheTime) {
          return cacheData;
        } else {
          this.logger.debug(`IP缓存已过期: ${ip}`);
          // 尝试删除过期缓存
          try {
            fs.unlinkSync(cacheFile);
          } catch (e) {
            this.logger.error(`删除过期缓存失败: ${e.message}`);
          }
        }
      } catch (e) {
        this.logger.error(`读取缓存文件失败: ${e.message}`);
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
    const cacheFile = path.join(this.cacheDir, `${ip.replace(/\./g, '_')}.json`);
    
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
      this.logger.debug(`IP信息已缓存: ${ip}`);
    } catch (e) {
      this.logger.error(`保存IP缓存失败: ${e.message}`);
    }
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
      const files = fs.readdirSync(this.cacheDir);
      const now = new Date().getTime();
      let cleaned = 0;
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const cacheFile = path.join(this.cacheDir, file);
          try {
            const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            const cacheTime = new Date(cacheData.timestamp).getTime();
            
            if (now - cacheTime >= this.cacheTime) {
              fs.unlinkSync(cacheFile);
              cleaned++;
            }
          } catch (e) {
            this.logger.error(`删除过期缓存失败: ${e.message}`);
          }
        }
      }
      
      this.logger.info(`已清理过期缓存: ${cleaned} 个`);
    } catch (e) {
      this.logger.error(`清理过期缓存失败: ${e.message}`);
    }
  }
}

export default IPLocator;
