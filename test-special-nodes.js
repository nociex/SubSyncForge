// 测试特殊节点类型（CDN和运营商）的重命名功能
import { NodeManager } from './src/converter/analyzer/index.js';
import { logger } from './src/utils/index.js';

// 创建日志实例
const testLogger = logger.defaultLogger.child({ component: 'SpecialNodesTest' });

// 创建节点管理器
const nodeManager = new NodeManager();

// 模拟测试节点数据
const testNodes = [
  // CDN节点测试
  {
    name: '美国CloudFlare公司CDN节点',
    type: 'vmess',
    server: '1.1.1.1',
    port: 443
  },
  {
    name: 'Cloudflare CDN',
    type: 'trojan',
    server: '8.8.8.8',
    port: 443
  },
  {
    name: 'Amazon CloudFront CDN',
    type: 'ss',
    server: '2.2.2.2',
    port: 80
  },
  {
    name: 'Fastly CDN Node',
    type: 'vless',
    server: '3.3.3.3',
    port: 443
  },

  // 运营商节点测试
  {
    name: '广东省移动',
    type: 'vmess',
    server: '10.0.0.1',
    port: 10086
  },
  {
    name: '广东移动4G',
    type: 'trojan',
    server: '10.0.0.2',
    port: 443
  },
  {
    name: '中国联通',
    type: 'ss',
    server: '10.0.0.3',
    port: 80
  },
  {
    name: '北京电信',
    type: 'vless',
    server: '10.0.0.4',
    port: 443
  },
  {
    name: 'China Mobile CMCC',
    type: 'vmess',
    server: '10.0.0.5',
    port: 10086
  },

  // 普通节点对比测试
  {
    name: '美国洛杉矶节点',
    type: 'vmess',
    server: '4.4.4.4',
    port: 443,
    country: 'US',
    countryName: '美国'
  },
  {
    name: '香港节点HK01',
    type: 'trojan',
    server: '5.5.5.5',
    port: 443,
    country: 'HK',
    countryName: '香港'
  }
];

// 主测试函数
async function testSpecialNodes() {
  testLogger.info('开始特殊节点类型测试');
  
  try {
    // 分析节点
    testLogger.info('开始分析测试节点...');
    const { nodes: analyzedNodes } = nodeManager.processNodes(testNodes);
    testLogger.info(`节点分析完成，分析后节点数: ${analyzedNodes.length}`);
    
    // 显示分析结果
    testLogger.info('\n=== 节点分析结果 ===');
    analyzedNodes.forEach((node, index) => {
      if (node.analysis) {
        const type = node.analysis.nodeType || 'normal';
        testLogger.info(`${index + 1}. 原名: ${node.analysis.originalName}`);
        testLogger.info(`   类型: ${type}, 国家: ${node.analysis.country || 'Unknown'}, 协议: ${node.analysis.protocol || 'Unknown'}`);
        if (node.analysis.tags && node.analysis.tags.length > 0) {
          testLogger.info(`   标签: ${node.analysis.tags.join(', ')}`);
        }
      }
    });
    
    // 重命名测试
    testLogger.info('\n=== 重命名测试 ===');
    const renamedNodes = nodeManager.renameNodes(analyzedNodes, {
      format: '{country}-{protocol}-{number}',
      includeCountry: true,
      includeProtocol: true,
      includeNumber: true,
      includeTags: false
    });
    
    testLogger.info('重命名结果:');
    renamedNodes.forEach((node, index) => {
      const originalName = node.analysis ? node.analysis.originalName : node.name;
      const nodeType = node.analysis ? node.analysis.nodeType : 'normal';
      testLogger.info(`${index + 1}. [${nodeType}] ${originalName} -> ${node.name}`);
    });
    
    // 统计结果
    const cdnNodes = renamedNodes.filter(node => node.analysis && node.analysis.nodeType === 'cdn');
    const ispNodes = renamedNodes.filter(node => node.analysis && node.analysis.nodeType === 'isp');
    const normalNodes = renamedNodes.filter(node => !node.analysis || node.analysis.nodeType === 'normal');
    
    testLogger.info('\n=== 统计结果 ===');
    testLogger.info(`CDN节点数量: ${cdnNodes.length}`);
    testLogger.info(`运营商节点数量: ${ispNodes.length}`);
    testLogger.info(`普通节点数量: ${normalNodes.length}`);
    
    // 显示特殊节点的重命名结果
    if (cdnNodes.length > 0) {
      testLogger.info('\nCDN节点重命名:');
      cdnNodes.forEach((node, index) => {
        testLogger.info(`  ${index + 1}. ${node.name} (${node.type})`);
      });
    }
    
    if (ispNodes.length > 0) {
      testLogger.info('\n运营商节点重命名:');
      ispNodes.forEach((node, index) => {
        testLogger.info(`  ${index + 1}. ${node.name} (${node.type})`);
      });
    }
    
  } catch (error) {
    testLogger.error(`测试失败: ${error.message}`);
    testLogger.error(error.stack);
  }
  
  testLogger.info('特殊节点类型测试完成');
}

// 运行测试
testSpecialNodes().catch(err => {
  testLogger.error('测试失败:', err);
  process.exit(1);
}); 