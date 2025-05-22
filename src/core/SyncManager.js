/**
 * 同步管理器
 * 主程序模块，负责组织和协调其他模块的工作
 */

import path from 'path';
import { ConfigLoader } from './config/ConfigLoader.js';
import { Logger } from './utils/Logger.js';
import { TimeLimit } from './utils/TimeLimit.js';
import { SubscriptionFetcher } from './subscription/SubscriptionFetcher.js';
import { NodeProcessor } from './node/NodeProcessor.js';
import { NodeTester } from './testing/NodeTester.js';
import { ConfigGenerator } from './output/ConfigGenerator.js';
import { ProxyManager } from './proxy/ProxyManager.js';

export class SyncManager {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    // 基本路径配置
    this.rootDir = options.rootDir || process.cwd();
    this.configPath = options.configPath || path.join(this.rootDir, 'config/custom.yaml');
    
    // 创建日志记录器
    this.logger = new Logger({
      level: options.logLevel || 'info',
      prefix: 'SyncManager'
    });
    
    // 创建时间限制管理器
    this.timeLimit = new TimeLimit(options.maxExecutionTime || 5 * 60 * 60 * 1000); // 默认5小时
    this.timeLimit.setLogger(this.logger);
    
    // 创建配置加载器
    this.configLoader = new ConfigLoader({
      rootDir: this.rootDir,
      configPath: this.configPath,
      logger: this.logger
    });
    
    // 初始化配置
    this.config = null;
    
    // 其他组件初始化为null，等待配置加载后再创建
    this.proxyManager = null;
    this.subscriptionFetcher = null;
    this.nodeProcessor = null;
    this.nodeTester = null;
    this.configGenerator = null;
    
    // 处理结果
    this.allNodes = [];
    this.processedNodes = [];
    this.validNodes = [];
  }

  /**
   * 初始化
   */
  async initialize() {
    try {
      this.logger.info('初始化同步管理器...');
      
      // 加载配置
      this.config = this.configLoader.loadConfig();
      if (!this.config) {
        throw new Error('配置加载失败');
      }
      
      // 创建代理管理器
      this.proxyManager = new ProxyManager({
        rootDir: this.rootDir,
        dataDir: this.config.options.dataDir,
        logger: this.logger
      });
      
      // 创建订阅获取器
      this.subscriptionFetcher = new SubscriptionFetcher({
        rootDir: this.rootDir,
        dataDir: this.config.options.dataDir,
        cacheTtl: this.config.advanced.cacheTtl,
        proxyManager: this.proxyManager,
        useProxy: this.config.advanced.proxyForSubscription,
        logger: this.logger
      });
      
      // 创建节点处理器
      this.nodeProcessor = new NodeProcessor({
        deduplication: this.config.options.deduplication,
        logger: this.logger
      });
      
      // 创建节点测试器
      const testingConfig = this.config.testing || {};
      this.nodeTester = new NodeTester({
        rootDir: this.rootDir,
        dataDir: this.config.options.dataDir,
        concurrency: testingConfig.concurrency || 5,
        timeout: testingConfig.timeout || 5000,
        testUrl: testingConfig.test_url || 'http://www.google.com/generate_204',
        maxLatency: testingConfig.max_latency || 5000,
        filterInvalid: testingConfig.filter_invalid !== false,
        verifyLocation: testingConfig.verify_location === true,
        logger: this.logger
      });
      
      // 创建配置生成器
      this.configGenerator = new ConfigGenerator({
        rootDir: this.rootDir,
        outputDir: this.config.options.outputDir,
        dataDir: this.config.options.dataDir,
        logger: this.logger
      });
      
      this.logger.info('同步管理器初始化完成');
      
      return true;
    } catch (error) {
      this.logger.error(`初始化失败: ${error.message}`);
      this.logger.error(error.stack);
      throw error;
    }
  }

  /**
   * 启动同步程序
   */
  async start() {
    try {
      this.logger.info('开始同步订阅...');
      
      // 检查是否已初始化
      if (!this.config) {
        await this.initialize();
      }
      
      // 获取所有订阅节点
      this.allNodes = await this.fetchAllSubscriptions();
      
      // 处理节点 (去重、过滤等)
      this.processedNodes = await this.processNodes(this.allNodes);
      
      // 测试节点
      if (this.config.testing?.enabled) {
        this.validNodes = await this.testNodes(this.processedNodes);
      } else {
        this.validNodes = this.processedNodes;
        this.logger.info('节点测试已禁用，跳过测试');
      }
      
      // 生成配置文件
      const generatedFiles = await this.generateConfigs(this.validNodes);
      
      this.logger.info(`同步完成，生成了 ${generatedFiles.length} 个配置文件`);
      
      return {
        success: true,
        generatedFiles: generatedFiles,
        allNodesCount: this.allNodes.length,
        processedNodesCount: this.processedNodes.length,
        validNodesCount: this.validNodes.length
      };
    } catch (error) {
      this.logger.error(`同步失败: ${error.message}`);
      this.logger.error(error.stack);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取所有订阅节点
   * @returns {Promise<Array>} 节点数组
   */
  async fetchAllSubscriptions() {
    this.logger.info('开始获取所有订阅...');
    
    // 检查时间限制
    if (this.timeLimit.isNearingLimit(0.5)) {
      this.logger.warn('执行时间接近限制，跳过部分订阅以确保完成');
      // 仅获取部分订阅
      const limitedSubscriptions = this.config.subscriptions.filter(s => s.priority === 'high' || s.enabled === true).slice(0, 3);
      this.logger.info(`限制后的订阅数量: ${limitedSubscriptions.length}`);
      return await this.subscriptionFetcher.fetchAllSubscriptions(limitedSubscriptions);
    }
    
    // 正常获取所有订阅
    return await this.subscriptionFetcher.fetchAllSubscriptions(this.config.subscriptions);
  }

  /**
   * 处理节点
   * @param {Array} nodes 节点数组
   * @returns {Promise<Array>} 处理后的节点数组
   */
  async processNodes(nodes) {
    this.logger.info(`开始处理 ${nodes.length} 个节点...`);
    
    // 处理选项
    const options = {
      maxNodes: this.config.testing?.max_nodes || 0
    };
    
    // 处理节点
    const processedNodes = this.nodeProcessor.processNodes(nodes, options);
    
    this.logger.info(`节点处理完成，处理后的节点数量: ${processedNodes.length}`);
    
    return processedNodes;
  }

  /**
   * 测试节点
   * @param {Array} nodes 节点数组
   * @returns {Promise<Array>} 测试后的节点数组
   */
  async testNodes(nodes) {
    this.logger.info(`开始测试 ${nodes.length} 个节点...`);
    
    // 检查时间限制
    if (this.timeLimit.isNearingLimit(0.7)) {
      this.logger.warn('执行时间接近限制，跳过测试以确保完成');
      return nodes;
    }
    
    // 正常测试节点
    const testedNodes = await this.nodeTester.testNodes(nodes);
    
    this.logger.info(`节点测试完成，有效节点数量: ${testedNodes.length}`);
    
    return testedNodes;
  }

  /**
   * 生成配置文件
   * @param {Array} nodes 节点数组
   * @returns {Promise<Array>} 生成的文件列表
   */
  async generateConfigs(nodes) {
    this.logger.info(`开始生成配置文件...`);
    
    // 生成配置文件
    const generatedFiles = await this.configGenerator.generateConfigs(nodes, this.config.outputConfigs);
    
    this.logger.info(`配置文件生成完成，生成了 ${generatedFiles.length} 个文件`);
    
    return generatedFiles;
  }
} 