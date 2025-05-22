// 导入SubscriptionConverter
import { SubscriptionConverter } from './src/converter/SubscriptionConverter.js';
import { NodeManager } from './src/converter/analyzer/index.js';
import { NodeTester } from './src/core/testing/NodeTester.js';
import { NodeProcessor } from './src/core/node/NodeProcessor.js';

// 导入需要的工具
import { logger } from './src/utils/index.js';
import yaml from 'js-yaml'; // 导入js-yaml库用于解析YAML

// 创建日志实例
const testLogger = logger.defaultLogger.child({ component: 'TestScript' });

// 测试订阅URL（使用一个公共可用的测试订阅链接）
// 这里使用一个示例链接，您可以替换为实际可用的订阅链接
const testSubscriptionUrls = [
  'https://sub.xeton.dev/sub?target=clash&url=https://raw.githubusercontent.com/freefq/free/master/v2&config=https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/config/ACL4SSR_Online_Mini.ini',
  'https://raw.githubusercontent.com/freefq/free/master/v2', // 常见的Base64编码订阅
  'https://github.com/ermaozi/get_subscribe/raw/main/subscribe/v2ray.txt' // 另一个测试订阅
];

// 创建SubscriptionConverter实例
const converter = new SubscriptionConverter({
  logger: testLogger,
  groupingMode: 'advanced',
  dedup: true,
  applyRules: true
});

// 创建节点测试器
const nodeTester = new NodeTester({
  concurrency: 10,
  timeout: 5000,
  filterInvalid: true,
  logger: testLogger
});

// 创建节点处理器
const nodeProcessor = new NodeProcessor({
  deduplication: true,
  filterIrrelevant: true,
  logger: testLogger
});

// 创建节点管理器
const nodeManager = new NodeManager();

// 主函数
async function testSubscription() {
  testLogger.info('开始订阅测试');
  
  for (const url of testSubscriptionUrls) {
    testLogger.info(`测试订阅链接: ${url}`);
    
    try {
      // 转换为clash格式
      const result = await converter.convert(url, 'clash');
      
      if (result.success) {
        testLogger.info(`成功转换订阅! 获取到 ${result.nodeCount} 个节点`);
        testLogger.info(`转换耗时: ${result.time}ms`);
        
        // 获取节点数据 - 使用js-yaml解析Clash配置
        const clashData = yaml.load(result.data);
        if (clashData.proxies && clashData.proxies.length > 0) {
          // 获取节点
          const nodes = clashData.proxies.map(proxy => ({
            type: proxy.type,
            name: proxy.name,
            server: proxy.server,
            port: proxy.port,
            settings: {
              password: proxy.password,
              method: proxy.cipher || proxy.method,
              id: proxy.uuid || proxy.id
            }
          }));
          
          testLogger.info(`开始测试节点有效性...`);
          
          // 测试节点有效性
          const testedNodes = await nodeTester.testNodes(nodes);
          const validNodes = testedNodes.filter(node => node.valid);
          
          testLogger.info(`测试完成，总共 ${testedNodes.length} 个节点，有效 ${validNodes.length} 个节点`);
          
          // 处理节点
          const processedNodes = nodeProcessor.processNodes(validNodes, { onlyValid: true });
          testLogger.info(`处理后有 ${processedNodes.length} 个有效节点`);
          
          // 分析节点
          const { nodes: analyzedNodes } = nodeManager.processNodes(processedNodes);
          
          // 重命名节点
          const renamedNodes = nodeManager.renameNodes(analyzedNodes);
          
          // 确保节点名称不重复
          const uniqueNameMap = new Map();
          let uniqueNodes = [];
          
          renamedNodes.forEach((node, index) => {
            // 如果名称已存在，则添加后缀以确保唯一性
            let baseName = node.name;
            let uniqueName = baseName;
            let counter = 1;
            
            while (uniqueNameMap.has(uniqueName)) {
              uniqueName = `${baseName}-${counter}`;
              counter++;
            }
            
            uniqueNameMap.set(uniqueName, true);
            uniqueNodes.push({
              ...node,
              name: uniqueName
            });
          });
          
          // 显示重命名后的节点
          testLogger.info(`节点重命名完成，最终有效节点数量: ${uniqueNodes.length}`);
          
          // 显示前10个有效节点
          testLogger.info(`有效节点示例:`);
          uniqueNodes.slice(0, 10).forEach((node, index) => {
            testLogger.info(`${index + 1}. ${node.name} (${node.type}) - ${node.server}:${node.port} - 延迟: ${node.latency}ms`);
          });
        }
      } else {
        testLogger.error(`转换失败: ${result.error}`);
        testLogger.error(`错误代码: ${result.code}`);
      }
    } catch (error) {
      testLogger.error(`处理订阅时出错: ${error.message}`);
      testLogger.error(error.stack);
    }
    
    testLogger.info('-'.repeat(50));
  }
  
  testLogger.info('订阅测试完成');
}

// 运行测试
testSubscription().catch(err => {
  testLogger.error('测试失败:', err);
  process.exit(1);
}); 