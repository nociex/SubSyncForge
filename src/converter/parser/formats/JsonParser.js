/**
 * JSON解析器
 * 用于解析JSON格式的订阅内容
 */
export class JsonParser {
  /**
   * 解析JSON格式的数据
   * @param {string} raw 原始JSON文本
   * @returns {Array} 解析后的节点数组
   */
  async parse(raw) {
    try {
      // 解析JSON数据
      const data = JSON.parse(raw);
      
      // 处理不同的JSON格式
      if (Array.isArray(data)) {
        // 直接是节点数组
        return data.map(node => this.normalizeNode(node)).filter(Boolean);
      } else if (data.servers || data.proxies) {
        // Clash类型格式，有servers或proxies字段
        const nodes = data.servers || data.proxies || [];
        return nodes.map(node => this.normalizeNode(node)).filter(Boolean);
      } else if (data.node_list) {
        // 某些自定义格式，有node_list字段
        return data.node_list.map(node => this.normalizeNode(node)).filter(Boolean);
      } else if (data.nodes) {
        // 某些自定义格式，有nodes字段
        return data.nodes.map(node => this.normalizeNode(node)).filter(Boolean);
      } else if (data.config) {
        // 某些自定义格式，有config字段
        if (Array.isArray(data.config)) {
          return data.config.map(node => this.normalizeNode(node)).filter(Boolean);
        } else if (data.config.servers || data.config.proxies) {
          const nodes = data.config.servers || data.config.proxies || [];
          return nodes.map(node => this.normalizeNode(node)).filter(Boolean);
        }
      }
      
      // 无法识别的格式，尝试作为单个节点处理
      const node = this.normalizeNode(data);
      return node ? [node] : [];
    } catch (error) {
      console.error('JSON parsing error:', error);
      return [];
    }
  }

  /**
   * 将不同格式的节点标准化
   * @param {Object} node 原始节点对象
   * @returns {Object|null} 标准化后的节点对象
   */
  normalizeNode(node) {
    // 检查是否包含必要的信息
    if (!node) return null;
    
    // 尝试识别节点类型和协议
    let type = this.detectNodeType(node);
    if (!type) return null;
    
    // 根据类型进行处理
    switch (type) {
      case 'vmess':
        return this.normalizeVmess(node);
      case 'ss':
      case 'shadowsocks':
        return this.normalizeShadowsocks(node);
      case 'trojan':
        return this.normalizeTrojan(node);
      case 'http':
      case 'https':
        return this.normalizeHttp(node);
      case 'socks':
      case 'socks5':
        return this.normalizeSocks(node);
      default:
        return null;
    }
  }

  /**
   * 检测节点类型
   * @param {Object} node 节点对象
   * @returns {string|null} 节点类型
   */
  detectNodeType(node) {
    // 检查常见的类型字段
    if (node.type) return node.type.toLowerCase();
    if (node.protocol) return node.protocol.toLowerCase();
    if (node.server && node.method && node.password) return 'shadowsocks';
    
    // Clash格式特殊处理
    if (node.name || node.server) {
      if (node.uuid || node.id) return 'vmess';
      if (node.password) {
        if (node.method) return 'shadowsocks';
        if (node.skip_cert_verify !== undefined) return 'trojan';
      }
      if (node.username) return 'http';
    }
    
    return null;
  }

  /**
   * 标准化Vmess节点
   * @param {Object} node Vmess节点对象
   * @returns {Object} 标准化后的节点对象
   */
  normalizeVmess(node) {
    return {
      type: 'vmess',
      name: node.name || node.ps || node.remarks || '',
      server: node.server || node.add || node.address || '',
      port: parseInt(node.port) || 443,
      protocol: 'vmess',
      settings: {
        id: node.uuid || node.id || '',
        alterId: parseInt(node.aid || node.alterId || '0'),
        security: node.security || node.cipher || 'auto',
        network: node.network || node.net || 'tcp',
        wsPath: node.ws_path || node.path || '',
        wsHeaders: node.ws_headers || (node.host ? { Host: node.host } : {}),
        tls: node.tls === 'tls' || node.tls === true || node.security === 'tls',
        serverName: node.sni || node.host || ''
      },
      extra: {
        raw: node
      }
    };
  }

  /**
   * 标准化Shadowsocks节点
   * @param {Object} node Shadowsocks节点对象
   * @returns {Object} 标准化后的节点对象
   */
  normalizeShadowsocks(node) {
    return {
      type: 'ss',
      name: node.name || node.remarks || '',
      server: node.server || node.address || '',
      port: parseInt(node.port) || 443,
      protocol: 'shadowsocks',
      settings: {
        method: node.method || node.cipher || 'aes-256-gcm',
        password: node.password || '',
        udp: node.udp === true
      },
      extra: {
        raw: node
      }
    };
  }

  /**
   * 标准化Trojan节点
   * @param {Object} node Trojan节点对象
   * @returns {Object} 标准化后的节点对象
   */
  normalizeTrojan(node) {
    return {
      type: 'trojan',
      name: node.name || node.remarks || '',
      server: node.server || node.address || '',
      port: parseInt(node.port) || 443,
      protocol: 'trojan',
      settings: {
        password: node.password || '',
        sni: node.sni || node.host || '',
        allowInsecure: node.skip_cert_verify === true || node.allow_insecure === true
      },
      extra: {
        raw: node
      }
    };
  }

  /**
   * 标准化HTTP节点
   * @param {Object} node HTTP节点对象
   * @returns {Object} 标准化后的节点对象
   */
  normalizeHttp(node) {
    return {
      type: 'http',
      name: node.name || node.remarks || '',
      server: node.server || node.address || '',
      port: parseInt(node.port) || 80,
      protocol: node.tls ? 'https' : 'http',
      settings: {
        username: node.username || '',
        password: node.password || '',
        tls: node.tls === true
      },
      extra: {
        raw: node
      }
    };
  }

  /**
   * 标准化Socks节点
   * @param {Object} node Socks节点对象
   * @returns {Object} 标准化后的节点对象
   */
  normalizeSocks(node) {
    return {
      type: 'socks',
      name: node.name || node.remarks || '',
      server: node.server || node.address || '',
      port: parseInt(node.port) || 1080,
      protocol: 'socks',
      settings: {
        username: node.username || '',
        password: node.password || ''
      },
      extra: {
        raw: node
      }
    };
  }
} 