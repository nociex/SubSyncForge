import { logger } from '../index.js';
import { SocksProxyAgent } from 'socks-proxy-agent';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { ChinaProxyLoader } from './ChinaProxyLoader.js';

const defaultLogger = logger?.defaultLogger || console;

/**
 * 中国大陆SOCKS代理订阅获取器
 * 用于通过中国大陆IP的SOCKS代理获取订阅内容
 */
export class ChinaSocksSubscriptionFetcher {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger.child({ component: 'ChinaSocksSubscriptionFetcher' });
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.cacheTtl = options.cacheTtl || 21600; // 默认缓存6小时
    this.timeout = options.timeout || 10000; // 默认10秒超时
    this.retries = options.retries || 3; // 默认重试3次
    
    // 使用传入的socksProxies或创建代理加载器
    if (options.socksProxies && Array.isArray(options.socksProxies)) {
      this.socksProxies = options.socksProxies;
      this.proxyLoader = null;
    } else {
      this.socksProxies = [];
      this.proxyLoader = new ChinaProxyLoader({
        rootDir: this.rootDir,
        dataDir: this.dataDir,
        logger: this.logger
      });
    }
    
    // 初始化当前使用的代理索引
    this._currentProxyIndex = 0;
  }

  /**
   * 获取下一个代理
   * @param {boolean} verifyProxies 是否验证代理可用性
   * @returns {Promise<string|null>} 代理URL或null
   */
  async getNextProxy(verifyProxies = false) {
    // 如果没有加载过代理，则从代理加载器加载
    if (this.proxyLoader && this.socksProxies.length === 0) {
      try {
        this.socksProxies = await this.proxyLoader.getFormattedProxies(verifyProxies);
        this.logger.info(`从代理加载器获取了 ${this.socksProxies.length} 个代理`);
      } catch (error) {
        this.logger.error(`从代理加载器获取代理失败: ${error.message}`);
      }
    }
    
    if (this.socksProxies.length === 0) {
      return null;
    }

    const proxy = this.socksProxies[this._currentProxyIndex];
    this._currentProxyIndex = (this._currentProxyIndex + 1) % this.socksProxies.length;
    return proxy;
  }

  /**
   * 通过中国大陆代理获取订阅内容
   * @param {string} url 订阅URL
   * @param {Object} options 选项
   * @returns {Promise<{success: boolean, data: string|null, error: Error|null}>} 获取结果
   */
  async fetch(url, options = {}) {
    const useCache = options.useCache !== false;
    const verifyProxies = options.verifyProxies !== false; // 默认验证代理
    const cacheKey = this.generateCacheKey(url);
    const cachePath = this.getCachePath(cacheKey);

    // 如果启用缓存且缓存有效，则使用缓存
    if (useCache && this.isCacheValid(cachePath)) {
      try {
        const cachedData = fs.readFileSync(cachePath, 'utf-8');
        this.logger.info(`使用缓存的订阅内容: ${url}`);
        return { success: true, data: cachedData, error: null };
      } catch (error) {
        this.logger.warn(`读取缓存失败: ${error.message}`);
      }
    }

    // 尝试通过代理获取订阅内容
    let lastError = null;
    for (let i = 0; i < this.retries; i++) {
      try {
        const proxyUrl = await this.getNextProxy(verifyProxies);
        
        // 如果没有可用代理，直接尝试不使用代理获取
        if (!proxyUrl) {
          this.logger.warn('没有可用的中国大陆代理，尝试直接获取订阅');
          return await this.fetchWithoutProxy(url, options);
        }
        
        this.logger.info(`尝试通过代理 ${proxyUrl} 获取订阅 (尝试 ${i + 1}/${this.retries})`);
        
        const agent = new SocksProxyAgent(proxyUrl);
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            ...options.headers
          },
          agent,
          timeout: this.timeout
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const data = await response.text();
        
        // 检查返回的数据是否有效
        if (!data || data.trim().length === 0) {
          throw new Error('返回的数据为空');
        }
        
        // 检查是否是HTML内容而不是预期的订阅内容
        if (data.trim().startsWith('<!DOCTYPE html>') || data.trim().startsWith('<html>')) {
          throw new Error('返回的是HTML页面，可能需要登录或URL无效');
        }

        // 缓存获取的内容
        if (useCache) {
          this.saveToCache(cachePath, data);
        }

        return { success: true, data, error: null };
      } catch (error) {
        lastError = error;
        this.logger.warn(`通过代理获取订阅失败: ${error.message}`);
        
        // 休眠一段时间再重试
        if (i < this.retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // 所有重试都失败，尝试不使用代理直接获取
    this.logger.warn(`通过代理获取订阅失败，尝试直接获取: ${lastError?.message}`);
    return await this.fetchWithoutProxy(url, options);
  }
  
  /**
   * 不使用代理直接获取订阅
   * @param {string} url 订阅URL
   * @param {Object} options 选项
   * @returns {Promise<{success: boolean, data: string|null, error: Error|null}>} 获取结果
   */
  async fetchWithoutProxy(url, options = {}) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...options.headers
        },
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.text();
      
      // 检查返回的数据是否有效
      if (!data || data.trim().length === 0) {
        throw new Error('返回的数据为空');
      }
      
      // 缓存获取的内容
      if (options.useCache !== false) {
        const cacheKey = this.generateCacheKey(url);
        const cachePath = this.getCachePath(cacheKey);
        this.saveToCache(cachePath, data);
      }

      return { success: true, data, error: null };
    } catch (error) {
      this.logger.error(`直接获取订阅失败: ${error.message}`);
      return { success: false, data: null, error };
    }
  }

  /**
   * 生成缓存键
   * @param {string} url 订阅URL
   * @returns {string} 缓存键
   */
  generateCacheKey(url) {
    return crypto.createHash('md5').update(url).digest('hex');
  }

  /**
   * 获取缓存路径
   * @param {string} cacheKey 缓存键
   * @returns {string} 缓存文件路径
   */
  getCachePath(cacheKey) {
    const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    return path.join(cacheDir, `china_${cacheKey}.txt`);
  }

  /**
   * 检查缓存是否有效
   * @param {string} cachePath 缓存路径
   * @returns {boolean} 缓存是否有效
   */
  isCacheValid(cachePath) {
    if (!fs.existsSync(cachePath)) {
      return false;
    }

    const stats = fs.statSync(cachePath);
    const now = new Date().getTime();
    const fileTime = stats.mtime.getTime();
    
    // 检查文件是否在缓存有效期内
    return now - fileTime < this.cacheTtl * 1000;
  }

  /**
   * 保存内容到缓存
   * @param {string} cachePath 缓存路径
   * @param {string} data 要缓存的数据
   */
  saveToCache(cachePath, data) {
    try {
      fs.writeFileSync(cachePath, data);
      this.logger.info(`已缓存订阅内容到: ${cachePath}`);
    } catch (error) {
      this.logger.error(`缓存订阅内容失败: ${error.message}`);
    }
  }
}

export default ChinaSocksSubscriptionFetcher; 