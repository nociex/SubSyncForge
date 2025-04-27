/**
 * 同步订阅脚本
 * 用于从配置的订阅源获取数据，转换为目标格式并保存
 */

// 导入依赖
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SubscriptionConverter } from '../converter/SubscriptionConverter.js';
import yaml from 'js-yaml';

// 设置 ES 模块中的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置日志级别
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const DEBUG = LOG_LEVEL === 'debug';

// 订阅类型
const SubscriptionType = {
  V2RAY: 'v2ray',
  CLASH: 'clash',
  SHADOWSOCKS: 'ss',
  TROJAN: 'trojan',
  MIXED: 'mixed'
};

// 目标转换格式
const ConversionFormat = {
  CLASH: 'clash',
  SURGE: 'surge',
  QUANTUMULT: 'quantumult',
  QUANTUMULTX: 'quantumultx',
  LOON: 'loon',
  SHADOWROCKET: 'shadowrocket'
};

// 基本配置
const CONFIG = {
  dataDir: path.resolve(__dirname, '../../data'),
  outputDir: path.resolve(__dirname, '../../output'),
  configFile: path.resolve(__dirname, '../../config/custom.yaml'),
  subscriptions: []
};

// 确保目录存在
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    console.log(`创建目录: ${directory}`);
  }
}

// 从配置文件中读取订阅源
function loadSubscriptionsFromConfig() {
  try {
    if (!fs.existsSync(CONFIG.configFile)) {
      console.warn(`配置文件不存在: ${CONFIG.configFile}`);
      return [];
    }

    const content = fs.readFileSync(CONFIG.configFile, 'utf-8');
    const config = yaml.load(content);

    if (!config || !config.subscriptions || !Array.isArray(config.subscriptions)) {
      console.warn('配置文件中未找到有效的订阅源配置');
      return [];
    }

    // 处理配置文件中的订阅源
    return config.subscriptions.map((sub, index) => {
      // 提取注释中的备注信息
      const remarkMatch = content.split('\n')
        .find(line => line.includes(`# 备注: `) && content.indexOf(line) > content.indexOf(sub.value || ''))?.match(/# 备注: (.+)/);
      
      const remark = remarkMatch ? remarkMatch[1].trim() : null;
      const id = `sub-${index + 1}`;
      const name = remark || `订阅源 ${index + 1}`;
      
      return {
        id,
        name,
        url: sub.value,
        type: sub.type,
        enabled: true
      };
    }).filter(sub => sub.url); // 过滤掉没有 URL 的订阅
  } catch (error) {
    console.error('解析配置文件失败:', error.message);
    return [];
  }
}

// 主函数
async function main() {
  console.log('开始同步订阅...');
  
  // 确保目录存在
  ensureDirectoryExists(CONFIG.dataDir);
  ensureDirectoryExists(CONFIG.outputDir);
  
  // 加载订阅源配置
  CONFIG.subscriptions = loadSubscriptionsFromConfig();
  
  if (CONFIG.subscriptions.length === 0) {
    console.warn('未找到有效的订阅源配置，同步过程已终止');
    return;
  }
  
  console.log(`发现 ${CONFIG.subscriptions.length} 个订阅源`);

  // 创建转换器实例
  const converter = new SubscriptionConverter({
    dedup: true,
    validateInput: true,
    validateOutput: true,
    recordMetrics: true,
    emitEvents: true,
    nodeManagement: true,
    renameNodes: false,
    groupingMode: 'advanced',
    applyRules: true
  });
  
  // 依次处理每个订阅
  for (const subscription of CONFIG.subscriptions) {
    if (!subscription.enabled) {
      console.log(`跳过禁用的订阅: ${subscription.name}`);
      continue;
    }
    
    console.log(`处理订阅: ${subscription.name} (${subscription.url})`);
    
    try {
      // 保存原始数据到 data 目录
      const rawResult = await converter.convert(
        subscription.url, 
        'raw', 
        { dedup: false, nodeManagement: false }
      );
      
      if (!rawResult.success) {
        throw new Error(`获取订阅失败: ${rawResult.error}`);
      }
      
      // 保存原始数据
      const rawFile = path.join(CONFIG.dataDir, `${subscription.id}.txt`);
      fs.writeFileSync(rawFile, rawResult.data);
      console.log(`保存原始订阅到: ${rawFile} (${rawResult.nodeCount} 个节点)`);
      
      // 转换为 Clash 格式并保存到 output 目录
      const clashResult = await converter.convert(
        subscription.url, 
        ConversionFormat.CLASH, 
        {
          template: {
            name: subscription.name,
            updated: new Date().toISOString()
          }
        }
      );
      
      if (clashResult.success) {
        const clashFile = path.join(CONFIG.outputDir, `${subscription.id}.yaml`);
        fs.writeFileSync(clashFile, clashResult.data);
        console.log(`保存 Clash 配置到: ${clashFile} (${clashResult.nodeCount} 个节点)`);
      } else {
        console.error(`转换为 Clash 格式失败: ${clashResult.error}`);
      }
      
    } catch (error) {
      console.error(`处理订阅 ${subscription.name} 时出错:`, error.message);
    }
  }
  
  console.log('订阅同步完成');
}

// 执行主函数
main().catch(error => {
  console.error('同步过程中发生错误:', error);
  process.exit(1);
}); 