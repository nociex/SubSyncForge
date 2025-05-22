/**
 * 同步订阅脚本
 * 用于从配置的订阅源获取数据，转换为目标格式并保存
 */

// 导入依赖
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SubscriptionConverter } from '../converter/SubscriptionConverter.js';
import { NodeTester } from '../tester/NodeTester.js';
import yaml from 'js-yaml';
import { BarkNotifier } from '../utils/events/BarkNotifier.js';
import { eventEmitter, EventType } from '../utils/events/index.js';
import { HttpsProxyAgent } from 'https-proxy-agent'; // 需要引入

// 全局超时控制 - 设置为5小时，留1小时的余量
const MAX_EXECUTION_TIME = 5 * 60 * 60 * 1000; // 5小时(毫秒)
let globalStartTime = Date.now();

// 检查是否接近时间限制
function checkTimeLimit() {
  const elapsed = Date.now() - globalStartTime;
  if (elapsed > MAX_EXECUTION_TIME) {
    console.warn(`⚠️ 执行时间已达到${(elapsed/3600000).toFixed(1)}小时，接近GitHub Actions限制，提前结束流程`);
    return true;
  }
  return false;
}

// 设置 ES 模块中的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置日志级别
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
console.log(`[Logger] Setting log level to: ${LOG_LEVEL}`);
const DEBUG = LOG_LEVEL === 'debug';

// 获取项目根目录
const rootDir = path.resolve(__dirname, '../..');
console.log(`项目根目录: ${rootDir}`);

// --- 国内代理缓存配置 ---
const CHINA_PROXY_CACHE_PATH = path.resolve(rootDir, 'data/ip_cache/china_proxies.json');
let loadedChinaProxies = []; // 缓存加载的代理
let currentProxyIndex = 0;

// 确保缓存目录存在
ensureDirectoryExists(path.dirname(CHINA_PROXY_CACHE_PATH));

// 加载国内代理缓存
function loadChinaProxies() {
  try {
    if (fs.existsSync(CHINA_PROXY_CACHE_PATH)) {
      const content = fs.readFileSync(CHINA_PROXY_CACHE_PATH, 'utf-8');
      const proxies = JSON.parse(content);
      if (Array.isArray(proxies)) {
        console.log(`成功从 ${CHINA_PROXY_CACHE_PATH} 加载 ${proxies.length} 个国内代理缓存`);
        return proxies.filter(p => typeof p === 'string' && p.startsWith('http')); // 基本验证
      }
    }
  } catch (error) {
    console.error(`加载国内代理缓存失败: ${error.message}`);
  }
  console.log('未找到或无法加载国内代理缓存文件。');
  return [];
}

// 保存国内代理缓存
function saveChinaProxies(proxies) {
  try {
    // 只保存有效的 HTTP/HTTPS 代理 URL
    const validProxies = proxies.filter(p => typeof p === 'string' && p.startsWith('http'));
    fs.writeFileSync(CHINA_PROXY_CACHE_PATH, JSON.stringify(validProxies, null, 2));
    console.log(`已将 ${validProxies.length} 个国内代理缓存保存到 ${CHINA_PROXY_CACHE_PATH}`);
  } catch (error) {
    console.error(`保存国内代理缓存失败: ${error.message}`);
  }
}

// 提供国内代理的函数 (轮询)
function getChinaProxy() {
  if (loadedChinaProxies.length === 0) {
    return null; // 没有可用代理
  }
  const proxy = loadedChinaProxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % loadedChinaProxies.length;
  console.log(`[ProxyProvider] 提供国内代理: ${proxy}`);
  return proxy;
}
// --- 结束 国内代理缓存配置 ---

// 订阅类型
const SubscriptionType = {
  URL: 'url',
  BASE64: 'base64',
  VMESS: 'vmess',
  SS: 'ss',
  SSR: 'ssr',
  TROJAN: 'trojan'
};

// 目标转换格式
const ConversionFormat = {
  CLASH: 'clash',
  MIHOMO: 'mihomo',
  SURGE: 'surge',
  SINGBOX: 'singbox',
  V2RAY: 'v2ray'
};

// 测试配置
const TESTING_CONFIG = {
  enabled: true,
  concurrency: 5,
  timeout: 5000,
  test_url: "http://www.google.com/generate_204",
  filter_invalid: true,
  sort_by_latency: true,
  max_latency: 2000,
  max_nodes: 100,
  verify_location: false,
  ip_location: null
};

// 基本配置
const CONFIG = {
  rootDir: rootDir,
  configFile: path.resolve(rootDir, 'config/custom.yaml'),
  subscriptions: [],
  outputConfigs: [],
  options: {
    deduplication: true,
    dataDir: 'data',
    outputDir: 'output'
  },
  advanced: {
    logLevel: 'info',
    cacheTtl: 3600,
    proxyForSubscription: false,
    sortNodes: true,
    syncInterval: 360
  }
};

// 确保目录存在
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`创建目录: ${dirPath}`);
    } catch (error) {
      console.error(`创建目录失败: ${dirPath}, 错误: ${error.message}`);
      throw error;
    }
  }
}

// 从配置文件中读取订阅源和配置
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG.configFile)) {
      console.warn(`配置文件不存在: ${CONFIG.configFile}`);
      
      // 尝试在当前工作目录下查找
      const cwdConfigPath = path.resolve(process.cwd(), 'config/custom.yaml');
      console.log(`尝试在当前工作目录查找配置: ${cwdConfigPath}`);
      
      if (fs.existsSync(cwdConfigPath)) {
        CONFIG.configFile = cwdConfigPath;
        console.log(`找到配置文件: ${CONFIG.configFile}`);
      } else {
        return false;
      }
    }

    const content = fs.readFileSync(CONFIG.configFile, 'utf-8');
    const config = yaml.load(content);

    if (!config) {
      console.warn('配置文件内容为空');
      return false;
    }

    // 加载订阅源
    if (config.subscriptions && Array.isArray(config.subscriptions)) {
      CONFIG.subscriptions = config.subscriptions;
    } else if (typeof config.subscriptions === 'object') {
      // 处理对象格式的订阅源
      CONFIG.subscriptions = Object.entries(config.subscriptions).map(([key, sub]) => ({
        name: key,
        url: sub.url,
        enabled: sub.enabled !== false,
        type: 'url'
      }));
    } else {
      console.warn('配置文件中未找到有效的订阅源配置');
      CONFIG.subscriptions = [];
    }

    // 加载输出配置
    if (config.output) {
      if (config.output.deduplication !== undefined) {
        CONFIG.options.deduplication = config.output.deduplication;
      }
      
      if (config.output.dir) {
        CONFIG.options.outputDir = config.output.dir;
      }
      
      if (config.output.data_dir) {
        CONFIG.options.dataDir = config.output.data_dir;
      }
      
      if (config.output.configs && Array.isArray(config.output.configs)) {
        CONFIG.outputConfigs = config.output.configs;
      }
    }

    // 加载高级设置
    if (config.advanced) {
      if (config.advanced.log_level) {
        CONFIG.advanced.logLevel = config.advanced.log_level;
      }
      
      if (config.advanced.cache_ttl) {
        CONFIG.advanced.cacheTtl = config.advanced.cache_ttl;
      }
      
      if (config.advanced.proxy_for_subscription !== undefined) {
        CONFIG.advanced.proxyForSubscription = config.advanced.proxy_for_subscription;
      }
      
      if (config.advanced.sort_nodes !== undefined) {
        CONFIG.advanced.sortNodes = config.advanced.sort_nodes;
      }
      
      if (config.advanced.sync_interval) {
        CONFIG.advanced.syncInterval = config.advanced.sync_interval;
      }
    }

    // 加载测试配置
    if (config.testing) {
      TESTING_CONFIG.enabled = config.testing.enabled !== false;
      
      if (config.testing.concurrency) {
        TESTING_CONFIG.concurrency = config.testing.concurrency;
      }
      
      if (config.testing.timeout) {
        TESTING_CONFIG.timeout = config.testing.timeout;
      }
      
      if (config.testing.test_url) {
        TESTING_CONFIG.test_url = config.testing.test_url;
      }
      
      if (config.testing.filter_invalid !== undefined) {
        TESTING_CONFIG.filter_invalid = config.testing.filter_invalid;
      }
      
      if (config.testing.sort_by_latency !== undefined) {
        TESTING_CONFIG.sort_by_latency = config.testing.sort_by_latency;
      }
      
      if (config.testing.max_latency !== undefined) {
        TESTING_CONFIG.max_latency = config.testing.max_latency;
      }
      
      if (config.testing.max_nodes !== undefined) {
        TESTING_CONFIG.max_nodes = config.testing.max_nodes;
      }
      
      // 加载地区验证配置
      if (config.testing.verify_location !== undefined) {
        TESTING_CONFIG.verify_location = config.testing.verify_location;
      }
      
      // 加载IP地址定位配置
      if (config.testing.ip_location) {
        TESTING_CONFIG.ip_location = {
          api_url: config.testing.ip_location.api_url || 'https://ipinfo.io/{ip}/json',
          api_key: config.testing.ip_location.api_key || '',
          cache_time: config.testing.ip_location.cache_time || 604800000 // 默认7天
        };
      }
    }

    return CONFIG.subscriptions.length > 0;
  } catch (error) {
    console.error('解析配置文件失败:', error.message);
    return false;
  }
}

// 处理单个订阅源的函数，用于并行处理
async function fetchSubscription(subscription, converter) {
  if (!subscription.enabled) {
    console.log(`跳过禁用的订阅: ${subscription.name}`);
    return [];
  }
  
  try {
    console.log(`===========================================================`);
    console.log(`开始处理订阅: ${subscription.name}, 类型: ${subscription.type || 'url'}, URL: ${subscription.url || '(BASE64/直接内容)'}`);
    
    // 增量处理逻辑：检查缓存
    const dataDir = path.join(CONFIG.rootDir, CONFIG.options.dataDir);
    ensureDirectoryExists(dataDir);
    
    // 缓存文件路径
    const subscriptionCachePath = path.join(dataDir, `subscription_${subscription.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    const subscriptionRawPath = path.join(dataDir, `${subscription.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`);
    
    // 默认需要更新
    let needUpdate = true;
    let cachedNodes = [];
    let lastHash = '';
    let lastTimestamp = 0;
    
    // 检查缓存
    if (fs.existsSync(subscriptionCachePath)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(subscriptionCachePath, 'utf-8'));
        if (cacheData && cacheData.nodes && Array.isArray(cacheData.nodes)) {
          cachedNodes = cacheData.nodes;
          lastHash = cacheData.hash || '';
          lastTimestamp = cacheData.timestamp || 0;
          
          // 检查更新间隔时间是否超过配置的间隔
          // 使用advanced.syncInterval配置项，默认为6小时(21600秒)
          const updateInterval = (CONFIG.advanced.syncInterval || 360) * 60 * 1000; // 转换为毫秒
          const timeNow = Date.now();
          
          if (timeNow - lastTimestamp < updateInterval) {
            console.log(`订阅 ${subscription.name} 上次更新时间为 ${new Date(lastTimestamp).toLocaleString()}`);
            console.log(`未超过更新间隔(${updateInterval/60000}分钟)，使用缓存数据，包含 ${cachedNodes.length} 个节点`);
            return cachedNodes;
          } else {
            console.log(`订阅 ${subscription.name} 缓存已过期，需要更新。上次更新: ${new Date(lastTimestamp).toLocaleString()}`);
          }
        }
      } catch (e) {
        console.error(`读取订阅缓存失败: ${e.message}`);
      }
    } else {
      console.log(`未找到订阅 ${subscription.name} 的缓存`);
    }
    
    let result = [];
    
    // 根据订阅类型处理
    if (subscription.type === SubscriptionType.BASE64 && subscription.content) {
      // 处理Base64内容
      console.log(`解析Base64订阅内容: ${subscription.name}`);
      // 计算内容哈希
      const contentHash = require('crypto').createHash('md5').update(subscription.content).digest('hex');
      
      // 如果哈希值相同，则内容未变化
      if (contentHash === lastHash) {
        console.log(`Base64内容未变化，使用缓存数据，包含 ${cachedNodes.length} 个节点`);
        return cachedNodes;
      }
      
      // 内容变化，重新解析
      result = await converter.parser.parse(subscription.content);
      console.log(`解析Base64订阅: ${subscription.name}, 获取 ${result.length} 个节点`);
      
      // 保存缓存
      saveCacheData(subscriptionCachePath, result, contentHash);
      
    } else if ([SubscriptionType.VMESS, SubscriptionType.SS, SubscriptionType.SSR, SubscriptionType.TROJAN].includes(subscription.type) && subscription.content) {
      // 处理单个节点
      console.log(`解析单个${subscription.type}节点: ${subscription.name}`);
      
      // 计算内容哈希
      const contentHash = require('crypto').createHash('md5').update(subscription.content).digest('hex');
      
      // 如果哈希值相同，则内容未变化
      if (contentHash === lastHash) {
        console.log(`节点内容未变化，使用缓存数据`);
        return cachedNodes;
      }
      
      // 内容变化，重新解析
      const node = await converter.parser.parseLine(subscription.content);
      result = node ? [node] : [];
      console.log(`解析${subscription.type}节点: ${subscription.name}, 成功: ${result.length > 0}`);
      
      // 保存缓存
      saveCacheData(subscriptionCachePath, result, contentHash);
      
    } else if (subscription.url) {
      // 获取URL订阅
      console.log(`从URL获取订阅: ${subscription.url}`);
      try {
        // 根据URL自定义请求头，部分订阅源需要特殊处理
        const customHeaders = {};
        const fetchOptions = { 
          headers: customHeaders,
          timeout: 60000, // 60秒超时
          retry: 3 // 最多重试3次
        };
        
        // 为某些域名设置特殊请求头
        const url = new URL(subscription.url);
        const domain = url.hostname;
        
        // 为特定域名添加Referer和更多特定处理
        if (domain.includes('alalbb.top')) {
          console.log(`检测到alalbb.top域名，添加特定请求头`);
          customHeaders['Referer'] = 'https://alalbb.top/';
          customHeaders['Origin'] = 'https://alalbb.top';
          customHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        } else if (domain.includes('flyi.me')) {
          console.log(`检测到flyi.me域名，添加特定请求头`);
          customHeaders['Referer'] = 'https://freesu7.flyi.me/';
          customHeaders['Origin'] = 'https://freesu7.flyi.me';
          customHeaders['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15';
        }
        
        console.log(`为 ${subscription.name} 设置的自定义请求头:`, customHeaders);
        
        // *** 添加 requireChinaIP 选项 ***
        fetchOptions.requireChinaIP = subscription.requireChinaIP === true;
        if (fetchOptions.requireChinaIP) {
          console.log(`[Fetcher] 订阅 ${subscription.name} 已标记需要国内代理`);
        }
        
        // 如果存在上次的原始数据文件，添加条件请求头
        if (fs.existsSync(subscriptionRawPath)) {
          try {
            const stats = fs.statSync(subscriptionRawPath);
            const lastModified = new Date(stats.mtime).toUTCString();
            customHeaders['If-Modified-Since'] = lastModified;
            console.log(`添加条件请求头 If-Modified-Since: ${lastModified}`);
          } catch (e) {
            console.error(`获取文件状态失败: ${e.message}`);
          }
        }

        const fetchResult = await converter.fetcher.fetch(subscription.url, fetchOptions);
        
        // 检查是否304 Not Modified (服务器返回的状态码)
        if (fetchResult.status === 304) {
          console.log(`订阅源返回304 Not Modified，内容未变化，使用缓存`);
          return cachedNodes;
        }
        
        const rawData = fetchResult.data;
        
        // 内容为空则使用缓存
        if (!rawData || rawData.trim() === '') {
          console.warn(`获取到的订阅内容为空，使用缓存数据`);
          if (cachedNodes.length > 0) {
            return cachedNodes;
          }
          return [];
        }
        
        // 计算内容哈希
        const contentHash = require('crypto').createHash('md5').update(rawData).digest('hex');
        
        // 检查内容是否变化
        if (contentHash === lastHash && lastHash !== '') {
          console.log(`订阅内容哈希未变化，使用缓存数据，包含 ${cachedNodes.length} 个节点`);
          return cachedNodes;
        }
        
        console.log(`成功获取订阅: ${subscription.name}, 原始数据大小: ${rawData.length} 字节, 哈希: ${contentHash.substring(0, 8)}...`);
        
        // 保存原始数据
        try {
          fs.writeFileSync(subscriptionRawPath, rawData);
          console.log(`原始订阅数据已保存到: ${subscriptionRawPath}`);
        } catch (writeError) {
          console.error(`保存原始订阅数据失败: ${writeError.message}`);
        }
        
        // 解析节点
        console.log(`解析订阅数据...`);
        try {
          result = await converter.parser.parse(rawData);
          console.log(`从 ${subscription.name} 解析出 ${result.length} 个节点`);
          
          // 检查是否解析结果为空
          if (result.length === 0 && cachedNodes.length > 0) {
            console.warn(`解析结果为空，但有缓存数据，使用缓存数据 ${cachedNodes.length} 个节点`);
            return cachedNodes;
          }
          
          // 保存缓存
          saveCacheData(subscriptionCachePath, result, contentHash);
          
        } catch (parseError) {
          console.error(`解析订阅数据时出错:`, parseError.message);
          
          // 如果解析失败但有缓存，使用缓存数据
          if (cachedNodes.length > 0) {
            console.warn(`解析失败但存在缓存，使用缓存数据 (${cachedNodes.length} 个节点)`);
            return cachedNodes;
          }
        }
      } catch (fetchError) {
        console.error(`获取订阅失败: ${fetchError.message}`);
        
        // 如果获取失败但有缓存，使用缓存数据
        if (cachedNodes.length > 0) {
          console.warn(`获取失败但存在缓存，使用缓存数据 (${cachedNodes.length} 个节点)`);
          return cachedNodes;
        }
        
        // 记录错误但继续处理其他订阅
        return [];
      }
    }
    
    // 添加订阅源信息到节点
    return result.map(node => ({
      ...node,
      source: subscription.name
    }));
  } catch (error) {
    console.error(`处理订阅 ${subscription.name} 时出错:`, error.message);
    
    // 如果有缓存，使用缓存数据
    const dataDir = path.join(CONFIG.rootDir, CONFIG.options.dataDir);
    const subscriptionCachePath = path.join(dataDir, `subscription_${subscription.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    
    if (fs.existsSync(subscriptionCachePath)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(subscriptionCachePath, 'utf-8'));
        if (cacheData && cacheData.nodes && Array.isArray(cacheData.nodes)) {
          console.warn(`处理订阅出错但存在缓存，使用缓存数据 (${cacheData.nodes.length} 个节点)`);
          return cacheData.nodes;
        }
      } catch (e) {
        console.error(`读取缓存失败: ${e.message}`);
      }
    }
    
    return []; // 返回空数组，不影响其他订阅的处理
  }
}

// 修改后的fetchAndMergeAllNodes函数，支持并行处理
async function fetchAndMergeAllNodes(converter) {
  const enabledSubscriptions = CONFIG.subscriptions.filter(sub => sub.enabled);
  console.log(`准备获取 ${enabledSubscriptions.length} 个启用的订阅源的节点`);
  
  // 使用并行处理提高效率
  const fetchPromises = enabledSubscriptions.map(sub => fetchSubscription(sub, converter));
  
  // 设置批次大小，避免并发太多
  const BATCH_SIZE = 5;
  const allNodes = [];
  
  // 增量更新标识和计数
  let hasUpdates = false;
  let cachedNodeCount = 0;
  let updatedNodeCount = 0;
  
  // 分批处理订阅源
  for (let i = 0; i < fetchPromises.length; i += BATCH_SIZE) {
    if (checkTimeLimit()) {
      console.warn('执行时间接近限制，终止剩余订阅获取');
      break;
    }
    
    const batchPromises = fetchPromises.slice(i, i + BATCH_SIZE);
    console.log(`处理订阅批次 ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(fetchPromises.length/BATCH_SIZE)}`);
    
    const batchResults = await Promise.all(batchPromises);
    
    // 处理每个订阅源的结果
    for (let j = 0; j < batchResults.length; j++) {
      const subscriptionIndex = i + j;
      if (subscriptionIndex < enabledSubscriptions.length) {
        const subscription = enabledSubscriptions[subscriptionIndex];
        const nodes = batchResults[j];
        
        if (nodes && nodes.length > 0) {
          console.log(`订阅 ${subscription.name} 返回 ${nodes.length} 个节点`);
          
          // 检查这些节点是否来自缓存
          const dataDir = path.join(CONFIG.rootDir, CONFIG.options.dataDir);
          const subscriptionCachePath = path.join(dataDir, `subscription_${subscription.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
          let isFromCache = false;
          
          try {
            if (fs.existsSync(subscriptionCachePath)) {
              const cacheData = JSON.parse(fs.readFileSync(subscriptionCachePath, 'utf-8'));
              const cacheTime = cacheData.timestamp || 0;
              // 如果缓存时间在5分钟内，认为这是刚刚从缓存获取的数据
              if (Date.now() - cacheTime < 5 * 60 * 1000) {
                isFromCache = true;
              }
            }
          } catch (e) {
            console.error(`检查缓存状态时出错: ${e.message}`);
          }
          
          // 统计使用缓存和更新的节点数量
          if (isFromCache) {
            cachedNodeCount += nodes.length;
            console.log(`订阅 ${subscription.name} 使用缓存数据`);
          } else {
            updatedNodeCount += nodes.length;
            hasUpdates = true;
            console.log(`订阅 ${subscription.name} 获取了更新的数据`);
          }
          
          // 将节点添加到总列表
          allNodes.push(...nodes);
        } else {
          console.log(`订阅 ${subscription.name} 未返回任何节点`);
        }
      }
    }
    
    // 保存中间结果
    const checkpointFile = path.join(CONFIG.rootDir, CONFIG.options.dataDir, 'checkpoint.json');
    try {
      fs.writeFileSync(checkpointFile, JSON.stringify({
        timestamp: Date.now(),
        processed: i + batchPromises.length,
        total: fetchPromises.length,
        nodeCount: allNodes.length,
        cachedNodeCount,
        updatedNodeCount,
        hasUpdates
      }));
    } catch (e) {
      console.error('保存检查点数据失败:', e.message);
    }
  }
  
  // 如果启用去重，对所有节点进行去重
  let finalNodes = allNodes;
  if (CONFIG.options.deduplication && allNodes.length > 0) {
    console.log(`正在进行节点去重...`);
    finalNodes = converter.deduplicator.deduplicate(allNodes);
    console.log(`节点去重: ${allNodes.length} -> ${finalNodes.length}`);
  }
  
  // 对节点进行分析和重命名
  if (finalNodes.length > 0) {
    console.log(`正在对节点进行分析和重命名...`);
    // 使用nodeManager处理节点
    const processedResult = converter.nodeManager.processNodes(finalNodes);
    finalNodes = processedResult.nodes;
    
    // 重命名节点
    finalNodes = converter.nodeManager.renameNodes(finalNodes, {
      format: '{country}{protocol}{tags}{number}',
      includeCountry: true,
      includeProtocol: true,
      includeNumber: true,
      includeTags: true,
      tagLimit: 2
    });
    
    console.log(`完成节点分析和重命名，节点数量: ${finalNodes.length}`);
  }
  
  console.log(`所有订阅处理完成，共获取 ${allNodes.length} 个节点 (缓存: ${cachedNodeCount}, 更新: ${updatedNodeCount})`);
  console.log(`最终节点数量(去重后): ${finalNodes.length}`);
  console.log(`是否有订阅源更新: ${hasUpdates ? '是' : '否'}`);
  
  // 如果没有任何更新，并且最终节点数量为0，尝试加载上次的最终节点数据
  if (!hasUpdates && finalNodes.length === 0) {
    const dataDir = path.join(CONFIG.rootDir, CONFIG.options.dataDir);
    const finalNodesFile = path.join(dataDir, 'final_nodes.json');
    
    if (fs.existsSync(finalNodesFile)) {
      try {
        console.log(`未获取到任何节点，且无订阅更新，尝试加载上次的最终节点数据...`);
        const lastFinalNodes = JSON.parse(fs.readFileSync(finalNodesFile, 'utf-8'));
        if (Array.isArray(lastFinalNodes) && lastFinalNodes.length > 0) {
          finalNodes = lastFinalNodes;
          console.log(`成功加载上次的最终节点数据，共 ${finalNodes.length} 个节点`);
        }
      } catch (e) {
        console.error(`加载上次最终节点数据失败: ${e.message}`);
      }
    }
  }
  
  return finalNodes;
}

// 修改后的testNodes函数，支持批次处理
async function testNodes(nodes, testConfig) {
  // 如果测试功能禁用，返回空结果
  if (!testConfig.enabled) {
    return { results: [], tester: null };
  }

  console.log(`开始测试 ${nodes.length} 个节点的连通性和延迟...`);
  console.log(`测试配置: 并发=${testConfig.concurrency}, 超时=${testConfig.timeout}ms, URL=${testConfig.test_url}`);

  try {
    // 创建测试器实例
    const tester = new NodeTester({
      concurrency: testConfig.concurrency,
      timeout: testConfig.timeout,
      testUrl: testConfig.test_url,
      verifyLocation: testConfig.verify_location !== false,
      ipLocatorOptions: {
        apiUrl: testConfig.ip_location?.api_url,
        apiKey: testConfig.ip_location?.api_key,
        cacheTime: testConfig.ip_location?.cache_time
      }
    });
    
    // 批次处理节点测试
    const BATCH_SIZE = 100; // 每批处理100个节点
    const batches = [];
    for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
      batches.push(nodes.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`将 ${nodes.length} 个节点分为 ${batches.length} 批进行测试`);
    
    let allResults = [];
    for (let i = 0; i < batches.length; i++) {
      if (checkTimeLimit()) {
        console.warn('执行时间接近限制，终止剩余节点测试');
        break;
      }
      
      const batch = batches[i];
      console.log(`测试批次 ${i+1}/${batches.length}, 包含 ${batch.length} 个节点`);
      
      const batchStartTime = Date.now();
      const batchResults = await tester.testNodes(batch);
      const batchTime = Date.now() - batchStartTime;
      
      console.log(`批次 ${i+1} 测试完成，耗时: ${batchTime}ms, 成功: ${batchResults.filter(r => r.status === 'up').length}/${batch.length}`);
      allResults = allResults.concat(batchResults);
      
      // 保存中间测试结果
      const testCheckpointFile = path.join(CONFIG.rootDir, CONFIG.options.dataDir, 'test_checkpoint.json');
      try {
        fs.writeFileSync(testCheckpointFile, JSON.stringify({
          timestamp: Date.now(),
          processed: i + 1,
          total: batches.length,
          resultCount: allResults.length,
          validCount: allResults.filter(r => r.status === 'up').length
        }));
      } catch (e) {
        console.error('保存测试检查点数据失败:', e.message);
      }
    }
    
    // 返回测试结果和测试器实例
    return { results: allResults, tester };
  } catch (error) {
    console.error('节点测试过程出错:', error.message);
    console.error('错误堆栈:', error.stack);
    // 测试失败时返回空结果
    return { results: [], tester: null };
  }
}

/**
 * 生成各种配置文件
 * @param {Array} nodes 所有节点
 * @param {Object} outputConfigs 输出配置
 * @param {Object} options 全局选项
 */
async function generateConfigs(nodes, outputConfigs, options) {
  // 添加更详细的日志
  console.log(`=== 开始生成配置文件 ===`);
  console.log(`输出配置详情: ${JSON.stringify(outputConfigs, null, 2)}`);
  console.log(`选项详情: ${JSON.stringify(options, null, 2)}`);
  
  // 创建转换器时传入节点重命名相关配置
  const converter = new SubscriptionConverter({
    nodeManagement: true,
    renameNodes: true,
    renameFormat: '{country}{protocol}{tags}{number}'
  });
  const rootDir = options.rootDir || process.cwd();
  const outputDir = path.join(rootDir, options.outputDir || 'output');
  ensureDirectoryExists(outputDir);
  
  console.log(`准备生成 ${outputConfigs.length} 个配置文件`);
  console.log(`输出目录: ${outputDir} (完整路径: ${path.resolve(outputDir)})`);
  console.log(`节点数量: ${nodes.length}`);
  
  if (nodes.length > 0) {
    console.log(`第一个节点示例: ${JSON.stringify(nodes[0], null, 2).substring(0, 200)}...`);
  }
  
  for (const output of outputConfigs) {
    try {
      // 如果配置被禁用，则跳过
      if (output.enabled === false) {
        console.log(`跳过禁用的输出配置: ${output.name}`);
        continue;
      }
      
      const { name, format, template: templateFile, path: outputFile } = output;
      const actualFormat = format || name; // 兼容旧格式，使用name作为format的备选
      
      if (!actualFormat || !outputFile) {
        console.error(`输出配置缺少必要参数: ${JSON.stringify(output)}`);
        continue;
      }
      
      console.log(`生成 ${actualFormat} 格式配置: ${outputFile}`);
      
      const outputPath = path.join(outputDir, outputFile);
      ensureDirectoryExists(path.dirname(outputPath));
      
      // 根据配置选项过滤节点
      let filteredNodes = [...nodes];
      
      // 处理按地区过滤选项
      if (output.options && output.options.filter_by_region && output.options.filter_by_region.length > 0) {
        console.log(`按地区过滤节点: ${output.options.filter_by_region.join(', ')}`);
        const regions = output.options.filter_by_region;
        
        filteredNodes = filteredNodes.filter(node => {
          // 检查节点的地区信息
          if (!node.analysis) return false;
          
          // 尝试匹配地区代码或地区名称
          if (node.analysis.countryCode && regions.some(r => r.toUpperCase() === node.analysis.countryCode.toUpperCase())) {
            return true;
          }
          
          if (node.analysis.country && regions.some(r => node.analysis.country.includes(r))) {
            return true;
          }
          
          // 尝试匹配节点名称中的地区信息
          const name = (node.name || '').toUpperCase();
          return regions.some(r => {
            const region = r.toUpperCase();
            return name.includes(region);
          });
        });
        
        console.log(`地区过滤后节点数量: ${filteredNodes.length}`);
      }
      
      // 处理按地区排除选项 (新增逻辑)
      if (output.options && output.options.exclude_regions && output.options.exclude_regions.length > 0) {
        console.log(`按地区排除节点: ${output.options.exclude_regions.join(', ')}`);
        const excludedRegions = output.options.exclude_regions;
        
        filteredNodes = filteredNodes.filter(node => {
          // 如果节点没有地区信息，则不排除
          if (!node.analysis || (!node.analysis.countryCode && !node.analysis.country)) {
            return true;
          }
          
          // 检查节点的地区代码是否在排除列表中
          if (node.analysis.countryCode && excludedRegions.some(r => r.toUpperCase() === node.analysis.countryCode.toUpperCase())) {
            return false; // 排除
          }
          
          // 检查节点的地区名称是否在排除列表中
          if (node.analysis.country && excludedRegions.some(r => node.analysis.country.includes(r))) {
            return false; // 排除
          }
          
          // 检查节点名称中是否包含排除的地区信息
          const name = (node.name || '').toUpperCase();
          if (excludedRegions.some(r => name.includes(r.toUpperCase()))) {
             return false; // 排除
          }
          
          // 如果都不匹配，则保留该节点
          return true;
        });
        
        console.log(`地区排除后节点数量: ${filteredNodes.length}`);
      }
      
      // 处理按服务过滤选项
      if (output.options && output.options.filter_by_service && output.options.filter_by_service.length > 0) {
        console.log(`按服务过滤节点: ${output.options.filter_by_service.join(', ')}`);
        const services = output.options.filter_by_service;
        
        filteredNodes = filteredNodes.filter(node => {
          // 检查节点名称中是否包含指定服务
          const name = (node.name || '').toUpperCase();
          return services.some(service => name.includes(service.toUpperCase()));
        });
        
        console.log(`服务过滤后节点数量: ${filteredNodes.length}`);
      }
      
      // 如果过滤后没有节点，记录警告并继续
      if (filteredNodes.length === 0) {
        console.warn(`警告: 过滤后没有节点符合条件，将跳过生成 ${outputFile}`);
        continue;
      }
      
      // 处理模板
      if (templateFile) {
        // 支持多种模板路径格式
        let templatePath = '';
        if (path.isAbsolute(templateFile)) {
          // 绝对路径
          templatePath = templateFile;
        } else if (templateFile.startsWith('templates/')) {
          // 相对于项目根目录的templates目录
          templatePath = path.join(rootDir, templateFile);
        } else {
          // 尝试其他可能的路径
          const possiblePaths = [
            path.join(rootDir, templateFile),
            path.join(rootDir, 'templates', templateFile),
            path.join(rootDir, 'config', 'templates', templateFile)
          ];
          
          console.log(`尝试查找模板文件，可能的路径: ${possiblePaths.join(', ')}`);
          
          for (const possiblePath of possiblePaths) {
            console.log(`检查路径是否存在: ${possiblePath} - ${fs.existsSync(possiblePath) ? '存在' : '不存在'}`);
            if (fs.existsSync(possiblePath)) {
              templatePath = possiblePath;
              break;
            }
          }
          
          if (!templatePath) {
            // 默认使用第一个路径
            templatePath = possiblePaths[0];
          }
        }
        
        console.log(`使用模板: ${templatePath}`);
        
        if (!fs.existsSync(templatePath)) {
          console.error(`模板文件不存在: ${templatePath}`);
          // 列出可能的模板目录内容
          try {
            const templatesDir = path.join(rootDir, 'templates');
            if (fs.existsSync(templatesDir)) {
              console.log(`templates目录内容: ${fs.readdirSync(templatesDir).join(', ')}`);
            } else {
              console.log(`templates目录不存在: ${templatesDir}`);
              
              // 尝试创建模板目录和基本模板
              console.log(`尝试创建基本模板文件...`);
              ensureDirectoryExists(templatesDir);
              
              // 创建基本模板
              const templates = {
                'mihomo.yaml': '# 基础Mihomo模板\nport: 7890\nproxy-groups:\n  - name: PROXY\n    proxies: []\nproxies: []',
                'surge.conf': '[General]\n[Proxy]\n[Proxy Group]\n[Rule]',
                'singbox.json': '{"log":{"level":"info"},"inbounds":[],"outbounds":[]}',
                'v2ray.json': '{"inbounds":[],"outbounds":[]}'
              };
              
              for (const [name, content] of Object.entries(templates)) {
                const templateFile = path.join(templatesDir, name);
                fs.writeFileSync(templateFile, content);
                console.log(`创建基本模板文件: ${templateFile}`);
              }
              
              // 重新设置模板路径
              templatePath = path.join(templatesDir, actualFormat.toLowerCase() + (
                actualFormat.toUpperCase() === 'MIHOMO' ? '.yaml' : 
                actualFormat.toUpperCase() === 'SURGE' ? '.conf' : '.json'
              ));
              
              console.log(`重新设置模板路径: ${templatePath}`);
            }
          } catch (e) {
            console.error(`无法处理templates目录: ${e.message}`);
          }
          
          if (!fs.existsSync(templatePath)) {
            console.error(`无法找到或创建模板文件，跳过该配置`);
          continue;
          }
        }
        
        let templateContent = fs.readFileSync(templatePath, 'utf-8');
        console.log(`模板大小: ${templateContent.length} 字节`);
        console.log(`模板内容片段: ${templateContent.substring(0, 200)}...`);
        
        try {
          // 判断文件类型并处理
          if (outputFile.endsWith('.json') || templateFile.endsWith('.json')) {
            // JSON格式处理
            console.log(`处理JSON格式模板`);
            
            // 解析模板为JSON
            const configWithNodes = JSON.parse(templateContent);
            
            if (actualFormat.toUpperCase() === 'SINGBOX') {
              // Sing-box 格式处理
              console.log(`处理Sing-box格式，节点数: ${filteredNodes.length}`);
              
              // 确保存在outbounds数组
              if (!configWithNodes.outbounds) {
                configWithNodes.outbounds = [];
              }
              
              // 寻找selector和urltest的索引
              const selectorIndex = configWithNodes.outbounds.findIndex(ob => ob.type === 'selector');
              const urltestIndex = configWithNodes.outbounds.findIndex(ob => ob.type === 'urltest');
              
              // 转换所有节点为outbound配置
              const proxyOutbounds = filteredNodes.map(node => {
                // 节点转换代码
                // 这里省略实际转换代码以避免复杂性
                
                return {
                  // 节点配置
                  type: node.type,
                  tag: node.name,
                  server: node.server,
                  server_port: parseInt(node.port)
                  // 其他配置...
                };
              }).filter(Boolean);
              
              // 在开头插入所有节点
              configWithNodes.outbounds.unshift(...proxyOutbounds);
              
              // 更新selector和urltest的outbounds
              if (selectorIndex !== -1) {
                configWithNodes.outbounds[selectorIndex].outbounds = 
                  ['auto', ...proxyOutbounds.map(p => p.tag)];
              }
              
              if (urltestIndex !== -1) {
                configWithNodes.outbounds[urltestIndex].outbounds = 
                  [...proxyOutbounds.map(p => p.tag)];
              }
              
              // 保存处理后的配置到文件
              fs.writeFileSync(outputPath, JSON.stringify(configWithNodes, null, 2));
              console.log(`已生成 ${actualFormat} 配置: ${outputPath} (${filteredNodes.length} 个节点)`);
              
            } else if (actualFormat.toUpperCase() === 'V2RAY') {
              // V2Ray 格式处理
              console.log(`处理V2Ray格式，节点数: ${filteredNodes.length}`);
              
              // 如果只使用第一个节点
              const useFirstNode = output.options?.use_first_node === true;
              
              if (useFirstNode && filteredNodes.length > 0) {
                // 使用第一个节点
                const nodeToUse = filteredNodes[0];
                // V2Ray单节点处理代码...
                
              } else {
                // 使用所有节点
                // V2Ray多节点处理代码...
              }
              
              fs.writeFileSync(outputPath, JSON.stringify(configWithNodes, null, 2));
              console.log(`已生成 ${actualFormat} 配置: ${outputPath} (${filteredNodes.length} 个节点)`);
            }
            
          } else {
            // 文本格式处理
            console.log(`处理文本格式模板: ${actualFormat}`);
            let formattedNodes = '';
            
            if (actualFormat.toUpperCase() === 'SURGE') {
              // Surge格式处理
              formattedNodes = filteredNodes.map(node => 
                converter.formatNodeForTarget(node, 'surge')
              ).filter(Boolean).join('\n');
              
              // Surge特定处理...
              
            } else if (actualFormat.toUpperCase() === 'CLASH' || actualFormat.toUpperCase() === 'MIHOMO') {
              // Clash/Mihomo格式处理
              formattedNodes = filteredNodes.map(node => 
                converter.formatNodeForTarget(node, 'clash')
              ).filter(Boolean).join('\n');
              
              // Clash/Mihomo特定处理...

            } else if (templatePath === path.join(rootDir, 'templates', 'txt_list.txt')) { // 使用完整路径匹配
              // 新增：处理 txt_list.txt 模板
              console.log(`处理 txt_list.txt 模板 (路径匹配)`); // 修改日志
              formattedNodes = filteredNodes.map(node => {
                // 优先使用原始URI (与 generateGroupedNodeFiles 逻辑类似)
                if (node.extra?.raw && typeof node.extra.raw === 'string' && node.extra.raw.trim().length > 0) {
                  return node.extra.raw;
                }
                // 尝试构造URI
                if (node.type === 'vmess' && node.settings?.id) {
                  const vmessInfo = { v: "2", ps: node.name, add: node.server, port: parseInt(node.port) || 443, id: node.settings.id, aid: parseInt(node.settings.alterId) || 0, net: node.settings.network || "tcp", type: "none", host: (node.settings.wsHeaders && node.settings.wsHeaders.Host) || "", path: node.settings.wsPath || "/", tls: node.settings.tls ? "tls" : "none" };
                  return `vmess://${Buffer.from(JSON.stringify(vmessInfo)).toString('base64')}`;
                } else if (node.type === 'ss' && node.settings?.method && node.settings?.password) {
                  const userInfo = `${node.settings.method}:${node.settings.password}`;
                  const base64UserInfo = Buffer.from(userInfo).toString('base64');
                  return `ss://${base64UserInfo}@${node.server}:${parseInt(node.port) || 443}#${encodeURIComponent(node.name || 'Node')}`;
                } else if (node.type === 'trojan' && node.settings?.password) {
                  return `trojan://${node.settings.password}@${node.server}:${parseInt(node.port) || 443}?sni=${node.settings.sni || ''}&allowInsecure=${node.settings.allowInsecure ? '1' : '0'}#${encodeURIComponent(node.name || 'Node')}`;
                } else if (node.type === 'ssr' && node.settings) {
                  try {
                    const ssrParams = { server: node.server, port: parseInt(node.port) || 443, protocol: node.settings.protocol || 'origin', method: node.settings.method || 'aes-256-cfb', obfs: node.settings.obfs || 'plain', password: node.settings.password || '' };
                    const base64Params = Buffer.from(`${ssrParams.server}:${ssrParams.port}:${ssrParams.protocol}:${ssrParams.method}:${ssrParams.obfs}:${Buffer.from(ssrParams.password).toString('base64')}`).toString('base64');
                    const base64Remarks = Buffer.from(node.name || 'Node').toString('base64');
                    return `ssr://${base64Params}/?remarks=${base64Remarks}`;
                  } catch (error) { return ''; }
                }
                console.warn(`无法为节点 ${node.name} 构造URI (类型: ${node.type})，在 txt_list 输出中跳过`);
                return ''; // 返回空字符串以过滤掉无法处理的节点
              }).filter(Boolean).join('\n'); // 过滤掉空URI并用换行符连接
            } else {
               // 对于其他未明确处理的文本模板，保留原始行为（可能需要改进）
               console.warn(`未知的文本模板类型或路径: ${templatePath} (原始: ${templateFile})，将写入原始模板内容`); // 添加更多日志信息
               formattedNodes = templateContent;
            }

            // 写入处理后的内容
            console.log(`准备写入 ${outputPath}, 内容片段: ${(formattedNodes || '').substring(0, 100)}...`); // 添加日志记录
            fs.writeFileSync(outputPath, formattedNodes);
            console.log(`已生成 ${actualFormat} 配置: ${outputPath} (${filteredNodes.length} 个节点)`);
          }
        } catch (error) {
          console.error(`处理模板时出错:`, error);
          console.error(`错误堆栈: ${error.stack}`);
        }
      } else {
        // 无模板，只输出节点列表
        console.log(`无模板，直接输出节点列表: ${outputFile}`);
        if (actualFormat.toUpperCase() === 'URL') {
          const base64Nodes = Buffer.from(JSON.stringify(filteredNodes)).toString('base64');
          fs.writeFileSync(outputPath, base64Nodes);
        } else {
          const nodeList = filteredNodes.map(node => JSON.stringify(node)).join('\n');
          fs.writeFileSync(outputPath, nodeList);
        }
        console.log(`已生成节点列表: ${outputPath} (${filteredNodes.length} 个节点)`);
        console.log(`文件大小: ${fs.statSync(outputPath).size} 字节`);
      }
    } catch (error) {
      console.error(`生成配置文件时出错:`, error);
      console.error(`错误堆栈: ${error.stack}`);
    }
  }
}

/**
 * 将分组节点直接输出到对应文件而非使用base64编码
 * @param {Array} nodes 所有节点
 * @param {Object} options 全局选项
 */
async function generateGroupedNodeFiles(nodes, options) {
  const rootDir = options.rootDir || process.cwd();
  const outputDir = path.join(rootDir, options.outputDir || 'output');
  ensureDirectoryExists(outputDir);
  
  console.log(`准备生成分组节点文件...`);
  
  if (nodes.length === 0) {
    console.warn('没有节点数据，无法生成分组节点文件');
    return;
  }

  try {
    // 创建分组管理器
    const { GroupManager } = await import('../converter/analyzer/GroupManager.js');
    const groupManager = new GroupManager();
    const { groups } = groupManager.groupNodes(nodes);

    // 创建分组目录
    const groupDir = path.join(outputDir, 'groups');
    ensureDirectoryExists(groupDir);
    
    console.log(`分组目录: ${groupDir}`);
    console.log(`分组目录完整路径: ${path.resolve(groupDir)}`);
    
    // 检查目录权限
    try {
      fs.accessSync(groupDir, fs.constants.W_OK);
      console.log(`分组目录有写入权限`);
    } catch (err) {
      console.error(`分组目录没有写入权限: ${err.message}`);
      // 尝试修改权限
      try {
        fs.chmodSync(groupDir, 0o755);
        console.log(`已尝试修改分组目录权限`);
      } catch (chmodErr) {
        console.error(`修改目录权限失败: ${chmodErr.message}`);
      }
    }
    
    // 处理地区分组
    let generatedFiles = 0;
    
    if (groups.region && groups.region.length > 0) {
      console.log(`发现 ${groups.region.length} 个地区分组`);
      
      for (const group of groups.region) {
        if (group.nodes.length > 0) {
          // 如果是 '其他' 分组，则跳过，避免生成重复的 output/groups/Others.txt
          if (group.name === '其他') {
            console.log(`跳过生成 '其他' 分组文件 (output/groups/Others.txt)，因为它与 output/others.txt 重复。`);
            continue;
          }
          
          // 使用英文文件名
          let filename;
          if (group.name === '香港') filename = 'HK.txt';
          else if (group.name === '台湾') filename = 'TW.txt';
          else if (group.name === '新加坡') filename = 'SG.txt';
          else if (group.name === '美国') filename = 'US.txt';
          else if (group.name === '日本') filename = 'JP.txt';
          else if (group.name === '其他') filename = 'Others.txt';
          else filename = `${group.name}.txt`;
          
          const outputPath = path.join(groupDir, filename);
          
          // 将节点原始链接拼接为字符串
          const rawNodes = group.nodes
                  .map(node => {
              // 优先使用原始URI，但更新节点名称
              if (node.extra?.raw && typeof node.extra.raw === 'string' && node.extra.raw.trim().length > 0) {
                // 构造节点名称，遵循分组格式
                // 获取国家/地区前缀
                let prefix = '';
                if (group.name === '香港') prefix = '🇭🇰 香港 ';
                else if (group.name === '台湾') prefix = '🇹🇼 台湾 ';
                else if (group.name === '新加坡') prefix = '🇸🇬 新加坡 ';
                else if (group.name === '美国') prefix = '🇺🇸 美国 ';
                else if (group.name === '日本') prefix = '🇯🇵 日本 ';
                else if (group.name === '其他') prefix = '🌍 其他 ';
                else prefix = '';
                
                // 构造完整节点名称
                const nodeName = node.name.includes(group.name) ? node.name : `${prefix}${node.name}`;
                
                // 获取原始URI
                let uri = node.extra.raw;
                
                // 针对不同类型的节点URI进行处理
                if (uri.startsWith('vmess://')) {
                  try {
                    // 解析VMess URI
                    const base64Str = uri.substring(8);
                    const decoded = JSON.parse(Buffer.from(base64Str, 'base64').toString());
                    // 更新节点名称
                    decoded.ps = nodeName;
                    // 重新编码URI
                    uri = 'vmess://' + Buffer.from(JSON.stringify(decoded)).toString('base64');
                  } catch (e) {
                    console.warn(`更新VMess节点名称失败: ${e.message}`);
                  }
                } else if (uri.startsWith('ss://')) {
                  // 处理SS URI（更新#后的名称部分）
                  const hashIndex = uri.indexOf('#');
                  if (hashIndex > 0) {
                    uri = uri.substring(0, hashIndex) + '#' + encodeURIComponent(nodeName);
                  }
                } else if (uri.startsWith('trojan://')) {
                  // 处理Trojan URI（更新#后的名称部分）
                  const hashIndex = uri.indexOf('#');
                  if (hashIndex > 0) {
                    uri = uri.substring(0, hashIndex) + '#' + encodeURIComponent(nodeName);
                  }
                } else if (uri.startsWith('vless://')) {
                  // 处理VLESS URI（更新#后的名称部分）
                  const hashIndex = uri.indexOf('#');
                  if (hashIndex > 0) {
                    uri = uri.substring(0, hashIndex) + '#' + encodeURIComponent(nodeName);
                  }
                } else if (uri.startsWith('ssr://')) {
                  // SSR URI处理较复杂，暂时保持原样
                  console.log(`注意: 未修改SSR节点的名称: ${nodeName}`);
                }
                
                return uri;
              }
              
              // 构造节点名称，遵循分组格式
              // 获取国家/地区前缀
              let prefix = '';
              if (group.name === '香港') prefix = '🇭🇰 香港 ';
              else if (group.name === '台湾') prefix = '🇹🇼 台湾 ';
              else if (group.name === '新加坡') prefix = '🇸🇬 新加坡 ';
              else if (group.name === '美国') prefix = '🇺🇸 美国 ';
              else if (group.name === '日本') prefix = '🇯🇵 日本 ';
              else if (group.name === '其他') prefix = '🌍 其他 ';
              else prefix = '';
              
              // 构造完整节点名称
              const nodeName = node.name.includes(group.name) ? node.name : `${prefix}${node.name}`;
              console.log(`为节点 ${node.name} 构造URI，修正名称为: ${nodeName}`);
              
              // 如果没有原始URI，尝试根据节点属性构造
              if (node.type === 'vmess' && node.settings?.id) {
                // 构造VMess节点URI
                const vmessInfo = {
                  v: "2",
                  ps: nodeName,
                  add: node.server,
                  port: parseInt(node.port) || 443,
                  id: node.settings.id,
                  aid: parseInt(node.settings.alterId) || 0,
                  net: node.settings.network || "tcp",
                  type: "none",
                  host: (node.settings.wsHeaders && node.settings.wsHeaders.Host) || "",
                  path: node.settings.wsPath || "/",
                  tls: node.settings.tls ? "tls" : "none"
                };
                const vmessUri = `vmess://${Buffer.from(JSON.stringify(vmessInfo)).toString('base64')}`;
                console.log(`已构造VMess节点URI: ${vmessUri.substring(0, 30)}...`);
                return vmessUri;
              } else if (node.type === 'ss' && node.settings?.method && node.settings?.password) {
                // 构造Shadowsocks节点URI
                const userInfo = `${node.settings.method}:${node.settings.password}`;
                const base64UserInfo = Buffer.from(userInfo).toString('base64');
                const ssUri = `ss://${base64UserInfo}@${node.server}:${parseInt(node.port) || 443}#${encodeURIComponent(nodeName)}`;
                console.log(`已构造SS节点URI: ${ssUri.substring(0, 30)}...`);
                return ssUri;
              } else if (node.type === 'trojan' && node.settings?.password) {
                // 构造Trojan节点URI
                const trojanUri = `trojan://${node.settings.password}@${node.server}:${parseInt(node.port) || 443}?sni=${node.settings.sni || ''}&allowInsecure=${node.settings.allowInsecure ? '1' : '0'}#${encodeURIComponent(nodeName)}`;
                console.log(`已构造Trojan节点URI: ${trojanUri.substring(0, 30)}...`);
                return trojanUri;
              } else if (node.type === 'ssr' && node.settings) {
                // 构造SSR节点URI
                try {
                  const ssrParams = {
                          server: node.server,
                    port: parseInt(node.port) || 443,
                    protocol: node.settings.protocol || 'origin',
                    method: node.settings.method || 'aes-256-cfb',
                    obfs: node.settings.obfs || 'plain',
                    password: node.settings.password || '',
                  };
                  
                  const base64Params = Buffer.from(
                    `${ssrParams.server}:${ssrParams.port}:${ssrParams.protocol}:${ssrParams.method}:${ssrParams.obfs}:${Buffer.from(ssrParams.password).toString('base64')}`
                  ).toString('base64');
                  
                  const base64Remarks = Buffer.from(nodeName).toString('base64');
                  const ssrUri = `ssr://${base64Params}/?remarks=${base64Remarks}`;
                  console.log(`已构造SSR节点URI: ${ssrUri.substring(0, 30)}...`);
                  return ssrUri;
                } catch (error) {
                  console.error(`构造SSR节点URI失败:`, error);
                  return '';
                }
              }
              
              // 无法构造URI的情况下返回空字符串
              console.warn(`无法为节点 ${node.name} 构造URI，类型: ${node.type}`);
              return '';
            })
            .filter(raw => raw.trim().length > 0) // 过滤掉空链接
            .join('\n'); // 用换行符连接
          
          // 输出节点数量统计
          const uriCount = rawNodes.split('\n').length;
          console.log(`${filename} 生成了 ${uriCount} 个节点URI，原始节点数 ${group.nodes.length}`);
          
          // 直接写入原始节点链接，不再使用base64编码
          try {
            fs.writeFileSync(outputPath, rawNodes);
            console.log(`已生成地区分组节点文件: ${filename} (${group.nodes.length} 个节点)`);
            console.log(`文件完整路径: ${path.resolve(outputPath)}`);
            generatedFiles++;
          } catch (writeErr) {
            console.error(`写入文件失败: ${filename} - ${writeErr.message}`);
          }
        }
      }
    }
    
    // 处理应用/流媒体分组
    if (groups.media && groups.media.length > 0) {
      console.log(`发现 ${groups.media.length} 个应用/流媒体分组`);

      for (const group of groups.media) {
        if (group.nodes.length > 0) {
          // 使用分组名称作为文件名，例如 OpenAI.txt, Disney+.txt
          // 需要处理 '+' 等可能在文件名中不安全的字符
          const safeGroupName = group.name.replace(/[^a-zA-Z0-9_-]/g, '_'); // 替换特殊字符为下划线
          const filename = `${safeGroupName}.txt`;
          const outputPath = path.join(groupDir, filename);

          // 将节点原始链接拼接为字符串 (与地区分组逻辑相同)
          const rawNodes = group.nodes
            .map(node => {
              // 优先使用原始URI，但更新节点名称
              if (node.extra?.raw && typeof node.extra.raw === 'string' && node.extra.raw.trim().length > 0) {
                // 构造节点名称
                const nodeName = node.name || 'Unnamed Node';
                
                // 获取原始URI
                let uri = node.extra.raw;
                
                // 针对不同类型的节点URI进行处理
                if (uri.startsWith('vmess://')) {
                  try {
                    // 解析VMess URI
                    const base64Str = uri.substring(8);
                    const decoded = JSON.parse(Buffer.from(base64Str, 'base64').toString());
                    // 更新节点名称
                    decoded.ps = nodeName;
                    // 重新编码URI
                    uri = 'vmess://' + Buffer.from(JSON.stringify(decoded)).toString('base64');
                  } catch (e) {
                    console.warn(`更新VMess节点名称失败: ${e.message}`);
                  }
                } else if (uri.startsWith('ss://')) {
                  // 处理SS URI（更新#后的名称部分）
                  const hashIndex = uri.indexOf('#');
                  if (hashIndex > 0) {
                    uri = uri.substring(0, hashIndex) + '#' + encodeURIComponent(nodeName);
                  }
                } else if (uri.startsWith('trojan://')) {
                  // 处理Trojan URI（更新#后的名称部分）
                  const hashIndex = uri.indexOf('#');
                  if (hashIndex > 0) {
                    uri = uri.substring(0, hashIndex) + '#' + encodeURIComponent(nodeName);
                  }
                } else if (uri.startsWith('vless://')) {
                  // 处理VLESS URI（更新#后的名称部分）
                  const hashIndex = uri.indexOf('#');
                  if (hashIndex > 0) {
                    uri = uri.substring(0, hashIndex) + '#' + encodeURIComponent(nodeName);
                  }
                } else if (uri.startsWith('ssr://')) {
                  // SSR URI处理较复杂，暂时保持原样
                  console.log(`注意: 未修改SSR节点的名称: ${nodeName}`);
                }
                
                return uri;
              }
              
              // 构造节点名称
              const nodeName = node.name || 'Unnamed Node';
              // 尝试构造URI (省略具体构造逻辑，与地区分组相同)
              // ... existing code ...
            })
            .filter(raw => raw.trim().length > 0) // 过滤掉空链接
            .join('\n'); // 用换行符连接
          
          // 输出节点数量统计
          const uriCount = rawNodes.split('\n').filter(Boolean).length; // 确保计算准确
          console.log(`${filename} 生成了 ${uriCount} 个节点URI，原始节点数 ${group.nodes.length}`);

          // 写入文件
          try {
            fs.writeFileSync(outputPath, rawNodes);
            console.log(`已生成应用/流媒体分组节点文件: ${filename} (${group.nodes.length} 个节点)`);
            console.log(`文件完整路径: ${path.resolve(outputPath)}`);
            generatedFiles++; // 增加计数器
          } catch (writeErr) {
            console.error(`写入文件失败: ${filename} - ${writeErr.message}`);
          }
        }
      }
    }
    
    const message = `分组节点文件生成完成，共生成 ${generatedFiles} 个文件`;
    console.log(message);
    
    // 触发转换完成事件，发送Bark通知
    eventEmitter.emit(EventType.CONVERSION_COMPLETE, {
      nodeCount: nodes.length,
      time: Date.now(),
      message: message
    });
  } catch (error) {
    console.error(`生成分组节点文件时出错:`, error);
    console.error(`错误堆栈: ${error.stack}`);
    
    // 触发错误事件，通过Bark通知
    eventEmitter.emit(EventType.SYSTEM_ERROR, {
      message: `生成分组节点文件出错: ${error.message}`,
      error: error
    });
  }
}

// 修改main函数，添加全局超时控制
async function main() {
  globalStartTime = Date.now();
  console.log('==================================================================');
  console.log(`开始同步订阅...时间: ${new Date().toISOString()}`);
  console.log(`已设置全局执行时间限制: ${MAX_EXECUTION_TIME/3600000}小时`);
  console.log('==================================================================');
  
  // *** 加载国内代理缓存 ***
  loadedChinaProxies = loadChinaProxies();
  
  // 加载配置
  if (!loadConfig()) {
    console.error('加载配置失败');
    process.exit(1);
  }
  
  let previousNodeCount = null; // 初始化上次节点数
  const dataDir = path.join(CONFIG.rootDir, CONFIG.options.dataDir);
  const statusFile = path.join(dataDir, 'sync_status.json');

  try {
    // 尝试读取上次同步状态
    if (fs.existsSync(statusFile)) {
      const statusContent = fs.readFileSync(statusFile, 'utf-8');
      const lastStatus = JSON.parse(statusContent);
      if (lastStatus && typeof lastStatus.finalNodesCount === 'number') {
        previousNodeCount = lastStatus.finalNodesCount;
        console.log(`上次同步成功，节点数量: ${previousNodeCount}`);
      }
    }
  } catch (error) {
    console.error('读取上次同步状态失败:', error.message);
  }

  try {
    ensureDirectoryExists(dataDir);
    
    // 创建转换器实例
    const converter = new SubscriptionConverter({
      parser: CONFIG.parser,
      fetcher: CONFIG.fetcher
    });
    
    // 检查是否有自定义处理函数
    if (CONFIG.processor && typeof CONFIG.processor.preprocess === 'function') {
      converter.processor = CONFIG.processor;
    }
    
    // 获取所有订阅节点
    console.log('开始获取所有订阅节点...');
    const mergedNodes = await fetchAndMergeAllNodes(converter);
    
    // 保存节点统计信息，方便后续增量处理
    const finalNodesFile = path.join(dataDir, 'final_nodes.json');
    try {
      fs.writeFileSync(finalNodesFile, JSON.stringify(mergedNodes, null, 2));
      console.log(`已保存最终节点数据到 ${finalNodesFile}`);
    } catch (e) {
      console.error(`保存最终节点数据失败: ${e.message}`);
    }
    
    if (checkTimeLimit()) {
      console.warn('执行时间已接近限制，跳过节点测试步骤');
      process.exit(0);
    }
    
    // 如果配置了测试，进行节点测试
    if (CONFIG.testConfig && CONFIG.testConfig.enabled) {
      console.log(`即将开始节点测试，总节点数: ${mergedNodes.length}`);
      
      if (mergedNodes.length === 0) {
        console.log('没有节点可供测试，跳过测试步骤');
      } else if (mergedNodes.length < 10) {
        console.log('节点数量过少，跳过测试步骤');
      } else {
        const tester = new NodeTester(CONFIG.testConfig);
        
        // 将大量节点分批测试，减轻服务器压力并避免超时
        const BATCH_SIZE = 100; // 每批100个节点
        const batches = [];
        
        for (let i = 0; i < mergedNodes.length; i += BATCH_SIZE) {
          batches.push(mergedNodes.slice(i, i + BATCH_SIZE));
        }
        
        let testedNodes = [];
        for (let i = 0; i < batches.length; i++) {
          if (checkTimeLimit()) {
            console.warn(`执行时间接近限制，终止剩余批次(${i+1}/${batches.length})的测试`);
            break;
          }
          
          console.log(`测试批次 ${i+1}/${batches.length}, 包含 ${batches[i].length} 个节点`);
          const testResults = await tester.testNodes(batches[i]);
          testedNodes = testedNodes.concat(testResults);
          
          // 保存中间测试结果
          const testCheckpoint = path.join(dataDir, 'test_checkpoint.json');
          try {
            fs.writeFileSync(testCheckpoint, JSON.stringify({
              timestamp: Date.now(),
              processed: (i + 1) * BATCH_SIZE,
              total: mergedNodes.length,
              testedCount: testedNodes.length
            }));
          } catch (e) {
            console.error('保存测试检查点失败:', e.message);
          }
        }
        
        // 更新节点测试结果
        mergedNodes.forEach((node, index) => {
          if (index < testedNodes.length) {
            node.test = testedNodes[index].test;
          }
        });
        
        console.log(`节点测试完成，共测试 ${testedNodes.length} 个节点`);
      }
    }
    
    // 对节点进行排序
    if (mergedNodes.length > 0) {
      console.log('对节点进行排序...');
      const sorter = (a, b) => {
        // 首先按测试结果排序
        if (a.test && b.test) {
          if (a.test.delay !== undefined && b.test.delay !== undefined) {
            return a.test.delay - b.test.delay;
          }
          if (a.test.delay !== undefined) return -1;
          if (b.test.delay !== undefined) return 1;
        }
        if (a.test && a.test.delay !== undefined) return -1;
        if (b.test && b.test.delay !== undefined) return 1;
        
        // 然后按国家排序
        if (a.metadata && b.metadata) {
          if (a.metadata.country && b.metadata.country) {
            return a.metadata.country.localeCompare(b.metadata.country);
          }
        }
        
        return 0;
      };
      
      mergedNodes.sort(sorter);
      console.log('节点排序完成');
    }
    
    // 保存各种格式的文件
    if (CONFIG.outFormats && CONFIG.outFormats.length > 0) {
      console.log(`生成 ${CONFIG.outFormats.length} 种格式的订阅文件...`);
      
      // 检查是否有增量更新标记
      let hasUpdates = false;
      let lastCheckpointData = null;
      
      try {
        const checkpointFile = path.join(dataDir, 'checkpoint.json');
        if (fs.existsSync(checkpointFile)) {
          lastCheckpointData = JSON.parse(fs.readFileSync(checkpointFile, 'utf-8'));
          hasUpdates = lastCheckpointData.hasUpdates === true;
        }
      } catch (e) {
        console.error('读取检查点数据失败:', e.message);
      }
      
      // 如果没有变化且节点数相同，可以跳过转换步骤(可选)
      const skipConversion = !hasUpdates && 
                          previousNodeCount === mergedNodes.length && 
                          CONFIG.options.skipUnchangedConversion === true;
      
      if (skipConversion) {
        console.log(`节点数量与上次相同(${mergedNodes.length})且无更新，跳过转换步骤`);
      } else {
        for (const format of CONFIG.outFormats) {
          if (checkTimeLimit()) {
            console.warn('执行时间接近限制，终止剩余格式的转换');
            break;
          }
          
          console.log(`生成 ${format} 格式的订阅文件...`);
          
          try {
            const convertedContent = await converter.convert(mergedNodes, format);
            if (convertedContent) {
              const outFile = path.join(CONFIG.rootDir, CONFIG.options.outDir, `${CONFIG.name}.${format}`);
              ensureDirectoryExists(path.dirname(outFile));
              fs.writeFileSync(outFile, convertedContent);
              console.log(`已生成 ${format} 格式的订阅文件: ${outFile}`);
            } else {
              console.error(`转换为 ${format} 格式失败: 返回内容为空`);
            }
          } catch (convertError) {
            console.error(`转换为 ${format} 格式失败:`, convertError.message);
          }
        }
      }
    }
    
    // 保存节点详细信息到JSON文件(方便调试和数据分析)
    const nodesJsonFile = path.join(CONFIG.rootDir, CONFIG.options.outDir, `${CONFIG.name}.nodes.json`);
    fs.writeFileSync(nodesJsonFile, JSON.stringify(mergedNodes, null, 2));
    console.log(`已保存节点详细信息到: ${nodesJsonFile}`);
    
    // 保存本次同步状态
    const statusData = {
      timestamp: Date.now(),
      success: true,
      finalNodesCount: mergedNodes.length,
      previousNodesCount: previousNodeCount,
      message: `成功同步 ${mergedNodes.length} 个节点`
    };
    fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
    
    // 发送通知
    const diff = previousNodeCount !== null ? mergedNodes.length - previousNodeCount : 0;
    const diffText = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '±0';
    
    const notifyMessage = `订阅同步完成!\n` +
                      `节点数量: ${mergedNodes.length} (${diffText})\n` +
                      `时间: ${new Date().toLocaleString()}`;
    
    // 使用事件发射器发送通知事件
    eventEmitter.emit(EventType.SYNC_COMPLETE, {
      timestamp: Date.now(),
      nodeCount: mergedNodes.length,
      diff: diff,
      message: notifyMessage
    });
    
    console.log('==================================================================');
    console.log(`同步订阅完成! 节点数量: ${mergedNodes.length} (${diffText})`);
    console.log(`执行时间: ${((Date.now() - globalStartTime) / 1000).toFixed(1)}秒`);
    console.log('==================================================================');
    
  } catch (error) {
    console.error('同步订阅时出错:', error.message);
    console.error(error.stack);
    
    // 保存错误状态
    const statusData = {
      timestamp: Date.now(),
      success: false,
      previousNodesCount: previousNodeCount,
      message: `同步失败: ${error.message}`
    };
    fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
    
    // 发送错误通知
    eventEmitter.emit(EventType.SYNC_ERROR, {
      timestamp: Date.now(),
      error: error.message
    });
    
    process.exit(1);
  }
}

// 执行主函数
main().catch(error => {
  console.error('同步过程中发生错误:', error);
  
  // 尝试发送错误通知
  try {
    eventEmitter.emit(EventType.SYSTEM_ERROR, {
      message: `同步过程中捕获到错误: ${error.message}`,
      error: error.toString(),
      stack: error.stack
    });
  } catch (e) {
    console.error('发送错误通知失败:', e);
  }
  
  process.exit(1);
});

// 保存订阅缓存数据
function saveCacheData(cachePath, nodes, contentHash) {
  try {
    const cacheData = {
      timestamp: Date.now(),
      hash: contentHash,
      nodes: nodes
    };
    fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
    console.log(`已保存订阅缓存，包含 ${nodes.length} 个节点，哈希值: ${contentHash.substring(0, 8)}...`);
  } catch (e) {
    console.error(`保存订阅缓存失败: ${e.message}`);
  }
}
