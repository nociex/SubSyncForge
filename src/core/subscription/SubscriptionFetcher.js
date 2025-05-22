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
    this.parser = new SubscriptionParser({
      rootDir: this.rootDir,
      dataDir: this.dataDir,
      logger: this.logger
    });
    
    // 添加最后成功获取的节点列表属性，用于错误恢复
    this.lastSuccessNodes = [];
  }

  /**
   * 获取订阅内容
   * @param {Object} subscription 订阅配置
   * @returns {Promise<Object>} 获取结果
   */
  async fetchSubscription(subscription) {
    if (!subscription || !subscription.url) {
      throw new Error('无效的订阅配置');
    }

    this.logger.info(`开始获取订阅: ${subscription.name}`);

    // 检查订阅配置
    const subscriptionUrl = subscription.url;
    const subscriptionType = subscription.type || 'auto';
    const headers = subscription.headers || {};
    const useCache = subscription.useCache !== false;
    const maxRetries = subscription.maxRetries || 2; // 默认重试2次

    // 计算缓存路径
    const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // 计算缓存文件名
    const subscriptionHash = crypto
      .createHash('md5')
      .update(subscriptionUrl)
      .digest('hex');
    const cachePath = path.join(cacheDir, `${subscriptionHash}_cache.json`);

    // 检查是否有有效缓存
    let cacheData = null;
    if (useCache && fs.existsSync(cachePath)) {
      try {
        const cacheContent = fs.readFileSync(cachePath, 'utf-8');
        const cacheJson = JSON.parse(cacheContent);
        const cacheTime = new Date(cacheJson.timestamp);
        const now = new Date();
        const cacheTtl = subscription.cacheTtl || this.cacheTtl;

        // 如果缓存未过期，则使用缓存
        if (now.getTime() - cacheTime.getTime() < cacheTtl * 1000) {
          this.logger.info(`使用缓存的订阅数据: ${subscription.name}`);
          cacheData = cacheJson;
        } else {
          this.logger.info(`缓存已过期: ${subscription.name}`);
        }
      } catch (error) {
        this.logger.warn(`读取缓存失败: ${error.message}`);
      }
    }

    // 如果有有效缓存则直接返回
    if (useCache && cacheData && Array.isArray(cacheData.nodes)) {
      this.logger.info(`返回缓存的订阅数据: ${subscription.name}，包含 ${cacheData.nodes.length} 个节点`);
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
    let retryCount = 0;

    // 尝试获取订阅内容，带重试机制
    while (retryCount <= maxRetries) {
      try {
        // 准备请求选项
        const requestOptions = {
          method: 'GET',
          headers: {
            'User-Agent': 'SubSyncForge/1.0',
            'Accept': '*/*',
            ...headers
          },
          timeout: subscription.timeout || 30000 // 默认30秒超时
        };

        // 使用代理（如果启用）
        if (this.useProxy && this.proxyManager) {
          const proxy = await this.proxyManager.getProxy();
          if (proxy) {
            this.logger.info(`使用代理: ${proxy}`);
            requestOptions.agent = new HttpsProxyAgent(proxy);
          }
        }

        this.logger.info(`开始请求订阅: ${subscriptionUrl}${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}`);
        
        // 使用AbortController处理超时
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, requestOptions.timeout);
        
        requestOptions.signal = controller.signal;
        
        const response = await fetch(subscriptionUrl, requestOptions);
        
        // 清除超时定时器
        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }

        // 获取内容
        content = await response.text();
        if (!content) {
          throw new Error('订阅内容为空');
        }

        this.logger.info(`成功获取订阅内容，长度: ${content.length}`);

        // 计算内容哈希
        contentHash = crypto
          .createHash('md5')
          .update(content)
          .digest('hex');

        // 如果内容哈希与缓存相同，直接返回缓存
        if (cacheData && contentHash === cacheData.hash) {
          this.logger.info(`内容未变化，使用缓存数据`);
          return {
            source: subscription.name,
            nodes: cacheData.nodes,
            fromCache: true,
            hash: contentHash
          };
        }
        
        // 成功获取数据，跳出重试循环
        break;
        
      } catch (error) {
        this.logger.error(`获取订阅内容失败: ${error.message}`);
        fetchError = error;
        
        // 增加重试计数
        retryCount++;
        
        // 如果还有重试次数，则继续
        if (retryCount <= maxRetries) {
          this.logger.info(`将在 2 秒后进行第 ${retryCount} 次重试...`);
          // 重试前等待2秒
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        
        // 已达到最大重试次数，检查是否有缓存可用
        if (cacheData) {
          this.logger.info(`获取失败，使用缓存数据`);
          return {
            source: subscription.name,
            nodes: cacheData.nodes,
            fromCache: true,
            hash: cacheData.hash,
            error: fetchError.message
          };
        }
        
        // 如果没有缓存，抛出错误
        throw error;
      }
    }

    // 解析订阅内容
    try {
      // 根据订阅类型解析内容
      if (content) {
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
        
        // 缓存节点
        if (useCache) {
          try {
            await saveCacheData(cachePath, parsedNodes, contentHash);
            this.logger.info(`已缓存订阅数据: ${subscription.name}`);
          } catch (error) {
            this.logger.warn(`缓存订阅数据失败: ${error.message}`);
          }
        }
        
        return {
          source: subscription.name,
          nodes: parsedNodes,
          fromCache: false,
          hash: contentHash
        };
      }
    } catch (error) {
      this.logger.error(`解析订阅内容失败: ${error.message}`);
      
      // 如果解析失败但有缓存，使用缓存
      if (cacheData) {
        this.logger.info(`解析失败，使用缓存数据`);
        return {
          source: subscription.name,
          nodes: cacheData.nodes,
          fromCache: true,
          hash: cacheData.hash,
          error: error.message
        };
      }
      
      // 如果没有缓存，抛出错误
      throw error;
    }
    
    throw new Error('未能获取订阅内容');
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
      let failedCount = 0;
      
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
        
        // 获取当前批次的订阅
        const currentBatch = batches[i];
        const batchResults = [];
        
        // 为每个订阅创建一个安全的获取函数，确保单个订阅失败不会影响整个批次
        for (const sub of currentBatch) {
          try {
            this.logger.info(`开始获取订阅: ${sub.name}`);
            const result = await this.fetchSubscription(sub);
            batchResults.push(result);
          } catch (error) {
            this.logger.error(`获取订阅 ${sub.name} 失败: ${error.message}`);
            failedCount++;
            // 添加一个失败结果，以便后续统计
            batchResults.push({
              source: sub.name,
              nodes: [],
              fromCache: false,
              error: error.message,
              failed: true
            });
          }
        }
        
        // 添加到结果集
        allResults = allResults.concat(batchResults);
      }
      
      // 处理结果，合并节点
      let allNodes = [];
      
      // 遍历订阅结果
      for (const result of allResults) {
        if (!result) continue;
        
        const { source, nodes, fromCache, error, failed } = result;
        
        if (failed || error) {
          this.logger.warn(`订阅 ${source} 处理出错: ${error || '未知错误'}`);
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
      this.logger.info(`所有订阅处理完成，共获取 ${allNodes.length} 个节点 (缓存: ${cachedCount}, 更新: ${updatedCount}, 失败: ${failedCount})`);
      
      // 检查是否有更新的订阅
      const hasUpdates = updatedCount > 0;
      this.logger.info(`是否有订阅源更新: ${hasUpdates ? '是' : '否'}`);
      
      // 保存当前成功获取的节点，用于错误恢复
      this.lastSuccessNodes = allNodes;
      
      // 即使某些订阅源失败，只要有节点就继续处理
      return allNodes;
    } catch (error) {
      this.logger.error(`获取和合并节点时出错:`, error);
      // 如果发生严重错误，但已获取了一些节点，仍然返回这些节点
      if (Array.isArray(this.lastSuccessNodes) && this.lastSuccessNodes.length > 0) {
        this.logger.warn(`尽管发生错误，但返回已获取的 ${this.lastSuccessNodes.length} 个节点`);
        return this.lastSuccessNodes;
      }
      throw error;
    }
  }
} 