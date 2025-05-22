/**
 * 订阅获取器
 * 负责从远程获取订阅内容
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { saveCacheData } from '../utils/FileSystem.js';
import { SubscriptionType } from '../config/ConfigDefaults.js';
import { ChinaSocksSubscriptionFetcher } from '../../utils/proxy/ChinaSocksSubscriptionFetcher.js';
import { ChinaProxyLoader } from '../../utils/proxy/ChinaProxyLoader.js';
import { SubscriptionParser } from './SubscriptionParser.js';

export class SubscriptionFetcher {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.cacheTtl = options.cacheTtl || 21600; // 默认缓存6小时
    this.useProxy = options.useProxy || false;
    this.proxyManager = options.proxyManager || null;
    this.logger = options.logger || console;
    this.converter = options.converter || null;
    this.chinaProxyEnabled = options.chinaProxyEnabled || false;
    this.parser = new SubscriptionParser({
      rootDir: this.rootDir,
      dataDir: this.dataDir,
      logger: this.logger
    });
    
    // 初始化中国代理加载器和中国代理订阅获取器
    if (this.chinaProxyEnabled) {
      this.chinaProxyLoader = new ChinaProxyLoader({
        rootDir: this.rootDir,
        dataDir: this.dataDir,
        logger: this.logger
      });
      
      this.chinaSocksFetcher = new ChinaSocksSubscriptionFetcher({
        rootDir: this.rootDir,
        dataDir: this.dataDir,
        logger: this.logger
      });
    }
  }

  /**
   * 获取订阅内容
   * @param {Object} subscription 订阅配置
   * @returns {Promise<Object>} 订阅内容
   */
  async fetchSubscription(subscription) {
    if (!subscription || !subscription.url) {
      this.logger.error('订阅配置无效，缺少URL');
      return {
        source: subscription?.name || 'unknown',
        nodes: [],
        error: '订阅配置无效，缺少URL'
      };
    }

    let useChinaProxy = false;
    
    // 检查是否使用中国代理
    if (this.chinaProxyEnabled && subscription.use_china_proxy) {
      useChinaProxy = true;
      this.logger.info(`将使用中国代理获取订阅: ${subscription.name}`);
    }

    const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
    const cacheHash = crypto.createHash('md5').update(subscription.url).digest('hex');
    const cachePath = path.join(cacheDir, `${cacheHash}_cache.json`);

    // 检查缓存
    let cacheData = null;
    let useCache = false;

    const saveCacheData = (path, nodes, hash) => {
      try {
        const data = {
          timestamp: Date.now(),
          source: subscription.name,
          url: subscription.url,
          type: subscription.type,
          nodes: nodes,
          hash: hash
        };
        fs.writeFileSync(path, JSON.stringify(data, null, 2));
        this.logger.info(`已缓存订阅数据: ${path}`);
      } catch (error) {
        this.logger.error(`缓存订阅数据失败: ${error.message}`);
      }
    };

    if (fs.existsSync(cachePath)) {
      try {
        const content = fs.readFileSync(cachePath, 'utf8');
        cacheData = JSON.parse(content);
        
        if (cacheData && cacheData.timestamp) {
          const now = Date.now();
          const cacheAge = (now - cacheData.timestamp) / 1000; // 转换为秒
          
          if (cacheAge < this.cacheTtl) {
            useCache = true;
            this.logger.info(`使用缓存的订阅数据，缓存年龄: ${Math.floor(cacheAge / 60)} 分钟`);
          } else {
            this.logger.info(`缓存已过期，需要重新获取: ${Math.floor(cacheAge / 60)} 分钟 > ${Math.floor(this.cacheTtl / 60)} 分钟`);
          }
        }
      } catch (error) {
        this.logger.warn(`读取缓存失败: ${error.message}`);
      }
    }

    // 如果有有效缓存则直接返回
    if (useCache && cacheData && Array.isArray(cacheData.nodes)) {
      this.logger.info(`返回缓存的订阅数据: ${subscription.name}，包含 ${cacheData.nodes.length} 个节点`);
      
      // 即使使用缓存，也启用中国节点检测
      if (subscription.detect_chinese_nodes !== false) {
        try {
          // 使用订阅解析器检测中国节点
          const parseOptions = {
            detectChineseNodes: true,
            convertToSocks: true,
            source: subscription.name,
            ...subscription.parseOptions
          };
          
          // 这里我们不重新解析，而是直接检测现有节点
          // 注意：这里我们传递null作为内容，这样解析器就知道直接处理已有节点
          this.logger.info(`检测缓存中的中国节点，总节点数: ${cacheData.nodes.length}`);
          
          // 更新节点缓存，添加中国节点的SOCKS版本
          const processedNodes = await this.parser.processNodes(cacheData.nodes, parseOptions);
          
          // 如果处理后的节点比之前多，更新缓存
          if (processedNodes.length > cacheData.nodes.length) {
            this.logger.info(`检测到新的中国节点，更新缓存`);
            cacheData.nodes = processedNodes;
            saveCacheData(cachePath, processedNodes, cacheData.hash);
          }
        } catch (error) {
          this.logger.warn(`检测缓存中的中国节点失败: ${error.message}`);
        }
      }
      
      return {
        source: subscription.name,
        nodes: cacheData.nodes,
        fromCache: true,
        hash: cacheData.hash
      };
    }

    // 否则获取新数据
    let content = '';
    let contentHash = '';
    let fetchError = null;
    
    try {
      // 根据配置选择获取方式
      if (useChinaProxy) {
        // 使用中国代理获取
        this.logger.info(`通过中国代理获取订阅: ${subscription.name}`);
        const result = await this.chinaSocksFetcher.fetch(subscription.url, {
          headers: subscription.headers || {},
          useCache: true
        });
        
        if (!result.success || !result.data) {
          throw new Error(result.error?.message || '通过中国代理获取订阅失败');
        }
        
        content = result.data;
      } else if (this.useProxy && this.proxyManager) {
        // 使用代理获取
        const proxy = await this.proxyManager.getProxy();
        
        if (proxy) {
          this.logger.info(`通过代理 ${proxy} 获取订阅: ${subscription.name}`);
          
          const agent = new HttpsProxyAgent(proxy);
          const response = await fetch(subscription.url, {
            agent,
            headers: subscription.headers || {},
            timeout: 30000
          });
          
          if (!response.ok) {
            throw new Error(`HTTP 错误: ${response.status}`);
          }
          
          content = await response.text();
        } else {
          this.logger.warn('未找到可用代理，直接获取订阅');
          
          const response = await fetch(subscription.url, {
            headers: subscription.headers || {},
            timeout: 30000
          });
          
          if (!response.ok) {
            throw new Error(`HTTP 错误: ${response.status}`);
          }
          
          content = await response.text();
        }
      } else {
        // 直接获取
        this.logger.info(`直接获取订阅: ${subscription.name}`);
        
        const response = await fetch(subscription.url, {
          headers: subscription.headers || {},
          timeout: 30000
        });
        
        if (!response.ok) {
          throw new Error(`HTTP 错误: ${response.status}`);
        }
        
        content = await response.text();
      }
      
      if (!content || content.trim().length === 0) {
        throw new Error('获取的订阅内容为空');
      }
      
      // 计算内容哈希
      contentHash = crypto.createHash('sha256').update(content).digest('hex');
      
      this.logger.info(`成功获取订阅: ${subscription.name}, 原始数据大小: ${content.length} 字节`);
      
      // 解析订阅内容
      try {
        if (!this.converter) {
          throw new Error('未配置转换器，无法解析订阅内容');
        }
        
        this.logger.info(`开始使用订阅解析器解析数据`);
        this.logger.info(`开始解析订阅数据，长度: ${content.length}`);
        
        // 使用现有转换器解析基本节点
        const parsedNodes = await this.converter.parseSubscription(content, subscription.type);
        
        if (!parsedNodes || !Array.isArray(parsedNodes) || parsedNodes.length === 0) {
          this.logger.info(`订阅 ${subscription.name} 未返回任何节点`);
          return {
            source: subscription.name,
            nodes: [],
            fromCache: false,
            hash: contentHash
          };
        }
        
        this.logger.info(`成功解析 ${subscription.name} 订阅，包含 ${parsedNodes.length} 个节点`);
        
        // 标记节点来源
        parsedNodes.forEach(node => {
          if (!node.metadata) node.metadata = {};
          node.metadata.source = subscription.name;
        });
        
        // 如果启用了中国节点检测
        let finalNodes = parsedNodes;
        if (subscription.detect_chinese_nodes !== false) {
          try {
            // 使用订阅解析器检测中国节点
            const parseOptions = {
              detectChineseNodes: true,
              convertToSocks: true,
              source: subscription.name,
              ...subscription.parseOptions
            };
            
            this.logger.info(`检测中国节点，总节点数: ${parsedNodes.length}`);
            finalNodes = await this.parser.processNodes(parsedNodes, parseOptions);
            this.logger.info(`中国节点检测完成，最终节点数: ${finalNodes.length}`);
          } catch (error) {
            this.logger.warn(`检测中国节点失败: ${error.message}`);
            finalNodes = parsedNodes;
          }
        }
        
        // 缓存订阅内容
        if (!fs.existsSync(cacheDir)) {
          fs.mkdirSync(cacheDir, { recursive: true });
        }
        saveCacheData(cachePath, finalNodes, contentHash);
        
        return {
          source: subscription.name,
          nodes: finalNodes,
          fromCache: false,
          hash: contentHash
        };
      } catch (error) {
        this.logger.error(`处理 ${subscription.name} 订阅失败: ${error.message}`);
        this.logger.error(`错误堆栈: ${error.stack}`);
        
        // 尝试使用缓存作为后备
        if (cacheData && Array.isArray(cacheData.nodes)) {
          this.logger.info(`使用缓存作为后备，包含 ${cacheData.nodes.length} 个节点`);
          return {
            source: subscription.name,
            nodes: cacheData.nodes,
            fromCache: true,
            fromBackup: true,
            hash: cacheData.hash
          };
        }
        
        return {
          source: subscription.name,
          nodes: [],
          fromCache: false,
          error: error.message
        };
      }
    } catch (fetchError) {
      this.logger.error(`获取 ${subscription.name} 订阅失败: ${fetchError.message}`);
      
      // 尝试使用缓存作为后备
      if (cacheData && Array.isArray(cacheData.nodes)) {
        this.logger.info(`使用缓存作为后备，包含 ${cacheData.nodes.length} 个节点`);
        return {
          source: subscription.name,
          nodes: cacheData.nodes,
          fromCache: true,
          fromBackup: true,
          hash: cacheData.hash
        };
      }
      
      return {
        source: subscription.name,
        nodes: [],
        fromCache: false,
        error: fetchError.message
      };
    }
  }

  /**
   * 获取多个订阅
   * @param {Array<Object>} subscriptions 订阅配置列表
   * @returns {Promise<Array<Object>>} 订阅内容列表
   */
  async fetchSubscriptions(subscriptions) {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      return [];
    }

    const results = [];
    
    for (const subscription of subscriptions) {
      if (!subscription.enabled) {
        this.logger.info(`跳过禁用的订阅: ${subscription.name}`);
        continue;
      }
      
      this.logger.info(`开始获取订阅: ${subscription.name}`);
      const result = await this.fetchSubscription(subscription);
      results.push(result);
    }

    return results;
  }

  /**
   * 获取所有订阅
   * @param {Array} subscriptions 订阅配置数组
   * @returns {Promise<Array>} 合并后的节点数组
   */
  async fetchAllSubscriptions(subscriptions) {
    try {
      // 初始化计数器
      let cachedCount = 0;
      let updatedCount = 0;
      
      // 过滤出启用的订阅
      const enabledSubscriptions = subscriptions.filter(sub => sub.enabled !== false);
      this.logger.info(`准备获取 ${enabledSubscriptions.length} 个启用的订阅源的节点`);
      
      // 批量处理订阅源，避免同时发送太多请求
      const batchSize = 5; // 每批处理5个订阅源
      const batches = [];
      
      for (let i = 0; i < enabledSubscriptions.length; i += batchSize) {
        batches.push(enabledSubscriptions.slice(i, i + batchSize));
      }
      
      // 存储所有订阅结果
      let allResults = [];
      
      // 分批处理
      for (let i = 0; i < batches.length; i++) {
        this.logger.info(`处理订阅批次 ${i+1}/${batches.length}`);
        
        // 并行处理当前批次的订阅
        const fetchPromises = batches[i].map(sub => this.fetchSubscription(sub));
        
        // 等待所有请求完成
        const batchResults = await Promise.all(fetchPromises);
        
        // 添加到结果集
        allResults = allResults.concat(batchResults);
      }
      
      // 处理结果，合并节点
      let allNodes = [];
      
      // 遍历订阅结果
      for (const result of allResults) {
        if (!result) continue;
        
        const { source, nodes, fromCache, error } = result;
        
        if (error) {
          this.logger.warn(`订阅 ${source} 处理出错: ${error}`);
          continue;
        }
        
        if (!nodes || !Array.isArray(nodes)) {
          this.logger.warn(`订阅 ${source} 未返回节点数组`);
          continue;
        }
        
        // 统计节点来源
        if (fromCache) {
          cachedCount += nodes.length;
        } else {
          updatedCount += nodes.length;
        }
        
        // 将节点添加到总集合
        allNodes = allNodes.concat(nodes);
        
        this.logger.info(`处理订阅 ${source} 完成，获取 ${nodes.length} 个节点，来源: ${fromCache ? '缓存' : '更新'}`);
      }
      
      // 节点数量统计
      const originalCount = allNodes.length;
      this.logger.info(`所有订阅处理完成，共获取 ${allNodes.length} 个节点 (缓存: ${cachedCount}, 更新: ${updatedCount})`);
      
      // 检查是否有更新的订阅
      const hasUpdates = updatedCount > 0;
      this.logger.info(`是否有订阅源更新: ${hasUpdates ? '是' : '否'}`);
      
      // 返回所有节点
      return allNodes;
    } catch (error) {
      this.logger.error(`获取和合并节点时出错:`, error);
      throw error;
    }
  }
} 