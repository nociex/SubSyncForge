/**
 * 中国代理配置加载器
 * 负责从配置文件加载中国大陆代理设置
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../index.js';
import { SocksProxyVerifier } from './SocksProxyVerifier.js';

const defaultLogger = logger?.defaultLogger || console;

export class ChinaProxyLoader {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.configPath = options.configPath || path.resolve(this.rootDir, 'config/china_proxies.json');
    this.logger = options.logger || defaultLogger.child({ component: 'ChinaProxyLoader' });
    this.verifier = new SocksProxyVerifier({
      logger: this.logger,
      testUrl: options.testUrl || 'http://www.gstatic.com/generate_204',
      directTestUrl: options.directTestUrl || 'https://www.baidu.com'
    });
  }

  /**
   * 加载中国代理配置
   * @returns {Object} 加载的配置
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.logger.warn(`中国代理配置文件不存在: ${this.configPath}`);
        return this.getDefaultConfig();
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(content);

      if (!config) {
        this.logger.warn('中国代理配置文件内容为空');
        return this.getDefaultConfig();
      }

      return this.mergeWithDefaults(config);
    } catch (error) {
      this.logger.error('解析中国代理配置文件失败:', error.message);
      return this.getDefaultConfig();
    }
  }

  /**
   * 获取默认配置
   * @returns {Object} 默认配置
   */
  getDefaultConfig() {
    return {
      enabled: false,
      proxies: [],
      use_for_subscription: false,
      use_for_testing: false,
      auto_detect_environment: false,
      use_local_connection_if_in_china: true,
      auto_find_china_nodes_from_cache: false,
      fallback_to_direct: true, // 默认在找不到中国代理时直接连接
      allow_non_china_socks_nodes: false, // 默认不使用非中国节点
      backup_proxies: [], // 备用代理列表
      subscription: {
        cache_ttl: 21600,
        timeout: 10000,
        retries: 3
      },
      testing: {
        timeout: 5000,
        test_url: "http://www.gstatic.com/generate_204"
      }
    };
  }

  /**
   * 将用户配置与默认配置合并
   * @param {Object} userConfig 用户配置
   * @returns {Object} 合并后的配置
   */
  mergeWithDefaults(userConfig) {
    const defaultConfig = this.getDefaultConfig();
    const finalConfig = { ...defaultConfig };

    // 合并启用状态
    if (userConfig.enabled !== undefined) {
      finalConfig.enabled = userConfig.enabled;
    }

    // 合并代理列表
    if (userConfig.proxies && Array.isArray(userConfig.proxies)) {
      finalConfig.proxies = userConfig.proxies.map(proxy => {
        // 确保代理格式正确
        if (typeof proxy === 'string') {
          return proxy;
        } else if (typeof proxy === 'object') {
          // 转换为标准格式
          if (proxy.server && proxy.port) {
            const { server, port, username, password, type = 'socks5', name } = proxy;
            return {
              name: name || `${server}:${port}`,
              server,
              port,
              username,
              password,
              type
            };
          }
        }
        return null;
      }).filter(proxy => proxy !== null);
    }

    // 合并订阅和测试相关配置
    if (userConfig.use_for_subscription !== undefined) {
      finalConfig.use_for_subscription = userConfig.use_for_subscription;
    }

    if (userConfig.use_for_testing !== undefined) {
      finalConfig.use_for_testing = userConfig.use_for_testing;
    }

    // 合并自动检测和查找节点相关配置
    if (userConfig.auto_detect_environment !== undefined) {
      finalConfig.auto_detect_environment = userConfig.auto_detect_environment;
    }

    if (userConfig.use_local_connection_if_in_china !== undefined) {
      finalConfig.use_local_connection_if_in_china = userConfig.use_local_connection_if_in_china;
    }

    if (userConfig.auto_find_china_nodes_from_cache !== undefined) {
      finalConfig.auto_find_china_nodes_from_cache = userConfig.auto_find_china_nodes_from_cache;
    }
    
    // 合并容错相关配置
    if (userConfig.fallback_to_direct !== undefined) {
      finalConfig.fallback_to_direct = userConfig.fallback_to_direct;
    }
    
    if (userConfig.allow_non_china_socks_nodes !== undefined) {
      finalConfig.allow_non_china_socks_nodes = userConfig.allow_non_china_socks_nodes;
    }
    
    if (userConfig.backup_proxies && Array.isArray(userConfig.backup_proxies)) {
      finalConfig.backup_proxies = userConfig.backup_proxies;
    }
    
    // 合并中国节点关键词配置
    if (userConfig.china_node_keywords && Array.isArray(userConfig.china_node_keywords)) {
      finalConfig.china_node_keywords = userConfig.china_node_keywords;
    } else {
      finalConfig.china_node_keywords = [
        "中国", "CN", "China", "大陆", "国内", "回国", "电信", "联通", "移动"
      ];
    }

    // 合并订阅设置
    if (userConfig.subscription) {
      if (userConfig.subscription.cache_ttl !== undefined) {
        finalConfig.subscription.cache_ttl = userConfig.subscription.cache_ttl;
      }
      
      if (userConfig.subscription.timeout !== undefined) {
        finalConfig.subscription.timeout = userConfig.subscription.timeout;
      }
      
      if (userConfig.subscription.retries !== undefined) {
        finalConfig.subscription.retries = userConfig.subscription.retries;
      }
    }

    // 合并测试设置
    if (userConfig.testing) {
      if (userConfig.testing.timeout !== undefined) {
        finalConfig.testing.timeout = userConfig.testing.timeout;
      }
      
      if (userConfig.testing.test_url !== undefined) {
        finalConfig.testing.test_url = userConfig.testing.test_url;
      }
    }

    return finalConfig;
  }

  /**
   * 获取格式化后的代理列表
   * @param {boolean} verifyProxies 是否验证代理可用性
   * @returns {Promise<Array<string>>} 代理列表
   */
  async getFormattedProxies(verifyProxies = false) {
    const config = this.loadConfig();
    if (!config.enabled) {
      this.logger.info('中国代理功能未启用');
      return [];
    }

    let proxies = [];

    // 首先尝试从配置中获取代理
    if (config.proxies && config.proxies.length > 0) {
      this.logger.info(`从配置中发现 ${config.proxies.length} 个中国代理`);
      proxies = this._formatProxies(config.proxies);
    } else {
      // 如果配置中没有，尝试自动查找
      if (config.auto_find_china_nodes_from_cache) {
        this.logger.info('尝试从缓存中查找中国节点');
        const chinaNodes = await this.findChinaNodesFromCache(config);
        if (chinaNodes.length > 0) {
          this.logger.info(`从缓存中找到 ${chinaNodes.length} 个中国节点`);
          const chinaProxies = this._formatNodes(chinaNodes);
          proxies = proxies.concat(chinaProxies);
        }
      }
      
      // 如果配置允许，查找任意SOCKS节点
      if (proxies.length === 0 && config.allow_non_china_socks_nodes) {
        this.logger.info('尝试从缓存中查找任意SOCKS节点');
        const socksNodes = await this.findAnySocksNodesFromCache();
        if (socksNodes.length > 0) {
          this.logger.info(`从缓存中找到 ${socksNodes.length} 个SOCKS节点`);
          const socksProxies = this._formatNodes(socksNodes);
          proxies = proxies.concat(socksProxies);
        }
      }

      // 如果仍然没有找到代理，使用备用代理
      if (proxies.length === 0 && config.backup_proxies && config.backup_proxies.length > 0) {
        this.logger.info(`使用 ${config.backup_proxies.length} 个备用代理`);
        proxies = this._formatProxies(config.backup_proxies);
      }
    }

    // 如果要求验证代理可用性
    if (verifyProxies && proxies.length > 0) {
      this.logger.info(`验证 ${proxies.length} 个代理的可用性`);
      const verifiedProxies = await this.verifyProxies(proxies);
      return verifiedProxies;
    }

    return proxies;
  }

  /**
   * 验证代理的可用性
   * @param {Array<string|Object>} proxies 代理列表
   * @returns {Promise<Array<string>>} 有效的代理列表
   */
  async verifyProxies(proxies) {
    if (!Array.isArray(proxies) || proxies.length === 0) {
      return [];
    }

    // 转换为节点对象格式
    const nodes = proxies.map(proxy => {
      if (typeof proxy === 'string') {
        // 解析代理字符串，如 socks5://user:pass@host:port
        const url = new URL(proxy);
        return {
          name: proxy,
          server: url.hostname,
          port: parseInt(url.port),
          settings: {
            username: url.username || undefined,
            password: url.password || undefined
          },
          type: url.protocol.replace(':', '')
        };
      } else if (typeof proxy === 'object') {
        // 对象格式
        return {
          name: proxy.name || `${proxy.server}:${proxy.port}`,
          server: proxy.server,
          port: proxy.port,
          settings: {
            username: proxy.username || undefined,
            password: proxy.password || undefined
          },
          type: proxy.type || 'socks5'
        };
      }
      return null;
    }).filter(node => node !== null);

    // 验证节点
    const results = await this.verifier.batchVerify(nodes);
    
    // 过滤出有效的节点
    const validNodes = results.filter(node => node.valid_as_socks);
    
    this.logger.info(`验证完成，${validNodes.length}/${nodes.length} 个代理可用`);
    
    // 将有效节点转换回代理字符串格式
    return validNodes.map(node => {
      const auth = node.settings?.username && node.settings?.password 
        ? `${node.settings.username}:${node.settings.password}@`
        : '';
      return `${node.type || 'socks5'}://${auth}${node.server}:${node.port}`;
    });
  }

  /**
   * 将对象格式的代理转换为字符串格式
   * @param {Array<Object>} proxies 代理对象数组
   * @returns {Array<string>} 格式化后的代理字符串数组
   */
  _formatProxies(proxies) {
    return proxies.map(proxy => {
      if (typeof proxy === 'string') {
        return proxy;
      } else if (typeof proxy === 'object') {
        const { server, port, username, password, type = 'socks5' } = proxy;
        if (server && port) {
          const auth = username && password ? `${username}:${password}@` : '';
          return `${type}://${auth}${server}:${port}`;
        }
      }
      return null;
    }).filter(proxy => proxy !== null);
  }

  /**
   * 将节点对象转换为代理字符串
   * @param {Array<Object>} nodes 节点对象数组
   * @returns {Array<string>} 代理字符串数组
   */
  _formatNodes(nodes) {
    return nodes.map(node => {
      if (node.type === 'socks' || node.type === 'socks5' || node.type === 'http' || node.type === 'https') {
        const auth = node.settings?.username && node.settings?.password 
          ? `${node.settings.username}:${node.settings.password}@`
          : '';
        return `${node.type}://${auth}${node.server}:${node.port}`;
      }
      return null;
    }).filter(proxy => proxy !== null);
  }

  /**
   * 从缓存中查找中国节点
   * @param {Object} config 配置对象
   * @returns {Promise<Array>} 中国节点列表
   */
  async findChinaNodesFromCache(config) {
    try {
      const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
      if (!fs.existsSync(cacheDir)) {
        this.logger.warn(`缓存目录不存在: ${cacheDir}`);
        return [];
      }
      
      // 首先尝试从专用的中国SOCKS节点缓存中获取
      const chinaSocksCachePath = path.join(cacheDir, 'china_socks_nodes.json');
      if (fs.existsSync(chinaSocksCachePath)) {
        try {
          const cacheContent = fs.readFileSync(chinaSocksCachePath, 'utf-8');
          const chinaNodes = JSON.parse(cacheContent);
          
          if (Array.isArray(chinaNodes) && chinaNodes.length > 0) {
            this.logger.info(`从专用缓存中找到 ${chinaNodes.length} 个中国SOCKS节点`);
            
            // 限制返回的节点数量，避免过多
            return chinaNodes.slice(0, 5);
          }
        } catch (error) {
          this.logger.warn(`解析中国SOCKS节点缓存失败: ${error.message}`);
        }
      }
      
      // 如果专用缓存中没有找到，尝试从普通缓存中查找
      const cacheFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('_cache.json'));
      if (cacheFiles.length === 0) {
        this.logger.warn('未找到任何缓存文件');
        return [];
      }
      
      let chinaNodes = [];
      const chinaKeywords = config.china_node_keywords || [
        "中国", "CN", "China", "大陆", "国内", "回国", "电信", "联通", "移动"
      ];
      
      for (const file of cacheFiles) {
        try {
          const cacheContent = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
          const cacheData = JSON.parse(cacheContent);
          
          if (cacheData && Array.isArray(cacheData.nodes)) {
            // 筛选出中国大陆节点
            const cnNodes = cacheData.nodes.filter(node => {
              // 检查节点是否为socks类型
              if (node.type !== 'socks' && node.type !== 'socks5') {
                return false;
              }
              
              // 优先使用已经标记为中国节点的
              if (node.metadata?.isChinaNode === true || 
                  node.metadata?.is_china_socks === true) {
                return true;
              }
              
              // 检查节点位置信息
              if (node.metadata?.location?.country === 'CN' || 
                  node.metadata?.location?.country === 'China') {
                return true;
              }
              
              // 检查节点名称是否包含中国相关关键词
              const nameCheck = node.name && chinaKeywords.some(keyword => 
                node.name.includes(keyword)
              );
              
              return nameCheck;
            });
            
            chinaNodes = [...chinaNodes, ...cnNodes];
          }
        } catch (error) {
          this.logger.warn(`解析缓存文件 ${file} 失败: ${error.message}`);
        }
      }
      
      // 对节点进行排序，优先使用名称明确包含关键词的节点
      chinaNodes.sort((a, b) => {
        const aScore = this.getChinaNodeScore(a, chinaKeywords);
        const bScore = this.getChinaNodeScore(b, chinaKeywords);
        return bScore - aScore;
      });
      
      // 限制返回的节点数量，避免过多
      return chinaNodes.slice(0, 5);
    } catch (error) {
      this.logger.error(`查找中国节点失败: ${error.message}`);
      return [];
    }
  }
  
  /**
   * 从缓存中查找任何SOCKS节点（非中国节点的备用方案）
   * @returns {Promise<Array>} SOCKS节点列表
   */
  async findAnySocksNodesFromCache() {
    try {
      const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
      if (!fs.existsSync(cacheDir)) {
        return [];
      }
      
      const cacheFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith('_cache.json'));
      if (cacheFiles.length === 0) {
        return [];
      }
      
      let socksNodes = [];
      
      for (const file of cacheFiles) {
        try {
          const cacheContent = fs.readFileSync(path.join(cacheDir, file), 'utf-8');
          const cacheData = JSON.parse(cacheContent);
          
          if (cacheData && Array.isArray(cacheData.nodes)) {
            // 筛选出所有SOCKS节点
            const nodes = cacheData.nodes.filter(node => 
              node.type === 'socks' || node.type === 'socks5'
            );
            
            socksNodes = [...socksNodes, ...nodes];
          }
        } catch (error) {
          this.logger.warn(`解析缓存文件 ${file} 失败: ${error.message}`);
        }
      }
      
      // 随机选择几个节点，避免总是使用相同的
      if (socksNodes.length > 5) {
        // 随机洗牌算法
        for (let i = socksNodes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [socksNodes[i], socksNodes[j]] = [socksNodes[j], socksNodes[i]];
        }
        
        // 取前5个
        socksNodes = socksNodes.slice(0, 5);
      }
      
      return socksNodes;
    } catch (error) {
      this.logger.error(`查找SOCKS节点失败: ${error.message}`);
      return [];
    }
  }
  
  /**
   * 获取中国节点的分数（用于排序）
   * @param {Object} node 节点对象
   * @param {Array<string>} keywords 关键词列表
   * @returns {number} 分数
   */
  getChinaNodeScore(node, keywords) {
    let score = 0;
    
    // 名称相关加分
    if (node.name) {
      for (const keyword of keywords) {
        if (node.name.includes(keyword)) {
          // 根据关键词重要性给不同分数
          switch (keyword) {
            case '中国':
            case 'CN':
            case 'China':
              score += 10;
              break;
            case '大陆':
            case '国内':
              score += 9;
              break;
            case '回国':
              score += 7;
              break;
            case '电信':
            case '联通':
            case '移动':
              score += 6;
              break;
            default:
              score += 5;
              break;
          }
        }
      }
    }
    
    // 位置信息加分
    if (node.metadata && node.metadata.location) {
      if (node.metadata.location.country === 'CN') score += 10;
      if (node.metadata.location.country === 'China') score += 10;
    }
    
    // 如果节点最近测试过且有效，加分
    if (node.metadata && node.metadata.test_result && node.metadata.test_result.valid) {
      score += 5;
      
      // 如果延迟较低，额外加分
      if (node.metadata.test_result.latency < 300) {
        score += 3;
      }
    }
    
    return score;
  }
  
  /**
   * 检测当前是否在中国大陆环境中运行
   * @returns {Promise<boolean>} 是否在中国大陆
   */
  async isRunningInChina() {
    try {
      // 先检查环境变量
      if (process.env.RUNNING_IN_CHINA === 'true') {
        return true;
      }
      if (process.env.RUNNING_IN_CHINA === 'false') {
        return false;
      }
      
      // 使用多个API检测IP位置，增加可靠性
      try {
        // 首先尝试ipinfo.io
        const response = await fetch('https://ipinfo.io/json', {
          headers: { 'User-Agent': 'SubSyncForge/1.0' },
          timeout: 5000
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.country === 'CN') {
            return true;
          }
        }
      } catch (error) {
        this.logger.warn(`ipinfo.io检测失败: ${error.message}`);
      }
      
      try {
        // 然后尝试ip-api.com
        const response = await fetch('http://ip-api.com/json/?fields=country,countryCode', {
          headers: { 'User-Agent': 'SubSyncForge/1.0' },
          timeout: 5000
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.countryCode === 'CN') {
            return true;
          }
        }
      } catch (error) {
        this.logger.warn(`ip-api.com检测失败: ${error.message}`);
      }
      
      // 如果以上检测都失败，尝试通过其他方式判断
      return this.fallbackLocationCheck();
    } catch (error) {
      this.logger.warn(`检测IP位置失败: ${error.message}`);
      
      // 如果检测失败，尝试通过其他方式判断
      return this.fallbackLocationCheck();
    }
  }
  
  /**
   * 备用位置检测方法
   * @returns {boolean} 是否可能在中国大陆
   */
  fallbackLocationCheck() {
    try {
      // 检查系统语言环境
      const locale = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL || '';
      if (locale.includes('zh_CN')) {
        this.logger.info('检测到中文语言环境，可能在中国大陆');
        return true;
      }
      
      // 检查时区
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone === 'Asia/Shanghai' || timezone === 'Asia/Chongqing') {
        this.logger.info('检测到中国时区，可能在中国大陆');
        return true;
      }
      
      // 检查本地网络连接，尝试访问中国特有网站
      this.testChinaWebsite().then(isChina => {
        if (isChina) {
          this.logger.info('能够访问中国特有网站，可能在中国大陆');
          return true;
        }
        return false;
      }).catch(() => false);
      
      return false;
    } catch (error) {
      this.logger.warn(`备用位置检测失败: ${error.message}`);
      return false;
    }
  }
  
  /**
   * 测试中国特有网站
   * @returns {Promise<boolean>} 是否能访问
   */
  async testChinaWebsite() {
    try {
      const websites = [
        'https://www.baidu.com/favicon.ico',
        'https://www.qq.com/favicon.ico'
      ];
      
      for (const site of websites) {
        try {
          const response = await fetch(site, {
            method: 'HEAD',
            timeout: 3000
          });
          
          if (response.ok) {
            return true;
          }
        } catch (e) {
          // 忽略单个网站的错误
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 检测是否在GitHub Actions环境中运行
   * @returns {boolean} 是否在GitHub Actions中
   */
  isGitHubActions() {
    return process.env.GITHUB_ACTIONS === 'true';
  }
}

export default ChinaProxyLoader; 