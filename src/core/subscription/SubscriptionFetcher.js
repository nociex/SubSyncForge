/**
 * 订阅获取器
 * 负责从远程获取订阅内容
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { saveCacheData } from '../utils/FileSystem.js';
import { SubscriptionType } from '../config/ConfigDefaults.js';

export class SubscriptionFetcher {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.cacheTtl = options.cacheTtl || 3600;
    this.proxyManager = options.proxyManager || null;
    this.converter = options.converter || null;
    this.logger = options.logger || console;
    this.useProxy = options.useProxy !== false;
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

  /**
   * 获取单个订阅内容
   * @param {Object} subscription 订阅配置
   * @returns {Promise<Object>} 订阅结果
   */
  async fetchSubscription(subscription) {
    this.logger.info(`===========================================================`);
    this.logger.info(`开始处理订阅: ${subscription.name}, 类型: ${subscription.type}, URL: ${subscription.url}`);
    
    // 检查缓存 - 只有URL类型的订阅才会缓存
    let useCache = false;
    let cacheData = null;
    const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
    const cachePath = path.join(cacheDir, `${subscription.name}_cache.json`);
    
    // 尝试从缓存中获取
    if (subscription.type === SubscriptionType.URL && fs.existsSync(cachePath)) {
      try {
        const cacheContent = fs.readFileSync(cachePath, 'utf-8');
        cacheData = JSON.parse(cacheContent);
        
        if (cacheData && Array.isArray(cacheData.nodes) && cacheData.timestamp) {
          const cacheAge = (Date.now() - cacheData.timestamp) / 1000; // 换算成秒
          if (cacheAge < this.cacheTtl) {
            this.logger.info(`使用${subscription.name}的缓存数据，缓存年龄: ${Math.floor(cacheAge/60)}分钟，包含${cacheData.nodes.length}个节点`);
            useCache = true;
            return {
              source: subscription.name,
              nodes: cacheData.nodes,
              fromCache: true,
              hash: cacheData.hash
            };
          } else {
            this.logger.info(`${subscription.name}的缓存已过期 (${Math.floor(cacheAge/60)}分钟), 重新获取`);
          }
        }
      } catch (error) {
        this.logger.error(`读取${subscription.name}的缓存失败:`, error.message);
      }
    } else {
      this.logger.info(`未找到订阅 ${subscription.name} 的缓存`);
    }
    
    // 如果不使用缓存，则获取新数据
    if (!useCache) {
      // 根据订阅类型获取数据
      if (subscription.type === SubscriptionType.URL) {
        try {
          this.logger.info(`从URL获取订阅: ${subscription.url}`);
          
          // 设置自定义请求头 (检查特定域名并添加对应请求头)
          let customHeaders = {};
          if (subscription.url.includes('alalbb.top')) {
            this.logger.info(`检测到alalbb.top域名，添加特定请求头`);
            customHeaders = {
              Referer: 'https://alalbb.top/',
              Origin: 'https://alalbb.top',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };
          } else if (subscription.url.includes('jikun.fun')) {
            this.logger.info(`检测到jikun.fun域名，添加特定请求头`);
            customHeaders = {
              Referer: 'https://zh.jikun.fun/',
              Origin: 'https://zh.jikun.fun',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };
          }
          
          // 添加用户自定义请求头 (如果有)
          if (subscription.headers && typeof subscription.headers === 'object') {
            customHeaders = { ...customHeaders, ...subscription.headers };
          }
          
          this.logger.info(`为 ${subscription.name} 设置的自定义请求头:`, JSON.stringify(customHeaders, null, 2));
          
          // 获取订阅内容
          let content = '';
          let contentHash = '';
          
          // 获取请求参数
          let options = {
            headers: customHeaders
          };
          
          // 如果配置了使用代理，并且有可用代理，则使用代理
          if (this.useProxy && this.proxyManager) {
            try {
              const proxy = this.proxyManager.getProxy();
              if (proxy) {
                this.logger.info(`尝试使用代理 ${proxy} 获取订阅`);
                const agent = new HttpsProxyAgent(proxy);
                options.agent = agent;
              } else {
                this.logger.info(`尝试使用代理但未成功创建或获取代理`);
              }
            } catch (proxyError) {
              this.logger.error(`设置代理失败: ${proxyError.message}`);
            }
          }
          
          try {
            // 获取订阅内容
            this.logger.info(`开始获取订阅内容...`);
            this.logger.info(`开始获取订阅: ${subscription.url}`);
            
            // 添加时间戳防止缓存
            const urlWithTimestamp = subscription.url.includes('?') 
              ? `${subscription.url}&_t=${Date.now()}` 
              : `${subscription.url}?_t=${Date.now()}`;
            
            this.logger.info(`发送请求到: ${urlWithTimestamp}`);
            
            // 设置默认请求头
            const defaultHeaders = {
              'User-Agent': 'v2rayN/5.29',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            };
            
            // 合并默认请求头和自定义请求头
            options.headers = { ...defaultHeaders, ...options.headers };
            this.logger.info(`请求头:`, JSON.stringify(options.headers, null, 2));
            
            // 发送请求
            const startTime = Date.now();
            const response = await fetch(urlWithTimestamp, options);
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            this.logger.info(`请求完成，耗时: ${responseTime}ms, 状态码: ${response.status}`);
            this.logger.info(`响应内容类型: ${response.headers.get('content-type')}`);
            
            if (!response.ok) {
              throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`);
            }
            
            // 获取内容
            content = await response.text();
            
            // 计算内容摘要 (用于缓存比较)
            contentHash = crypto.createHash('sha256').update(content).digest('hex');
            
            // 如果内容过长，只显示前200个字符
            if (content.length > 200) {
              this.logger.info(`响应内容太长，只显示前200字符: \n${content.substring(0, 200)}...`);
            } else if (content.trim().length === 0) {
              this.logger.info(`服务器返回了空内容`);
              throw new Error('服务器返回了空内容');
            } else {
              this.logger.info(`响应内容: \n${content}`);
            }
            
            if (content.trim().length === 0) {
              throw new Error('服务器返回了空内容');
            }
            
            this.logger.info(`成功获取订阅，数据大小: ${content.length} 字节`);
            
            // 检测格式类型
            if (content.includes('proxies:') || content.includes('Proxy:') || content.includes('proxy-groups:')) {
              this.logger.info(`检测到可能的YAML/Clash配置`);
            } else if (content.startsWith('ss://') || content.startsWith('ssr://') || content.startsWith('vmess://') || content.startsWith('trojan://') || content.startsWith('vless://') || content.startsWith('socks://') || content.startsWith('tuic://') || content.startsWith('hysteria://')) {
              this.logger.info(`检测到Base64/文本格式的节点列表`);
            } else if (content.startsWith('{') && content.includes('"outbounds"')) {
              this.logger.info(`检测到V2Ray/Sing-box JSON配置`);
            } else if (/^[A-Za-z0-9+/=]+$/.test(content.trim())) {
              this.logger.info(`检测到可能的Base64编码内容`);
              
              // 尝试解码Base64内容并查看是否包含有效协议
              try {
                const decodedContent = Buffer.from(content, 'base64').toString('utf-8');
                if (decodedContent.includes('ss://') || decodedContent.includes('ssr://') || 
                    decodedContent.includes('vmess://') || decodedContent.includes('trojan://') ||
                    decodedContent.includes('vless://') || decodedContent.includes('socks://') ||
                    decodedContent.includes('tuic://') || decodedContent.includes('hysteria://')) {
                  this.logger.info(`Base64解码后发现有效协议前缀`);
                }
              } catch (e) {
                this.logger.error(`Base64解码失败: ${e.message}`);
              }
            }
            
            // 保存原始订阅数据，方便调试
            try {
              const rawDataDir = path.join(this.rootDir, this.dataDir);
              if (!fs.existsSync(rawDataDir)) {
                fs.mkdirSync(rawDataDir, { recursive: true });
              }
              fs.writeFileSync(path.join(rawDataDir, `${subscription.name}.txt`), content);
              this.logger.info(`原始订阅数据已保存到: ${path.join(rawDataDir, `${subscription.name}.txt`)}`);
            } catch (e) {
              this.logger.error(`保存原始订阅数据失败: ${e.message}`);
            }
            
            this.logger.info(`成功获取订阅: ${subscription.name}, 原始数据大小: ${content.length} 字节`);
            
            // 解析订阅内容
            try {
              if (!this.converter) {
                throw new Error('未配置转换器，无法解析订阅内容');
              }
              
              this.logger.info(`开始使用订阅解析器解析数据`);
              this.logger.info(`开始解析订阅数据，长度: ${content.length}`);
              
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
              
              // 保存到缓存
              if (subscription.type === SubscriptionType.URL) {
                if (!fs.existsSync(cacheDir)) {
                  fs.mkdirSync(cacheDir, { recursive: true });
                }
                saveCacheData(cachePath, parsedNodes, contentHash);
              }
              
              return {
                source: subscription.name,
                nodes: parsedNodes,
                fromCache: false,
                hash: contentHash
              };
            } catch (parseError) {
              this.logger.error(`解析订阅失败: ${parseError.message}`);
              this.logger.error(`解析错误详情: ${parseError.stack}`);
              return {
                source: subscription.name,
                nodes: [],
                fromCache: false,
                error: parseError.message
              };
            }
          } catch (fetchError) {
            this.logger.error(`获取订阅出错: ${fetchError.message}`);
            this.logger.error(`详细错误信息: ${fetchError.stack}`);
            return {
              source: subscription.name,
              nodes: [],
              fromCache: false,
              error: fetchError.message
            };
          }
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
      } else {
        // 处理其他类型的订阅，如Base64, VMess等
        this.logger.info(`不支持的订阅类型: ${subscription.type}`);
        return {
          source: subscription.name,
          nodes: [],
          fromCache: false,
          error: `不支持的订阅类型: ${subscription.type}`
        };
      }
    }
  }
} 