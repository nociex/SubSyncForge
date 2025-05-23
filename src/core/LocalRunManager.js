import fs from 'fs/promises';
import path from 'path';
import { SyncManager } from './SyncManager.js';
import { AdvancedNodeTester } from '../tester/AdvancedNodeTester.js';
import { BlacklistManager } from './BlacklistManager.js';
import { SubscriptionConverter } from '../converter/SubscriptionConverter.js';
import { logger } from '../utils/index.js';
import { CronJob } from 'cron';
import yaml from 'js-yaml';

const defaultLogger = logger?.defaultLogger || console;

export class LocalRunManager {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.configPath = options.configPath || path.join(this.rootDir, 'config/custom.yaml');
    this.logger = options.logger || defaultLogger.child({ component: 'LocalRunManager' });
    
    // 核心组件
    this.syncManager = null;
    this.advancedTester = null;
    this.blacklistManager = null;
    this.subscriptionConverter = null;
    
    // 运行状态
    this.isRunning = false;
    this.autoMode = false;
    this.cronJobs = [];
    
    // 配置
    this.config = null;
    this.lastRunTime = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      lastRunResult: null
    };
  }

  /**
   * 初始化管理器
   */
  async initialize() {
    this.logger.info('初始化本地运行管理器...');
    
    try {
      // 加载配置
      await this.loadConfig();
      
      // 初始化黑名单管理器
      this.blacklistManager = new BlacklistManager({
        blacklistFile: path.join(this.rootDir, 'config/blacklist.json'),
        maxFailures: this.config.blacklist?.maxFailures || 3,
        blacklistDuration: this.config.blacklist?.duration || 24 * 60 * 60 * 1000,
        logger: this.logger
      });
      await this.blacklistManager.load();
      
      // 初始化订阅转换器
      this.subscriptionConverter = new SubscriptionConverter({
        logger: this.logger,
        githubUser: this.config.options?.githubUser || '',
        repoName: this.config.options?.repoName || 'SubSyncForge',
        outputDir: this.config.options?.outputDir || 'output'
      });
      
      // 初始化高级测试器
      this.advancedTester = new AdvancedNodeTester({
        coreType: this.config.testing?.coreType || 'mihomo',
        timeout: this.config.testing?.timeout || 8000,
        concurrency: this.config.testing?.concurrency || 10,
        useCoreTest: this.config.testing?.useCoreTest !== false,
        fallbackToBasic: this.config.testing?.fallbackToBasic !== false,
        verifyLocation: this.config.testing?.verifyLocation !== false,
        logger: this.logger
      });
      
      // 初始化同步管理器
      this.syncManager = new SyncManager({
        rootDir: this.rootDir,
        configPath: this.configPath,
        logLevel: 'info'
      });
      await this.syncManager.initialize();
      
      this.logger.info('本地运行管理器初始化完成');
      return true;
      
    } catch (error) {
      this.logger.error(`初始化失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 加载配置文件
   */
  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      this.config = yaml.load(configData);
      
      // 设置默认配置
      this.config.blacklist = this.config.blacklist || {};
      this.config.localRun = this.config.localRun || {};
      this.config.testing = this.config.testing || {};
      
      this.logger.info('配置文件加载完成');
      return this.config;
      
    } catch (error) {
      this.logger.error(`加载配置文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 手动模式1: 更新订阅测试并重命名
   */
  async runMode1UpdateAndTest() {
    this.logger.info('🚀 开始执行模式1: 更新订阅测试并重命名');
    
    const startTime = Date.now();
    let result = {
      mode: 'update_and_test',
      success: false,
      startTime: new Date().toISOString(),
      steps: {},
      error: null
    };
    
    try {
      // 步骤1: 更新订阅
      this.logger.info('📥 步骤1: 更新订阅数据');
      result.steps.updateSubscription = await this.updateSubscriptions();
      
      // 步骤2: 过滤黑名单节点
      this.logger.info('🚫 步骤2: 过滤黑名单节点');
      const filteredNodes = this.blacklistManager.filterNodes(result.steps.updateSubscription.nodes);
      result.steps.filterBlacklist = {
        originalCount: result.steps.updateSubscription.nodes.length,
        filteredCount: filteredNodes.length,
        removedCount: result.steps.updateSubscription.nodes.length - filteredNodes.length
      };
      
      // 步骤3: 高级测试节点
      this.logger.info('🔍 步骤3: 高级测试节点连接性');
      const testResults = await this.advancedTester.testNodes(filteredNodes);
      result.steps.nodeTest = this.advancedTester.getTestStatistics(testResults);
      
      // 步骤4: 更新黑名单
      this.logger.info('📝 步骤4: 更新黑名单记录');
      for (const testResult of testResults) {
        const isSuccess = testResult.status === 'up';
        const error = testResult.error;
        await this.blacklistManager.recordResult(testResult.node, isSuccess, error);
      }
      
      // 步骤5: 修正节点名称
      this.logger.info('✏️ 步骤5: 修正节点位置和名称');
      const successfulNodes = testResults.filter(r => r.status === 'up').map(r => r.node);
      const correctedNodes = this.advancedTester.correctNodeLocations(successfulNodes, testResults);
      result.steps.nameCorrection = {
        totalNodes: successfulNodes.length,
        correctedNodes: correctedNodes.filter(n => n.extra?.originalName).length
      };
      
      // 步骤6: 生成配置文件
      this.logger.info('📄 步骤6: 生成配置文件');
      result.steps.generateConfigs = await this.generateConfigs(correctedNodes);
      
      result.success = true;
      result.duration = Date.now() - startTime;
      result.endTime = new Date().toISOString();
      
      this.logger.info(`✅ 模式1执行完成，用时 ${result.duration}ms`);
      await this.saveRunResult(result);
      
      return result;
      
    } catch (error) {
      result.success = false;
      result.error = error.message;
      result.duration = Date.now() - startTime;
      result.endTime = new Date().toISOString();
      
      this.logger.error(`❌ 模式1执行失败: ${error.message}`);
      await this.saveRunResult(result);
      throw error;
    }
  }

  /**
   * 手动模式2: 从现有配置构建mihomo测试
   */
  async runMode2ConfigTest() {
    this.logger.info('🚀 开始执行模式2: 从现有配置构建mihomo测试');
    
    const startTime = Date.now();
    let result = {
      mode: 'config_test',
      success: false,
      startTime: new Date().toISOString(),
      steps: {},
      error: null
    };
    
    try {
      // 步骤1: 读取现有配置文件中的节点
      this.logger.info('📖 步骤1: 读取现有配置文件');
      const existingNodes = await this.loadExistingNodes();
      result.steps.loadNodes = {
        totalNodes: existingNodes.length,
        sources: Object.keys(existingNodes.reduce((acc, node) => {
          acc[node.source || 'unknown'] = true;
          return acc;
        }, {}))
      };
      
      // 步骤2: 过滤黑名单节点
      this.logger.info('🚫 步骤2: 过滤黑名单节点');
      const filteredNodes = this.blacklistManager.filterNodes(existingNodes);
      result.steps.filterBlacklist = {
        originalCount: existingNodes.length,
        filteredCount: filteredNodes.length,
        removedCount: existingNodes.length - filteredNodes.length
      };
      
      // 步骤3: 使用mihomo核心测试
      this.logger.info('🔍 步骤3: 使用mihomo核心测试节点');
      await this.advancedTester.setCoreType('mihomo');
      const testResults = await this.advancedTester.testNodes(filteredNodes);
      result.steps.nodeTest = this.advancedTester.getTestStatistics(testResults);
      
      // 步骤4: 更新黑名单
      this.logger.info('📝 步骤4: 更新黑名单记录');
      for (const testResult of testResults) {
        const isSuccess = testResult.status === 'up';
        const error = testResult.error;
        await this.blacklistManager.recordResult(testResult.node, isSuccess, error);
      }
      
      // 步骤5: 修正节点位置和名称
      this.logger.info('✏️ 步骤5: 修正节点位置和名称');
      const successfulNodes = testResults.filter(r => r.status === 'up').map(r => r.node);
      const correctedNodes = this.advancedTester.correctNodeLocations(successfulNodes, testResults);
      result.steps.nameCorrection = {
        totalNodes: successfulNodes.length,
        correctedNodes: correctedNodes.filter(n => n.extra?.originalName).length
      };
      
      // 步骤6: 生成mihomo配置
      this.logger.info('📄 步骤6: 生成mihomo配置文件');
      result.steps.generateMihomoConfig = await this.generateMihomoConfig(correctedNodes);
      
      result.success = true;
      result.duration = Date.now() - startTime;
      result.endTime = new Date().toISOString();
      
      this.logger.info(`✅ 模式2执行完成，用时 ${result.duration}ms`);
      await this.saveRunResult(result);
      
      return result;
      
    } catch (error) {
      result.success = false;
      result.error = error.message;
      result.duration = Date.now() - startTime;
      result.endTime = new Date().toISOString();
      
      this.logger.error(`❌ 模式2执行失败: ${error.message}`);
      await this.saveRunResult(result);
      throw error;
    }
  }

  /**
   * 启动自动模式
   */
  async startAutoMode() {
    if (this.autoMode) {
      this.logger.warn('自动模式已在运行中');
      return;
    }
    
    this.logger.info('🤖 启动自动模式');
    this.autoMode = true;
    
    // 设置定时任务
    const scheduleConfig = this.config.localRun.schedule || {};
    
    // 模式1定时任务 (默认每6小时)
    if (scheduleConfig.mode1 !== false) {
      const mode1Cron = scheduleConfig.mode1?.cron || '0 */6 * * *';
      const mode1Job = new CronJob(
        mode1Cron,
        () => this.runMode1UpdateAndTest().catch(err => 
          this.logger.error(`自动模式1执行失败: ${err.message}`)
        ),
        null,
        true,
        'Asia/Shanghai'
      );
      
      this.cronJobs.push({ name: 'mode1', job: mode1Job });
      this.logger.info(`已设置模式1定时任务: ${mode1Cron}`);
    }
    
    // 模式2定时任务 (默认每2小时)
    if (scheduleConfig.mode2 !== false) {
      const mode2Cron = scheduleConfig.mode2?.cron || '0 */2 * * *';
      const mode2Job = new CronJob(
        mode2Cron,
        () => this.runMode2ConfigTest().catch(err => 
          this.logger.error(`自动模式2执行失败: ${err.message}`)
        ),
        null,
        true,
        'Asia/Shanghai'
      );
      
      this.cronJobs.push({ name: 'mode2', job: mode2Job });
      this.logger.info(`已设置模式2定时任务: ${mode2Cron}`);
    }
    
    // 黑名单清理任务 (默认每天凌晨2点)
    const cleanupCron = scheduleConfig.cleanup?.cron || '0 2 * * *';
    const cleanupJob = new CronJob(
      cleanupCron,
      () => this.blacklistManager.cleanup().catch(err => 
        this.logger.error(`黑名单清理失败: ${err.message}`)
      ),
      null,
      true,
      'Asia/Shanghai'
    );
    
    this.cronJobs.push({ name: 'cleanup', job: cleanupJob });
    this.logger.info(`已设置黑名单清理任务: ${cleanupCron}`);
    
    this.logger.info(`🤖 自动模式已启动，共 ${this.cronJobs.length} 个定时任务`);
  }

  /**
   * 停止自动模式
   */
  stopAutoMode() {
    if (!this.autoMode) {
      this.logger.warn('自动模式未在运行');
      return;
    }
    
    this.logger.info('⏹️ 停止自动模式');
    
    // 停止所有定时任务
    this.cronJobs.forEach(({ name, job }) => {
      job.stop();
      this.logger.info(`已停止定时任务: ${name}`);
    });
    
    this.cronJobs = [];
    this.autoMode = false;
    
    this.logger.info('⏹️ 自动模式已停止');
  }

  /**
   * 更新订阅数据
   */
  async updateSubscriptions() {
    this.logger.info('📥 开始更新订阅数据');
    
    const syncResult = await this.syncManager.start();
    const nodes = await this.syncManager.fetchAllSubscriptions();
    
    return {
      totalNodes: syncResult.totalNodes,
      validNodes: syncResult.validNodes,
      outputs: syncResult.outputs,
      nodes: nodes
    };
  }

  /**
   * 读取现有配置文件中的节点
   */
  async loadExistingNodes() {
    const outputDir = path.join(this.rootDir, this.config.options?.outputDir || 'output');
    const nodes = [];
    
    try {
      const files = await fs.readdir(outputDir);
      
      for (const file of files) {
        const filePath = path.join(outputDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        
        // 处理YAML配置文件
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          try {
            const config = yaml.load(content);
            
            // 检查 proxies 字段
            if (config.proxies && Array.isArray(config.proxies) && config.proxies.length > 0) {
              config.proxies.forEach(proxy => {
                nodes.push({
                  name: proxy.name,
                  type: proxy.type,
                  server: proxy.server,
                  port: proxy.port,
                  ...proxy,
                  source: file
                });
              });
            }
          } catch (yamlError) {
            this.logger.warn(`解析YAML文件失败 ${file}: ${yamlError.message}`);
          }
        }
        
        // 处理TXT文件（节点链接格式）
        else if (file.endsWith('.txt') && file !== 'all.txt') {
          try {
            const lines = content.split('\n').filter(line => 
              line.trim() && 
              !line.startsWith('#') && 
              (line.startsWith('vmess://') || 
               line.startsWith('vless://') || 
               line.startsWith('ss://') || 
               line.startsWith('trojan://') ||
               line.startsWith('hysteria2://') ||
               line.startsWith('tuic://'))
            );
            
            // 使用订阅转换器解析节点链接
            for (const line of lines) {
              try {
                const parsedNodes = await this.subscriptionConverter.parseSubscription(line.trim());
                if (parsedNodes && parsedNodes.length > 0) {
                  parsedNodes.forEach(node => {
                    nodes.push({
                      ...node,
                      source: file
                    });
                  });
                }
              } catch (parseError) {
                this.logger.debug(`解析节点链接失败: ${line.substring(0, 50)}... - ${parseError.message}`);
              }
            }
          } catch (txtError) {
            this.logger.warn(`解析TXT文件失败 ${file}: ${txtError.message}`);
          }
        }
        
        // 处理JSON文件
        else if (file.endsWith('.json') && file !== 'nodes.json') {
          try {
            const config = JSON.parse(content);
            
            // Sing-box格式
            if (config.outbounds && Array.isArray(config.outbounds)) {
              config.outbounds.forEach(outbound => {
                if (outbound.type && outbound.server) {
                  nodes.push({
                    name: outbound.tag || `${outbound.type}-${outbound.server}`,
                    type: outbound.type,
                    server: outbound.server,
                    port: outbound.server_port || outbound.port,
                    ...outbound,
                    source: file
                  });
                }
              });
            }
            
            // V2Ray格式
            if (config.outbounds && Array.isArray(config.outbounds)) {
              config.outbounds.forEach(outbound => {
                if (outbound.protocol && outbound.settings) {
                  const settings = outbound.settings;
                  if (settings.vnext && Array.isArray(settings.vnext)) {
                    settings.vnext.forEach(server => {
                      nodes.push({
                        name: `${outbound.protocol}-${server.address}`,
                        type: outbound.protocol,
                        server: server.address,
                        port: server.port,
                        settings: server,
                        source: file
                      });
                    });
                  }
                }
              });
            }
          } catch (jsonError) {
            this.logger.warn(`解析JSON文件失败 ${file}: ${jsonError.message}`);
          }
        }
      }
      
      this.logger.info(`从 ${files.length} 个配置文件中读取了 ${nodes.length} 个节点`);
      
      // 过滤重复节点
      const uniqueNodes = [];
      const seenNodes = new Set();
      
      for (const node of nodes) {
        const nodeKey = `${node.server}:${node.port}:${node.type}`;
        if (!seenNodes.has(nodeKey)) {
          seenNodes.add(nodeKey);
          uniqueNodes.push(node);
        }
      }
      
      if (uniqueNodes.length < nodes.length) {
        this.logger.info(`去重后保留 ${uniqueNodes.length} 个唯一节点`);
      }
      
      return uniqueNodes;
      
    } catch (error) {
      this.logger.error(`读取现有配置失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 生成配置文件
   */
  async generateConfigs(nodes) {
    this.logger.info(`📄 生成配置文件，节点数量: ${nodes.length}`);
    
    // 使用现有的配置生成器
    if (this.config.outputs && Array.isArray(this.config.outputs)) {
      await this.syncManager.configGenerator.generateConfigs(nodes, this.config.outputs);
      return {
        configCount: this.config.outputs.filter(o => o.enabled !== false).length,
        nodeCount: nodes.length
      };
    }
    
    return { configCount: 0, nodeCount: nodes.length };
  }

  /**
   * 生成mihomo配置
   */
  async generateMihomoConfig(nodes) {
    this.logger.info(`📄 生成mihomo配置，节点数量: ${nodes.length}`);
    
    const outputPath = path.join(this.rootDir, this.config.options?.outputDir || 'output', 'mihomo-test.yaml');
    
    const mihomoConfig = {
      port: 7890,
      "socks-port": 7891,
      "allow-lan": true,
      mode: "rule",
      "log-level": "info",
      "external-controller": "127.0.0.1:9090",
      proxies: nodes.map(node => this.advancedTester.coreManager.convertNodeToMihomoProxy(node)),
      "proxy-groups": [
        {
          name: "🚀 节点选择",
          type: "select",
          proxies: ["♻️ 自动选择", "🎯 全球直连", ...nodes.map(n => n.name)]
        },
        {
          name: "♻️ 自动选择",
          type: "url-test",
          proxies: nodes.map(n => n.name),
          url: "http://www.gstatic.com/generate_204",
          interval: 300
        },
        {
          name: "🎯 全球直连",
          type: "select",
          proxies: ["DIRECT"]
        }
      ],
      rules: [
        "DOMAIN-SUFFIX,local,DIRECT",
        "IP-CIDR,127.0.0.0/8,DIRECT",
        "IP-CIDR,172.16.0.0/12,DIRECT",
        "IP-CIDR,192.168.0.0/16,DIRECT",
        "IP-CIDR,10.0.0.0/8,DIRECT",
        "IP-CIDR,17.0.0.0/8,DIRECT",
        "IP-CIDR,100.64.0.0/10,DIRECT",
        "MATCH,🚀 节点选择"
      ]
    };
    
    await fs.writeFile(outputPath, yaml.dump(mihomoConfig, { indent: 2 }));
    this.logger.info(`mihomo配置已保存到: ${outputPath}`);
    
    return {
      configPath: outputPath,
      nodeCount: nodes.length,
      proxyGroups: mihomoConfig["proxy-groups"].length
    };
  }

  /**
   * 保存运行结果
   */
  async saveRunResult(result) {
    try {
      const resultPath = path.join(this.rootDir, 'config', 'last_run_result.json');
      await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
      
      this.lastRunTime = new Date();
      this.stats.totalRuns++;
      if (result.success) {
        this.stats.successfulRuns++;
      }
      this.stats.lastRunResult = result;
      
      this.logger.debug(`运行结果已保存到: ${resultPath}`);
    } catch (error) {
      this.logger.error(`保存运行结果失败: ${error.message}`);
    }
  }

  /**
   * 获取运行状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      autoMode: this.autoMode,
      lastRunTime: this.lastRunTime,
      stats: this.stats,
      activeCronJobs: this.cronJobs.map(({ name, job }) => ({
        name,
        nextRun: job.nextDates().toISOString()
      })),
      blacklistStats: this.blacklistManager ? this.blacklistManager.getStatistics() : null
    };
  }

  /**
   * 获取黑名单报告
   */
  async getBlacklistReport() {
    if (!this.blacklistManager) {
      await this.initialize();
    }
    return this.blacklistManager.exportReport();
  }

  /**
   * 手动管理黑名单
   */
  async manageBlacklist(action, nodeInfo, reason) {
    if (!this.blacklistManager) {
      await this.initialize();
    }
    
    switch (action) {
      case 'add':
        await this.blacklistManager.addToBlacklist(nodeInfo, reason);
        break;
      case 'remove':
        await this.blacklistManager.removeFromBlacklist(nodeInfo);
        break;
      case 'reset':
        await this.blacklistManager.reset();
        break;
      default:
        throw new Error(`未知的黑名单操作: ${action}`);
    }
  }
}

export default LocalRunManager; 