/**
 * SOCKS代理验证器
 * 专门用于验证SOCKS代理的可用性
 */

import { logger } from '../index.js';
import { SocksProxyAgent } from 'socks-proxy-agent';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import net from 'net';

const defaultLogger = logger?.defaultLogger || console;

export class SocksProxyVerifier {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger.child({ component: 'SocksProxyVerifier' });
    this.timeout = options.timeout || 5000; // 默认5秒超时
    this.testUrl = options.testUrl || 'http://www.gstatic.com/generate_204';
    this.directTestUrl = options.directTestUrl || 'https://www.baidu.com';
    this.concurrency = options.concurrency || 5;
  }

  /**
   * 验证SOCKS代理是否可用
   * @param {Object} node SOCKS节点对象
   * @returns {Promise<Object>} 验证结果 { valid, latency, error, asSocksProxy }
   */
  async verifySocksProxy(node) {
    if (!node || !node.server || !node.port) {
      return { valid: false, latency: null, error: '无效的节点信息', asSocksProxy: false };
    }

    this.logger.info(`开始验证SOCKS代理: ${node.name || node.server}:${node.port}`);
    
    // 1. 首先验证TCP连接是否可用
    const tcpResult = await this.verifyTcpConnection(node);
    if (!tcpResult.valid) {
      this.logger.warn(`节点 ${node.name || node.server} TCP连接失败: ${tcpResult.error}`);
      return { ...tcpResult, asSocksProxy: false };
    }
    
    // 2. 尝试通过SOCKS代理访问测试URL
    const socksResult = await this.verifySocksConnection(node);
    
    // 3. 如果第一个测试URL失败，尝试使用国内URL
    if (!socksResult.valid && this.directTestUrl !== this.testUrl) {
      this.logger.info(`使用国际URL测试失败，尝试使用国内URL: ${this.directTestUrl}`);
      const directResult = await this.verifySocksConnection(node, this.directTestUrl);
      
      if (directResult.valid) {
        this.logger.info(`节点 ${node.name || node.server} 可以访问国内网站，但不能访问国际网站`);
        return { ...directResult, asSocksProxy: true, chinaOnly: true };
      } else {
        this.logger.warn(`节点 ${node.name || node.server} 无法作为SOCKS代理使用: ${directResult.error}`);
        return { ...directResult, asSocksProxy: false };
      }
    }
    
    if (socksResult.valid) {
      this.logger.info(`节点 ${node.name || node.server} 可以作为SOCKS代理使用，延迟: ${socksResult.latency}ms`);
      return { ...socksResult, asSocksProxy: true };
    } else {
      this.logger.warn(`节点 ${node.name || node.server} 无法作为SOCKS代理使用: ${socksResult.error}`);
      return { ...socksResult, asSocksProxy: false };
    }
  }
  
  /**
   * 验证TCP连接
   * @param {Object} node 节点对象
   * @returns {Promise<Object>} 验证结果 { valid, latency, error }
   */
  async verifyTcpConnection(node) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let connected = false;
      const startTime = Date.now();
      
      const timeoutId = setTimeout(() => {
        if (!connected) {
          socket.destroy();
          resolve({ valid: false, latency: null, error: '连接超时' });
        }
      }, this.timeout);
      
      socket.connect(node.port, node.server, () => {
        connected = true;
        const latency = Date.now() - startTime;
        clearTimeout(timeoutId);
        socket.end();
        resolve({ valid: true, latency, error: null });
      });
      
      socket.on('error', (err) => {
        if (!connected) {
          clearTimeout(timeoutId);
          resolve({ valid: false, latency: null, error: err.message });
        }
      });
    });
  }
  
  /**
   * 验证SOCKS连接
   * @param {Object} node 节点对象
   * @param {string} testUrl 测试URL，默认使用实例配置的URL
   * @returns {Promise<Object>} 验证结果 { valid, latency, error }
   */
  async verifySocksConnection(node, testUrl = this.testUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      // 构建SOCKS代理URL
      const auth = node.settings?.username && node.settings?.password
        ? `${node.settings.username}:${node.settings.password}@`
        : '';
      const socksUrl = `socks5://${auth}${node.server}:${node.port}`;
      
      // 创建SOCKS代理
      const agent = new SocksProxyAgent(socksUrl);
      
      // 创建URL对象
      const targetUrl = new URL(testUrl);
      
      const requestOptions = {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'SubSyncForge/1.0'
        },
        agent
      };
      
      const startTime = Date.now();
      
      return new Promise((resolve) => {
        const httpModule = targetUrl.protocol === 'https:' ? https : http;
        
        const req = httpModule.request(targetUrl, requestOptions, (res) => {
          clearTimeout(timeoutId);
          const latency = Date.now() - startTime;
          
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve({ valid: true, latency, error: null });
          } else {
            resolve({ valid: false, latency: null, error: `HTTP状态码 ${res.statusCode}` });
          }
          
          res.resume(); // 消耗响应数据释放内存
        });
        
        req.on('error', (err) => {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            resolve({ valid: false, latency: null, error: '请求超时' });
          } else {
            resolve({ valid: false, latency: null, error: err.message });
          }
        });
        
        req.end();
      });
    } catch (error) {
      clearTimeout(timeoutId);
      return { valid: false, latency: null, error: error.message };
    }
  }
  
  /**
   * 批量验证SOCKS代理
   * @param {Array<Object>} nodes 节点数组
   * @returns {Promise<Array<Object>>} 验证结果数组
   */
  async batchVerify(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      this.logger.warn('没有节点需要验证');
      return [];
    }
    
    this.logger.info(`开始验证 ${nodes.length} 个SOCKS代理，并发数: ${this.concurrency}`);
    
    const results = [];
    const queue = [...nodes]; // 创建节点队列的副本
    
    // 创建验证工作者
    const workers = Array(Math.min(this.concurrency, nodes.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const node = queue.shift();
          if (!node) continue;
          
          try {
            const verifyResult = await this.verifySocksProxy(node);
            results.push({
              ...node,
              valid_as_socks: verifyResult.asSocksProxy,
              latency: verifyResult.latency,
              error: verifyResult.error,
              china_only: verifyResult.chinaOnly || false
            });
          } catch (error) {
            this.logger.error(`验证节点 ${node.name || node.server} 时发生错误: ${error.message}`);
            results.push({
              ...node,
              valid_as_socks: false,
              latency: null,
              error: error.message
            });
          }
        }
      });
    
    await Promise.all(workers);
    
    // 统计结果
    const validNodes = results.filter(n => n.valid_as_socks);
    const chinaOnlyNodes = validNodes.filter(n => n.china_only);
    
    this.logger.info(`SOCKS代理验证完成，共 ${results.length} 个节点，有效: ${validNodes.length} (其中仅国内可用: ${chinaOnlyNodes.length})，无效: ${results.length - validNodes.length}`);
    
    return results;
  }
}

export default SocksProxyVerifier; 