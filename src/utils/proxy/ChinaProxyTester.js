/**
 * 中国代理测速器
 * 通过中国大陆代理测试节点速度
 */

import { logger } from '../index.js';
import { SocksProxyAgent } from 'socks-proxy-agent';
import http from 'http';
import https from 'https';
import { URL } from 'url';

const defaultLogger = logger?.defaultLogger || console;

export class ChinaProxyTester {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger.child({ component: 'ChinaProxyTester' });
    this.socksProxies = options.socksProxies || [];
    this.timeout = options.timeout || 5000; // 默认5秒超时
    this.testUrl = options.testUrl || 'http://www.gstatic.com/generate_204';
    this.concurrency = options.concurrency || 5;
    this._currentProxyIndex = 0;
  }

  /**
   * 获取下一个中国代理
   * @returns {string|null} SOCKS代理URL或null
   */
  getNextProxy() {
    if (this.socksProxies.length === 0) {
      return null;
    }
    
    // 轮流使用代理
    const proxy = this.socksProxies[this._currentProxyIndex];
    this._currentProxyIndex = (this._currentProxyIndex + 1) % this.socksProxies.length;
    return proxy;
  }

  /**
   * 测试单个节点
   * @param {Object} node 节点对象
   * @returns {Promise<Object>} 测试结果 { status, latency, error }
   */
  async testNode(node) {
    const proxyUrl = this.getNextProxy();
    if (!proxyUrl) {
      this.logger.error(`未配置中国大陆SOCKS代理，无法使用此功能测试节点: ${node.name}`);
      return { status: false, latency: null, error: '未配置中国大陆SOCKS代理' };
    }

    this.logger.info(`通过中国大陆SOCKS代理 ${proxyUrl} 测试节点: ${node.name}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // 创建SOCKS代理
      const agent = new SocksProxyAgent(proxyUrl);
      
      // 创建URL对象
      const targetUrl = new URL(this.testUrl);
      
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
            this.logger.debug(`节点 ${node.name} 测试通过，延迟: ${latency}ms`);
            resolve({ status: true, latency, error: null });
          } else {
            this.logger.warn(`节点 ${node.name} 测试失败 (HTTP ${res.statusCode})`);
            resolve({ status: false, latency: null, error: `HTTP Status ${res.statusCode}` });
          }
          
          res.resume(); // 消耗响应数据释放内存
        });

        req.on('error', (err) => {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            this.logger.warn(`节点 ${node.name} 测试超时`);
            resolve({ status: false, latency: null, error: '测试超时' });
          } else {
            this.logger.warn(`节点 ${node.name} 测试错误: ${err.message}`);
            resolve({ status: false, latency: null, error: err.message });
          }
        });
        
        req.end();
      });
    } catch (error) {
      clearTimeout(timeoutId);
      this.logger.error(`测试节点时出错: ${error.message}`);
      return { status: false, latency: null, error: error.message };
    }
  }

  /**
   * 批量测试节点
   * @param {Array<Object>} nodes 节点数组
   * @returns {Promise<Array<Object>>} 测试结果数组
   */
  async testNodes(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      this.logger.warn('没有节点需要测试');
      return [];
    }

    this.logger.info(`开始通过中国大陆代理测试 ${nodes.length} 个节点，并发数: ${this.concurrency}`);
    
    const results = [];
    const queue = [...nodes]; // 创建节点队列的副本
    
    // 创建测试工作者
    const workers = Array(Math.min(this.concurrency, nodes.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const node = queue.shift();
          if (!node) continue;
          
          try {
            const testResult = await this.testNode(node);
            results.push({
              ...node,
              via_china_proxy: true,
              valid: testResult.status,
              latency: testResult.latency,
              error: testResult.error
            });
            
            this.logger.info(`节点 ${node.name} 测试结果: ${testResult.status ? '成功' : '失败'}, 延迟: ${testResult.latency || 'N/A'}ms`);
          } catch (error) {
            this.logger.error(`测试节点 ${node.name} 时发生错误: ${error.message}`);
            results.push({
              ...node,
              via_china_proxy: true,
              valid: false,
              latency: null,
              error: error.message
            });
          }
        }
      });
    
    await Promise.all(workers);
    
    // 统计结果
    const validNodes = results.filter(n => n.valid);
    this.logger.info(`中国大陆代理测试完成，共 ${results.length} 个节点，有效: ${validNodes.length}, 无效: ${results.length - validNodes.length}`);
    
    return results;
  }
}

export default ChinaProxyTester; 