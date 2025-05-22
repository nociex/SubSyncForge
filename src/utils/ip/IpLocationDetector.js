/**
 * IP地理位置检测器
 * 用于检测IP的地理位置信息
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../index.js';

const defaultLogger = logger?.defaultLogger || console;

export class IpLocationDetector {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.logger = options.logger || defaultLogger.child({ component: 'IpLocationDetector' });
    this.cacheTtl = options.cacheTtl || 86400; // 默认缓存1天
    this.apiTimeout = options.apiTimeout || 5000; // 默认API超时5秒
    this.apiRetries = options.apiRetries || 3; // 默认重试3次
    
    // 缓存已查询过的IP地址 (所有地区，不仅仅是中国IP)
    this.ipCache = new Map();
    
    // API健康状态跟踪
    this.apiHealthStatus = {
      'ip-api.com': { healthy: true, failCount: 0, lastFailTime: 0 },
      'ipwhois.app': { healthy: true, failCount: 0, lastFailTime: 0 },
      'ip.cn': { healthy: true, failCount: 0, lastFailTime: 0 },
      '36ip.cn': { healthy: true, failCount: 0, lastFailTime: 0 },
      'vore.top': { healthy: true, failCount: 0, lastFailTime: 0 }
    };
    
    // API频率限制跟踪
    this.apiRateLimits = {
      'ip-api.com': { limit: 150, window: 60000, count: 0, resetTime: Date.now() }, // 每分钟150次
      'ip.cn': { limit: 500, window: 86400000, count: 0, resetTime: Date.now() },  // 每天500次
      '36ip.cn': { limit: 50, window: 60000, count: 0, resetTime: Date.now() }     // 每分钟50次
    };
    
    // 加载缓存
    this._loadCache();
  }

  /**
   * 检测IP地理位置
   * @param {string} ip IP地址
   * @returns {Promise<Object|null>} 位置信息，失败返回null
   */
  async detectLocation(ip) {
    if (!ip) return null;
    
    // 检查缓存 - 不论哪个国家/地区的IP都会被缓存
    if (this.ipCache.has(ip)) {
      const cachedData = this.ipCache.get(ip);
      // 检查缓存是否过期
      if (Date.now() - cachedData.timestamp < this.cacheTtl * 1000) {
        this.logger.debug(`使用缓存的位置信息: ${ip} (${cachedData.location.country_name || cachedData.location.country})`);
        return cachedData.location;
      } else {
        this.logger.debug(`缓存已过期: ${ip}, 重新查询`);
      }
    }
    
    // 尝试使用多个API源
    for (let i = 0; i < this.apiRetries; i++) {
      try {
        // 选择一个健康的API源
        const location = await this._queryHealthyApi(ip);
        
        if (location) {
          // 缓存结果 - 所有地区的IP都会被缓存，不仅仅是中国IP
          this.ipCache.set(ip, {
            location,
            timestamp: Date.now()
          });
          
          // 异步保存缓存
          this._saveCache().catch(err => {
            this.logger.warn(`保存IP缓存失败: ${err.message}`);
          });
          
          return location;
        }
      } catch (error) {
        this.logger.warn(`检测IP位置失败(尝试 ${i+1}/${this.apiRetries}): ${error.message}`);
        // 最后一次尝试失败，返回null
        if (i === this.apiRetries - 1) {
          return null;
        }
        // 短暂等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return null;
  }
  
  /**
   * 快速获取IP地理位置（优先使用缓存，无需联网）
   * @param {string} ip IP地址
   * @returns {Object|null} 位置信息，如果缓存中没有则返回null
   */
  getLocationFromCache(ip) {
    if (!ip || !this.ipCache.has(ip)) return null;
    
    const cachedData = this.ipCache.get(ip);
    // 检查缓存是否过期
    if (Date.now() - cachedData.timestamp < this.cacheTtl * 1000) {
      return cachedData.location;
    }
    
    return null;
  }

  /**
   * 批量获取多个IP的地理位置信息（仅从缓存）
   * @param {string[]} ips IP地址数组
   * @returns {Object} 以IP为键，位置信息为值的对象，未找到的IP不会包含在结果中
   */
  getBatchLocationsFromCache(ips) {
    if (!Array.isArray(ips) || ips.length === 0) return {};
    
    const results = {};
    const now = Date.now();
    
    for (const ip of ips) {
      if (!ip || !this.ipCache.has(ip)) continue;
      
      const cachedData = this.ipCache.get(ip);
      // 检查缓存是否过期
      if (now - cachedData.timestamp < this.cacheTtl * 1000) {
        results[ip] = cachedData.location;
      }
    }
    
    return results;
  }

  /**
   * 获取特定国家/地区的所有IP
   * @param {string} countryCode 国家/地区代码，例如 'CN', 'US'
   * @returns {string[]} 符合条件的IP地址数组
   */
  getIpsByCountry(countryCode) {
    if (!countryCode) return [];
    
    const ips = [];
    const now = Date.now();
    
    for (const [ip, data] of this.ipCache.entries()) {
      // 检查缓存是否过期
      if (now - data.timestamp >= this.cacheTtl * 1000) continue;
      
      if (data.location && data.location.country === countryCode) {
        ips.push(ip);
      }
    }
    
    return ips;
  }

  /**
   * 判断IP是否属于特定国家/地区
   * @param {string} ip IP地址
   * @param {string} countryCode 国家/地区代码
   * @returns {boolean|null} 如果IP在缓存中且属于该国家/地区返回true，不属于返回false，缓存中没有返回null
   */
  isIpInCountry(ip, countryCode) {
    if (!ip || !countryCode) return null;
    
    const location = this.getLocationFromCache(ip);
    if (!location) return null;
    
    return location.country === countryCode;
  }

  /**
   * 分析IP位置并基于ISP或组织对其分类
   * @param {string} ip IP地址
   * @returns {Object|null} 包含分类信息的对象，如果IP不在缓存中则返回null
   */
  analyzeIpType(ip) {
    const location = this.getLocationFromCache(ip);
    if (!location) return null;
    
    const result = {
      ip,
      country: location.country,
      country_name: location.country_name,
      region: location.region,
      city: location.city,
      isp: location.isp,
      type: 'unknown'
    };
    
    // 基于ISP信息进行分类
    const ispLower = (location.isp || '').toLowerCase();
    
    if (ispLower.includes('cloud') || 
        ispLower.includes('aws') || 
        ispLower.includes('azure') || 
        ispLower.includes('google') ||
        ispLower.includes('alibaba') ||
        ispLower.includes('tencent')) {
      result.type = 'cloud';
    } else if (ispLower.includes('mobile') || 
               ispLower.includes('wireless') ||
               ispLower.includes('cellular')) {
      result.type = 'mobile';
    } else if (ispLower.includes('edu') || 
               ispLower.includes('university') || 
               ispLower.includes('school')) {
      result.type = 'education';
    } else if (ispLower.includes('telecom') || 
               ispLower.includes('unicom') || 
               ispLower.includes('mobile') ||
               ispLower.includes('comcast') ||
               ispLower.includes('verizon')) {
      result.type = 'isp';
    } else if (ispLower.includes('datacenter') || 
               ispLower.includes('hosting')) {
      result.type = 'datacenter';
    }
    
    return result;
  }
  
  /**
   * 获取IP地址属于哪个洲
   * @param {string} ip IP地址
   * @returns {string|null} 洲名称，如果IP不在缓存中则返回null
   */
  getContinentForIp(ip) {
    const location = this.getLocationFromCache(ip);
    if (!location) return null;
    
    // 根据国家代码确定大洲
    const country = location.country;
    
    // 亚洲国家
    const asiaCountries = ['CN', 'JP', 'KR', 'IN', 'SG', 'TH', 'VN', 'MY', 'ID', 'PH', 'HK', 'TW'];
    // 北美洲国家
    const northAmericaCountries = ['US', 'CA', 'MX'];
    // 欧洲国家
    const europeCountries = ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'CH', 'AT', 'BE', 'DK', 'FI', 'NO', 'PL', 'PT', 'IE'];
    // 大洋洲国家
    const oceaniaCountries = ['AU', 'NZ'];
    // 南美洲国家
    const southAmericaCountries = ['BR', 'AR', 'CL', 'CO', 'PE', 'VE'];
    // 非洲国家
    const africaCountries = ['ZA', 'EG', 'NG', 'KE', 'MA'];
    
    if (asiaCountries.includes(country)) return '亚洲';
    if (northAmericaCountries.includes(country)) return '北美洲';
    if (europeCountries.includes(country)) return '欧洲';
    if (oceaniaCountries.includes(country)) return '大洋洲';
    if (southAmericaCountries.includes(country)) return '南美洲';
    if (africaCountries.includes(country)) return '非洲';
    
    return '未知';
  }

  /**
   * 选择一个健康的API源查询
   * @param {string} ip IP地址
   * @returns {Promise<Object|null>} 位置信息
   * @private
   */
  async _queryHealthyApi(ip) {
    // 更新API速率限制
    this._updateApiRateLimits();
    
    // 获取健康的且未超过速率限制的API
    const availableApis = Object.entries(this.apiHealthStatus)
      .filter(([name, status]) => {
        // API必须健康
        if (!status.healthy) return false;
        
        // 检查是否有速率限制
        const rateLimit = this.apiRateLimits[name];
        if (rateLimit) {
          // 如果已达到速率限制，返回false
          if (rateLimit.count >= rateLimit.limit) return false;
        }
        
        return true;
      })
      .map(([name]) => name);
    
    // 如果没有可用的API，尝试重置状态
    if (availableApis.length === 0) {
      this.logger.warn('没有可用的API源，尝试重置状态');
      
      // 重置已经超过30分钟的API健康状态
      const now = Date.now();
      const thirtyMinutes = 30 * 60 * 1000;
      
      Object.keys(this.apiHealthStatus).forEach(name => {
        const status = this.apiHealthStatus[name];
        if (!status.healthy && (now - status.lastFailTime > thirtyMinutes)) {
          status.healthy = true;
          status.failCount = 0;
          this.logger.info(`API源 ${name} 已过30分钟，重置健康状态`);
        }
      });
      
      // 再次获取可用API
      const resetApis = Object.entries(this.apiHealthStatus)
        .filter(([, status]) => status.healthy)
        .map(([name]) => name);
      
      if (resetApis.length === 0) {
        this.logger.warn('重置后仍无可用API，尝试使用任意API');
        // 如果还是没有，随机选择一个API
        const allApis = Object.keys(this.apiHealthStatus);
        const randomApi = allApis[Math.floor(Math.random() * allApis.length)];
        return await this._queryApiByName(randomApi, ip);
      }
      
      // 使用重置后的可用API列表
      const randomResetApi = resetApis[Math.floor(Math.random() * resetApis.length)];
      return await this._queryApiByName(randomResetApi, ip);
    }
    
    // 随机选择一个可用的API
    const randomAvailableApi = availableApis[Math.floor(Math.random() * availableApis.length)];
    this.logger.debug(`使用API源 ${randomAvailableApi} 检测IP: ${ip}`);
    
    // 增加该API的请求计数
    if (this.apiRateLimits[randomAvailableApi]) {
      this.apiRateLimits[randomAvailableApi].count++;
    }
    
    return await this._queryApiByName(randomAvailableApi, ip);
  }
  
  /**
   * 更新API速率限制状态
   * @private
   */
  _updateApiRateLimits() {
    const now = Date.now();
    
    Object.entries(this.apiRateLimits).forEach(([name, limit]) => {
      // 如果已经过了窗口期，重置计数
      if (now - limit.resetTime >= limit.window) {
        limit.count = 0;
        limit.resetTime = now;
        this.logger.debug(`重置API ${name} 的速率限制计数`);
      }
    });
  }
  
  /**
   * 根据API名称查询
   * @param {string} apiName API名称
   * @param {string} ip IP地址
   * @returns {Promise<Object|null>} 位置信息
   * @private
   */
  async _queryApiByName(apiName, ip) {
    try {
      let result;
      
      switch (apiName) {
        case 'ip-api.com':
          result = await this._queryIpApi(ip);
          break;
        case 'ipwhois.app':
          result = await this._queryIpWhois(ip);
          break;
        case 'ip.cn':
          result = await this._queryIpCn(ip);
          break;
        case '36ip.cn':
          result = await this._query36IpCn(ip);
          break;
        case 'vore.top':
          result = await this._queryVoreTop(ip);
          break;
        default:
          throw new Error(`未知的API源: ${apiName}`);
      }
      
      // 成功后更新API状态
      this._updateApiHealthStatus(apiName, true);
      
      return result;
    } catch (error) {
      // 更新API健康状态
      this._updateApiHealthStatus(apiName, false);
      throw error;
    }
  }
  
  /**
   * 更新API健康状态
   * @param {string} apiName API名称
   * @param {boolean} success 是否成功
   * @private
   */
  _updateApiHealthStatus(apiName, success) {
    if (!this.apiHealthStatus[apiName]) return;
    
    if (!success) {
      this.apiHealthStatus[apiName].failCount++;
      this.apiHealthStatus[apiName].lastFailTime = Date.now();
      
      // 如果连续失败超过3次，标记为不健康
      if (this.apiHealthStatus[apiName].failCount >= 3) {
        this.apiHealthStatus[apiName].healthy = false;
        this.logger.warn(`API源 ${apiName} 已标记为不健康，连续失败 ${this.apiHealthStatus[apiName].failCount} 次`);
      }
    } else {
      // 成功恢复后重置失败计数
      this.apiHealthStatus[apiName].failCount = 0;
      
      // 如果之前不健康，现在恢复
      if (!this.apiHealthStatus[apiName].healthy) {
        this.apiHealthStatus[apiName].healthy = true;
        this.logger.info(`API源 ${apiName} 已恢复健康状态`);
      }
    }
    
    // 如果API不健康但已经过了30分钟，尝试重新标记为健康
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    
    if (!this.apiHealthStatus[apiName].healthy && 
        (now - this.apiHealthStatus[apiName].lastFailTime > thirtyMinutes)) {
      this.apiHealthStatus[apiName].healthy = true;
      this.apiHealthStatus[apiName].failCount = 0;
      this.logger.info(`API源 ${apiName} 已过30分钟，重新标记为健康状态`);
    }
  }
  
  /**
   * 查询ip-api.com
   * @param {string} ip IP地址
   * @returns {Promise<Object|null>} 位置信息
   * @private
   */
  async _queryIpApi(ip) {
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp&lang=zh-CN`, {
        headers: { 'User-Agent': 'SubSyncForge/1.0' },
        timeout: this.apiTimeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status !== 'success') {
        throw new Error(`API返回错误: ${data.message || 'Unknown error'}`);
      }
      
      // 返回标准格式的位置信息
      return {
        country: data.countryCode,
        country_name: data.country,
        region: data.regionName,
        city: data.city,
        isp: data.isp,
        source: 'ip-api.com'
      };
    } catch (error) {
      this.logger.warn(`ip-api.com查询失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 查询ipwhois.app
   * @param {string} ip IP地址
   * @returns {Promise<Object|null>} 位置信息
   * @private
   */
  async _queryIpWhois(ip) {
    try {
      const response = await fetch(`https://ipwhois.app/json/${ip}?format=json`, {
        headers: { 'User-Agent': 'SubSyncForge/1.0' },
        timeout: this.apiTimeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error('API查询失败');
      }
      
      // 返回标准格式的位置信息
      return {
        country: data.country_code,
        country_name: data.country,
        region: data.region,
        city: data.city,
        isp: data.isp,
        source: 'ipwhois.app'
      };
    } catch (error) {
      this.logger.warn(`ipwhois.app查询失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 查询IP.CN
   * @param {string} ip IP地址
   * @returns {Promise<Object|null>} 位置信息
   * @private
   */
  async _queryIpCn(ip) {
    try {
      const response = await fetch(`https://www.ip.cn/api/index?ip=${ip}&type=0`, {
        headers: { 
          'User-Agent': 'SubSyncForge/1.0',
          'Referer': 'https://www.ip.cn/'
        },
        timeout: this.apiTimeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.address) {
        throw new Error('API返回错误: 无地址信息');
      }
      
      // 解析地址信息，通常格式为 "中国 广东 广州"
      const addressParts = data.address.split(' ').filter(Boolean);
      
      // 返回标准格式的位置信息
      return {
        country: addressParts[0] === '中国' ? 'CN' : '',
        country_name: addressParts[0] || '',
        region: addressParts[1] || '',
        city: addressParts[2] || '',
        isp: data.isp || '',
        source: 'ip.cn'
      };
    } catch (error) {
      this.logger.warn(`ip.cn查询失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 查询36IP.CN
   * @param {string} ip IP地址
   * @returns {Promise<Object|null>} 位置信息
   * @private
   */
  async _query36IpCn(ip) {
    try {
      const response = await fetch(`https://www.36ip.cn/?type=json&ip=${ip}`, {
        headers: { 'User-Agent': 'SubSyncForge/1.0' },
        timeout: this.apiTimeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 返回标准格式的位置信息
      return {
        country: data.area?.split(' ')[0] === '中国' ? 'CN' : '',
        country_name: data.area?.split(' ')[0] || '',
        region: data.area?.split(' ')[1] || '',
        city: data.area?.split(' ')[2] || '',
        isp: data.operator || '',
        source: '36ip.cn'
      };
    } catch (error) {
      this.logger.warn(`36ip.cn查询失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 查询api.vore.top
   * @param {string} ip IP地址
   * @returns {Promise<Object|null>} 位置信息
   * @private
   */
  async _queryVoreTop(ip) {
    try {
      const response = await fetch(`https://api.vore.top/api/IPdata?ip=${ip}`, {
        headers: { 'User-Agent': 'SubSyncForge/1.0' },
        timeout: this.apiTimeout
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.code !== 200) {
        throw new Error(`API返回错误: ${data.msg}`);
      }
      
      // 返回标准格式的位置信息
      return {
        country: data.ipinfo.cnip ? 'CN' : '', // 如果是中国IP则标记为CN
        country_name: data.ipdata.info1.includes('省') ? '中国' : data.ipdata.info1,
        region: data.ipdata.info1,
        city: data.ipdata.info2,
        isp: data.ipdata.isp,
        source: 'vore.top'
      };
    } catch (error) {
      this.logger.warn(`vore.top查询失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 获取国家名称
   * @param {string} countryCode 国家代码
   * @returns {string} 国家名称
   * @private
   */
  _getCountryName(countryCode) {
    const countryMap = {
      'CN': '中国',
      'HK': '香港',
      'TW': '台湾',
      'US': '美国',
      'JP': '日本',
      'KR': '韩国',
      'SG': '新加坡',
      'GB': '英国',
      'DE': '德国',
      'FR': '法国',
      'AU': '澳大利亚',
      'CA': '加拿大',
      'IN': '印度',
      'RU': '俄罗斯'
      // 可以根据需要添加更多国家
    };
    
    return countryMap[countryCode] || countryCode;
  }
  
  /**
   * 加载IP缓存
   * @private
   */
  _loadCache() {
    try {
      const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
      const cachePath = path.join(cacheDir, 'ip_location_cache.json');
      
      if (!fs.existsSync(cachePath)) {
        return;
      }
      
      const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      
      if (!cacheData || !cacheData.entries) {
        return;
      }
      
      // 转换为Map
      for (const [ip, data] of Object.entries(cacheData.entries)) {
        this.ipCache.set(ip, data);
      }
      
      this.logger.info(`已加载 ${this.ipCache.size} 条IP缓存记录`);
      
      // 输出缓存的国家/地区分布情况
      this._logCacheCountryDistribution();
    } catch (error) {
      this.logger.warn(`加载IP缓存失败: ${error.message}`);
    }
  }
  
  /**
   * 保存IP缓存
   * @private
   */
  async _saveCache() {
    try {
      const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
      
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      const cachePath = path.join(cacheDir, 'ip_location_cache.json');
      
      // 转换Map为对象
      const entries = {};
      for (const [ip, data] of this.ipCache.entries()) {
        entries[ip] = data;
      }
      
      const cacheData = {
        timestamp: Date.now(),
        entries
      };
      
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
      
      this.logger.debug(`已保存 ${this.ipCache.size} 条IP缓存记录`);
    } catch (error) {
      this.logger.warn(`保存IP缓存失败: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * 清除IP缓存
   */
  clearCache() {
    this.ipCache.clear();
    
    try {
      const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
      const cachePath = path.join(cacheDir, 'ip_location_cache.json');
      
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
      
      this.logger.info('已清除IP缓存');
    } catch (error) {
      this.logger.warn(`清除IP缓存文件失败: ${error.message}`);
    }
  }

  /**
   * 输出缓存中的国家/地区分布统计
   * @private
   */
  _logCacheCountryDistribution() {
    if (this.ipCache.size === 0) return;

    const countryStats = {};
    let unknownCount = 0;

    // 统计每个国家/地区的IP数量
    for (const [, data] of this.ipCache.entries()) {
      if (data.location && data.location.country) {
        const country = data.location.country;
        countryStats[country] = (countryStats[country] || 0) + 1;
      } else {
        unknownCount++;
      }
    }

    // 构建统计信息字符串
    const statsEntries = Object.entries(countryStats)
      .sort((a, b) => b[1] - a[1])  // 按数量降序排序
      .map(([country, count]) => {
        const countryName = this._getCountryName(country);
        return `${countryName}(${country}): ${count}`;
      });
    
    if (unknownCount > 0) {
      statsEntries.push(`未知: ${unknownCount}`);
    }

    this.logger.debug(`IP缓存国家/地区分布: ${statsEntries.join(', ')}`);
  }

  /**
   * 获取缓存中的国家/地区分布统计
   * @returns {Object} 国家/地区分布统计
   */
  getCacheCountryDistribution() {
    const countryStats = {};
    let unknownCount = 0;

    // 统计每个国家/地区的IP数量
    for (const [, data] of this.ipCache.entries()) {
      if (data.location && data.location.country) {
        const country = data.location.country;
        const countryName = this._getCountryName(country);
        const key = `${countryName}(${country})`;
        countryStats[key] = (countryStats[key] || 0) + 1;
      } else {
        unknownCount++;
      }
    }

    if (unknownCount > 0) {
      countryStats['未知'] = unknownCount;
    }

    return {
      total: this.ipCache.size,
      distribution: countryStats
    };
  }
}

export default IpLocationDetector; 