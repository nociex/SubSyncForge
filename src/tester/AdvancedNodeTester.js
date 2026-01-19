import { ProxyCoreManager } from '../core/ProxyCoreManager.js';
import { NodeTester } from './NodeTester.js';
import { IPLocator } from '../utils/proxy/IPLocator.js';
import { NodeAnalyzer } from '../converter/analyzer/NodeAnalyzer.js';
import { logger } from '../utils/index.js';
import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from '../core/utils/FileSystem.js';
import { PortFinder } from '../core/utils/PortFinder.js';
import { SubconverterClient } from '../core/utils/SubconverterClient.js';
import { ConfigGenerator } from '../core/output/ConfigGenerator.js';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import http from 'http';
import yaml from 'js-yaml';

const defaultLogger = logger?.defaultLogger || console;



export class AdvancedNodeTester extends NodeTester {
  constructor(options = {}) {
    super(options);

    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';

    this.useCoreTest = options.useCoreTest !== false; // 默认启用核心测试
    this.coreType = options.coreType || 'mihomo'; // 'mihomo' | 'v2ray' | 'singbox'
    this.fallbackToBasic = options.fallbackToBasic !== false; // 失败时回退到基本测试
    this.autoRename = options.autoRename !== false; // 默认启用自动重命名
    this.maxLatency = options.maxLatency || 3000; // 最大延迟限制，默认3秒
    this.coreFailureCount = 0;
    this.maxCoreFailures = options.maxCoreFailures || 3;

    // 初始化代理核心管理器
    this.coreManager = new ProxyCoreManager({
      coreType: this.coreType,
      timeout: this.timeout,
      testUrl: this.testUrl,
      logger: this.logger
    });

    // Subconverter setup
    this.subconverter = new SubconverterClient();
    this.configGenerator = new ConfigGenerator({ logger: this.logger });
    this.controllerPort = 0;
    this.mixedPort = 0;
    this.secret = 'subsync-test';

    // 初始化IP定位器
    this.ipLocator = new IPLocator({
      rootDir: options.rootDir || process.cwd(),
      dataDir: options.dataDir || 'data',
      logger: this.logger
    });

    this.logger.info(`高级节点测试器已初始化，核心类型: ${this.coreType}，自动重命名: ${this.autoRename}，延迟限制: ${this.maxLatency}ms`);
  }

  /**
   * 批量测试节点
   * @param {Array<Object>} nodes - 节点列表
   * @returns {Promise<Array<Object>>} - 测试结果
   */
  async testNodes(nodes) {
    this.logger.info(`开始高级测试 ${nodes.length} 个节点，并发数 ${this.concurrency}...`);

    let results = [];

    // Decide whether to use Batch Mode (Active Testing) or Legacy Loop
    // For now, always use Batch Mode if core type is 'mihomo' and we are enabled
    if (this.useCoreTest && this.coreType === 'mihomo') {
      try {
        results = await this.testNodesBatch(nodes);
      } catch (e) {
        this.logger.error(`Batch testing failed: ${e.message}. Falling back to individual testing.`);
        results = await super.testNodes(nodes);
      }
    } else {
      results = await this.testNodesLegacy(nodes);
    }

    // 获取成功的节点进行重命名
    const successfulResults = results.filter(r => r.status === 'up');
    this.logger.info(`测试完成: ${successfulResults.length}/${results.length} 个节点可用`);

    // 如果启用自动重命名，对成功的节点进行重命名
    if (this.autoRename && successfulResults.length > 0) {
      this.logger.info(`开始对 ${successfulResults.length} 个可用节点进行自动重命名...`);
      const renamedNodes = this.renameAndCorrectNodes(
        successfulResults.map(r => r.node),
        successfulResults
      );

      // 更新结果中的节点信息
      successfulResults.forEach((result, index) => {
        if (renamedNodes[index]) {
          result.node = renamedNodes[index];
        }
      });

      this.logger.info(`节点重命名完成`);
    }

    // 保存测试结果
    this.saveTestResults(results);

    return results;
  }

  async testNodesLegacy(nodes) {
    // 检查核心是否可用
    const coreAvailable = await this.ensureCoreAvailable();

    const results = [];
    const batches = this.createBatches(nodes, this.concurrency);

    for (let i = 0; i < batches.length; i++) {
      this.logger.info(`Legacy测试批次 ${i + 1}/${batches.length} (${batches[i].length} 个节点)...`);

      const batchPromises = batches[i].map(node => this.testSingleNode(node, coreAvailable, this.useCoreTest && coreAvailable));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * 确保代理核心可用
   * @returns {Promise<boolean>}
   */
  async ensureCoreAvailable() {
    if (!this.useCoreTest) return false;

    let coreAvailable = false;
    try {
      coreAvailable = await this.coreManager.isReady();
      if (!coreAvailable) {
        this.logger.warn(`${this.coreType} 核心不可用，尝试下载...`);
        await this.coreManager.downloadCore();
        coreAvailable = await this.coreManager.isReady();
      }
      this.logger.info(`${this.coreType} 核心状态: ${coreAvailable ? '可用' : '不可用'}`);
    } catch (error) {
      this.logger.warn(`检查 ${this.coreType} 核心失败: ${error.message}`);
      coreAvailable = false;
    }

    if (!coreAvailable && this.useCoreTest) {
      if (this.fallbackToBasic) {
        this.logger.warn('核心测试不可用，回退到基本连接测试');
      } else {
        throw new Error(`${this.coreType} 核心不可用且未启用回退模式`);
      }
    }

    return coreAvailable;
  }

  /**
   * 测试单个节点
   * @param {Object} node 节点对象
   * @param {boolean} coreAvailable 核心是否全局可用
   * @param {boolean} canUseCore 本次是否允许使用核心
   * @returns {Promise<Object>}
   */
  async testSingleNode(node, coreAvailable, canUseCore) {
    const startTime = Date.now();

    // 首先尝试使用代理核心测试
    if (canUseCore && this.isSupportedByCore(node)) {
      try {
        this.logger.debug(`使用 ${this.coreType} 核心测试节点: ${node.name}`);
        const coreResult = await this.coreManager.testNode(node);

        // 核心异常检查
        if (!coreResult.status) {
          const errorMessage = coreResult.error || '';
          if (this.isCoreCriticalError(errorMessage)) {
            this.coreFailureCount += 1;
            if (this.coreFailureCount >= this.maxCoreFailures) {
              this.logger.warn(`核心连续失败已达阈值(${this.maxCoreFailures})，禁用核心测试并回退到基本测试`);
              this.useCoreTest = false;
              // 后续不再使用核心
              canUseCore = false;
            }
          } else {
            this.coreFailureCount = 0;
          }
        } else {
          this.coreFailureCount = 0;
        }

        if (!coreResult.status && this.fallbackToBasic) {
          this.logger.warn(`${this.coreType} 核心测试失败，回退到基本测试: ${node.name}`);
          const result = await this.runBasicTest(node, startTime);
          result.testMethod = 'basic';
          return result;
        } else {
          const result = {
            node,
            status: coreResult.status ? 'up' : 'down',
            latency: coreResult.latency,
            error: coreResult.error,
            testMethod: `${this.coreType}-core`,
            locationInfo: null,
            needsLocationCorrection: false,
            actualLocation: null
          };

          // 如果核心测试成功且启用了地区验证，获取位置信息
          if (result.status === 'up' && this.verifyLocation) {
            await this.enrichLocationInfo(result);
          }
          return result;
        }

      } catch (coreError) {
        this.logger.warn(`${this.coreType} 核心测试失败: ${node.name}, ${coreError.message}`);

        // 如果启用了回退，使用基本测试
        if (this.fallbackToBasic) {
          const result = await this.runBasicTest(node, startTime);
          result.testMethod = 'basic';
          return result;
        } else {
          return {
            node,
            status: 'down',
            latency: null,
            error: coreError.message,
            testMethod: `${this.coreType}-core`,
            locationInfo: null,
            needsLocationCorrection: false,
            actualLocation: null
          };
        }
      }
    } else {
      // 使用基本连接测试
      const result = await this.runBasicTest(node, startTime);
      result.testMethod = 'basic';
      return result;
    }
  }

  /**
   * 判断是否为核心严重错误
   * @param {string} errorMessage 错误信息
   * @returns {boolean}
   */
  isCoreCriticalError(errorMessage) {
    return errorMessage.includes('核心异常退出') ||
      errorMessage.includes('Core exited') ||
      errorMessage.includes('启动失败') ||
      errorMessage.includes('启动异常');
  }

  /**
   * 补充位置信息
   * @param {Object} result 测试结果对象
   */
  async enrichLocationInfo(result) {
    try {
      const locationInfo = await this.ipLocator.locate(result.node.server);
      result.locationInfo = locationInfo;

      // 检查地区匹配
      if (locationInfo && this.checkLocationMismatch(result.node, locationInfo)) {
        result.needsLocationCorrection = true;
        result.actualLocation = {
          country: locationInfo.country,
          countryName: locationInfo.countryName,
          city: locationInfo.city
        };
      }
    } catch (locErr) {
      this.logger.warn(`获取节点 ${result.node.name} 位置信息失败: ${locErr.message}`);
    }
  }

  /**
   * 对节点进行统一重命名和地区修正
   * @param {Array<Object>} nodes - 需要修正的节点数组
   * @param {Array<Object>} testResults - 测试结果数组
   * @returns {Array<Object>} - 修正后的节点数组
   */
  renameAndCorrectNodes(nodes, testResults) {
    this.logger.info(`开始标准化节点名称...`);
    const analyzer = new NodeAnalyzer();
    let corrected = 0;

    const renamedNodes = nodes.map((node, index) => {
      const testResult = testResults.find(r => r.node === node || r.node.server === node.server);

      if (testResult && testResult.status === 'up') {
        const resultAnalysis = testResult.node.analysis || {};

        if (testResult.actualLocation) {
          resultAnalysis.countryCode = testResult.actualLocation.country;
          resultAnalysis.country = testResult.actualLocation.countryName;
        } else if (testResult.locationInfo) {
          resultAnalysis.countryCode = testResult.locationInfo.country;
          resultAnalysis.country = testResult.locationInfo.countryName;
        } else if (!resultAnalysis.countryCode && node.country) {
          resultAnalysis.countryCode = node.country;
        }

        if (!node.analysis) {
          node.analysis = {
            ...resultAnalysis,
            protocol: node.type,
            nodeType: node.type && ['vmess', 'vless', 'ss', 'trojan', 'hysteria2', 'tuic'].includes(node.type.toLowerCase()) ? 'normal' : 'other',
            tags: []
          };
          const tempAnalysis = analyzer.analyze(node);
          if (!node.analysis.countryCode) node.analysis.countryCode = tempAnalysis.countryCode;
          if (!node.analysis.protocol) node.analysis.protocol = tempAnalysis.protocol;
        } else {
          if (resultAnalysis.countryCode) node.analysis.countryCode = resultAnalysis.countryCode;
          if (resultAnalysis.country) node.analysis.country = resultAnalysis.country;
        }

        const newName = analyzer.generateName(node.analysis, {}, index);

        if (newName !== node.name) {
          corrected++;
          const renamedNode = { ...node, name: newName };
          if (!renamedNode.extra) renamedNode.extra = {};
          renamedNode.extra.originalName = node.name;
          return renamedNode;
        }
      }
      return node;
    });

    this.logger.info(`节点标准化重命名完成，共修改 ${corrected} 个节点`);
    return renamedNodes;
  }

  /**
   * 创建测试批次
   * @param {Array} nodes - 节点数组
   * @param {number} batchSize - 批次大小
   * @returns {Array} - 批次数组
   */
  createBatches(nodes, batchSize) {
    const batches = [];
    for (let i = 0; i < nodes.length; i += batchSize) {
      batches.push(nodes.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 执行基本连接测试（原有逻辑）
   * @param {Object} node - 节点配置
   * @param {number} startTime - 开始时间
   * @returns {Promise<Object>} - 测试结果
   */
  async runBasicTest(node, startTime) {
    try {
      const result = await this.checker.checkConnectivity(node, this.timeout, this.testUrl);
      const latency = Date.now() - startTime;

      let locationInfo = null;
      if (result.status && this.verifyLocation) {
        try {
          locationInfo = await this.ipLocator.locate(node.server);
        } catch (locErr) {
          this.logger.warn(`获取节点 ${node.name} 位置信息失败: ${locErr.message}`);
        }
      }

      let finalStatus = 'down';
      let finalLatency = null;
      let finalError = result.error || null;

      if (result.status) {
        // 使用配置的最大延迟限制，而不是硬编码1000ms
        const maxLatency = this.maxLatency || 3000; // 默认3秒
        if (latency < maxLatency) {
          finalStatus = 'up';
          finalLatency = latency;
        } else {
          finalStatus = 'down';
          finalLatency = null;
          finalError = `延迟过高 (${latency}ms，限制${maxLatency}ms)`;
        }
      }

      const testResult = {
        node,
        status: finalStatus,
        latency: finalLatency,
        error: finalError,
        locationInfo: locationInfo,
        needsLocationCorrection: false,
        actualLocation: null
      };

      // 检查地区匹配
      if (locationInfo && this.checkLocationMismatch(node, locationInfo)) {
        testResult.needsLocationCorrection = true;
        testResult.actualLocation = {
          country: locationInfo.country,
          countryName: locationInfo.countryName,
          city: locationInfo.city
        };
      }

      return testResult;

    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        node,
        status: 'down',
        latency: null,
        error: error.message,
        locationInfo: null,
        needsLocationCorrection: false,
        actualLocation: null
      };
    }
  }

  /**
   * 检查节点类型是否被代理核心支持
   * @param {Object} node - 节点配置
   * @returns {boolean} - 是否支持
   */
  isSupportedByCore(node) {
    const nodeType = node.type?.toLowerCase();

    if (this.coreType === 'mihomo') {
      // 支持的协议类型，包括协议名称的不同变体
      // 移除 'ssr' 防止 mihomo 核心崩溃，强制回退到基本测试
      const supportedTypes = ['ss', 'vmess', 'trojan', 'vless', 'hy2', 'hysteria2', 'tuic'];
      return supportedTypes.includes(nodeType);
    } else if (this.coreType === 'v2ray') {
      return ['vmess', 'vless', 'trojan', 'shadowsocks'].includes(nodeType);
    } else if (this.coreType === 'singbox') {
      return ['ss', 'shadowsocks', 'vmess', 'vless', 'trojan', 'hysteria2', 'tuic'].includes(nodeType);
    }

    return false;
  }

  /**
   * 检查节点名称与实际位置是否匹配
   * @param {Object} node - 节点配置
   * @param {Object} locationInfo - 位置信息
   * @returns {boolean} - 是否不匹配
   */
  checkLocationMismatch(node, locationInfo) {
    if (!locationInfo || !locationInfo.country) return false;

    const countryCodeCorrections = {
      '🇭🇰': ['HK', '香港'],
      '🇨🇳': ['CN', '中国'],
      '🇺🇸': ['US', '美国'],
      '🇯🇵': ['JP', '日本'],
      '🇸🇬': ['SG', '新加坡'],
      '🇰🇷': ['KR', '韩国'],
      '🇬🇧': ['GB', 'UK', '英国'],
      '🇹🇼': ['TW', '台湾']
    };

    const nodeName = node.name || '';
    const actualCountry = locationInfo.country;
    const actualCountryName = locationInfo.countryName;

    // 检查名称是否已经包含正确的地区信息
    for (const [emoji, codes] of Object.entries(countryCodeCorrections)) {
      if (codes.includes(actualCountry) || codes.includes(actualCountryName)) {
        if (nodeName.includes(emoji) || codes.some(code => nodeName.includes(code))) {
          return false; // 匹配，无需修正
        }
      }
    }

    return true; // 不匹配，需要修正
  }

  /**
   * 批量测试特定类型的节点
   * @param {Array<Object>} nodes - 节点列表
   * @param {string} nodeType - 节点类型过滤
   * @returns {Promise<Array<Object>>} - 测试结果
   */
  async testNodesByType(nodes, nodeType) {
    const filteredNodes = nodes.filter(node =>
      node.type?.toLowerCase() === nodeType.toLowerCase()
    );

    if (filteredNodes.length === 0) {
      this.logger.warn(`没有找到类型为 ${nodeType} 的节点`);
      return [];
    }

    this.logger.info(`开始测试 ${filteredNodes.length} 个 ${nodeType} 类型节点`);
    return this.testNodes(filteredNodes);
  }

  /**
   * 获取测试统计信息
   * @param {Array<Object>} results - 测试结果
   * @returns {Object} - 统计信息
   */
  getTestStatistics(results) {
    const total = results.length;
    const successful = results.filter(r => r.status === 'up').length;
    const failed = total - successful;

    const methodStats = {};
    results.forEach(r => {
      const method = r.testMethod || 'unknown';
      methodStats[method] = (methodStats[method] || 0) + 1;
    });

    const typeStats = {};
    results.forEach(r => {
      const type = r.node.type || 'unknown';
      typeStats[type] = (typeStats[type] || 0) + 1;
    });

    const avgLatency = successful > 0
      ? results
        .filter(r => r.status === 'up' && r.latency)
        .reduce((sum, r) => sum + r.latency, 0) /
      results.filter(r => r.status === 'up' && r.latency).length
      : 0;

    return {
      total,
      successful,
      failed,
      successRate: (successful / total * 100).toFixed(2) + '%',
      averageLatency: Math.round(avgLatency),
      methodStatistics: methodStats,
      typeStatistics: typeStats,
      needLocationCorrection: results.filter(r => r.needsLocationCorrection).length
    };
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
        validNodes: results.filter(n => n.node && (n.node.valid || n.status === 'up')).length,
        invalidNodes: results.filter(n => !n.node || (!n.node.valid && n.status !== 'up')).length,
        avgLatency: results.filter(n => n.status === 'up' && n.latency).reduce((sum, n) => sum + n.latency, 0) /
          (results.filter(n => n.status === 'up' && n.latency).length || 1)
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

  /**
   * 设置代理核心类型
   * @param {string} coreType - 核心类型 ('mihomo' | 'v2ray')
   */
  async setCoreType(coreType) {
    if (!['mihomo', 'v2ray', 'singbox'].includes(coreType)) {
      throw new Error(`不支持的核心类型: ${coreType}`);
    }

    this.coreType = coreType;
    this.coreManager = new ProxyCoreManager({
      coreType: this.coreType,
      timeout: this.timeout,
      testUrl: this.testUrl,
      logger: this.logger
    });

    this.logger.info(`已切换到 ${coreType} 核心`);
  }

  // --- Batch Testing Methods ---

  async testNodesBatch(nodes) {
    if (!nodes || nodes.length === 0) return [];

    this.logger.info(`Init Active Testing (Mihomo API) for ${nodes.length} nodes...`);
    const tempDir = path.join(this.rootDir, 'temp', 'testing');
    await fs.promises.mkdir(tempDir, { recursive: true });

    let process = null;
    let configPath = '';

    try {
      // 1. Prepare Ports
      this.controllerPort = await PortFinder.findFreePort(15000);
      this.mixedPort = await PortFinder.findFreePort(this.controllerPort + 1);

      // 2. Install Core
      const coreBin = await this.coreManager.installCore();

      // 3. Generate Config
      this.logger.info('Generating test config via Subconverter...');
      const uriList = this.configGenerator.generateTextContent('', nodes);
      let convertedConfig = {};
      try {
        const yamlStr = await this.subconverter.convertContent(uriList, 'clash');
        convertedConfig = yaml.load(yamlStr);
      } catch (e) {
        this.logger.warn(`Subconverter error: ${e.message}. Trying local generation.`);
        const localYaml = this.configGenerator.generateClashContent('proxies: []', nodes);
        convertedConfig = yaml.load(localYaml);
      }

      const mergedConfig = {
        ...convertedConfig,
        port: this.mixedPort,
        'socks-port': this.mixedPort + 1,
        'allow-lan': false,
        mode: 'rule',
        'log-level': 'info',
        'external-controller': `127.0.0.1:${this.controllerPort}`,
        secret: this.secret
      };

      configPath = path.join(tempDir, `batch-test-${Date.now()}.yaml`);
      await fs.promises.writeFile(configPath, yaml.dump(mergedConfig));


      // 4. Start Core
      this.logger.info(`Starting Mihomo on port ${this.controllerPort}...`);
      process = spawn(coreBin, ['-d', this.coreManager.coreDir, '-f', configPath], {
        cwd: this.coreManager.coreDir,
        stdio: 'inherit'
      });

      // Wait for API
      let attempts = 0;
      let ready = false;
      while (attempts < 20) {
        try {
          const res = await fetch(`http://127.0.0.1:${this.controllerPort}/version`, {
            headers: { 'Authorization': `Bearer ${this.secret}` }
          });
          if (res.ok) { ready = true; break; }
        } catch (e) { }
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }
      if (!ready) throw new Error('Mihomo API failed to start');

      // 5. Run Tests
      const results = await this.performBatchTests(nodes);
      return results;

    } finally {
      if (process) process.kill();
      // Optional: cleanup temp file
    }
  }

  async performBatchTests(nodes) {
    const apiBase = `http://127.0.0.1:${this.controllerPort}`;
    const headers = { 'Authorization': `Bearer ${this.secret}` };

    // Get proxies list from API
    const res = await fetch(`${apiBase}/proxies`, { headers });
    const data = await res.json();
    const proxies = data.proxies;

    const results = [];
    const nodeNames = Object.keys(proxies).filter(name =>
      !['DIRECT', 'REJECT', 'GLOBAL', 'Pass', 'Fail'].includes(name)
    );

    this.logger.info(`Core loaded ${nodeNames.length} nodes. Testing...`);

    // We need to map back to original nodes. 
    // Name matching is tricky due to escaping. 
    // We'll trust that we can fuzzy match or exact match.

    // Batch loop
    let completed = 0;
    const batchSize = this.concurrency || 50;

    for (let i = 0; i < nodeNames.length; i += batchSize) {
      const batch = nodeNames.slice(i, i + batchSize);
      const batchPromises = batch.map(async (name) => {
        // Test
        try {
          const testUrl = 'http://www.gstatic.com/generate_204';
          const delayRes = await fetch(`${apiBase}/proxies/${encodeURIComponent(name)}/delay?timeout=${this.maxLatency}&url=${testUrl}`, {
            headers
          });

          let result = {
            status: 'down',
            latency: 0,
            error: 'Timeout'
          };

          if (delayRes.ok) {
            const d = await delayRes.json();
            if (d.delay > 0) {
              result.status = 'up';
              result.latency = d.delay;
              result.error = null;
            } else {
              this.logger.debug(`Node ${name} test failed: Invalid delay ${d.delay}`);
            }
          } else {
            // 503 usually means timeout in Mihomo API
            const statusText = delayRes.statusText;
            result.error = `HTTP ${delayRes.status}: ${statusText}`;
            this.logger.debug(`Node ${name} test failed: ${result.error}`);
          }

          // Find original node
          // loose match: name in core might be escaped
          const originalNode = nodes.find(n => n.name === name || n.name.replace(/"/g, '') === name);

          if (originalNode) {
            results.push({
              node: originalNode,
              ...result,
              testMethod: 'mihomo-api',
              locationInfo: null, // Can fetch later
              needsLocationCorrection: false
            });
            // Enrich location if up
            if (result.status === 'up' && this.verifyLocation) {
              const r = results[results.length - 1];
              await this.enrichLocationInfo(r);
            }
          }
        } catch (e) { }
      });

      await Promise.all(batchPromises);
      completed += batch.length;
      if (completed % 100 === 0 || completed === nodeNames.length) {
        this.logger.info(`Progress: ${completed}/${nodeNames.length}`);
      }
    }

    return results;
  }
}

export default AdvancedNodeTester; 
