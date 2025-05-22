/**
 * 节点测试器
 * 负责测试节点的连通性和性能
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from '../utils/FileSystem.js';

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
    this.minLatency = options.minLatency || 0; // 默认最小延迟阈值
    this.filterInvalid = options.filterInvalid !== false;
    this.verifyLocation = options.verifyLocation === true;
    this.filterUnreasonableLatency = options.filterUnreasonableLatency !== false; // 是否过滤不合理的延迟
    this.logger = options.logger || console;
    this.ipInfoCache = new Map();
    this.cachePath = path.join(this.rootDir, this.dataDir, 'ip_cache/ip_info_cache.json');
    
    // 国家/地区的合理最小延迟（毫秒）
    this.regionMinLatency = {
      '中国': 2,
      '香港': 20,
      'HK': 20,
      'Hong Kong': 20,
      '台湾': 30,
      'TW': 30,
      'Taiwan': 30,
      '日本': 40,
      'JP': 40,
      'Japan': 40,
      '韩国': 50,
      'KR': 50,
      'Korea': 50,
      '新加坡': 60,
      'SG': 60,
      'Singapore': 60,
      '美国': 120,
      'US': 120,
      'United States': 120,
      // 欧洲国家
      '德国': 150,
      'DE': 150,
      'Germany': 150,
      '英国': 160,
      'GB': 160,
      'UK': 160,
      '法国': 160,
      'FR': 160,
      'France': 160,
      // 其他地区
      'default': 100 // 默认最小延迟
    };
    
    // 初始化时加载IP缓存
    this.loadIPCache();
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
    let unreasonableLatencyNodes = 0;
    
    // 分批测试
    for (let i = 0; i < batches.length; i++) {
      this.logger.info(`测试批次 ${i+1}/${batches.length} (${batches[i].length} 个节点)...`);
      
      // 并行测试一批节点
      const batchPromises = batches[i].map((node, index) => {
        return this.testNode(node, i * this.concurrency + index)
          .then(result => {
            if (result.valid) {
              // 检查延迟是否合理
              const isReasonableLatency = this.isLatencyReasonable(result);
              
              if (isReasonableLatency || !this.filterUnreasonableLatency) {
                validNodes.push(result);
                this.logger.info(`节点 ${result.name} 测试通过，延迟: ${result.latency}ms`);
              } else {
                result.valid = false;
                result.error = `不合理的延迟值: ${result.latency}ms (${this.getReasonableMinLatency(result)}ms)`;
                invalidNodes.push(result);
                unreasonableLatencyNodes++;
                this.logger.warn(`节点 ${result.name} 延迟不合理: ${result.latency}ms，最小合理延迟: ${this.getReasonableMinLatency(result)}ms`);
              }
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
    
    // 统计结果
    this.logger.info(`测试完成，总计 ${testedNodes.length} 个节点，有效: ${validNodes.length}, 无效: ${invalidNodes.length}, 延迟不合理: ${unreasonableLatencyNodes}`);
    
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
          // 使用改进的测试方法
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
        if (testResult.valid && this.maxLatency > 0 && testResult.latency > this.maxLatency) {
          testResult.valid = false;
          testResult.error = `Latency too high: ${testResult.latency}ms > ${this.maxLatency}ms`;
        }
        
        // 全局最小延迟检查
        if (testResult.valid && this.minLatency > 0 && testResult.latency < this.minLatency) {
          // 我们仍将其标记为有效，但会在后续过程中根据地区特定的延迟合理性检查过滤
          testResult.suspiciousLatency = true;
        }
        
        // 返回结果，包含原始节点信息和测试结果
        resolve({
          ...node,
          valid: testResult.valid,
          latency: testResult.valid ? testResult.latency : -1,
          location: testResult.location,
          error: testResult.valid ? null : testResult.error,
          suspiciousLatency: testResult.suspiciousLatency,
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
   * 判断节点延迟是否合理
   * @param {Object} node 节点对象
   * @returns {boolean} 是否合理
   */
  isLatencyReasonable(node) {
    const minLatency = this.getReasonableMinLatency(node);
    return node.latency >= minLatency;
  }

  /**
   * 获取节点的合理最小延迟
   * @param {Object} node 节点对象
   * @returns {number} 最小合理延迟
   */
  getReasonableMinLatency(node) {
    // 从节点名称中提取地区信息
    let region = null;
    
    // 首先检查名称中是否包含地区代码或地区名称
    for (const key of Object.keys(this.regionMinLatency)) {
      if (node.name && node.name.includes(key)) {
        region = key;
        break;
      }
    }
    
    // 如果节点有地区或国家标签，也可以用来判断
    if (!region && node.region) {
      region = node.region;
    }
    
    // 如果节点有位置信息，可以用国家代码
    if (!region && node.location && node.location.country) {
      region = node.location.country;
    }
    
    // 返回该地区的最小延迟阈值，如果没有找到匹配的地区，则返回默认值
    return this.regionMinLatency[region] || this.regionMinLatency.default;
  }

  /**
   * 测试节点延迟
   * @param {Object} node 节点对象
   * @returns {Promise<Object>} 测试结果
   */
  async testLatency(node) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Timeout' });
      }, this.timeout);
      
      // 使用更严格的测试方法
      try {
        import('net').then(net => {
          const socket = new net.Socket();
          
          // 设置更短的超时时间，确保节点响应迅速
          socket.setTimeout(Math.min(5000, this.timeout / 2));
          
          // 增加错误处理和健壮性
          let hasResolved = false;
          
          const resolveOnce = (result) => {
            if (!hasResolved) {
              hasResolved = true;
              clearTimeout(timeout);
              socket.destroy();
              resolve(result);
            }
          };
          
          socket.on('error', (error) => {
            resolveOnce({ success: false, error: error.message });
          });
          
          socket.on('timeout', () => {
            resolveOnce({ success: false, error: 'Socket timeout' });
          });
          
          socket.on('close', () => {
            if (!hasResolved) {
              resolveOnce({ success: false, error: 'Connection closed unexpectedly' });
            }
          });
          
          // 尝试连接
          socket.connect(node.port, node.server, () => {
            // 测试连接速度和稳定性
            // 1. 首先通过TCP成功连接
            // 2. 检查连接是否稳定
            
            // 获取当前时间作为基准
            const startTime = Date.now();
            
            // 发送一些数据并测试响应能力
            socket.write('PING\r\n');
            
            // 设置数据接收处理器
            socket.once('data', () => {
              const latency = Date.now() - startTime;
              resolveOnce({ success: true, latency });
            });
            
            // 延迟返回结果，确保测量的延迟更准确
            // 不再立即返回超快的连接，而是等待足够时间测量实际延迟
            setTimeout(() => {
              if (!hasResolved && socket.writable) {
                const latency = Date.now() - startTime;
                resolveOnce({ success: true, latency });
              }
            }, 100); // 等待至少100ms以获取更准确的延迟测量
          });
        }).catch(error => {
          resolve({ success: false, error: error.message });
        });
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
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
        suspiciousLatencyNodes: results.filter(n => n.valid && n.suspiciousLatency).length,
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