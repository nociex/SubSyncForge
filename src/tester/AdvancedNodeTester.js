import { ProxyCoreManager } from '../core/ProxyCoreManager.js';
import { NodeTester } from './NodeTester.js';
import { IPLocator } from '../utils/proxy/IPLocator.js';
import { logger } from '../utils/index.js';

const defaultLogger = logger?.defaultLogger || console;

export class AdvancedNodeTester extends NodeTester {
  constructor(options = {}) {
    super(options);
    
    this.useCoreTest = options.useCoreTest !== false; // 默认启用核心测试
    this.coreType = options.coreType || 'mihomo'; // 'mihomo' | 'v2ray'
    this.fallbackToBasic = options.fallbackToBasic !== false; // 失败时回退到基本测试
    this.autoRename = options.autoRename !== false; // 默认启用自动重命名
    this.maxLatency = options.maxLatency || 3000; // 最大延迟限制，默认3秒
    
    // 初始化代理核心管理器
    this.coreManager = new ProxyCoreManager({
      coreType: this.coreType,
      timeout: this.timeout,
      testUrl: this.testUrl,
      logger: this.logger
    });
    
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
    
    // 检查核心是否可用
    let coreAvailable = false;
    if (this.useCoreTest) {
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
    }

    if (!coreAvailable && this.useCoreTest) {
      if (this.fallbackToBasic) {
        this.logger.warn('核心测试不可用，回退到基本连接测试');
      } else {
        throw new Error(`${this.coreType} 核心不可用且未启用回退模式`);
      }
    }

    const results = [];
    const batches = this.createBatches(nodes, this.concurrency);

    for (let i = 0; i < batches.length; i++) {
      this.logger.info(`测试批次 ${i + 1}/${batches.length} (${batches[i].length} 个节点)...`);
      
      const batchPromises = batches[i].map(async (node) => {
        const startTime = Date.now();
        let result = null;
        
        // 首先尝试使用代理核心测试
        if (coreAvailable && this.isSupportedByCore(node)) {
          try {
            this.logger.debug(`使用 ${this.coreType} 核心测试节点: ${node.name}`);
            const coreResult = await this.coreManager.testNode(node);
            
            result = {
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
              try {
                const locationInfo = await this.ipLocator.locate(node.server);
                result.locationInfo = locationInfo;
                
                // 检查地区匹配
                if (locationInfo && this.checkLocationMismatch(node, locationInfo)) {
                  result.needsLocationCorrection = true;
                  result.actualLocation = {
                    country: locationInfo.country,
                    countryName: locationInfo.countryName,
                    city: locationInfo.city
                  };
                }
              } catch (locErr) {
                this.logger.warn(`获取节点 ${node.name} 位置信息失败: ${locErr.message}`);
              }
            }
            
          } catch (coreError) {
            this.logger.warn(`${this.coreType} 核心测试失败: ${node.name}, ${coreError.message}`);
            
            // 如果启用了回退，使用基本测试
            if (this.fallbackToBasic) {
              result = await this.runBasicTest(node, startTime);
              result.testMethod = 'basic';
            } else {
              result = {
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
          result = await this.runBasicTest(node, startTime);
          result.testMethod = 'basic';
        }
        
        return result;
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    // 获取成功的节点进行重命名
    const successfulResults = results.filter(r => r.status === 'up');
    this.logger.info(`测试完成: ${successfulResults.length}/${results.length} 个节点可用`);
    
    // 如果启用自动重命名，对成功的节点进行重命名
    if (this.autoRename && successfulResults.length > 0) {
      this.logger.info(`开始对 ${successfulResults.length} 个可用节点进行自动重命名...`);
      const renamedNodes = this.correctNodeLocations(
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
    
    return results;
  }

  /**
   * 根据测试结果修正节点名称中的地区信息
   * @param {Array<Object>} nodes - 需要修正的节点数组
   * @param {Array<Object>} testResults - 测试结果数组
   * @returns {Array<Object>} - 修正后的节点数组
   */
  correctNodeLocations(nodes, testResults) {
    this.logger.info(`开始修正节点地区信息...`);
    let corrected = 0;
    
    // 为地区代码创建emoji映射
    const countryToEmoji = {
      'CN': '🇨🇳',
      'HK': '🇭🇰',
      'TW': '🇹🇼',
      'JP': '🇯🇵',
      'US': '🇺🇸',
      'KR': '🇰🇷',
      'SG': '🇸🇬',
      'GB': '🇬🇧',
      'UK': '🇬🇧',
      'DE': '🇩🇪',
      'FR': '🇫🇷',
      'CA': '🇨🇦',
      'AU': '🇦🇺',
      'RU': '🇷🇺',
      'IN': '🇮🇳',
      'NL': '🇳🇱',
      'BR': '🇧🇷',
      'IT': '🇮🇹',
      'TR': '🇹🇷',
      'TH': '🇹🇭',
      'VN': '🇻🇳',
      'ID': '🇮🇩',
      'MY': '🇲🇾',
      'PH': '🇵🇭',
      'AE': '🇦🇪',
      'FI': '🇫🇮',
      'SE': '🇸🇪',
      'NO': '🇳🇴',
      'DK': '🇩🇰',
      'CH': '🇨🇭',
      'AT': '🇦🇹',
      'BE': '🇧🇪',
      'IE': '🇮🇪',
      'PT': '🇵🇹',
      'ES': '🇪🇸',
      'PL': '🇵🇱',
      'CZ': '🇨🇿',
      'HU': '🇭🇺',
      'RO': '🇷🇴',
      'BG': '🇧🇬',
      'GR': '🇬🇷',
      'HR': '🇭🇷',
      'LV': '🇱🇻',
      'LT': '🇱🇹',
      'EE': '🇪🇪'
    };
    
    const correctedNodes = nodes.map(node => {
      // 查找对应的测试结果
      const testResult = testResults.find(r => r.node === node || r.node.server === node.server);
      
      // 如果测试成功且需要修正地区
      if (testResult && testResult.status === 'up' && testResult.needsLocationCorrection && testResult.actualLocation) {
        const country = testResult.actualLocation.country;
        const countryName = testResult.actualLocation.countryName;
        const emoji = countryToEmoji[country] || '🌀';
        
        // 创建新的节点名称（加上地区前缀）
        let newName = node.name || '';
        
        // 移除现有的emoji和地区信息
        newName = newName.replace(/[\p{Emoji_Presentation}\p{Emoji}\uFE0F]/gu, '').trim();
        newName = newName.replace(/^[\u{1F1E6}-\u{1F1FF}]+\s*/u, '').trim();
        
        // 添加正确的地区前缀
        newName = `${emoji} ${countryName} | ${newName}`;
        
        // 复制节点对象并更新名称
        const correctedNode = { ...node, name: newName };
        
        // 保存原始名称到extra字段
        if (!correctedNode.extra) correctedNode.extra = {};
        correctedNode.extra.originalName = node.name;
        
        // 保存地区信息
        correctedNode.country = country;
        correctedNode.countryName = countryName;
        correctedNode.locationInfo = testResult.locationInfo;
        
        this.logger.debug(`修正节点地区: "${node.name}" -> "${newName}"`);
        corrected++;
        
        return correctedNode;
      }
      
      return node;
    });
    
    this.logger.info(`节点地区修正完成，共修正 ${corrected} 个节点`);
    return correctedNodes;
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
      const supportedTypes = ['ss', 'vmess', 'trojan', 'vless', 'hy2', 'hysteria2', 'tuic', 'ssr'];
      return supportedTypes.includes(nodeType);
    } else if (this.coreType === 'v2ray') {
      return ['vmess', 'vless', 'trojan', 'shadowsocks'].includes(nodeType);
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
   * 设置代理核心类型
   * @param {string} coreType - 核心类型 ('mihomo' | 'v2ray')
   */
  async setCoreType(coreType) {
    if (!['mihomo', 'v2ray'].includes(coreType)) {
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
}

export default AdvancedNodeTester; 