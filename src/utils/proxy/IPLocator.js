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
    this.apiUrl = options.apiUrl || 'https://ipinfo.io/{ip}/json';
    this.apiKey = options.apiKey || '';
    this.timeout = options.timeout || 5000;
    this.cacheDir = options.cacheDir || 'data/ip_cache';
    this.cacheTime = options.cacheTime || 7 * 24 * 60 * 60 * 1000; // 默认缓存7天
    
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
      
      const apiUrlWithIp = this.apiUrl.replace('{ip}', ip);
      const url = new URL(apiUrlWithIp);
      
      // 添加API密钥（如果有）
      if (this.apiKey) {
        url.searchParams.append('token', this.apiKey);
      }
      
      // 超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.timeout);
      
      const ipInfo = await new Promise((resolve, reject) => {
        https.get(url.toString(), { signal: controller.signal }, (res) => {
          if (res.statusCode !== 200) {
            clearTimeout(timeoutId);
            reject(new Error(`HTTP错误: ${res.statusCode}`));
            return;
          }
          
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            clearTimeout(timeoutId);
            try {
              const jsonData = JSON.parse(data);
              resolve(jsonData);
            } catch (e) {
              reject(new Error(`解析响应失败: ${e.message}`));
            }
          });
        }).on('error', (err) => {
          clearTimeout(timeoutId);
          reject(new Error(`请求失败: ${err.message}`));
        });
      });
      
      // 处理结果
      const result = {
        ip: ipInfo.ip || ip,
        country: ipInfo.country,
        countryName: this.getCountryName(ipInfo.country),
        region: ipInfo.region,
        city: ipInfo.city,
        org: ipInfo.org,
        loc: ipInfo.loc,
        timezone: ipInfo.timezone,
        timestamp: new Date().toISOString()
      };
      
      // 保存到缓存
      this.saveToCache(ip, result);
      
      return result;
    } catch (error) {
      this.logger.error(`获取IP地址位置失败: ${ip}, 错误: ${error.message}`);
      // 返回一个带有错误信息的基本结果
      return {
        ip: ip,
        error: error.message,
        timestamp: new Date().toISOString()
      };
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
    if (!countryCode) return '未知';
    
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
            this.logger.error(`处理缓存文件失败 ${file}: ${e.message}`);
          }
        }
      }
      
      this.logger.info(`清理了 ${cleaned} 个过期IP缓存文件`);
    } catch (e) {
      this.logger.error(`清理缓存失败: ${e.message}`);
    }
  }
}

export default IPLocator; 