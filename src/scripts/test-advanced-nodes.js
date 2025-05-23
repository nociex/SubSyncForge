#!/usr/bin/env node

import { AdvancedNodeTester } from '../tester/AdvancedNodeTester.js';
import { logger } from '../utils/index.js';

// 测试节点配置 (示例)
const testNodes = [
  {
    name: "🇭🇰 香港测试节点",
    type: "vmess",
    server: "hk.example.com",
    port: 443,
    uuid: "12345678-1234-1234-1234-123456789abc",
    alterId: 0,
    cipher: "auto",
    tls: true,
    network: "ws"
  },
  {
    name: "🇺🇸 美国测试节点",
    type: "trojan",
    server: "us.example.com", 
    port: 443,
    password: "your-password-here",
    sni: "us.example.com"
  },
  {
    name: "🇸🇬 新加坡测试节点",
    type: "ss",
    server: "sg.example.com",
    port: 8080,
    method: "aes-256-gcm",
    password: "your-ss-password"
  }
];

async function runTest() {
  const startTime = Date.now();
  
  console.log('🚀 开始高级节点测试演示...\n');
  
  try {
    // 创建高级测试器实例
    const tester = new AdvancedNodeTester({
      coreType: 'mihomo', // 使用mihomo核心
      timeout: 8000,
      concurrency: 3,
      useCoreTest: true,
      fallbackToBasic: true,
      verifyLocation: true,
      logger: logger.defaultLogger.child({ component: 'TestScript' })
    });
    
    console.log('📋 测试配置:');
    console.log(`- 核心类型: ${tester.coreType}`);
    console.log(`- 超时时间: ${tester.timeout}ms`);
    console.log(`- 并发数: ${tester.concurrency}`);
    console.log(`- 回退策略: ${tester.fallbackToBasic ? '启用' : '禁用'}`);
    console.log(`- 位置验证: ${tester.verifyLocation ? '启用' : '禁用'}\n`);
    
    // 执行测试
    console.log('🔍 开始测试节点连接性...\n');
    const results = await tester.testNodes(testNodes);
    
    // 显示详细结果
    console.log('\n📊 测试结果详情:');
    console.log('=' .repeat(80));
    
    results.forEach((result, index) => {
      const node = result.node;
      const status = result.status === 'up' ? '✅ 可用' : '❌ 不可用';
      const latency = result.latency ? `${result.latency}ms` : 'N/A';
      const method = result.testMethod || 'unknown';
      const location = result.locationInfo ? 
        `${result.locationInfo.countryName || '未知'} (${result.locationInfo.country || 'N/A'})` : 
        '未获取';
      
      console.log(`\n${index + 1}. ${node.name}`);
      console.log(`   状态: ${status}`);
      console.log(`   延迟: ${latency}`);
      console.log(`   方法: ${method}`);
      console.log(`   类型: ${node.type}`);
      console.log(`   服务器: ${node.server}:${node.port}`);
      console.log(`   位置: ${location}`);
      
      if (result.error) {
        console.log(`   错误: ${result.error}`);
      }
      
      if (result.needsLocationCorrection && result.actualLocation) {
        console.log(`   ⚠️  位置需要修正: 实际位置为 ${result.actualLocation.countryName}`);
      }
    });
    
    // 显示统计信息
    console.log('\n' + '='.repeat(80));
    const stats = tester.getTestStatistics(results);
    console.log('\n📈 测试统计:');
    console.log(`- 总节点数: ${stats.total}`);
    console.log(`- 可用节点: ${stats.successful}`);
    console.log(`- 不可用节点: ${stats.failed}`);
    console.log(`- 成功率: ${stats.successRate}`);
    console.log(`- 平均延迟: ${stats.averageLatency}ms`);
    console.log(`- 需修正位置: ${stats.needLocationCorrection}`);
    
    console.log('\n🔧 测试方法分布:');
    Object.entries(stats.methodStatistics).forEach(([method, count]) => {
      console.log(`  - ${method}: ${count} 个节点`);
    });
    
    console.log('\n🌐 节点类型分布:');
    Object.entries(stats.typeStatistics).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count} 个节点`);
    });
    
    // 演示核心切换
    console.log('\n🔄 演示核心切换功能...');
    await tester.setCoreType('v2ray');
    console.log('已切换到 v2ray 核心');
    
    // 测试特定类型的节点
    console.log('\n🎯 演示按类型测试...');
    const vmessNodes = await tester.testNodesByType(testNodes, 'vmess');
    console.log(`VMess 节点测试结果: ${vmessNodes.filter(r => r.status === 'up').length}/${vmessNodes.length} 可用`);
    
  } catch (error) {
    console.error('\n❌ 测试过程中发生错误:', error.message);
    console.error('详细错误信息:', error.stack);
  } finally {
    const duration = Date.now() - startTime;
    console.log(`\n⏱️  总测试时间: ${duration}ms`);
    console.log('\n✨ 高级节点测试演示完成!');
  }
}

// 处理命令行参数
const args = process.argv.slice(2);
const coreType = args.includes('--v2ray') ? 'v2ray' : 'mihomo';
const noCore = args.includes('--no-core');
const verbose = args.includes('--verbose');

if (args.includes('--help')) {
  console.log(`
使用方法: node test-advanced-nodes.js [选项]

选项:
  --mihomo     使用 mihomo 核心 (默认)
  --v2ray      使用 v2ray 核心
  --no-core    禁用核心测试，仅使用基本连接测试
  --verbose    显示详细日志
  --help       显示此帮助信息

示例:
  node test-advanced-nodes.js                # 使用 mihomo 核心
  node test-advanced-nodes.js --v2ray        # 使用 v2ray 核心
  node test-advanced-nodes.js --no-core      # 仅基本测试
  node test-advanced-nodes.js --verbose      # 详细模式
`);
  process.exit(0);
}

// 设置日志级别
if (verbose) {
  // 如果有日志配置，可以在这里设置为 debug 级别
}

// 修改测试配置
if (noCore) {
  // 修改 testNodes 配置以禁用核心测试
  console.log('🔧 核心测试已禁用，将仅使用基本连接测试\n');
}

// 运行测试
runTest().catch(error => {
  console.error('💥 脚本执行失败:', error);
  process.exit(1);
}); 