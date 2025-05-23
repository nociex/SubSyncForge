/**
 * 测试 Mihomo 核心和自动重命名功能
 */

import { AdvancedNodeTester } from './src/tester/AdvancedNodeTester.js';
import { SubscriptionParser } from './src/converter/parser/SubscriptionParser.js';
import { logger } from './src/utils/index.js';

const testLogger = logger?.defaultLogger || console;

// 测试用的订阅链接
const testSubscriptionUrls = [
  'https://raw.githubusercontent.com/aiboboxx/clashfree/main/clash.yml',
  'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub'
];

/**
 * 主测试函数
 */
async function testMihomoRenaming() {
  testLogger.info('🚀 开始测试 Mihomo 核心和自动重命名功能');
  
  const parser = new SubscriptionParser();
  let allNodes = [];
  
  // 获取测试节点
  for (const url of testSubscriptionUrls) {
    try {
      testLogger.info(`📥 获取订阅: ${url}`);
      const response = await fetch(url);
      const content = await response.text();
      
      const nodes = await parser.parse(content, 'auto');
      testLogger.info(`✅ 解析成功: ${nodes.length} 个节点`);
      allNodes.push(...nodes);
      
      if (allNodes.length >= 20) break; // 限制测试节点数量
    } catch (error) {
      testLogger.warn(`❌ 获取订阅失败: ${error.message}`);
    }
  }
  
  if (allNodes.length === 0) {
    testLogger.error('❌ 没有获取到测试节点');
    return;
  }
  
  // 取前20个节点进行测试
  const testNodes = allNodes.slice(0, 20);
  testLogger.info(`🔬 开始测试 ${testNodes.length} 个节点`);
  
  // 显示测试前的节点名称
  testLogger.info('📋 测试前节点名称:');
  testNodes.slice(0, 10).forEach((node, index) => {
    testLogger.info(`  ${index + 1}. ${node.name} (${node.type}) - ${node.server}:${node.port}`);
  });
  
  try {
    // 创建高级测试器，启用 Mihomo 核心和自动重命名
    const tester = new AdvancedNodeTester({
      coreType: 'mihomo',
      useCoreTest: true,
      fallbackToBasic: true,
      autoRename: true,
      verifyLocation: true,
      timeout: 10000,
      concurrency: 5,
      logger: testLogger
    });
    
    testLogger.info('⚙️ 测试器配置:');
    testLogger.info(`  - 核心类型: ${tester.coreType}`);
    testLogger.info(`  - 使用核心测试: ${tester.useCoreTest}`);
    testLogger.info(`  - 回退到基本测试: ${tester.fallbackToBasic}`);
    testLogger.info(`  - 自动重命名: ${tester.autoRename}`);
    testLogger.info(`  - 验证位置: ${tester.verifyLocation}`);
    
    // 执行测试
    testLogger.info('🔍 开始节点测试...');
    const results = await tester.testNodes(testNodes);
    
    // 统计测试结果
    const stats = tester.getTestStatistics(results);
    testLogger.info('\n📊 测试结果统计:');
    testLogger.info(`  ✅ 总节点数: ${stats.total}`);
    testLogger.info(`  🟢 可用节点: ${stats.successful}`);
    testLogger.info(`  🔴 不可用节点: ${stats.failed}`);
    testLogger.info(`  📈 成功率: ${stats.successRate}`);
    testLogger.info(`  ⏱️ 平均延迟: ${stats.averageLatency}ms`);
    testLogger.info(`  🌍 需要位置修正: ${stats.needLocationCorrection}`);
    
    testLogger.info('\n🔧 测试方法分布:');
    Object.entries(stats.methodStatistics).forEach(([method, count]) => {
      testLogger.info(`  - ${method}: ${count} 个节点`);
    });
    
    testLogger.info('\n🌐 节点类型分布:');
    Object.entries(stats.typeStatistics).forEach(([type, count]) => {
      testLogger.info(`  - ${type}: ${count} 个节点`);
    });
    
    // 显示成功的节点详情
    const successfulResults = results.filter(r => r.status === 'up');
    if (successfulResults.length > 0) {
      testLogger.info('\n🎯 成功节点详情:');
      successfulResults.forEach((result, index) => {
        const node = result.node;
        const location = result.locationInfo ? 
          `${result.locationInfo.countryName || '未知'} (${result.locationInfo.country || 'N/A'})` : 
          '未获取';
        const renamed = result.node.extra?.originalName ? '✏️ 已重命名' : '';
        
        testLogger.info(`  ${index + 1}. ${node.name} ${renamed}`);
        testLogger.info(`     类型: ${node.type} | 延迟: ${result.latency}ms | 方法: ${result.testMethod}`);
        testLogger.info(`     服务器: ${node.server}:${node.port} | 位置: ${location}`);
        
        if (result.node.extra?.originalName) {
          testLogger.info(`     原名称: ${result.node.extra.originalName}`);
        }
        
        if (result.error) {
          testLogger.info(`     错误: ${result.error}`);
        }
      });
    }
    
    // 显示重命名统计
    const renamedNodes = results.filter(r => r.node.extra?.originalName);
    if (renamedNodes.length > 0) {
      testLogger.info(`\n✏️ 重命名统计: ${renamedNodes.length} 个节点已重命名`);
      renamedNodes.slice(0, 5).forEach((result, index) => {
        testLogger.info(`  ${index + 1}. "${result.node.extra.originalName}" -> "${result.node.name}"`);
      });
    }
    
    testLogger.info('\n✅ 测试完成!');
    
  } catch (error) {
    testLogger.error(`❌ 测试失败: ${error.message}`);
    testLogger.error(error.stack);
  }
}

// 运行测试
testMihomoRenaming().catch(error => {
  console.error('💥 脚本执行失败:', error);
  process.exit(1);
}); 