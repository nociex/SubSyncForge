/**
 * 示例：使用中国大陆代理获取订阅并测速
 * 此示例展示如何配置和使用中国大陆代理功能
 */

import { SubscriptionFetcher } from '../src/core/subscription/SubscriptionFetcher.js';
import { SubscriptionConverter } from '../src/converter/SubscriptionConverter.js';
import { NodeTester } from '../src/core/testing/NodeTester.js';
import { logger } from '../src/utils/index.js';
import fs from 'fs';
import path from 'path';

// 创建日志记录器
const log = logger.defaultLogger.child({ component: 'ChinaProxyExample' });

// 配置订阅列表
const subscriptions = [
  {
    name: "demo-sub",
    url: "https://your-subscription-url.com",
    type: "url",
    enabled: true,
    use_china_proxy: true  // 启用中国代理获取此订阅
  }
];

// 主函数
async function main() {
  try {
    log.info('开始运行中国大陆代理示例...');
    
    // 确保配置文件存在
    const configPath = path.resolve(process.cwd(), 'config/china_proxies.json');
    if (!fs.existsSync(configPath)) {
      log.error(`中国代理配置文件不存在: ${configPath}`);
      log.info('请先创建配置文件，可参考 config/china_proxies.json 示例');
      return;
    }
    
    // 步骤1: 创建订阅转换器
    const converter = new SubscriptionConverter({
      logger: log,
      groupingMode: 'advanced',
      dedup: true
    });
    
    // 步骤2: 创建订阅获取器（启用中国代理）
    const fetcher = new SubscriptionFetcher({
      rootDir: process.cwd(),
      dataDir: 'data',
      logger: log,
      converter: converter,
      chinaProxyEnabled: true  // 启用中国代理功能
    });
    
    // 步骤3: 获取订阅内容
    log.info('开始获取订阅...');
    const nodes = await fetcher.fetchAllSubscriptions(subscriptions);
    log.info(`成功获取 ${nodes.length} 个节点`);
    
    // 步骤4: 测试节点延迟（同时使用正常测试和中国代理测试）
    log.info('开始测试节点延迟...');
    
    const tester = new NodeTester({
      rootDir: process.cwd(),
      dataDir: 'data',
      logger: log,
      concurrency: 5,
      timeout: 5000,
      testUrl: 'http://www.gstatic.com/generate_204',
      maxLatency: 2000,
      useChineseProxy: true  // 启用中国代理测速
    });
    
    const results = await tester.testNodes(nodes);
    
    // 步骤5: 显示测试结果
    log.info('测试完成，输出结果...');
    
    // 有效节点（常规测试通过的节点）
    const validNodes = results.filter(node => node.valid);
    log.info(`常规测试有效节点数: ${validNodes.length}`);
    
    // 中国测试有效的节点
    const validInChina = results.filter(node => node.china_test && node.china_test.valid);
    log.info(`中国大陆测试有效节点数: ${validInChina.length}`);
    
    // 两种测试都有效的节点
    const validInBoth = results.filter(node => node.valid && node.china_test && node.china_test.valid);
    log.info(`两种测试都有效的节点数: ${validInBoth.length}`);
    
    // 打印延迟对比
    log.info('延迟对比 (常规测试 vs 中国大陆测试):');
    validInBoth.slice(0, 10).forEach(node => {
      log.info(`节点 ${node.name}: ${node.latency}ms vs ${node.china_test.latency}ms`);
    });
    
    // 步骤6: 保存结果到文件
    const resultDir = path.join(process.cwd(), 'data', 'test_results');
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const resultPath = path.join(resultDir, `china_test_${timestamp}.json`);
    
    // 统计信息
    const stats = {
      totalNodes: results.length,
      validNodesNormal: validNodes.length,
      validNodesChina: validInChina.length,
      validNodesBoth: validInBoth.length,
      avgLatencyNormal: validNodes.reduce((sum, n) => sum + n.latency, 0) / (validNodes.length || 1),
      avgLatencyChina: validInChina.reduce((sum, n) => sum + n.china_test.latency, 0) / (validInChina.length || 1)
    };
    
    // 保存结果
    const data = {
      timestamp: new Date().toISOString(),
      stats: stats,
      results: results
    };
    
    fs.writeFileSync(resultPath, JSON.stringify(data, null, 2));
    log.info(`测试结果已保存到: ${resultPath}`);
    
    log.info('示例执行完成');
  } catch (error) {
    log.error('示例执行过程中发生错误:', error);
  }
}

// 执行主函数
main().catch(error => {
  log.error('程序执行失败:', error);
  process.exit(1);
}); 