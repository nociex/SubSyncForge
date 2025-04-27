/**
 * YAML解析器
 * 用于解析YAML格式的订阅内容
 */
export class YamlParser {
  /**
   * 解析YAML格式的数据
   * @param {string} raw 原始YAML文本
   * @returns {Array} 解析后的节点数组
   */
  async parse(raw) {
    try {
      // 动态导入yaml解析库
      let yamlModule;
      try {
        yamlModule = await import('js-yaml');
      } catch (e) {
        // 如果js-yaml不可用，尝试使用yaml库
        try {
          yamlModule = await import('yaml');
        } catch (e2) {
          throw new Error('No YAML parser module available');
        }
      }
      
      // 使用合适的解析函数
      const yaml = yamlModule.default || yamlModule;
      const parseFunc = yaml.load || yaml.parse || yaml.safeLoad;
      
      if (!parseFunc) {
        throw new Error('No valid YAML parse function found');
      }
      
      // 解析YAML数据
      const data = parseFunc(raw);
      
      if (!data) {
        console.error('YAML parsed to null or undefined');
        return [];
      }
      
      console.log('成功解析YAML，开始提取节点信息');
      
      // 处理不同的YAML格式（主要是Clash配置格式）
      if (data.proxies) {
        // Clash格式
        console.log(`找到proxies字段，包含 ${data.proxies.length} 个节点`);
        return data.proxies.map(node => this.normalizeNode(node)).filter(Boolean);
      } else if (data.Proxy) {
        // 某些自定义格式
        console.log('找到Proxy字段');
        if (Array.isArray(data.Proxy)) {
          return data.Proxy.map(node => this.normalizeNode(node)).filter(Boolean);
        } else {
          const proxy = this.normalizeNode(data.Proxy);
          return proxy ? [proxy] : [];
        }
      } else if (data['proxy-providers']) {
        // Clash格式的provider
        console.log('找到proxy-providers字段');
        const providers = data['proxy-providers'];
        const nodes = [];
        
        for (const key in providers) {
          if (providers[key]?.proxies) {
            const providerNodes = providers[key].proxies.map(node => this.normalizeNode(node)).filter(Boolean);
            nodes.push(...providerNodes);
          }
        }
        
        console.log(`从proxy-providers提取了 ${nodes.length} 个节点`);
        return nodes;
      } else if (data['proxy-groups']) {
        // 尝试从代理组提取节点
        console.log('找到proxy-groups字段');
        const groups = data['proxy-groups'];
        const nodes = [];
        
        for (const group of groups) {
          if (group.proxies && Array.isArray(group.proxies)) {
            // 过滤出非组名的项（可能是直接节点配置）
            const directNodes = group.proxies.filter(item => 
              typeof item === 'object' && item !== null
            );
            
            const parsedNodes = directNodes.map(node => this.normalizeNode(node)).filter(Boolean);
            nodes.push(...parsedNodes);
          }
        }
        
        console.log(`从proxy-groups提取了 ${nodes.length} 个节点`);
        return nodes;
      } else {
        // 输出YAML结构以便调试
        console.log('YAML结构中没有找到proxies、Proxy等标准字段，尝试查找其他可能包含节点的字段');
        console.log('YAML顶级键:',  Object.keys(data).join(', '));
        
        // 检查是否有任何字段包含可能的节点数组
        for (const key of Object.keys(data)) {
          if (Array.isArray(data[key])) {
            const possibleNodes = data[key].filter(item => 
              typeof item === 'object' && item !== null && 
              (item.type || item.server || item.host || item.port)
            );
            
            if (possibleNodes.length > 0) {
              console.log(`在字段 ${key} 中发现 ${possibleNodes.length} 个可能的节点`);
              const nodes = possibleNodes.map(node => this.normalizeNode(node)).filter(Boolean);
              if (nodes.length > 0) {
                console.log(`成功从字段 ${key} 解析出 ${nodes.length} 个节点`);
                return nodes;
              }
            }
          }
        }
      }
      
      // 尝试将整个文档作为单个节点
      console.log('尝试将整个文档作为单个节点处理');
      const node = this.normalizeNode(data);
      return node ? [node] : [];
    } catch (error) {
      console.error('YAML parsing error:', error);
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
    if (!node || typeof node !== 'object') return null;
    
    // 尝试识别节点类型
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
    // 先检查类型字段
    if (node.type) return node.type.toLowerCase();
    
    // 根据特定字段推断类型
    if (node.uuid || node.id) return 'vmess';
    if (node.password) {
      if (node.method || node.cipher) return 'shadowsocks';
      if (node.sni || node.skip_cert_verify !== undefined) return 'trojan';
    }
    if (node.username && node.server) return 'http';
    
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
      name: node.name || '',
      server: node.server || '',
      port: parseInt(node.port) || 443,
      protocol: 'vmess',
      settings: {
        id: node.uuid || node.id || '',
        alterId: parseInt(node.alterId || '0'),
        security: node.cipher || 'auto',
        network: node.network || 'tcp',
        wsPath: node.ws_path || node.path || node['ws-path'] || '',
        wsHeaders: node.ws_headers || node['ws-headers'] || {},
        tls: node.tls === true,
        serverName: node.sni || node.servername || ''
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
      name: node.name || '',
      server: node.server || '',
      port: parseInt(node.port) || 443,
      protocol: 'shadowsocks',
      settings: {
        method: node.cipher || node.method || 'aes-256-gcm',
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
      name: node.name || '',
      server: node.server || '',
      port: parseInt(node.port) || 443,
      protocol: 'trojan',
      settings: {
        password: node.password || '',
        sni: node.sni || '',
        allowInsecure: node.skip_cert_verify === true || node['skip-cert-verify'] === true
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
      name: node.name || '',
      server: node.server || '',
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
      name: node.name || '',
      server: node.server || '',
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