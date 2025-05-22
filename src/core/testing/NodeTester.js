/**
 * 节点测试器
 * 负责测试节点的连通性和性能
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from '../utils/FileSystem.js';
import { ChinaProxyTester } from '../../utils/proxy/ChinaProxyTester.js';
import { ChinaProxyLoader } from '../../utils/proxy/ChinaProxyLoader.js';

export class NodeTester {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.concurrency = options.concurrency || 5;
    this.timeout = options.timeout || 5000;
    this.testUrl = options.testUrl || 'http://www.google.com/generate_204';
    this.maxLatency = options.maxLatency || 5000;
    this.filterInvalid = options.filterInvalid !== false;
    this.verifyLocation = options.verifyLocation === true;
    this.logger = options.logger || console;
    this.ipInfoCache = new Map();
    this.cachePath = path.join(this.rootDir, this.dataDir, 'ip_cache/ip_info_cache.json');
    this.useChineseProxy = options.useChineseProxy || false;
    
    // 初始化时加载IP缓存
    this.loadIPCache();
    
    // 初始化中国代理测试器（如果启用）
    if (this.useChineseProxy) {
      this.chinaProxyLoader = new ChinaProxyLoader({
        rootDir: this.rootDir,
        logger: this.logger
      });
      
      const chinaProxyConfig = this.chinaProxyLoader.loadConfig();
      if (chinaProxyConfig.enabled && chinaProxyConfig.use_for_testing) {
        const formattedProxies = this.chinaProxyLoader.getFormattedProxies();
        if (formattedProxies.length > 0) {
          this.chinaProxyTester = new ChinaProxyTester({
            logger: this.logger,
            socksProxies: formattedProxies,
            timeout: chinaProxyConfig.testing.timeout || this.timeout,
            testUrl: chinaProxyConfig.testing.test_url || this.testUrl,
            concurrency: this.concurrency
          });
          this.logger.info(`已启用中国大陆代理测速，配置了 ${formattedProxies.length} 个代理`);
        } else {
          this.logger.warn(`虽然启用了中国大陆代理测速，但没有配置有效的代理`);
          this.chinaProxyTester = null;
        }
      } else {
        this.chinaProxyTester = null;
      }
    } else {
      this.chinaProxyTester = null;
      this.chinaProxyLoader = null;
    }
  }

  /**
   * 批量测试节点
   * @param {Array} nodes 节点数组
   * @returns {Promise<Array>} 测试结果
   */
  async testNodes(nodes) {
    this.logger.info(`开始测试节点...`);
    this.logger.info(`节点数量: ${nodes.length}, 并发数: ${this.concurrency}, 超时: ${this.timeout}ms`);
    
    // 节点分组测试，避免一次性创建太多进程
    const batches = [];
    for (let i = 0; i < nodes.length; i += this.concurrency) {
      batches.push(nodes.slice(i, i + this.concurrency));
    }
    
    let testedNodes = [];
    let validNodes = [];
    let invalidNodes = [];
    
    // 分批测试
    for (let i = 0; i < batches.length; i++) {
      this.logger.info(`测试批次 ${i+1}/${batches.length} (${batches[i].length} 个节点)...`);
      
      // 并行测试一批节点
      const batchPromises = batches[i].map((node, index) => {
        return this.testNode(node, i * this.concurrency + index)
          .then(result => {
            if (result.valid) {
              validNodes.push(result);
              this.logger.info(`节点 ${result.name} 测试通过，延迟: ${result.latency}ms`);
            } else {
              invalidNodes.push(result);
              this.logger.info(`节点 ${result.name} 测试失败: ${result.error}`);
            }
            return result;
          })
          .catch(error => {
            this.logger.error(`测试节点出错:`, error.message);
            return {
              ...node,
              valid: false,
              error: error.message,
              test: { valid: false, error: error.message }
            };
          });
      });
      
      // 等待当前批次完成
      const batchResults = await Promise.all(batchPromises);
      testedNodes = testedNodes.concat(batchResults);
    }
    
    // 如果启用了中国代理测试，则使用中国代理测试所有节点
    if (this.chinaProxyTester) {
      this.logger.info(`开始通过中国大陆代理测试节点...`);
      
      try {
        const chinaResults = await this.chinaProxyTester.testNodes(nodes);
        
        // 将中国代理测试结果添加到测试结果中
        for (const chinaResult of chinaResults) {
          const index = testedNodes.findIndex(node => 
            node.name === chinaResult.name && 
            node.server === chinaResult.server && 
            node.port === chinaResult.port);
          
          if (index !== -1) {
            // 添加中国测试结果到现有节点
            testedNodes[index].china_test = {
              valid: chinaResult.valid,
              latency: chinaResult.latency,
              error: chinaResult.error
            };
            
            this.logger.info(`节点 ${chinaResult.name} 通过中国代理测试结果: ${chinaResult.valid ? '成功' : '失败'}, 延迟: ${chinaResult.latency || 'N/A'}ms`);
          }
        }
      } catch (error) {
        this.logger.error(`中国大陆代理测试失败:`, error.message);
      }
    }
    
    // 统计结果
    this.logger.info(`测试完成，总计 ${testedNodes.length} 个节点，有效: ${validNodes.length}, 无效: ${invalidNodes.length}`);
    
    // 保存测试结果到文件
    this.saveTestResults(testedNodes);
    
    // 返回有效节点或所有节点
    if (this.filterInvalid) {
      this.logger.info(`已过滤掉无效节点，返回 ${validNodes.length} 个有效节点`);
      return validNodes;
    } else {
      return testedNodes;
    }
  }

  /**
   * 测试单个节点
   * @param {Object} node 节点对象
   * @param {number} index 节点索引
   * @returns {Promise<Object>} 测试结果
   */
  async testNode(node, index) {
    return new Promise(async (resolve) => {
      try {
        this.logger.info(`开始测试节点 ${index}: ${node.name}`);
        
        // 检查节点是否有必要字段
        if (!node.server || !node.port || !node.type) {
          this.logger.info(`节点 ${index} 缺少必要字段，跳过测试`);
          resolve({
            ...node,
            valid: false,
            error: 'Missing required fields',
            test: { valid: false, error: 'Missing required fields' }
          });
          return;
        }
        
        // 执行延迟测试
        const startTime = Date.now();
        let testResult = { valid: false, error: 'Timeout' };
        
        try {
          // 简单的延迟测试 - 后续可以替换为更复杂的测试方法
          const result = await this.testLatency(node);
          const endTime = Date.now();
          const latency = endTime - startTime;
          
          if (result.success) {
            testResult = { valid: true, latency };
            
            // 如果配置了验证位置，尝试获取IP信息
            if (this.verifyLocation) {
              try {
                const locationInfo = await this.getIPLocation(node.server);
                testResult.location = locationInfo;
              } catch (locError) {
                this.logger.warn(`获取位置信息失败: ${locError.message}`);
              }
            }
          } else {
            testResult = { valid: false, error: result.error || 'Connection failed' };
          }
        } catch (error) {
          testResult = { valid: false, error: error.message };
        }
        
        // 添加最大延迟检查
        if (testResult.valid && testResult.latency > this.maxLatency) {
          testResult.valid = false;
          testResult.error = `Latency too high: ${testResult.latency}ms > ${this.maxLatency}ms`;
        }
        
        // 返回结果，包含原始节点信息和测试结果
        resolve({
          ...node,
          valid: testResult.valid,
          latency: testResult.valid ? testResult.latency : -1,
          location: testResult.location,
          error: testResult.valid ? null : testResult.error,
          test: testResult
        });
      } catch (error) {
        resolve({
          ...node,
          valid: false,
          error: error.message,
          test: { valid: false, error: error.message }
        });
      }
    });
  }

  /**
   * 测试节点延迟
   * @param {Object} node 节点对象
   * @returns {Promise<Object>} 测试结果
   */
  async testLatency(node) {
    // 简化的测试：仅检查TCP连接
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Timeout' });
      }, this.timeout);
      
      // 使用socket检查连接 - 在实际项目中，应该替换为真正的代理连接测试
      import('net').then(net => {
        const socket = new net.Socket();
        
        socket.connect(node.port, node.server, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve({ success: true });
        });
        
        socket.on('error', (error) => {
          clearTimeout(timeout);
          socket.destroy();
          resolve({ success: false, error: error.message });
        });
      }).catch(error => {
        clearTimeout(timeout);
        resolve({ success: false, error: `模块加载失败: ${error.message}` });
      });
    });
  }

  /**
   * 获取IP位置信息
   * @param {string} ip IP地址
   * @returns {Promise<Object>} 位置信息
   */
  async getIPLocation(ip) {
    // 检查缓存中是否有此IP信息
    if (this.ipInfoCache.has(ip)) {
      const cachedInfo = this.ipInfoCache.get(ip);
      const now = Date.now();
      // 如果缓存未过期，则使用缓存数据
      if (now - cachedInfo.timestamp < 604800000) { // 7天的毫秒数
        return cachedInfo.data;
      }
    }
    
    // 调用IP信息API获取位置信息
    try {
      const apiUrl = `https://ipinfo.io/${ip}/json`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 缓存结果
      this.ipInfoCache.set(ip, {
        data: data,
        timestamp: Date.now()
      });
      
      // 保存缓存
      this.saveIPCache();
      
      return data;
    } catch (error) {
      this.logger.error(`获取IP位置信息失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 加载IP缓存
   */
  loadIPCache() {
    try {
      // 确保缓存目录存在
      ensureDirectoryExists(path.dirname(this.cachePath));
      
      if (fs.existsSync(this.cachePath)) {
        const cacheData = JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
        
        // 转换为Map
        this.ipInfoCache = new Map(Object.entries(cacheData));
        this.logger.info(`已加载 ${this.ipInfoCache.size} 条IP信息缓存`);
      } else {
        this.logger.info(`IP信息缓存文件不存在，将创建新的缓存`);
        this.ipInfoCache = new Map();
      }
    } catch (error) {
      this.logger.error(`加载IP信息缓存失败: ${error.message}`);
      this.ipInfoCache = new Map();
    }
  }

  /**
   * 保存IP缓存
   */
  saveIPCache() {
    try {
      // 确保缓存目录存在
      ensureDirectoryExists(path.dirname(this.cachePath));
      
      // 将Map转换为对象
      const cacheObject = Object.fromEntries(this.ipInfoCache);
      
      fs.writeFileSync(this.cachePath, JSON.stringify(cacheObject, null, 2));
      this.logger.info(`已保存 ${this.ipInfoCache.size} 条IP信息缓存`);
    } catch (error) {
      this.logger.error(`保存IP信息缓存失败: ${error.message}`);
    }
  }

  /**
   * 保存测试结果到文件
   * @param {Array} results 测试结果
   */
  saveTestResults(results) {
    try {
      const resultDir = path.join(this.rootDir, this.dataDir, 'test_results');
      ensureDirectoryExists(resultDir);
      
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
      const resultPath = path.join(resultDir, `test_${timestamp}.json`);
      
      // 统计信息
      const stats = {
        totalNodes: results.length,
        validNodes: results.filter(n => n.valid).length,
        invalidNodes: results.filter(n => !n.valid).length,
        avgLatency: results.filter(n => n.valid).reduce((sum, n) => sum + n.latency, 0) / 
                   (results.filter(n => n.valid).length || 1)
      };
      
      // 保存结果
      const data = {
        timestamp: new Date().toISOString(),
        stats: stats,
        results: results
      };
      
      fs.writeFileSync(resultPath, JSON.stringify(data, null, 2));
      this.logger.info(`测试结果已保存到: ${resultPath}`);
      
      // 保存最新测试结果的副本
      const latestPath = path.join(resultDir, 'latest_test.json');
      fs.writeFileSync(latestPath, JSON.stringify(data, null, 2));
      this.logger.info(`最新测试结果已保存到: ${latestPath}`);
    } catch (error) {
      this.logger.error(`保存测试结果失败: ${error.message}`);
    }
  }
} 