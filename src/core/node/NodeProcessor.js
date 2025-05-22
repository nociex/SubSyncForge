/**
 * 节点处理器
 * 负责节点的去重、过滤和处理
 */

export class NodeProcessor {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.deduplication = options.deduplication !== false;
    this.logger = options.logger || console;
    this.filterIrrelevant = options.filterIrrelevant !== false;
  }

  /**
   * 处理节点数组
   * @param {Array} nodes 节点数组
   * @param {Object} options 处理选项
   * @returns {Array} 处理后的节点数组
   */
  processNodes(nodes, options = {}) {
    if (!Array.isArray(nodes)) {
      this.logger.warn('节点数组不是有效数组');
      return [];
    }

    this.logger.info(`开始处理节点，原始数量: ${nodes.length}`);
    
    // 过滤掉无效节点
    let validNodes = nodes.filter(node => this.isValidNode(node));
    this.logger.info(`过滤无效节点后数量: ${validNodes.length}`);
    
    // 过滤掉包含无关信息的节点
    if (this.filterIrrelevant) {
      const beforeCount = validNodes.length;
      validNodes = this.filterIrrelevantNodes(validNodes);
      this.logger.info(`过滤无关节点后数量: ${validNodes.length} (删除了 ${beforeCount - validNodes.length} 个节点)`);
    }
    
    // 仅保留测试连接成功的有效节点
    if (options.onlyValid) {
      const beforeCount = validNodes.length;
      validNodes = validNodes.filter(node => node.valid === true);
      this.logger.info(`仅保留连接有效的节点后数量: ${validNodes.length} (删除了 ${beforeCount - validNodes.length} 个连接失败的节点)`);
    }
    
    // 去重
    if (this.deduplication) {
      validNodes = this.deduplicateNodes(validNodes);
      this.logger.info(`去重后节点数量: ${validNodes.length}`);
    }
    
    // 应用过滤器（如果有）
    if (options.filters && Array.isArray(options.filters)) {
      options.filters.forEach(filter => {
        const beforeCount = validNodes.length;
        validNodes = validNodes.filter(node => filter(node));
        this.logger.info(`应用过滤器后节点数量: ${validNodes.length} (删除了 ${beforeCount - validNodes.length} 个节点)`);
      });
    }
    
    // 限制节点数量（如果有）
    if (options.maxNodes && options.maxNodes > 0 && validNodes.length > options.maxNodes) {
      validNodes = validNodes.slice(0, options.maxNodes);
      this.logger.info(`限制节点数量为 ${options.maxNodes}`);
    }
    
    // 规范化节点（确保每个节点都有必要的字段）
    validNodes = this.normalizeNodes(validNodes);
    
    return validNodes;
  }

  /**
   * 过滤包含无关信息的节点
   * @param {Array} nodes 节点数组
   * @returns {Array} 过滤后的节点数组
   */
  filterIrrelevantNodes(nodes) {
    if (!Array.isArray(nodes)) return [];
    
    // 定义无关关键词列表
    const irrelevantKeywords = [
      '剩余流量', '重置时间', '机场', '过期', '到期', '重置',
      'expire', 'reset', 'remaining', 'traffic', 'balance',
      '官网', '官方', 'website', 'channel', '频道', '客服',
      '购买', '购物', 'buy', 'shop', 'time', 'left',
      '续费', 'renewal', '网站', '流量', '套餐'
    ];
    
    return nodes.filter(node => {
      // 检查节点名称是否包含无关关键词
      if (!node.name) return true;
      
      const nodeName = node.name.toLowerCase();
      
      // 如果节点名称包含任何无关关键词，则过滤掉
      for (const keyword of irrelevantKeywords) {
        if (nodeName.includes(keyword.toLowerCase())) {
          this.logger.debug(`过滤掉无关节点: ${node.name}`);
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * 检查节点是否有效
   * @param {Object} node 节点对象
   * @returns {boolean} 是否有效
   */
  isValidNode(node) {
    if (!node) {
      this.logger.debug('节点无效: 节点对象为空');
      return false;
    }
    
    // 基本属性检查
    if (!node.type) {
      this.logger.debug(`节点无效: 缺少type字段`, {name: node.name});
      return false;
    }
    
    if (!node.server) {
      this.logger.debug(`节点无效: 缺少server字段`, {name: node.name, type: node.type});
      return false;
    }
    
    if (!node.port) {
      this.logger.debug(`节点无效: 缺少port字段`, {name: node.name, type: node.type, server: node.server});
      return false;
    }
    
    // 服务器地址检查 - 过滤掉明显无效的地址
    const invalidServerPatterns = [
      /localhost/i,
      /^127\./,
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /example/i,
      /test/i,
      /^[^.]+$/  // 不包含点的地址
    ];
    
    for (const pattern of invalidServerPatterns) {
      if (pattern.test(node.server)) {
        this.logger.debug(`节点无效: 服务器地址无效`, {name: node.name, server: node.server});
        return false;
      }
    }
    
    // 特定类型的额外检查
    if (node.type === 'ss' || node.type === 'shadowsocks') {
      if (!node.settings || !node.settings.method || !node.settings.password) {
        this.logger.debug(`SS节点无效: 缺少method或password`, {name: node.name, server: node.server});
        return false;
      }
    } else if (node.type === 'vmess') {
      if (!node.settings || !node.settings.id) {
        this.logger.debug(`Vmess节点无效: 缺少id`, {name: node.name, server: node.server});
        return false;
      }
    } else if (node.type === 'trojan') {
      if (!node.settings || !node.settings.password) {
        this.logger.debug(`Trojan节点无效: 缺少password`, {name: node.name, server: node.server});
        return false;
      }
    } else if (node.type === 'vless') {
      if (!node.settings || !node.settings.id) {
        this.logger.debug(`VLESS节点无效: 缺少id`, {name: node.name, server: node.server});
        return false;
      }
    }
    
    return true;
  }

  /**
   * 节点去重
   * @param {Array} nodes 节点数组
   * @returns {Array} 去重后的节点数组
   */
  deduplicateNodes(nodes) {
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
        if (node.settings) {
          if (node.settings.password) uniqueKey += `:${node.settings.password}`;
          if (node.settings.id) uniqueKey += `:${node.settings.id}`;
          if (node.settings.method) uniqueKey += `:${node.settings.method}`;
        }
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

  /**
   * 规范化节点
   * @param {Array} nodes 节点数组
   * @returns {Array} 规范化后的节点数组
   */
  normalizeNodes(nodes) {
    return nodes.map(node => ({
      id: node.id || this.generateId(),
      type: node.type,
      name: node.name || `${node.type}-${node.server}:${node.port}`,
      server: node.server,
      port: parseInt(node.port),
      protocol: node.protocol || node.type,
      settings: node.settings || {},
      metadata: node.metadata || {},
      extra: node.extra || {},
      test: node.test || null
    }));
  }

  /**
   * 生成随机ID
   * @returns {string} 随机ID
   */
  generateId() {
    return Math.random().toString(36).substring(2, 11);
  }

  /**
   * 按区域分组节点
   * @param {Array} nodes 节点数组
   * @returns {Object} 分组后的节点
   */
  groupNodesByRegion(nodes) {
    const groups = {
      '香港': [],
      '台湾': [],
      '日本': [],
      '美国': [],
      '新加坡': [],
      '其他': []
    };
    
    nodes.forEach(node => {
      const name = node.name || '';
      
      if (name.includes('香港') || name.includes('HK') || name.includes('Hong')) {
        groups['香港'].push(node);
      } else if (name.includes('台湾') || name.includes('TW') || name.includes('Taiwan')) {
        groups['台湾'].push(node);
      } else if (name.includes('日本') || name.includes('JP') || name.includes('Japan')) {
        groups['日本'].push(node);
      } else if (name.includes('美国') || name.includes('US') || name.includes('USA')) {
        groups['美国'].push(node);
      } else if (name.includes('新加坡') || name.includes('SG') || name.includes('Singapore')) {
        groups['新加坡'].push(node);
      } else {
        groups['其他'].push(node);
      }
    });
    
    return groups;
  }
} 