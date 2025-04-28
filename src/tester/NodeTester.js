import { ProxyChecker } from '../utils/proxy/ProxyChecker.js';
import { IPLocator } from '../utils/proxy/IPLocator.js';
import { logger } from '../utils/index.js';

const defaultLogger = logger?.defaultLogger || console;

export class NodeTester {
  constructor(options = {}) {
    this.checker = new ProxyChecker(options.checkerOptions);
    this.ipLocator = new IPLocator(options.ipLocatorOptions);
    this.timeout = options.timeout || 5000; // Default timeout 5 seconds
    this.concurrency = options.concurrency || 10; // Test 10 nodes concurrently
    this.logger = options.logger || defaultLogger.child({ component: 'NodeTester' });
    this.testUrl = options.testUrl || 'http://www.google.com/generate_204'; // Default test URL
    this.verifyLocation = options.verifyLocation !== false; // 默认启用地区验证
  }

  /**
   * Tests a list of nodes for connectivity and latency.
   * @param {Array<Object>} nodes - Array of node objects.
   * @returns {Promise<Array<Object>>} - Array of test result objects { node, status, latency }.
   */
  async testNodes(nodes) {
    this.logger.info(`开始测试 ${nodes.length} 个节点，并发数 ${this.concurrency}...`);
    const results = [];
    const queue = [...nodes]; // Create a copy to avoid modifying the original array

    const runTest = async (node) => {
      const startTime = Date.now();
      try {
        // Use a timeout for the check
        const result = await this.checker.checkConnectivity(node, this.timeout, this.testUrl);
        const latency = Date.now() - startTime;
        
        let locationInfo = null;
        // 如果连接成功且启用了地区验证，则获取IP地区信息
        if (result.status && this.verifyLocation) {
          try {
            locationInfo = await this.ipLocator.locate(node.server);
            
            // 检查节点名称与实际地区是否一致，并尝试纠正
            if (locationInfo && locationInfo.country) {
              const countryCodeCorrections = {
                // 不同国家/地区代码的映射关系
                '🇭🇰': ['HK', '香港'],
                '🇨🇳': ['CN', '中国'],
                '🇺🇸': ['US', '美国'],
                '🇯🇵': ['JP', '日本'],
                '🇸🇬': ['SG', '新加坡'],
                '🇰🇷': ['KR', '韩国'],
                '🇬🇧': ['GB', 'UK', '英国'],
                '🇹🇼': ['TW', '台湾']
                // 可以添加更多映射
              };
              
              // 检查节点名称中是否包含正确的国家/地区信息
              let locationMismatch = true;
              const nodeName = node.name || '';
              const actualCountry = locationInfo.country;
              const actualCountryName = locationInfo.countryName;
              
              // 检查名称是否已经包含正确的地区信息
              for (const [emoji, codes] of Object.entries(countryCodeCorrections)) {
                if (codes.includes(actualCountry) || codes.includes(actualCountryName)) {
                  // 检查节点名称是否已包含对应国家的emoji或代码
                  if (nodeName.includes(emoji) || codes.some(code => nodeName.includes(code))) {
                    locationMismatch = false;
                    break;
                  }
                }
              }
              
              // 如果存在地区不匹配，记录下来以便后续更正
              if (locationMismatch) {
                this.logger.info(`节点 ${node.name} 的位置信息可能不准确，实际位置: ${locationInfo.countryName}`);
                // 在测试结果中标记需要更正
                result.needsLocationCorrection = true;
                result.actualLocation = {
                  country: actualCountry,
                  countryName: actualCountryName,
                  city: locationInfo.city
                };
              }
            }
          } catch (locErr) {
            this.logger.warn(`获取节点 ${node.name} 的位置信息失败: ${locErr.message}`);
          }
        }

        this.logger.debug(`测试结果 ${node.name}: 状态=${result.status ? 'up' : 'down'}, 延迟=${latency}ms, 位置=${locationInfo?.countryName || '未知'}`);
        return {
          node,
          status: result.status ? 'up' : 'down',
          latency: result.status ? latency : null,
          error: result.error || null,
          locationInfo: locationInfo,
          needsLocationCorrection: result.needsLocationCorrection || false,
          actualLocation: result.actualLocation || null
        };
      } catch (error) {
        const latency = Date.now() - startTime;
        this.logger.warn(`测试失败 ${node.name}，用时 ${latency}ms: ${error.message}`);
        return {
          node,
          status: 'down',
          latency: null,
          error: error.message,
          locationInfo: null
        };
      }
    };

    const workers = Array(this.concurrency).fill(null).map(async () => {
      while (queue.length > 0) {
        const node = queue.shift();
        if (node) {
          const result = await runTest(node);
          results.push(result);
        }
      }
    });

    await Promise.all(workers);

    this.logger.info(`完成 ${nodes.length} 个节点测试, ${results.filter(r => r.status === 'up').length} 个连接正常`);
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
      'UK': '🇬🇧'
      // 可以添加更多映射
    };
    
    const correctedNodes = nodes.map(node => {
      // 查找对应的测试结果
      const testResult = testResults.find(r => r.node === node);
      
      // 如果测试成功且需要修正地区
      if (testResult && testResult.status === 'up' && testResult.needsLocationCorrection && testResult.actualLocation) {
        const country = testResult.actualLocation.country;
        const countryName = testResult.actualLocation.countryName;
        const emoji = countryToEmoji[country] || '';
        
        // 创建新的节点名称（加上地区前缀）
        let newName = node.name || '';
        
        // 已有emoji，则替换为正确的
        if (/\p{Emoji_Presentation}/u.test(newName)) {
          // 替换第一个emoji
          newName = newName.replace(/[\p{Emoji_Presentation}]+/u, emoji);
        } else {
          // 没有emoji则添加前缀
          newName = `${emoji} ${newName}`;
        }
        
        // 复制节点对象并更新名称
        const correctedNode = { ...node, name: newName };
        
        // 保存原始名称到extra字段
        if (!correctedNode.extra) correctedNode.extra = {};
        correctedNode.extra.originalName = node.name;
        
        // 保存地区信息
        correctedNode.country = country;
        correctedNode.countryName = countryName;
        
        this.logger.debug(`修正节点地区: "${node.name}" -> "${newName}"`);
        corrected++;
        
        return correctedNode;
      }
      
      return node;
    });
    
    this.logger.info(`节点地区修正完成，共修正 ${corrected} 个节点`);
    return correctedNodes;
  }
}

export default NodeTester; 