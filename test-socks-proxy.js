/**
 * SOCKS代理验证测试脚本
 * 用于测试节点是否可用作SOCKS代理
 */

import { ChinaProxyLoader, SocksProxyVerifier } from './src/utils/proxy/index.js';
import { SubscriptionConverter } from './src/converter/SubscriptionConverter.js';
import fs from 'fs';
import path from 'path';
import { logger } from './src/utils/index.js';

// 创建日志实例
const testLogger = logger.defaultLogger.child({ component: 'SocksProxyTest' });

// 解析命令行参数
const args = process.argv.slice(2);
const subscriptionUrl = args.find(arg => !arg.startsWith('-')) || 'https://hssq.cc/5dccpz';
const concurrency = parseInt(args.find(arg => arg.startsWith('--concurrency='))?.split('=')[1] || '10');
const timeout = parseInt(args.find(arg => arg.startsWith('--timeout='))?.split('=')[1] || '5000');
const outputDir = args.find(arg => arg.startsWith('--output='))?.split('=')[1] || 'output';
const testChinaNodes = args.includes('--china-only') || args.includes('-c');
const includeIpInfo = args.includes('--ip-info') || args.includes('-i');

/**
 * 主函数
 */
async function main() {
  testLogger.info(`开始测试SOCKS代理，订阅URL: ${subscriptionUrl}`);
  testLogger.info(`并发数: ${concurrency}, 超时时间: ${timeout}ms`);
  
  try {
    // 1. 获取订阅内容
    testLogger.info('正在获取订阅内容...');
    const converter = new SubscriptionConverter({
      logger: testLogger,
      groupingMode: 'advanced',
      dedup: true,
      applyRules: true
    });
    
    const convertResult = await converter.convert(subscriptionUrl, 'json');
    if (!convertResult.success) {
      testLogger.error(`获取订阅失败: ${convertResult.error}`);
      process.exit(1);
    }
    
    let nodes = [];
    try {
      // 尝试解析为JSON
      const parsedData = JSON.parse(convertResult.data);
      nodes = parsedData.nodes || parsedData.proxies || [];
      testLogger.info(`成功解析到 ${nodes.length} 个节点`);
    } catch (error) {
      testLogger.error(`解析订阅内容失败: ${error.message}`);
      process.exit(1);
    }
    
    // 2. 如果指定了仅测试中国节点，筛选出中国节点
    if (testChinaNodes) {
      testLogger.info('筛选中国节点...');
      // 加载ChinaProxyLoader获取中国节点关键词
      const proxyLoader = new ChinaProxyLoader({
        rootDir: process.cwd()
      });
      const config = proxyLoader.loadConfig();
      const chinaKeywords = config.china_node_keywords || ['中国', 'CN', 'China', '大陆', '国内', '回国', '电信', '联通', '移动'];
      
      // 筛选节点
      const chinaNodes = nodes.filter(node => {
        // 检查节点名称或节点服务器是否包含中国关键词
        const nodeName = node.name || '';
        const server = node.server || '';
        
        // 检查元数据中的国家信息
        const isChinaInMetadata = node.metadata?.isChinaNode === true || 
                                  node.metadata?.location?.country === 'CN' ||
                                  node.metadata?.location?.country_name === '中国';
                                  
        // 检查节点名称中是否包含中国关键词
        const hasKeywordInName = chinaKeywords.some(keyword => 
          nodeName.includes(keyword)
        );
        
        return isChinaInMetadata || hasKeywordInName;
      });
      
      testLogger.info(`找到 ${chinaNodes.length} 个中国节点`);
      nodes = chinaNodes;
    }
    
    // 如果没有节点可测试，退出
    if (nodes.length === 0) {
      testLogger.warn('没有找到可以测试的节点');
      process.exit(0);
    }
    
    // 3. 创建SOCKS代理验证器
    const socksVerifier = new SocksProxyVerifier({
      logger: testLogger,
      timeout,
      concurrency,
      testUrl: 'http://www.gstatic.com/generate_204',
      directTestUrl: 'https://www.baidu.com'
    });
    
    // 4. 批量验证节点
    testLogger.info(`开始验证 ${nodes.length} 个节点是否可用作SOCKS代理...`);
    const startTime = Date.now();
    const verifyResults = await socksVerifier.batchVerify(nodes);
    const endTime = Date.now();
    
    // 5. 统计结果
    const validAsSocks = verifyResults.filter(node => node.valid_as_socks);
    const chinaOnlySocks = validAsSocks.filter(node => node.china_only);
    
    testLogger.info(`验证完成，用时: ${endTime - startTime}ms`);
    testLogger.info(`总节点数: ${nodes.length}`);
    testLogger.info(`可用作SOCKS代理的节点数: ${validAsSocks.length}`);
    testLogger.info(`其中仅支持访问中国大陆网站的节点数: ${chinaOnlySocks.length}`);
    
    // 6. 将结果保存到文件
    const resultDir = path.join(process.cwd(), outputDir);
    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }
    
    // 创建结果对象
    const result = {
      subscription_url: subscriptionUrl,
      timestamp: new Date().toISOString(),
      test_duration_ms: endTime - startTime,
      total_nodes: nodes.length,
      valid_as_socks: validAsSocks.length,
      china_only_nodes: chinaOnlySocks.length,
      results: verifyResults.map(node => {
        // 过滤掉不需要的字段，减小文件大小
        const { server, port, type, name, valid_as_socks, latency, error, china_only } = node;
        
        // 基本结果
        const result = {
          server,
          port,
          type,
          name,
          valid_as_socks,
          latency,
          error: error || null,
          china_only: china_only || false
        };
        
        // 如果需要包含IP信息
        if (includeIpInfo && node.metadata?.location) {
          result.location = node.metadata.location;
        }
        
        return result;
      })
    };
    
    // 保存完整结果
    const resultFile = path.join(resultDir, `socks_verify_result_${Date.now()}.json`);
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    testLogger.info(`验证结果已保存到: ${resultFile}`);
    
    // 7. 保存可用节点列表
    if (validAsSocks.length > 0) {
      const validNodesFile = path.join(resultDir, 'valid_socks_nodes.json');
      fs.writeFileSync(validNodesFile, JSON.stringify({
        timestamp: new Date().toISOString(),
        count: validAsSocks.length,
        nodes: validAsSocks.map(node => ({
          server: node.server,
          port: node.port,
          type: node.type,
          name: node.name,
          latency: node.latency,
          china_only: node.china_only || false
        }))
      }, null, 2));
      testLogger.info(`可用SOCKS节点列表已保存到: ${validNodesFile}`);
    }
    
  } catch (error) {
    testLogger.error(`测试过程中发生错误: ${error.message}`);
    testLogger.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
main(); 