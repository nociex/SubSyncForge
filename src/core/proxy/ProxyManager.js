/**
 * 代理管理器
 * 负责管理和提供代理
 */

import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from '../utils/FileSystem.js';

export class ProxyManager {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.cachePath = options.cachePath || path.join(this.rootDir, this.dataDir, 'ip_cache/china_proxies.json');
    this.logger = options.logger || console;
    this.proxies = [];
    this.currentIndex = 0;
    
    // 确保缓存目录存在
    ensureDirectoryExists(path.dirname(this.cachePath));
    
    // 初始化时加载代理
    this.loadProxies();
  }

  /**
   * 加载代理列表
   * @returns {Array} 加载的代理列表
   */
  loadProxies() {
    try {
      if (fs.existsSync(this.cachePath)) {
        const content = fs.readFileSync(this.cachePath, 'utf-8');
        const proxies = JSON.parse(content);
        if (Array.isArray(proxies)) {
          this.proxies = proxies.filter(p => typeof p === 'string' && p.startsWith('http'));
          this.logger.info(`成功从 ${this.cachePath} 加载 ${this.proxies.length} 个代理缓存`);
          return this.proxies;
        }
      }
    } catch (error) {
      this.logger.error(`加载代理缓存失败: ${error.message}`);
    }
    
    this.logger.info('未找到或无法加载代理缓存文件');
    this.proxies = [];
    return this.proxies;
  }

  /**
   * 保存代理列表
   * @param {Array} proxies 要保存的代理列表
   * @returns {boolean} 是否保存成功
   */
  saveProxies(proxies) {
    try {
      // 确保目录存在
      ensureDirectoryExists(path.dirname(this.cachePath));
      
      // 只保存有效的 HTTP/HTTPS 代理 URL
      const validProxies = proxies.filter(p => typeof p === 'string' && p.startsWith('http'));
      fs.writeFileSync(this.cachePath, JSON.stringify(validProxies, null, 2));
      
      this.proxies = validProxies;
      this.logger.info(`已将 ${validProxies.length} 个代理缓存保存到 ${this.cachePath}`);
      return true;
    } catch (error) {
      this.logger.error(`保存代理缓存失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 添加代理
   * @param {string} proxy 代理URL
   * @returns {boolean} 是否添加成功
   */
  addProxy(proxy) {
    if (typeof proxy !== 'string' || !proxy.startsWith('http')) {
      this.logger.warn(`无效的代理URL: ${proxy}`);
      return false;
    }
    
    // 确保没有重复
    if (!this.proxies.includes(proxy)) {
      this.proxies.push(proxy);
      this.saveProxies(this.proxies);
      this.logger.info(`添加代理: ${proxy}`);
      return true;
    }
    
    return false;
  }

  /**
   * 添加多个代理
   * @param {Array} proxies 代理URL数组
   * @returns {number} 添加成功的代理数量
   */
  addProxies(proxies) {
    if (!Array.isArray(proxies)) {
      this.logger.warn('无效的代理数组');
      return 0;
    }
    
    let addedCount = 0;
    
    for (const proxy of proxies) {
      if (this.addProxy(proxy)) {
        addedCount++;
      }
    }
    
    if (addedCount > 0) {
      this.logger.info(`成功添加 ${addedCount} 个代理`);
    }
    
    return addedCount;
  }

  /**
   * 移除代理
   * @param {string} proxy 要移除的代理URL
   * @returns {boolean} 是否移除成功
   */
  removeProxy(proxy) {
    const index = this.proxies.indexOf(proxy);
    if (index !== -1) {
      this.proxies.splice(index, 1);
      this.saveProxies(this.proxies);
      this.logger.info(`移除代理: ${proxy}`);
      return true;
    }
    
    return false;
  }

  /**
   * 清空代理列表
   */
  clearProxies() {
    this.proxies = [];
    this.saveProxies([]);
    this.logger.info('清空代理列表');
  }

  /**
   * 获取可用代理
   * @returns {string|null} 代理URL或null
   */
  getProxy() {
    if (this.proxies.length === 0) {
      return null; // 没有可用代理
    }
    
    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    this.logger.info(`提供代理: ${proxy}`);
    return proxy;
  }

  /**
   * 获取所有代理
   * @returns {Array} 代理列表
   */
  getAllProxies() {
    return [...this.proxies];
  }

  /**
   * 获取代理数量
   * @returns {number} 代理数量
   */
  getProxyCount() {
    return this.proxies.length;
  }
}