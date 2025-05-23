// 导入SubscriptionConverter
import { SubscriptionConverter } from './src/converter/SubscriptionConverter.js';
import { NodeManager } from './src/converter/analyzer/index.js';
import { SubscriptionParser } from './src/converter/parser/SubscriptionParser.js';
import { NodeTester } from './src/tester/NodeTester.js';

// 导入需要的工具
import { logger } from './src/utils/index.js';

// 创建日志实例
const testLogger = logger.defaultLogger.child({ component: 'TestScript' });

// 测试订阅URL
const testSubscriptionUrls = [
  'https://raw.githubusercontent.com/freefq/free/master/v2', // Base64编码订阅
];

// 创建订阅解析器
const parser = new SubscriptionParser({ logger: testLogger });

// 创建节点测试器（包含IP检测）
const nodeTester = new NodeTester({
  concurrency: 5, // 限制并发数避免过多请求
  timeout: 8000,
  verifyLocation: true, // 启用地理位置验证
  logger: testLogger
});

// 创建节点管理器
const nodeManager = new NodeManager();

// 主函数
async function testSubscription() {
  testLogger.info('开始节点重命名测试（包含IP检测）');
  
  for (const url of testSubscriptionUrls) {
    testLogger.info(`测试订阅链接: ${url}`);
    
    try {
      // 直接解析订阅获取节点
      testLogger.info('开始获取订阅内容...');
      const response = await fetch(url);
      const content = await response.text();
      testLogger.info(`获取到订阅内容，长度: ${content.length}`);
      
      // 解析订阅内容
      testLogger.info('开始解析订阅内容...');
      const nodes = await parser.parse(content, 'auto');
      testLogger.info(`解析成功，获取到 ${nodes.length} 个节点`);
      
      if (nodes.length > 0) {
        // 显示原始节点名称
        testLogger.info(`原始节点名称示例:`);
        nodes.slice(0, 5).forEach((node, index) => {
          testLogger.info(`${index + 1}. ${node.name} (${node.type}) - ${node.server}:${node.port}`);
        });
        
        // 进行节点连通性测试和IP地理位置检测
        testLogger.info(`开始进行节点连通性测试和IP地理位置检测...`);
        const testResults = await nodeTester.testNodes(nodes.slice(0, 10)); // 只测试前10个节点以节省时间
        
        const validResults = testResults.filter(result => result.status === 'up');
        testLogger.info(`连通性测试完成: ${validResults.length}/${testResults.length} 个节点可用`);
        
        // 显示地理位置检测结果
        testLogger.info(`地理位置检测结果:`);
        validResults.forEach((result, index) => {
          const location = result.locationInfo ? 
            `${result.locationInfo.countryName || 'Unknown'} (${result.locationInfo.country || 'N/A'})` : 
            'Unknown';
          const needsCorrection = result.needsLocationCorrection ? ' [需要修正]' : '';
          testLogger.info(`${index + 1}. ${result.node.name} -> ${location}${needsCorrection}`);
        });
        
        // 修正节点地理位置信息
        const validNodes = validResults.map(result => result.node);
        const correctedNodes = nodeTester.correctNodeLocations(validNodes, validResults);
        
        // 显示修正后的节点名称
        testLogger.info(`地理位置修正后的节点名称:`);
        correctedNodes.forEach((node, index) => {
          testLogger.info(`${index + 1}. ${node.name} (${node.type}) - ${node.server}:${node.port}`);
        });
        
        // 分析节点
        testLogger.info(`开始分析修正后的节点...`);
        const { nodes: analyzedNodes } = nodeManager.processNodes(correctedNodes);
        testLogger.info(`节点分析完成，分析后节点数: ${analyzedNodes.length}`);
        
        // 显示分析结果示例
        testLogger.info(`节点分析结果示例:`);
        analyzedNodes.slice(0, 3).forEach((node, index) => {
          if (node.analysis) {
            testLogger.info(`${index + 1}. ${node.name} -> 国家: ${node.analysis.country || 'Unknown'}, 国家代码: ${node.analysis.countryCode || 'N/A'}, 协议: ${node.analysis.protocol || 'Unknown'}, 标签: ${node.analysis.tags ? node.analysis.tags.join(', ') : 'None'}`);
          }
        });
        
        // 重命名节点 - 测试基本格式
        testLogger.info(`\n开始重命名节点 (格式: {country}-{protocol}-{number})...`);
        const renamedNodes1 = nodeManager.renameNodes(analyzedNodes, {
          format: '{country}-{protocol}-{number}',
          includeCountry: true,
          includeProtocol: true,
          includeNumber: true,
          includeTags: false
        });
        
        testLogger.info(`基本格式重命名结果:`);
        renamedNodes1.forEach((node, index) => {
          testLogger.info(`${index + 1}. ${node.name} (${node.type}) - ${node.server}:${node.port}`);
        });
        
        // 测试包含标签的重命名
        testLogger.info(`\n开始重命名节点 (包含标签格式: {country}-{protocol}-{number}-{tags})...`);
        const renamedNodes2 = nodeManager.renameNodes(analyzedNodes, {
          format: '{country}-{protocol}-{number}-{tags}',
          includeCountry: true,
          includeProtocol: true,
          includeNumber: true,
          includeTags: true,
          tagLimit: 2
        });
        
        testLogger.info(`包含标签的重命名结果:`);
        renamedNodes2.forEach((node, index) => {
          testLogger.info(`${index + 1}. ${node.name} (${node.type}) - ${node.server}:${node.port}`);
        });
        
        // 测试自定义格式
        testLogger.info(`\n开始重命名节点 (自定义格式: {protocol}[{country}]-{number})...`);
        const renamedNodes3 = nodeManager.renameNodes(analyzedNodes, {
          format: '{protocol}[{country}]-{number}',
          includeCountry: true,
          includeProtocol: true,
          includeNumber: true,
          includeTags: false
        });
        
        testLogger.info(`自定义格式重命名结果:`);
        renamedNodes3.forEach((node, index) => {
          testLogger.info(`${index + 1}. ${node.name} (${node.type}) - ${node.server}:${node.port}`);
        });
        
      } else {
        testLogger.warn('没有获取到任何节点');
      }
      
    } catch (error) {
      testLogger.error(`处理订阅时出错: ${error.message}`);
      testLogger.error(error.stack);
    }
    
    testLogger.info('-'.repeat(50));
  }
  
  testLogger.info('节点重命名测试完成');
}

// 运行测试
testSubscription().catch(err => {
  testLogger.error('测试失败:', err);
  process.exit(1);
}); 