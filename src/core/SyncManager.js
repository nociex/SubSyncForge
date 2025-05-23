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
import { AdvancedNodeTester } from '../tester/AdvancedNodeTester.js';
import { NodeAnalyzer } from '../converter/analyzer/NodeAnalyzer.js';

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
      this.nodeTester = new AdvancedNodeTester({
        logger: this.logger,
        rootDir: this.rootDir,
        dataDir: this.config.options.dataDir,
        coreType: testingConfig.coreType || 'mihomo',
        useCoreTest: testingConfig.useCoreTest !== false,
        fallbackToBasic: testingConfig.fallbackToBasic !== false,
        autoRename: testingConfig.autoRename !== false,
        verifyLocation: testingConfig.verifyLocation !== false,
        timeout: testingConfig.timeout || 8000,
        concurrency: testingConfig.concurrency || 10,
        maxLatency: testingConfig.maxLatency || 5000,
        filterUnreasonableLatency: testingConfig.filterUnreasonableLatency !== false,
        ...testingConfig
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
    
    if (!Array.isArray(nodes) || nodes.length === 0) {
      this.logger.warn('没有节点需要测试');
      return [];
    }
    
    // 使用高级节点测试器进行测试，自动包含IP定位和重命名功能
    const testResults = await this.nodeTester.testNodes(nodes);
    
    // 处理测试结果，确保正确设置valid属性
    const allTestedNodes = testResults.map(result => {
      const node = { ...result.node };
      
      // 设置节点的有效性和延迟信息
      if (result.status === 'up') {
        node.valid = true;
        node.latency = result.latency || null;
        node.error = null;
      } else {
        node.valid = false;
        node.latency = null;
        node.error = result.error || 'Connection failed';
      }
      
      // 保留其他测试信息
      if (result.locationInfo) {
        node.locationInfo = result.locationInfo;
      }
      
      return node;
    });

    // 如果启用了自动重命名，对所有测试成功的节点进行统一重命名
    const validNodes = allTestedNodes.filter(node => node.valid === true);
    if (this.config.testing?.autoRename !== false && validNodes.length > 0) {
      this.logger.info(`开始对 ${validNodes.length} 个有效节点进行统一重命名...`);
      
      // 创建节点管理器进行重命名
      const nodeManager = new NodeManager();
      
      // 对有效节点进行分析和重命名
      const { nodes: analyzedValidNodes } = nodeManager.processNodes(validNodes);
      const renamedValidNodes = nodeManager.renameNodes(analyzedValidNodes, {
        format: '{country}-{protocol}-{number}',
        includeCountry: true,
        includeProtocol: true,
        includeNumber: true,
        includeTags: false
      });
      
      // 更新allTestedNodes中的有效节点
      let validIndex = 0;
      for (let i = 0; i < allTestedNodes.length; i++) {
        if (allTestedNodes[i].valid === true) {
          // 保留原始测试信息，只更新名称和分析信息
          allTestedNodes[i] = {
            ...allTestedNodes[i],
            ...renamedValidNodes[validIndex],
            valid: true,  // 确保保持有效状态
            latency: allTestedNodes[i].latency,  // 保留延迟信息
            locationInfo: allTestedNodes[i].locationInfo  // 保留定位信息
          };
          validIndex++;
        }
      }
      
      this.logger.info(`节点重命名完成，${validNodes.length} 个节点已使用统一命名格式`);
    }
    
    // 筛选成功的节点
    const finalValidNodes = allTestedNodes.filter(node => node.valid === true);
    
    this.logger.info(`测试完成: ${finalValidNodes.length}/${nodes.length} 个节点可用`);
    
    // 显示测试统计信息
    const stats = this.nodeTester.getTestStatistics(testResults);
    this.logger.info(`测试统计: 成功率 ${stats.successRate}, 平均延迟 ${stats.averageLatency}ms`);
    
    if (stats.needLocationCorrection > 0) {
      this.logger.info(`已自动修正 ${stats.needLocationCorrection} 个节点的地区信息`);
    }
    
    // 显示测试方法分布
    this.logger.info('测试方法统计:');
    Object.entries(stats.methodStatistics).forEach(([method, count]) => {
      this.logger.info(`  - ${method}: ${count} 个节点`);
    });
    
    // 返回所有测试过的节点（包括失败的），让NodeProcessor根据配置决定是否过滤
    return allTestedNodes;
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