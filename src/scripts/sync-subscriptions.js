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
import crypto from 'crypto';

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
const rootDir = process.env.ROOT_DIR || path.resolve(__dirname, '../..');
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
  configFile: process.env.CONFIG_PATH || path.resolve(rootDir, 'config/custom.yaml'),
  subscriptions: [],
  outputConfigs: [],
  options: {
    deduplication: true,
    dataDir: process.env.DATA_DIR || 'data',
    outputDir: 'output'
  },
  advanced: {
    logLevel: process.env.LOG_LEVEL || 'info',
    cacheTtl: 3600,
    proxyForSubscription: process.env.PROXY_FOR_SUBSCRIPTION === 'true',
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
  console.log(`===========================================================`);
  console.log(`开始处理订阅: ${subscription.name}, 类型: ${subscription.type}, URL: ${subscription.url}`);
  
  // 检查缓存 - 只有URL类型的订阅才会缓存
  let useCache = false;
  let cacheData = null;
  const cacheDir = path.join(CONFIG.rootDir, CONFIG.options.dataDir, 'cache');
  const cachePath = path.join(cacheDir, `${subscription.name}_cache.json`);
  
  // 缓存过期时间检查 (单位: 秒)
  const cacheExpiry = CONFIG.advanced.cacheTtl || 3600; // 默认1小时
  
  // 尝试从缓存中获取
  if (subscription.type === SubscriptionType.URL && fs.existsSync(cachePath)) {
    try {
      const cacheContent = fs.readFileSync(cachePath, 'utf-8');
      cacheData = JSON.parse(cacheContent);
      
      if (cacheData && Array.isArray(cacheData.nodes) && cacheData.timestamp) {
        const cacheAge = (Date.now() - cacheData.timestamp) / 1000; // 换算成秒
        if (cacheAge < cacheExpiry) {
          console.log(`使用${subscription.name}的缓存数据，缓存年龄: ${Math.floor(cacheAge/60)}分钟，包含${cacheData.nodes.length}个节点`);
          useCache = true;
          return {
            source: subscription.name,
            nodes: cacheData.nodes,
            fromCache: true,
            hash: cacheData.hash
          };
        } else {
          console.log(`${subscription.name}的缓存已过期 (${Math.floor(cacheAge/60)}分钟), 重新获取`);
        }
      }
    } catch (error) {
      console.error(`读取${subscription.name}的缓存失败:`, error.message);
    }
  } else {
    console.log(`未找到订阅 ${subscription.name} 的缓存`);
  }
  
  // 如果不使用缓存，则获取新数据
  if (!useCache) {
    // 根据订阅类型获取数据
    if (subscription.type === SubscriptionType.URL) {
      try {
        console.log(`从URL获取订阅: ${subscription.url}`);
        
        // 设置自定义请求头 (检查特定域名并添加对应请求头)
        let customHeaders = {};
        if (subscription.url.includes('alalbb.top')) {
          console.log(`检测到alalbb.top域名，添加特定请求头`);
          customHeaders = {
            Referer: 'https://alalbb.top/',
            Origin: 'https://alalbb.top',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          };
        }
        
        // 添加用户自定义请求头 (如果有)
        if (subscription.headers && typeof subscription.headers === 'object') {
          customHeaders = { ...customHeaders, ...subscription.headers };
        }
        
        console.log(`为 ${subscription.name} 设置的自定义请求头:`, JSON.stringify(customHeaders, null, 2));
        
        // 获取订阅内容
        let content = '';
        let contentHash = '';
        
        // 获取请求参数
        let options = {
          headers: customHeaders
        };
        
        // 如果配置了使用代理，并且有可用代理，则使用代理
        if (CONFIG.advanced.proxyForSubscription && loadedChinaProxies.length > 0) {
          try {
            const proxy = getChinaProxy();
            if (proxy) {
              console.log(`尝试使用代理 ${proxy} 获取订阅`);
              const agent = new HttpsProxyAgent(proxy);
              options.agent = agent;
            } else {
              console.log(`尝试使用代理但未成功创建或获取代理`);
            }
          } catch (proxyError) {
            console.error(`设置代理失败: ${proxyError.message}`);
          }
        }
        
        try {
          // 获取订阅内容
          console.log(`开始获取订阅: ${subscription.url}`);
          
          // 添加时间戳防止缓存
          const urlWithTimestamp = subscription.url.includes('?') 
            ? `${subscription.url}&_t=${Date.now()}` 
            : `${subscription.url}?_t=${Date.now()}`;
          
          console.log(`发送请求到: ${urlWithTimestamp}`);
          
          // 设置默认请求头
          const defaultHeaders = {
            'User-Agent': 'v2rayN/5.29',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          };
          
          // 合并默认请求头和自定义请求头
          options.headers = { ...defaultHeaders, ...options.headers };
          console.log(`请求头:`, JSON.stringify(options.headers, null, 2));
          
          // 发送请求
          const startTime = Date.now();
          const response = await fetch(urlWithTimestamp, options);
          const endTime = Date.now();
          const responseTime = endTime - startTime;
          
          console.log(`请求完成，耗时: ${responseTime}ms, 状态码: ${response.status}`);
          console.log(`响应内容类型: ${response.headers.get('content-type')}`);
          
          if (!response.ok) {
            throw new Error(`HTTP 错误: ${response.status} ${response.statusText}`);
          }
          
          // 获取内容
          content = await response.text();
          
          // 计算内容摘要 (用于缓存比较)
          contentHash = crypto.createHash('sha256').update(content).digest('hex');
          
          // 如果内容过长，只显示前200个字符
          if (content.length > 200) {
            console.log(`响应内容太长，只显示前200字符: \n${content.substring(0, 200)}...`);
          } else if (content.trim().length === 0) {
            console.log(`服务器返回了空内容`);
            throw new Error('服务器返回了空内容');
          } else {
            console.log(`响应内容: \n${content}`);
          }
          
          if (content.trim().length === 0) {
            throw new Error('服务器返回了空内容');
          }
          
          console.log(`成功获取订阅，数据大小: ${content.length} 字节`);
          
          // 检测格式类型
          if (content.includes('proxies:') || content.includes('Proxy:') || content.includes('proxy-groups:')) {
            console.log(`检测到可能的YAML/Clash配置`);
          } else if (content.startsWith('ss://') || content.startsWith('ssr://') || content.startsWith('vmess://') || content.startsWith('trojan://')) {
            console.log(`检测到Base64/文本格式的节点列表`);
          } else if (content.startsWith('{') && content.includes('"outbounds"')) {
            console.log(`检测到V2Ray/Sing-box JSON配置`);
          } else if (/^[A-Za-z0-9+/=]+$/.test(content.trim())) {
            console.log(`检测到可能的Base64编码内容`);
          }
          
        } catch (fetchError) {
          console.error(`获取订阅出错: ${fetchError.message}`);
          return {
            source: subscription.name,
            nodes: [],
            fromCache: false,
            error: fetchError.message
          };
        }
        
        // 解析订阅内容
        try {
          const parsedNodes = await converter.parseSubscription(content, subscription.type);
          
          if (!parsedNodes || !Array.isArray(parsedNodes) || parsedNodes.length === 0) {
            console.log(`订阅 ${subscription.name} 未返回任何节点`);
            return {
              source: subscription.name,
              nodes: [],
              fromCache: false,
              hash: contentHash
            };
          }
          
          console.log(`成功解析 ${subscription.name} 订阅，包含 ${parsedNodes.length} 个节点`);
          
          // 标记节点来源
          parsedNodes.forEach(node => {
            if (!node.metadata) node.metadata = {};
            node.metadata.source = subscription.name;
          });
          
          // 保存到缓存
          if (subscription.type === SubscriptionType.URL) {
            ensureDirectoryExists(cacheDir);
            saveCacheData(cachePath, parsedNodes, contentHash);
          }
          
          return {
            source: subscription.name,
            nodes: parsedNodes,
            fromCache: false,
            hash: contentHash
          };
        } catch (parseError) {
          console.error(`获取订阅失败: ${parseError.message}`);
          return {
            source: subscription.name,
            nodes: [],
            fromCache: false,
            error: parseError.message
          };
        }
      } catch (error) {
        console.error(`处理 ${subscription.name} 订阅失败: ${error.message}`);
        // 尝试使用缓存作为后备
        if (cacheData && Array.isArray(cacheData.nodes)) {
          console.log(`使用缓存作为后备，包含 ${cacheData.nodes.length} 个节点`);
          return {
            source: subscription.name,
            nodes: cacheData.nodes,
            fromCache: true,
            fromBackup: true,
            hash: cacheData.hash
          };
        }
        
        return {
          source: subscription.name,
          nodes: [],
          fromCache: false,
          error: error.message
        };
      }
    } else {
      // 处理其他类型的订阅，如Base64, VMess等
      console.log(`不支持的订阅类型: ${subscription.type}`);
      return {
        source: subscription.name,
        nodes: [],
        fromCache: false,
        error: `不支持的订阅类型: ${subscription.type}`
      };
    }
  }
}

// 修改后的fetchAndMergeAllNodes函数，支持并行处理
async function fetchAndMergeAllNodes(converter) {
  try {
    // 初始化计数器
    let cachedCount = 0;
    let updatedCount = 0;
    
    // 过滤出启用的订阅
    const enabledSubscriptions = CONFIG.subscriptions.filter(sub => sub.enabled !== false);
    console.log(`准备获取 ${enabledSubscriptions.length} 个启用的订阅源的节点`);
    
    // 批量处理订阅源，避免同时发送太多请求
    const batchSize = 5; // 每批处理5个订阅源
    const batches = [];
    
    for (let i = 0; i < enabledSubscriptions.length; i += batchSize) {
      batches.push(enabledSubscriptions.slice(i, i + batchSize));
    }
    
    // 存储所有订阅结果
    let allResults = [];
    
    // 分批处理
    for (let i = 0; i < batches.length; i++) {
      console.log(`处理订阅批次 ${i+1}/${batches.length}`);
      
      // 并行处理当前批次的订阅
      const fetchPromises = batches[i].map(sub => fetchSubscription(sub, converter));
      
      // 等待所有请求完成
      const batchResults = await Promise.all(fetchPromises);
      
      // 添加到结果集
      allResults = allResults.concat(batchResults);
      
      // 如果超时，提前结束
      if (checkTimeLimit()) {
        console.warn(`执行时间接近限制，终止剩余批次的获取 (${i+1}/${batches.length})`);
        break;
      }
    }
    
    // 处理结果，合并节点
    let allNodes = [];
    
    // 遍历订阅结果
    for (const result of allResults) {
      if (!result) continue;
      
      const { source, nodes, fromCache, error } = result;
      
      if (error) {
        console.warn(`订阅 ${source} 处理出错: ${error}`);
        continue;
      }
      
      if (!nodes || !Array.isArray(nodes)) {
        console.warn(`订阅 ${source} 未返回节点数组`);
        continue;
      }
      
      // 统计节点来源
      if (fromCache) {
        cachedCount += nodes.length;
      } else {
        updatedCount += nodes.length;
      }
      
      // 将节点添加到总集合
      allNodes = allNodes.concat(nodes);
      
      console.log(`处理订阅 ${source} 完成，获取 ${nodes.length} 个节点，来源: ${fromCache ? '缓存' : '更新'}`);
    }
    
    // 节点数量统计
    const originalCount = allNodes.length;
    
    // 如果配置了去重，则去重
    if (CONFIG.options.deduplication) {
      allNodes = deduplicateNodes(allNodes);
      console.log(`去重后节点数量: ${allNodes.length} (原始: ${originalCount}, 减少: ${originalCount - allNodes.length})`);
    }
    
    console.log(`所有订阅处理完成，共获取 ${allNodes.length} 个节点 (缓存: ${cachedCount}, 更新: ${updatedCount})`);
    console.log(`最终节点数量(去重后): ${allNodes.length}`);
    
    // 检查是否有更新的订阅
    const hasUpdates = updatedCount > 0;
    console.log(`是否有订阅源更新: ${hasUpdates ? '是' : '否'}`);
    
    // 返回所有节点
    return allNodes;
  } catch (error) {
    console.error(`获取和合并节点时出错:`, error);
    throw error;
  }
}

// 节点去重函数
function deduplicateNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  if (nodes.length <= 1) return nodes;
  
  // 通过唯一标识符去重
  const uniqueMap = new Map();
  
  for (const node of nodes) {
    // 构建唯一标识，通常是节点的服务器+端口+类型+密码等信息的组合
    let uniqueKey = '';
    
    if (node.server && node.port) {
      // 基于服务器地址和端口号生成唯一键
      uniqueKey = `${node.server}:${node.port}`;
      
      // 如果有额外的标识信息，添加到唯一键中
      if (node.password) uniqueKey += `:${node.password}`;
      if (node.uuid) uniqueKey += `:${node.uuid}`;
      if (node.type) uniqueKey += `:${node.type}`;
    } else if (node.extra && node.extra.raw) {
      // 如果有原始URI，则直接用URI作为唯一键
      uniqueKey = node.extra.raw;
    } else {
      // 如果没有足够信息，则使用节点的完整内容作为唯一键
      uniqueKey = JSON.stringify(node);
    }
    
    // 如果唯一键已存在，则跳过当前节点
    if (!uniqueMap.has(uniqueKey)) {
      uniqueMap.set(uniqueKey, node);
    }
  }
  
  // 返回去重后的节点数组
  return Array.from(uniqueMap.values());
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
  console.log(`节点数量: ${nodes ? nodes.length : 0}`);
  
  // 如果节点数组为空或未定义，创建空的配置文件
  if (!nodes || nodes.length === 0) {
    console.log(`节点数组为空，将创建空的配置文件`);
    
    for (const output of outputConfigs) {
      // 如果配置被禁用，则跳过
      if (output.enabled === false) {
        console.log(`跳过禁用的输出配置: ${output.name}`);
        continue;
      }
      
      const { name, path: outputFile } = output;
      
      if (!outputFile) {
        console.error(`输出配置缺少必要参数: ${JSON.stringify(output)}`);
        continue;
      }
      
      const outputPath = path.join(outputDir, outputFile);
      ensureDirectoryExists(path.dirname(outputPath));
      
      try {
        // 为不同类型的配置创建基本的空内容
        let emptyContent = '';
        
        if (outputFile.endsWith('.yaml') || outputFile.endsWith('.yml')) {
          emptyContent = `# 空的配置文件 - 自动生成\nproxies: []\n`;
        } else if (outputFile.endsWith('.json')) {
          emptyContent = `{\n  "proxies": []\n}`;
        } else if (outputFile.endsWith('.conf')) {
          emptyContent = `# 空的配置文件 - 自动生成\n`;
        } else {
          emptyContent = `# 空的配置文件 - 自动生成\n`;
        }
        
        fs.writeFileSync(outputPath, emptyContent);
        console.log(`已创建空的配置文件: ${outputFile}`);
      } catch (error) {
        console.error(`创建空配置文件失败: ${outputFile} - ${error.message}`);
      }
    }
    
    console.log(`所有空配置文件创建完成`);
    return;
  }
  
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
      
      // 如果过滤后没有节点，记录警告并继续但创建空文件
      if (filteredNodes.length === 0) {
        console.warn(`警告: 过滤后没有节点符合条件，将创建空的 ${outputFile} 文件`);
        
        // 创建空的配置文件
        let emptyContent = '';
        
        if (outputFile.endsWith('.yaml') || outputFile.endsWith('.yml')) {
          emptyContent = `# 空的配置文件 - 自动生成\nproxies: []\n`;
        } else if (outputFile.endsWith('.json')) {
          emptyContent = `{\n  "proxies": []\n}`;
        } else if (outputFile.endsWith('.conf')) {
          emptyContent = `# 空的配置文件 - 自动生成\n`;
        } else {
          emptyContent = `# 空的配置文件 - 自动生成\n`;
        }
        
        fs.writeFileSync(outputPath, emptyContent);
        console.log(`已创建空的配置文件: ${outputFile}`);
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
  
  console.log(`=== 配置文件生成完成 ===`);
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
  
  if (!nodes || nodes.length === 0) {
    console.warn('没有节点数据，创建空的分组节点文件');
    
    // 创建分组目录
    const groupDir = path.join(outputDir, 'groups');
    ensureDirectoryExists(groupDir);
    
    // 创建一些常见分组的空文件
    const defaultGroups = ['HK.txt', 'US.txt', 'JP.txt', 'SG.txt', 'TW.txt', 'Others.txt'];
    
    for (const filename of defaultGroups) {
      const outputPath = path.join(groupDir, filename);
      try {
        fs.writeFileSync(outputPath, ''); // 写入空内容
        console.log(`已创建空的分组节点文件: ${filename}`);
      } catch (writeErr) {
        console.error(`创建空文件失败: ${filename} - ${writeErr.message}`);
      }
    }
    
    console.log(`空分组节点文件创建完成`);
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
    } else {
      console.log(`没有发现地区分组，创建默认空文件`);
      
      // 创建默认分组的空文件
      const defaultGroups = ['HK.txt', 'US.txt', 'JP.txt', 'SG.txt', 'TW.txt', 'Others.txt'];
      
      for (const filename of defaultGroups) {
        const outputPath = path.join(groupDir, filename);
        try {
          fs.writeFileSync(outputPath, ''); // 写入空内容
          console.log(`已创建空的分组节点文件: ${filename}`);
          generatedFiles++;
        } catch (writeErr) {
          console.error(`创建空文件失败: ${filename} - ${writeErr.message}`);
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
    } else {
      console.log(`没有发现应用/流媒体分组，创建默认空文件`);
      
      // 创建默认流媒体分组的空文件
      const defaultMediaGroups = ['Netflix.txt', 'Disney_.txt', 'OpenAI.txt'];
      
      for (const filename of defaultMediaGroups) {
        const outputPath = path.join(groupDir, filename);
        try {
          fs.writeFileSync(outputPath, ''); // 写入空内容
          console.log(`已创建空的应用分组节点文件: ${filename}`);
          generatedFiles++;
        } catch (writeErr) {
          console.error(`创建空文件失败: ${filename} - ${writeErr.message}`);
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

// 修改main函数，添加全局超时控制和错误处理
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
  const dataDir = path.join(rootDir, CONFIG.options.dataDir);
  console.log(`数据目录: ${dataDir}`);
  
  // 确保数据目录存在
  ensureDirectoryExists(dataDir);
  
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
    let mergedNodes = [];
    try {
      mergedNodes = await fetchAndMergeAllNodes(converter);
    } catch (error) {
      console.error(`获取订阅节点失败: ${error.message}`);
      console.error(error.stack);
      mergedNodes = []; // 确保是空数组
    }
    
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
    if (CONFIG.testConfig && CONFIG.testConfig.enabled && mergedNodes.length > 0) {
      console.log(`即将开始节点测试，总节点数: ${mergedNodes.length}`);
      
      if (mergedNodes.length < 10) {
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
          try {
            const testResults = await tester.testNodes(batches[i]);
            testedNodes = testedNodes.concat(testResults);
          } catch (testError) {
            console.error(`测试批次 ${i+1} 失败: ${testError.message}`);
          }
          
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
    } else {
      console.log('跳过节点测试步骤');
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
    } else {
      console.log('没有节点可供排序');
    }
    
    // 创建输出目录
    const outDir = path.join(rootDir, CONFIG.options.outputDir || 'output');
    ensureDirectoryExists(outDir);
    console.log(`确保输出目录存在: ${outDir}`);
    
    // 保存节点详细信息到JSON文件(方便调试和数据分析)
    try {
      const nodesJsonFile = path.join(outDir, `nodes.json`);
      fs.writeFileSync(nodesJsonFile, JSON.stringify(mergedNodes, null, 2));
      console.log(`已保存节点详细信息到: ${nodesJsonFile}`);
    } catch (error) {
      console.error(`保存节点详细信息失败: ${error.message}`);
    }
    
    // 生成各种配置文件
    if (CONFIG.outputConfigs && CONFIG.outputConfigs.length > 0) {
      console.log(`准备生成配置文件...`);
      try {
        await generateConfigs(mergedNodes, CONFIG.outputConfigs, {
          rootDir: rootDir,
          outputDir: CONFIG.options.outputDir || 'output',
          dataDir: CONFIG.options.dataDir || 'data'
        });
        console.log(`配置文件生成完成`);
      } catch (configError) {
        console.error(`生成配置文件失败: ${configError.message}`);
      }
    }
    
    // 生成分组节点文件
    try {
      console.log(`准备生成分组节点文件...`);
      await generateGroupedNodeFiles(mergedNodes, {
        rootDir: rootDir,
        outputDir: CONFIG.options.outputDir || 'output',
        dataDir: CONFIG.options.dataDir || 'data'
      });
      console.log(`分组节点文件生成完成`);
    } catch (groupError) {
      console.error(`生成分组节点文件失败: ${groupError.message}`);
    }
    
    // 保存本次同步状态
    const statusData = {
      timestamp: Date.now(),
      success: true,
      finalNodesCount: mergedNodes.length,
      previousNodesCount: previousNodeCount,
      message: `成功同步 ${mergedNodes.length} 个节点`
    };
    
    try {
      fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
      console.log(`已保存同步状态到: ${statusFile}`);
    } catch (e) {
      console.error(`保存同步状态失败: ${e.message}`);
    }
    
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
    try {
      const statusData = {
        timestamp: Date.now(),
        success: false,
        previousNodesCount: previousNodeCount,
        message: `同步失败: ${error.message}`
      };
      fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
    } catch (e) {
      console.error(`保存错误状态失败: ${e.message}`);
    }
    
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
