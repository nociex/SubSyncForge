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

      // 获取所有订阅配置
      let subscriptions = this.config.subscriptions;

      // 检查时间限制
      if (this.timeLimit.isNearingLimit(0.5)) {
        this.logger.warn('执行时间接近限制，跳过部分订阅以确保完成');
        subscriptions = subscriptions.filter(s => s.priority === 'high' || s.enabled === true).slice(0, 3);
      } else {
        subscriptions = subscriptions.filter(s => s.enabled !== false);
      }

      this.logger.info(`准备处理 ${subscriptions.length} 个订阅源...`);

      // 创建节点管理器
      const nodeManager = new NodeManager();

      // 逐个处理订阅：获取 -> 分析 -> 测试
      let allNodes = [];

      for (const sub of subscriptions) {
        try {
          this.logger.info(`>>> 处理订阅源: ${sub.name} <<<`);

          // 1. 获取
          const result = await this.subscriptionFetcher.fetchSubscription(sub);
          if (!result || !result.nodes || result.nodes.length === 0) {
            this.logger.warn(`订阅 ${sub.name} 未获取到节点`);
            continue;
          }
          this.logger.info(`获取到 ${result.nodes.length} 个节点`);

          // 2. 分析 (添加地区、类型等)
          const { nodes: analyzedNodes } = nodeManager.processNodes(result.nodes);

          // 3. 测试 (如果启用)
          let currentBatchNodes = analyzedNodes;
          if (this.config.testing?.enabled !== false) {
            // 即使只有一个节点也走测试流程，保证一致性
            // processNodes 只是简单的分析，不负责过滤无效节点（除了根据配置）
            // 这里我们可以在测试前先做一次简单的过滤？
            // 不，AdvancedNodeTester 会处理
            this.logger.info(`正在单独测试订阅 ${sub.name} 的 ${currentBatchNodes.length} 个节点...`);
            currentBatchNodes = await this.testNodes(currentBatchNodes);
          }

          allNodes = allNodes.concat(currentBatchNodes);

        } catch (subErr) {
          this.logger.error(`处理订阅 ${sub.name} 时出错: ${subErr.message}`);
        }
      }

      this.logger.info(`所有订阅处理完成。总计有效节点(测试后): ${allNodes.filter(n => n.valid).length} / ${allNodes.length}`);

      // 最终处理节点（去重、过滤、排序等）
      const finalOptions = {
        maxNodes: this.config.testing?.max_nodes || 1000,
        maxNodesPerType: this.config.testing?.max_nodes_per_type || 200,
        maxNodesPerRegion: this.config.testing?.max_nodes_per_region || 100,
        onlyValid: this.config.testing?.filter_invalid !== false
      };

      // NodeProcessor 此时进行去重和最终筛选
      const processedNodes = this.nodeProcessor.processNodes(allNodes, finalOptions);

      // 初始化配置生成器
      this.configGenerator = new ConfigGenerator({
        rootDir: this.rootDir,
        outputDir: this.config.options?.outputDir || 'output',
        dataDir: this.config.options?.dataDir || 'data',
        logger: this.logger
      });

      // 生成配置文件
      const outputs = this.config.outputs || (this.config.outputConfigs ? this.config.outputConfigs.outputs : []);

      if (outputs && Array.isArray(outputs)) {
        this.logger.info('=== 开始生成配置文件 ===');
        await this.configGenerator.generateConfigs(processedNodes, outputs);

        const outputCount = outputs.filter(o => o.enabled !== false).length;
        this.logger.info('同步完成，生成了 ' + outputCount + ' 个配置文件');

        return {
          totalNodes: allNodes.length,
          validNodes: processedNodes.length,
          outputs: outputCount
        };
      } else {
        // ... empty ...
        this.logger.info('没有找到有效的输出配置');
        return { totalNodes: allNodes.length, validNodes: processedNodes.length, outputs: 0 };
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

    const allTestedNodes = testResults.map(result => {
      const node = result.node;

      if (result.status === 'up') {
        node.valid = true;
        node.latency = result.latency || null;
        node.error = null;
      } else {
        node.valid = false;
        node.latency = null;
        node.error = result.error || 'Connection failed';
      }

      if (result.locationInfo) {
        node.locationInfo = result.locationInfo;
      }

      return node;
    });

    const validNodes = allTestedNodes.filter(node => node.valid === true);
    this.logger.info(`测试完成: ${validNodes.length}/${nodes.length} 个节点可用`);

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