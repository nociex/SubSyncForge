import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/index.js';
import { IpLocationDetector } from '../../utils/ip/IpLocationDetector.js';

const defaultLogger = logger?.defaultLogger || console;

export class SubscriptionParser {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.logger = options.logger || defaultLogger.child({ component: 'SubscriptionParser' });
  }

  /**
   * 解析订阅内容
   * @param {string} content 订阅内容
   * @param {string} type 订阅类型
   * @param {Object} options 选项
   * @returns {Promise<Array>} 解析后的节点列表
   */
  async parseSubscription(content, type, options = {}) {
    let nodes = [];

    try {
      if (!content) {
        this.logger.warn('订阅内容为空');
        return [];
      }

      // 根据订阅类型选择合适的解析器
      switch (type.toLowerCase()) {
        case 'base64':
        case 'v2ray':
        case 'vmess':
        case 'ss':
        case 'ssr':
        case 'trojan':
          // 这些类型由现有解析器处理
          break;
        case 'clash':
        case 'yaml':
          // 这些类型由现有解析器处理
          break;
        case 'singbox':
        case 'json':
          // 这些类型由现有解析器处理
          break;
        default:
          this.logger.warn(`未知的订阅类型: ${type}，将尝试自动检测`);
      }

      // 检查是否需要对中国节点进行处理
      if (options.detectChineseNodes !== false) {
        // 创建IP地理位置检测器
        const ipDetector = new IpLocationDetector({
          logger: this.logger,
          rootDir: this.rootDir,
          dataDir: this.dataDir
        });
        
        // 记录开始检测
        this.logger.info(`开始检测中国大陆节点，总节点数: ${nodes.length}`);
        
        // 分批处理节点，避免一次检测过多
        const batchSize = 50;
        const batches = Math.ceil(nodes.length / batchSize);
        
        let cnNodes = [];
        
        for (let i = 0; i < batches; i++) {
          const start = i * batchSize;
          const end = Math.min(start + batchSize, nodes.length);
          const batch = nodes.slice(start, end);
          
          this.logger.info(`处理批次 ${i+1}/${batches}，节点数: ${batch.length}`);
          
          // 并行检测节点位置
          const promises = batch.map(async (node) => {
            // 跳过已经检测过的节点
            if (node.metadata?.location?.country) {
              return {
                node,
                isCN: node.metadata.location.country === 'CN' || 
                      node.metadata.location.country_name === '中国' ||
                      node.metadata.isChinaNode === true
              };
            }
            
            // 检测节点服务器位置
            try {
              if (!node.server) {
                return { node, isCN: false };
              }
              
              const location = await ipDetector.getIpLocation(node.server);
              
              // 如果节点没有元数据，创建一个
              if (!node.metadata) {
                node.metadata = {};
              }
              
              // 保存位置信息
              node.metadata.location = location;
              
              // 判断是否为中国节点
              const isCN = location?.country === 'CN' || 
                        location?.country_name === '中国';
              
              // 标记是否为中国节点
              node.metadata.isChinaNode = isCN;
              
              return { node, isCN };
            } catch (error) {
              // 如果检测失败，默认不是中国节点
              this.logger.warn(`检测节点 ${node.name || node.server} 位置失败: ${error.message}`);
              return { node, isCN: false };
            }
          });
          
          // 等待所有检测完成
          const results = await Promise.all(promises);
          
          // 收集中国节点
          const batchCNNodes = results.filter(r => r.isCN).map(r => r.node);
          cnNodes = [...cnNodes, ...batchCNNodes];
          
          this.logger.info(`批次 ${i+1}/${batches} 检测完成，发现 ${batchCNNodes.length} 个中国节点`);
        }
        
        // 输出中国节点数量
        this.logger.info(`共发现 ${cnNodes.length} 个中国大陆节点`);
      }
      
      return nodes;
    } catch (error) {
      this.logger.error(`解析订阅内容失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 处理已有节点，检测中国节点
   * @param {Array} nodes 节点列表
   * @param {Object} options 选项
   * @returns {Promise<Array>} 处理后的节点列表
   */
  async processNodes(nodes, options = {}) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }
    
    try {
      // 检查是否需要对中国节点进行处理
      if (options.detectChineseNodes !== false) {
        // 创建IP地理位置检测器
        const ipDetector = new IpLocationDetector({
          logger: this.logger,
          rootDir: this.rootDir,
          dataDir: this.dataDir
        });
        
        // 记录开始检测
        this.logger.info(`开始检测中国大陆节点，总节点数: ${nodes.length}`);
        
        // 分批处理节点，避免一次检测过多
        const batchSize = 50;
        const batches = Math.ceil(nodes.length / batchSize);
        
        let cnNodes = [];
        
        for (let i = 0; i < batches; i++) {
          const start = i * batchSize;
          const end = Math.min(start + batchSize, nodes.length);
          const batch = nodes.slice(start, end);
          
          this.logger.info(`处理批次 ${i+1}/${batches}，节点数: ${batch.length}`);
          
          // 并行检测节点位置
          const promises = batch.map(async (node) => {
            // 跳过已经检测过的节点
            if (node.metadata?.location?.country) {
              return {
                node,
                isCN: node.metadata.location.country === 'CN' || 
                      node.metadata.location.country_name === '中国' ||
                      node.metadata.isChinaNode === true
              };
            }
            
            // 检测节点服务器位置
            try {
              if (!node.server) {
                return { node, isCN: false };
              }
              
              const location = await ipDetector.getIpLocation(node.server);
              
              // 如果节点没有元数据，创建一个
              if (!node.metadata) {
                node.metadata = {};
              }
              
              // 保存位置信息
              node.metadata.location = location;
              
              // 判断是否为中国节点
              const isCN = location?.country === 'CN' || 
                        location?.country_name === '中国';
              
              // 标记是否为中国节点
              node.metadata.isChinaNode = isCN;
              
              return { node, isCN };
            } catch (error) {
              // 如果检测失败，默认不是中国节点
              this.logger.warn(`检测节点 ${node.name || node.server} 位置失败: ${error.message}`);
              return { node, isCN: false };
            }
          });
          
          // 等待所有检测完成
          const results = await Promise.all(promises);
          
          // 收集中国节点
          const batchCNNodes = results.filter(r => r.isCN).map(r => r.node);
          cnNodes = [...cnNodes, ...batchCNNodes];
          
          this.logger.info(`批次 ${i+1}/${batches} 检测完成，发现 ${batchCNNodes.length} 个中国节点`);
        }
        
        // 输出中国节点数量
        this.logger.info(`共发现 ${cnNodes.length} 个中国大陆节点`);
      }
      
      // 直接返回原节点列表
      return nodes;
    } catch (error) {
      this.logger.error(`处理节点失败: ${error.message}`);
      return nodes;
    }
  }
} 