// 导入SubscriptionConverter
import { SubscriptionConverter } from './src/converter/SubscriptionConverter.js';

// 导入需要的工具
import { logger } from './src/utils/index.js';

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
        
        // 显示前3个节点的信息
        const clashData = JSON.parse(result.data);
        if (clashData.proxies && clashData.proxies.length > 0) {
          testLogger.info(`节点示例:`);
          clashData.proxies.slice(0, 3).forEach((proxy, index) => {
            testLogger.info(`${index + 1}. ${proxy.name} (${proxy.type}) - ${proxy.server}:${proxy.port}`);
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