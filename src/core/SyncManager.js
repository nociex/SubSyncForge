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
import { SubscriptionConverter } from '../converter/SubscriptionConverter.js';
import { NodeManager } from '../converter/analyzer/index.js';
import fs from 'fs';
import { ensureDirectoryExists } from './utils/FileSystem.js';
import yaml from 'js-yaml';

export class SyncManager {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    // 基本路径配置
    this.rootDir = options.rootDir || process.cwd();
    this.configPath = options.configPath || path.join(this.rootDir, 'config/custom.yaml');
    this.subscriptionsPath = options.subscriptionsPath || path.join(this.rootDir, 'config/subscriptions.json');
    this.customConfigPath = options.customConfigPath || path.join(this.rootDir, 'config/custom.yaml');
    
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
      
      // 创建订阅转换器
      this.subscriptionConverter = new SubscriptionConverter({
        logger: this.logger,
        githubUser: this.config.options.githubUser || '',
        repoName: this.config.options.repoName || 'SubSyncForge',
        outputDir: this.config.options.outputDir || 'output'
      });
      
      // 创建订阅获取器
      this.subscriptionFetcher = new SubscriptionFetcher({
        rootDir: this.rootDir,
        dataDir: this.config.options.dataDir,
        cacheTtl: this.config.advanced.cacheTtl,
        proxyManager: this.proxyManager,
        useProxy: this.config.advanced.proxyForSubscription,
        converter: this.subscriptionConverter,
        logger: this.logger
      });
      
      // 创建节点处理器
      this.nodeProcessor = new NodeProcessor({
        deduplication: this.config.options.deduplication,
        filterIrrelevant: this.config.options.filterIrrelevant !== false,
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
        minLatency: testingConfig.min_latency || 0,
        filterInvalid: testingConfig.filter_invalid !== false,
        filterUnreasonableLatency: testingConfig.filter_unreasonable_latency !== false,
        verifyLocation: testingConfig.verify_location === true,
        logger: this.logger
      });
      
      // 创建配置生成器
      this.configGenerator = new ConfigGenerator({
        rootDir: this.rootDir,
        outputDir: this.config.options.outputDir,
        dataDir: this.config.options.dataDir,
        githubUser: this.config.options.githubUser || '',
        repoName: this.config.options.repoName || 'SubSyncForge',
        converter: this.subscriptionConverter,
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
   * 开始同步处理
   * @returns {Promise<void>}
   */
  async start() {
    try {
      this.logger.info('开始同步订阅...');
      
      // 检查是否已初始化
      if (!this.config) {
        await this.initialize();
      }
      
      // 获取所有订阅
      const nodes = await this.fetchAllSubscriptions();
      
      // 分析和初步处理节点，但不过滤有效性
      this.logger.info(`开始处理 ${nodes.length} 个节点...`);
      
      // 创建节点管理器，用于分析节点
      const nodeManager = new NodeManager();
      
      // 分析节点，添加地区、服务等标记
      this.logger.info(`开始分析节点...`);
      const { nodes: analyzedNodes } = nodeManager.processNodes(nodes);
      this.logger.info(`节点分析完成`);
      
      // 初步处理节点（不过滤有效性）
      const options = {
        maxNodes: this.config.testing?.max_nodes || 0,
        onlyValid: false // 初步处理时不过滤有效性
      };
      const initialProcessedNodes = this.nodeProcessor.processNodes(analyzedNodes, options);
      
      // 测试节点
      let testedNodes = initialProcessedNodes;
      if (this.config.testing?.enabled !== false) {
        testedNodes = await this.testNodes(initialProcessedNodes);
      }
      
      // 最终处理节点（根据配置过滤有效性）
      const finalOptions = {
        maxNodes: this.config.testing?.max_nodes || 500, // 设置默认最大节点数为500
        maxNodesPerType: this.config.testing?.max_nodes_per_type || 50, // 每种类型最大节点数
        maxNodesPerRegion: this.config.testing?.max_nodes_per_region || 30, // 每个地区最大节点数
        onlyValid: this.config.testing?.filter_invalid !== false // 根据配置决定是否只保留有效节点
      };
      const processedNodes = this.nodeProcessor.processNodes(testedNodes, finalOptions);
      
      // 初始化配置生成器
      this.configGenerator = new ConfigGenerator({
        rootDir: this.rootDir,
        outputDir: this.config.options?.outputDir || 'output',
        dataDir: this.config.options?.dataDir || 'data',
        logger: this.logger
      });
      
      // 生成配置文件
      if (this.config.outputs && Array.isArray(this.config.outputs)) {
        this.logger.info('=== 开始生成配置文件 ===');
        await this.configGenerator.generateConfigs(processedNodes, this.config.outputs);
        
        // 完成
        this.logger.info('同步完成，生成了 ' + this.config.outputs.filter(o => o.enabled !== false).length + ' 个配置文件');
        
        return {
          totalNodes: nodes.length,
          validNodes: processedNodes.length,
          outputs: this.config.outputs.filter(o => o.enabled !== false).length
        };
      } else if (this.config.outputConfigs && this.config.outputConfigs.outputs) {
        // 向后兼容旧格式
        this.logger.info('=== 开始生成配置文件（使用旧格式配置）===');
        await this.configGenerator.generateConfigs(processedNodes, this.config.outputConfigs.outputs);
        
        // 完成
        this.logger.info('同步完成，生成了 ' + this.config.outputConfigs.outputs.filter(o => o.enabled !== false).length + ' 个配置文件');
        
        return {
          totalNodes: nodes.length,
          validNodes: processedNodes.length,
          outputs: this.config.outputConfigs.outputs.filter(o => o.enabled !== false).length
        };
      } else {
        // 没有有效的输出配置
        this.logger.info('没有找到有效的输出配置，同步过程完成但未生成任何文件');
        
        return {
          totalNodes: nodes.length,
          validNodes: processedNodes.length,
          outputs: 0
        };
      }
    } catch (error) {
      this.logger.error('同步处理出错:', error.message);
      throw error;
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
    
    // 记录节点类型分布
    const nodeTypes = {};
    nodes.forEach(node => {
      if (node && node.type) {
        nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;
      }
    });
    this.logger.info(`测试前节点类型分布: ${JSON.stringify(nodeTypes)}`);
    
    // 正常测试节点
    const testedNodes = await this.nodeTester.testNodes(nodes);
    
    // 分析测试结果
    const validNodes = testedNodes.filter(node => node.valid);
    const invalidNodes = testedNodes.filter(node => !node.valid);
    
    // 汇总无效原因
    const errorCounts = {};
    invalidNodes.forEach(node => {
      if (node.error) {
        errorCounts[node.error] = (errorCounts[node.error] || 0) + 1;
      }
    });
    
    // 有效节点类型分布
    const validNodeTypes = {};
    validNodes.forEach(node => {
      if (node && node.type) {
        validNodeTypes[node.type] = (validNodeTypes[node.type] || 0) + 1;
      }
    });
    
    this.logger.info(`节点测试完成，有效节点数量: ${validNodes.length}/${testedNodes.length}`);
    this.logger.info(`有效节点类型分布: ${JSON.stringify(validNodeTypes)}`);
    
    if (Object.keys(errorCounts).length > 0) {
      this.logger.info(`无效节点错误分布: ${JSON.stringify(errorCounts)}`);
    }
    
    // 保存测试状态到文件
    this.saveTestStatus({
      timestamp: new Date().toISOString(),
      totalNodes: testedNodes.length,
      validNodes: validNodes.length,
      invalidNodes: invalidNodes.length,
      errorDistribution: errorCounts,
      typeDistribution: validNodeTypes
    });
    
    // 重要修复：IP检测后重新进行节点分析和分类
    this.logger.info(`IP检测完成，开始重新分析和分类节点...`);
    
    // 创建节点管理器，用于重新分析节点
    const nodeManager = new NodeManager();
    
    // 重新分析测试后的节点，添加地区、服务等标记
    this.logger.info(`开始重新分析节点...`);
    const { nodes: reanalyzedNodes } = nodeManager.processNodes(validNodes); // 只对有效节点进行重新分析
    this.logger.info(`节点重新分析完成`);
    
    // 使用NodeAnalyzer重命名节点，确保格式为"国家+协议+编号"
    this.logger.info(`开始按统一格式重命名节点...`);
    const renamedNodes = nodeManager.renameNodes(reanalyzedNodes, {
      format: '{country}-{protocol}-{number}',
      includeCountry: true,
      includeProtocol: true,
      includeNumber: true,
      includeTags: false
    });
    
    // 确保节点名称不重复
    const uniqueNameMap = new Map();
    let uniqueNodes = [];
    
    renamedNodes.forEach((node, index) => {
      // 如果名称已存在，则添加后缀以确保唯一性
      let baseName = node.name;
      let uniqueName = baseName;
      let counter = 1;
      
      while (uniqueNameMap.has(uniqueName)) {
        uniqueName = `${baseName}-${counter}`;
        counter++;
      }
      
      uniqueNameMap.set(uniqueName, true);
      uniqueNodes.push({
        ...node,
        name: uniqueName
      });
    });
    
    this.logger.info(`节点重命名完成，最终有效节点数量: ${uniqueNodes.length}`);
    
    return uniqueNodes;
  }

  /**
   * 保存测试状态到文件
   * @param {Object} status 测试状态
   */
  saveTestStatus(status) {
    try {
      const statusPath = path.join(this.rootDir, this.config.options.dataDir, 'test_status.json');
      fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
      this.logger.info(`测试状态已保存到: ${statusPath}`);
    } catch (error) {
      this.logger.error(`保存测试状态失败: ${error.message}`);
    }
  }
} 