import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/index.js';
import { IpLocationDetector } from '../../utils/ip/IpLocationDetector.js';
import { SocksNodeConverter } from '../../utils/proxy/SocksNodeConverter.js';

const defaultLogger = logger?.defaultLogger || console;

export class SubscriptionParser {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.dataDir = options.dataDir || 'data';
    this.logger = options.logger || defaultLogger.child({ component: 'SubscriptionParser' });
  }

  /**
   * 解析订阅内容
   * @param {string} content 订阅内容
   * @param {string} type 订阅类型
   * @param {Object} options 选项
   * @returns {Promise<Array>} 解析后的节点列表
   */
  async parseSubscription(content, type, options = {}) {
    let nodes = [];
    
    try {
      // 根据订阅类型选择不同的解析方法
      switch (type) {
        case 'base64':
          nodes = await this.parseBase64(content, options);
          break;
        case 'shadowsocks':
          nodes = await this.parseShadowsocks(content, options);
          break;
        case 'clash':
          nodes = await this.parseClash(content, options);
          break;
        case 'sip002':
          nodes = await this.parseSIP002(content, options);
          break;
        case 'v2ray':
          nodes = await this.parseV2Ray(content, options);
          break;
        case 'trojan':
          nodes = await this.parseTrojan(content, options);
          break;
        case 'mixed':
          nodes = await this.parseMixed(content, options);
          break;
        default:
          this.logger.warn(`未知的订阅类型: ${type}，尝试作为混合类型解析`);
          nodes = await this.parseMixed(content, options);
      }
      
      // 检查是否需要对中国节点进行处理
      if (options.detectChineseNodes !== false) {
        // 创建IP地理位置检测器和SOCKS节点转换器
        const ipDetector = new IpLocationDetector({
          logger: this.logger,
          rootDir: this.rootDir,
          dataDir: this.dataDir
        });
        
        const socksConverter = new SocksNodeConverter({
          logger: this.logger
        });
        
        // 记录开始检测
        this.logger.info(`开始检测中国大陆节点，总节点数: ${nodes.length}`);
        
        // 分批处理节点，避免一次检测过多
        const batchSize = 50;
        const batches = Math.ceil(nodes.length / batchSize);
        
        let cnNodes = [];
        
        for (let i = 0; i < batches; i++) {
          const start = i * batchSize;
          const end = Math.min(start + batchSize, nodes.length);
          const batch = nodes.slice(start, end);
          
          // 并行检测每个节点的IP位置
          const promises = batch.map(async (node) => {
            try {
              // 跳过已标记的节点
              if (node.metadata?.location?.country === 'CN' || 
                  node.metadata?.location?.country === 'China') {
                return {
                  node,
                  isCN: true
                };
              }
              
              // 跳过没有服务器地址的节点
              if (!node.server) {
                return {
                  node,
                  isCN: false
                };
              }
              
              // 检测IP地理位置
              const location = await ipDetector.detectLocation(node.server);
              
              // 如果是中国大陆IP，标记该节点
              if (location && (location.country === 'CN' || location.country === 'China')) {
                // 添加位置元数据
                if (!node.metadata) node.metadata = {};
                node.metadata.location = location;
                node.metadata.isChinaNode = true;
                
                return {
                  node,
                  isCN: true
                };
              }
              
              // 非中国节点，添加位置信息
              if (location) {
                if (!node.metadata) node.metadata = {};
                node.metadata.location = location;
              }
              
              return {
                node,
                isCN: false
              };
            } catch (error) {
              this.logger.warn(`检测节点 ${node.name || node.server} 的地理位置失败: ${error.message}`);
              return {
                node,
                isCN: false
              };
            }
          });
          
          // 等待所有检测完成
          const results = await Promise.all(promises);
          
          // 收集中国节点
          const batchCNNodes = results.filter(r => r.isCN).map(r => r.node);
          cnNodes = [...cnNodes, ...batchCNNodes];
          
          this.logger.info(`批次 ${i+1}/${batches} 检测完成，发现 ${batchCNNodes.length} 个中国节点`);
        }
        
        // 输出中国节点数量
        this.logger.info(`共发现 ${cnNodes.length} 个中国大陆节点`);
        
        // 如果找到中国节点，创建SOCKS版本
        if (cnNodes.length > 0 && options.convertToSocks !== false) {
          this.logger.info('开始将中国节点转换为SOCKS类型');
          
          // 过滤掉已经是SOCKS的节点，避免重复转换
          const nonSocksNodes = cnNodes.filter(node => 
            node.type !== 'socks' && 
            node.type !== 'socks5' && 
            !node.metadata?.is_china_socks
          );
          
          if (nonSocksNodes.length === 0) {
            this.logger.info('所有中国节点都已经是SOCKS类型，无需转换');
            return nodes;
          }
          
          // 转换为SOCKS节点
          const socksNodes = await Promise.all(
            nonSocksNodes.map(node => socksConverter.convertToSocks(node))
          );
          
          // 过滤掉转换失败的节点
          const validSocksNodes = socksNodes.filter(node => node !== null);
          
          this.logger.info(`成功转换 ${validSocksNodes.length} 个SOCKS节点`);
          
          // 将SOCKS节点添加到结果中
          const result = [...nodes, ...validSocksNodes];
          
          // 缓存中国SOCKS节点
          this._cacheChinaSocksNodes(validSocksNodes);
          
          return result;
        }
      }
      
      return nodes;
    } catch (error) {
      this.logger.error(`解析订阅内容失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 缓存中国SOCKS节点
   * @param {Array} nodes SOCKS节点列表
   * @private
   */
  _cacheChinaSocksNodes(nodes) {
    if (!nodes || nodes.length === 0) return;
    
    try {
      // 确保目录存在
      const cacheDir = path.join(this.rootDir, this.dataDir, 'cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      
      // 缓存文件路径
      const cachePath = path.join(cacheDir, 'china_socks_nodes.json');
      
      // 检查现有缓存
      let existingNodes = [];
      if (fs.existsSync(cachePath)) {
        try {
          const cacheContent = fs.readFileSync(cachePath, 'utf-8');
          existingNodes = JSON.parse(cacheContent);
        } catch (e) {
          this.logger.warn(`读取现有中国SOCKS节点缓存失败: ${e.message}`);
        }
      }
      
      // 合并节点，避免重复
      const serverSet = new Set();
      
      // 添加现有节点的服务器地址
      existingNodes.forEach(node => {
        if (node.server && node.port) {
          serverSet.add(`${node.server}:${node.port}`);
        }
      });
      
      // 添加新节点
      const newNodes = [];
      for (const node of nodes) {
        if (node.server && node.port) {
          const key = `${node.server}:${node.port}`;
          if (!serverSet.has(key)) {
            serverSet.add(key);
            newNodes.push(node);
          }
        }
      }
      
      // 合并节点
      const mergedNodes = [...existingNodes, ...newNodes];
      
      // 写入缓存
      fs.writeFileSync(cachePath, JSON.stringify(mergedNodes, null, 2));
      
      this.logger.info(`已缓存 ${mergedNodes.length} 个中国SOCKS节点 (新增 ${newNodes.length} 个)`);
    } catch (error) {
      this.logger.error(`缓存中国SOCKS节点失败: ${error.message}`);
    }
  }

  /**
   * 处理已有节点，检测中国节点并转换为SOCKS
   * @param {Array} nodes 节点列表
   * @param {Object} options 选项
   * @returns {Promise<Array>} 处理后的节点列表
   */
  async processNodes(nodes, options = {}) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }
    
    try {
      // 检查是否需要对中国节点进行处理
      if (options.detectChineseNodes !== false) {
        // 创建IP地理位置检测器和SOCKS节点转换器
        const ipDetector = new IpLocationDetector({
          logger: this.logger,
          rootDir: this.rootDir,
          dataDir: this.dataDir
        });
        
        const socksConverter = new SocksNodeConverter({
          logger: this.logger
        });
        
        // 记录开始检测
        this.logger.info(`开始检测中国大陆节点，总节点数: ${nodes.length}`);
        
        // 分批处理节点，避免一次检测过多
        const batchSize = 50;
        const batches = Math.ceil(nodes.length / batchSize);
        
        let cnNodes = [];
        
        for (let i = 0; i < batches; i++) {
          const start = i * batchSize;
          const end = Math.min(start + batchSize, nodes.length);
          const batch = nodes.slice(start, end);
          
          // 并行检测每个节点的IP位置
          const promises = batch.map(async (node) => {
            try {
              // 跳过已标记的节点
              if (node.metadata?.location?.country === 'CN' || 
                  node.metadata?.location?.country === 'China') {
                return {
                  node,
                  isCN: true
                };
              }
              
              // 跳过没有服务器地址的节点
              if (!node.server) {
                return {
                  node,
                  isCN: false
                };
              }
              
              // 检测IP地理位置
              const location = await ipDetector.detectLocation(node.server);
              
              // 如果是中国大陆IP，标记该节点
              if (location && (location.country === 'CN' || location.country === 'China')) {
                // 添加位置元数据
                if (!node.metadata) node.metadata = {};
                node.metadata.location = location;
                node.metadata.isChinaNode = true;
                
                return {
                  node,
                  isCN: true
                };
              }
              
              // 非中国节点，添加位置信息
              if (location) {
                if (!node.metadata) node.metadata = {};
                node.metadata.location = location;
              }
              
              return {
                node,
                isCN: false
              };
            } catch (error) {
              this.logger.warn(`检测节点 ${node.name || node.server} 的地理位置失败: ${error.message}`);
              return {
                node,
                isCN: false
              };
            }
          });
          
          // 等待所有检测完成
          const results = await Promise.all(promises);
          
          // 收集中国节点
          const batchCNNodes = results.filter(r => r.isCN).map(r => r.node);
          cnNodes = [...cnNodes, ...batchCNNodes];
          
          this.logger.info(`批次 ${i+1}/${batches} 检测完成，发现 ${batchCNNodes.length} 个中国节点`);
        }
        
        // 输出中国节点数量
        this.logger.info(`共发现 ${cnNodes.length} 个中国大陆节点`);
        
        // 如果找到中国节点，创建SOCKS版本
        if (cnNodes.length > 0 && options.convertToSocks !== false) {
          this.logger.info('开始将中国节点转换为SOCKS类型');
          
          // 过滤掉已经是SOCKS的节点，避免重复转换
          const nonSocksNodes = cnNodes.filter(node => 
            node.type !== 'socks' && 
            node.type !== 'socks5' && 
            !node.metadata?.is_china_socks
          );
          
          if (nonSocksNodes.length === 0) {
            this.logger.info('所有中国节点都已经是SOCKS类型，无需转换');
            return nodes;
          }
          
          // 转换为SOCKS节点
          const socksNodes = await Promise.all(
            nonSocksNodes.map(node => socksConverter.convertToSocks(node))
          );
          
          // 过滤掉转换失败的节点
          const validSocksNodes = socksNodes.filter(node => node !== null);
          
          this.logger.info(`成功转换 ${validSocksNodes.length} 个SOCKS节点`);
          
          // 将SOCKS节点添加到结果中
          const result = [...nodes, ...validSocksNodes];
          
          // 缓存中国SOCKS节点
          this._cacheChinaSocksNodes(validSocksNodes);
          
          return result;
        }
      }
      
      // 如果没有进行中国节点检测，或者没有找到中国节点，直接返回原节点列表
      return nodes;
    } catch (error) {
      this.logger.error(`处理节点失败: ${error.message}`);
      return nodes;
    }
  }
} 