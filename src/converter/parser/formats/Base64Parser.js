/**
 * Base64解析器
 * 用于解析Base64编码的订阅内容
 */
export class Base64Parser {
  /**
   * 解析Base64编码的数据
   * @param {string} raw 原始Base64编码文本
   * @returns {Array} 解析后的节点数组
   */
  async parse(raw) {
    try {
      // 清理输入，去除可能的换行和空格
      const cleanedRaw = raw.replace(/[\r\n\s]/g, '');
      
      // 解码Base64数据
      let decoded;
      try {
        decoded = this.decodeBase64(cleanedRaw);
      } catch (error) {
        console.error('首次Base64解码失败，尝试修复格式:', error);
        
        // 尝试修复Base64字符串（去除填充字符再尝试）
        const withoutPadding = cleanedRaw.replace(/=/g, '');
        try {
          decoded = this.decodeBase64(withoutPadding);
        } catch (paddingError) {
          console.error('去除填充后解码仍然失败:', paddingError);
          
          // 再尝试添加正确的填充
          const missingPadding = 4 - (withoutPadding.length % 4);
          if (missingPadding < 4) {
            const withPadding = withoutPadding + '='.repeat(missingPadding);
            decoded = this.decodeBase64(withPadding);
          } else {
            throw new Error('无法解码Base64内容');
          }
        }
      }
      
      // 检查解码后的内容是什么格式
      if (this.isJsonFormat(decoded)) {
        console.log('检测到Base64编码的JSON内容');
        return this.parseJsonContent(decoded);
      } else if (this.isYamlFormat(decoded)) {
        console.log('检测到Base64编码的YAML/Clash内容，但Base64解析器不处理YAML');
        // 这种情况应该由SubscriptionParser来处理，返回空数组
        return [];
      }
      
      // 尝试按行分割，每行是一个节点
      const lines = decoded.split(/[\r\n]+/).filter(line => line.trim());
      
      // 解析每个节点
      const nodes = [];
      for (const line of lines) {
        const node = this.parseNode(line);
        if (node) {
          nodes.push(node);
        }
      }
      
      return nodes;
    } catch (error) {
      console.error('Base64 parsing error:', error);
      throw error; // 向上抛出错误，让调用者知道解析失败
    }
  }

  /**
   * 检测内容是否为JSON格式
   */
  isJsonFormat(content) {
    try {
      const trimmed = content.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        JSON.parse(trimmed);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * 检测内容是否为YAML/Clash格式
   */
  isYamlFormat(content) {
    return content.includes('proxies:') || 
           content.includes('Proxy:') || 
           content.includes('proxy-groups:') || 
           content.includes('rules:');
  }

  /**
   * 解析JSON格式的内容
   */
  parseJsonContent(content) {
    try {
      const data = JSON.parse(content);
      
      // 处理各种JSON格式
      if (Array.isArray(data)) {
        // 直接是节点数组
        return data.map(item => this.normalizeJsonNode(item)).filter(Boolean);
      } else if (data.servers || data.proxies) {
        // SIP008或类似格式
        const servers = data.servers || data.proxies || [];
        return servers.map(server => this.normalizeJsonNode(server)).filter(Boolean);
      } else if (data.outbounds || data.outbound) {
        // v2ray配置格式
        const outbounds = data.outbounds || [data.outbound];
        return outbounds.map(outbound => this.normalizeJsonNode(outbound)).filter(Boolean);
      } else {
        // 单个节点
        const node = this.normalizeJsonNode(data);
        return node ? [node] : [];
      }
    } catch (error) {
      console.error('JSON解析错误:', error);
      return [];
    }
  }

  /**
   * 标准化JSON节点格式
   */
  normalizeJsonNode(jsonNode) {
    try {
      // 根据不同的JSON结构进行转换
      if (jsonNode.server && jsonNode.server_port) {
        // sing-box格式
        return {
          type: jsonNode.type || 'unknown',
          name: jsonNode.tag || jsonNode.remarks || `${jsonNode.type || 'node'}-${jsonNode.server}`,
          server: jsonNode.server,
          port: jsonNode.server_port,
          settings: {
            // 根据节点类型提取必要设置
            ...(jsonNode.type === 'vmess' ? {
              id: jsonNode.uuid,
              alterId: jsonNode.alter_id || 0,
              security: jsonNode.security || 'auto'
            } : {}),
            ...(jsonNode.type === 'ss' || jsonNode.type === 'shadowsocks' ? {
              method: jsonNode.method,
              password: jsonNode.password
            } : {}),
            ...(jsonNode.type === 'trojan' ? {
              password: jsonNode.password
            } : {})
          }
        };
      } else if (jsonNode.address || jsonNode.addr) {
        // 其他常见格式
        return {
          type: this.mapProtocolType(jsonNode.protocol || jsonNode.type),
          name: jsonNode.name || jsonNode.ps || jsonNode.remarks || `${jsonNode.protocol || 'node'}-${jsonNode.address || jsonNode.addr}`,
          server: jsonNode.address || jsonNode.addr || jsonNode.host,
          port: parseInt(jsonNode.port),
          settings: {
            // 通用设置字段
            ...(jsonNode.id ? { id: jsonNode.id } : {}),
            ...(jsonNode.password ? { password: jsonNode.password } : {}),
            ...(jsonNode.method ? { method: jsonNode.method } : {})
          }
        };
      } else if (jsonNode.type && jsonNode.host && jsonNode.port) {
        // 标准格式
        return {
          type: this.mapProtocolType(jsonNode.type),
          name: jsonNode.name || jsonNode.remarks || `${jsonNode.type}-${jsonNode.host}:${jsonNode.port}`,
          server: jsonNode.host,
          port: parseInt(jsonNode.port),
          settings: {
            // 提取其他字段作为设置
            ...(jsonNode.password ? { password: jsonNode.password } : {}),
            ...(jsonNode.method ? { method: jsonNode.method } : {}),
            ...(jsonNode.id ? { id: jsonNode.id } : {})
          }
        };
      }
      
      // 无法识别的格式
      return null;
    } catch (error) {
      console.error('标准化JSON节点失败:', error);
      return null;
    }
  }

  /**
   * 映射协议类型到标准类型
   */
  mapProtocolType(type) {
    if (!type) return 'unknown';
    
    type = type.toLowerCase();
    
    if (type === 'shadowsocks') return 'ss';
    if (type === 'shadowsocksr') return 'ssr';
    if (type === 'socks5') return 'socks';
    
    return type; // vmess, trojan, hysteria2, vless等保持原样
  }

  /**
   * 解码Base64字符串
   * @param {string} str Base64编码的字符串
   * @returns {string} 解码后的字符串
   */
  decodeBase64(str) {
    try {
      // 浏览器环境
      if (typeof window !== 'undefined' && window.atob) {
        return window.atob(str);
      }
      // Node.js环境
      else if (typeof Buffer !== 'undefined') {
        return Buffer.from(str, 'base64').toString('utf8');
      } else {
        throw new Error('No Base64 decode method available');
      }
    } catch (error) {
      console.error('Base64 decode error:', error);
      throw new Error('Invalid Base64 encoding');
    }
  }

  /**
   * 解析节点字符串
   * @param {string} line 节点字符串
   * @returns {Object|null} 解析后的节点对象
   */
  parseNode(line) {
    if (!line) return null;
    
    // 根据协议前缀来选择解析方法
    if (line.startsWith('vmess://')) {
      return this.parseVmess(line);
    } else if (line.startsWith('ss://')) {
      return this.parseShadowsocks(line);
    } else if (line.startsWith('ssr://')) {
      return this.parseShadowsocksR(line);
    } else if (line.startsWith('trojan://')) {
      return this.parseTrojan(line);
    } else if (line.startsWith('hysteria2://')) {
      return this.parseHysteria2(line);
    } else if (line.startsWith('hysteria://')) {
      return this.parseHysteria(line);
    } else if (line.startsWith('vless://')) {
      return this.parseVless(line);
    } else if (line.startsWith('socks://')) {
      return this.parseSocks(line);
    } else if (line.startsWith('tuic://')) {
      return this.parseTuic(line);
    } else {
      console.warn(`Unsupported protocol: ${line.substring(0, 20)}...`);
      return null;
    }
  }

  /**
   * 解析VMess节点
   * @param {string} line VMess节点文本
   * @returns {Object} 解析后的VMess节点对象
   */
  parseVmess(line) {
    try {
      // vmess://后面是Base64编码的JSON配置
      const base64Config = line.substring(8);
      let configStr;
      
      try {
        configStr = this.decodeBase64(base64Config);
      } catch (error) {
        // 尝试修复Base64
        console.warn('VMess解码失败，尝试修复Base64...');
        const withoutPadding = base64Config.replace(/=/g, '');
        try {
          configStr = this.decodeBase64(withoutPadding);
        } catch (e) {
          // 添加填充再试
          const missingPadding = 4 - (withoutPadding.length % 4);
          if (missingPadding < 4) {
            const withPadding = withoutPadding + '='.repeat(missingPadding);
            configStr = this.decodeBase64(withPadding);
          } else {
            throw new Error('无法解码VMess配置');
          }
        }
      }
      
      const config = JSON.parse(configStr);
      
      return {
        type: 'vmess',
        name: config.ps || config.remarks || config.name || `VMess ${config.add || config.addr || config.host}:${config.port}`,
        server: config.add || config.addr || config.host,
        port: parseInt(config.port),
        protocol: 'vmess',
        settings: {
          id: config.id,
          alterId: parseInt(config.aid || config.alterId || 0),
          security: config.security || config.scy || 'auto',
          network: config.net || config.network || 'tcp',
          ws: (config.net || config.network) === 'ws',
          wsPath: config.path || '',
          wsHeaders: config.host ? { Host: config.host } : {},
          tls: config.tls === 'tls',
          serverName: config.sni || config.host || ''
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse VMess node:', error);
      return null;
    }
  }

  /**
   * 解析Shadowsocks节点
   * @param {string} line Shadowsocks节点文本
   * @returns {Object} 解析后的Shadowsocks节点对象
   */
  parseShadowsocks(line) {
    try {
      // ss://后面是Base64编码的用户信息，然后是@，然后是服务器信息
      // 例如: ss://BASE64(method:password)@server:port#name
      // 或者 ss://BASE64(method:password@server:port)#name
      
      let server, port, method, password, name = '';
      
      // 处理SIP002格式
      if (line.includes('@')) {
        const url = new URL(line);
        name = decodeURIComponent(url.hash.substring(1) || '');
        server = url.hostname;
        port = url.port;
        
        // 处理用户信息部分
        try {
          if (url.username.includes(':')) {
            // 明文格式
            [method, password] = url.username.split(':');
          } else {
            // Base64编码格式
            const decodedUserInfo = this.decodeBase64(url.username);
            [method, password] = decodedUserInfo.split(':');
          }
        } catch (e) {
          // 可能是SIP002变种，尝试从查询参数获取
          method = url.searchParams.get('method') || 'aes-256-gcm';
          password = url.password || url.searchParams.get('password') || '';
        }
      } 
      // 处理旧格式 ss://BASE64(method:password@server:port)
      else {
        const base64Part = line.split('#')[0].substring(5);
        name = line.includes('#') ? decodeURIComponent(line.split('#')[1] || '') : '';
        
        let decodedData;
        try {
          decodedData = this.decodeBase64(base64Part);
        } catch (e) {
          // 尝试修复Base64
          const withoutPadding = base64Part.replace(/=/g, '');
          const missingPadding = 4 - (withoutPadding.length % 4);
          if (missingPadding < 4) {
            const withPadding = withoutPadding + '='.repeat(missingPadding);
            decodedData = this.decodeBase64(withPadding);
          } else {
            throw new Error('无法解码SS配置');
          }
        }
        
        // 解析格式为 method:password@server:port
        const atSplit = decodedData.split('@');
        if (atSplit.length !== 2) {
          throw new Error('无效的SS URL格式');
        }
        
        [method, password] = atSplit[0].split(':');
        [server, port] = atSplit[1].split(':');
      }
      
      return {
        type: 'ss',
        name: name || `SS ${server}:${port}`,
        server: server,
        port: parseInt(port),
        protocol: 'shadowsocks',
        settings: {
          method: method,
          password: password
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse Shadowsocks node:', error);
      return null;
    }
  }

  /**
   * 解析ShadowsocksR节点
   * @param {string} line ShadowsocksR节点文本
   * @returns {Object} 解析后的ShadowsocksR节点对象
   */
  parseShadowsocksR(line) {
    try {
      // ssr://后面是Base64编码的所有配置
      const base64Config = line.substring(6);
      let config;
      
      try {
        config = this.decodeBase64(base64Config);
      } catch (e) {
        // 尝试修复Base64
        const withoutPadding = base64Config.replace(/=/g, '');
        const missingPadding = 4 - (withoutPadding.length % 4);
        if (missingPadding < 4) {
          const withPadding = withoutPadding + '='.repeat(missingPadding);
          config = this.decodeBase64(withPadding);
        } else {
          throw new Error('无法解码SSR配置');
        }
      }
      
      // 从配置字符串中提取各部分
      // 格式: server:port:protocol:method:obfs:base64pass/?params
      const mainParts = config.split('/?');
      const baseParts = mainParts[0].split(':');
      const paramsPart = mainParts.length > 1 ? mainParts[1] : '';
      
      // 确保有足够的部分
      if (baseParts.length < 6) {
        throw new Error('SSR配置格式不完整');
      }
      
      // 解析参数
      const params = {};
      if (paramsPart) {
        paramsPart.split('&').forEach(param => {
          const [key, value] = param.split('=');
          if (key && value) {
            params[key] = value;
          }
        });
      }
      
      // 解码remarks
      let remarks = '';
      if (params.remarks) {
        try {
          remarks = this.decodeBase64(params.remarks);
        } catch (e) {
          // 尝试修复Base64
          const withoutPadding = params.remarks.replace(/=/g, '');
          const missingPadding = 4 - (withoutPadding.length % 4);
          if (missingPadding < 4) {
            const withPadding = withoutPadding + '='.repeat(missingPadding);
            remarks = this.decodeBase64(withPadding);
          }
        }
      }
      
      // 解码密码
      let password;
      try {
        password = this.decodeBase64(baseParts[5]);
      } catch (e) {
        // 尝试修复Base64
        const withoutPadding = baseParts[5].replace(/=/g, '');
        const missingPadding = 4 - (withoutPadding.length % 4);
        if (missingPadding < 4) {
          const withPadding = withoutPadding + '='.repeat(missingPadding);
          password = this.decodeBase64(withPadding);
        } else {
          password = ''; // 无法解码时使用空密码
        }
      }
      
      // 解码obfs参数
      let obfsParam = '';
      if (params.obfsparam) {
        try {
          obfsParam = this.decodeBase64(params.obfsparam);
        } catch (e) {
          // 尝试修复
          const withoutPadding = params.obfsparam.replace(/=/g, '');
          const missingPadding = 4 - (withoutPadding.length % 4);
          if (missingPadding < 4) {
            const withPadding = withoutPadding + '='.repeat(missingPadding);
            obfsParam = this.decodeBase64(withPadding);
          }
        }
      }
      
      // 解码协议参数
      let protocolParam = '';
      if (params.protoparam) {
        try {
          protocolParam = this.decodeBase64(params.protoparam);
        } catch (e) {
          // 尝试修复
          const withoutPadding = params.protoparam.replace(/=/g, '');
          const missingPadding = 4 - (withoutPadding.length % 4);
          if (missingPadding < 4) {
            const withPadding = withoutPadding + '='.repeat(missingPadding);
            protocolParam = this.decodeBase64(withPadding);
          }
        }
      }
      
      return {
        type: 'ssr',
        name: remarks || `SSR ${baseParts[0]}:${baseParts[1]}`,
        server: baseParts[0],
        port: parseInt(baseParts[1]),
        protocol: 'shadowsocksr',
        settings: {
          protocol: baseParts[2],
          method: baseParts[3],
          obfs: baseParts[4],
          password: password,
          obfsParam: obfsParam,
          protocolParam: protocolParam
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse ShadowsocksR node:', error, line);
      return null;
    }
  }

  /**
   * 解析Trojan节点
   * @param {string} line Trojan节点文本
   * @returns {Object} 解析后的Trojan节点对象
   */
  parseTrojan(line) {
    try {
      // 先检查基本格式
      if (!line.startsWith('trojan://') || !line.includes('@')) {
        console.warn('Invalid Trojan URL format');
        return null;
      }

      // 处理特殊字符 - 先提取密码部分进行编码
      const atIndex = line.indexOf('@');
      const passwordPart = line.substring(8, atIndex);
      const encodedPassword = encodeURIComponent(decodeURIComponent(passwordPart));
      const sanitizedLine = `trojan://${encodedPassword}${line.substring(atIndex)}`;

      // 解析URL
      const url = new URL(sanitizedLine);

      // 提取密码（在用户名部分）
      const password = decodeURIComponent(url.username);

      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || 443;

      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');

      // 提取参数
      const sni = url.searchParams.get('sni') || server;
      const allowInsecure = url.searchParams.get('allowInsecure') === '1';

      return {
        type: 'trojan',
        name: name || `Trojan ${server}:${port}`,
        server: server,
        port: port,
        protocol: 'trojan',
        settings: {
          password: password,
          sni: sni,
          allowInsecure: allowInsecure
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse Trojan node:', error.message);
      return null;
    }
  }

  /**
   * 解析Hysteria2节点
   * @param {string} line Hysteria2节点文本
   * @returns {Object} 解析后的Hysteria2节点对象
   */
  parseHysteria2(line) {
    try {
      // hysteria2://auth@server:port?params#name
      const url = new URL(line);
      
      // 提取认证信息（在用户名部分）
      const auth = url.username;
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || 443;
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取参数
      const sni = url.searchParams.get('sni') || server;
      const insecure = url.searchParams.get('insecure') === '1';
      const obfs = url.searchParams.get('obfs') || '';
      const obfsPassword = url.searchParams.get('obfs-password') || '';
      const uploadBandwidth = url.searchParams.get('up') || '';
      const downloadBandwidth = url.searchParams.get('down') || '';
      
      return {
        type: 'hysteria2',
        name: name || `Hysteria2 ${server}:${port}`,
        server: server,
        port: port,
        protocol: 'hysteria2',
        settings: {
          auth: auth,
          sni: sni,
          insecure: insecure,
          obfs: obfs,
          obfsPassword: obfsPassword,
          uploadBandwidth: uploadBandwidth,
          downloadBandwidth: downloadBandwidth
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse Hysteria2 node:', error);
      return null;
    }
  }

  /**
   * 解析VLESS节点
   * @param {string} line VLESS节点文本
   * @returns {Object} 解析后的VLESS节点对象
   */
  parseVless(line) {
    try {
      // vless://uuid@server:port?params#name
      const url = new URL(line);
      
      // 提取UUID（在用户名部分）
      const id = url.username;
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || 443;
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取参数
      const type = url.searchParams.get('type') || 'tcp';
      const security = url.searchParams.get('security') || 'none';
      const sni = url.searchParams.get('sni') || server;
      const fp = url.searchParams.get('fp') || '';
      const alpn = url.searchParams.get('alpn') || '';
      const path = url.searchParams.get('path') || '/';
      const host = url.searchParams.get('host') || '';
      const encryption = url.searchParams.get('encryption') || 'none';
      const flow = url.searchParams.get('flow') || '';
      
      return {
        type: 'vless',
        name: name || `VLESS ${server}:${port}`,
        server: server,
        port: port,
        protocol: 'vless',
        settings: {
          id: id,
          network: type,
          security: security,
          sni: sni,
          fp: fp,
          alpn: alpn,
          path: path,
          host: host,
          encryption: encryption,
          flow: flow
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse VLESS node:', error);
      return null;
    }
  }

  /**
   * 解析Socks节点
   * @param {string} line Socks节点文本
   * @returns {Object} 解析后的Socks节点对象
   */
  parseSocks(line) {
    try {
      // socks://[用户名:密码@]host:port#备注
      // 例如: socks://username:password@server:port#name
      const url = new URL(line);
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || 1080;
      
      // 提取用户名和密码（如果有）
      let username = '', password = '';
      if (url.username) {
        username = decodeURIComponent(url.username);
        if (url.password) {
          password = decodeURIComponent(url.password);
        }
      }
      
      return {
        type: 'socks',
        name: name || `Socks5 ${server}:${port}`,
        server: server,
        port: parseInt(port),
        protocol: 'socks5',
        settings: {
          username: username,
          password: password,
          udp: true
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse Socks node:', error);
      return null;
    }
  }

  /**
   * 解析Tuic节点
   * @param {string} line Tuic节点文本
   * @returns {Object} 解析后的Tuic节点对象
   */
  parseTuic(line) {
    try {
      // tuic://uuid:password@host:port?params#name
      const url = new URL(line);
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || 443;
      
      // 提取UUID和密码
      let uuid = '', password = '';
      if (url.username) {
        uuid = decodeURIComponent(url.username);
        if (url.password) {
          password = decodeURIComponent(url.password);
        }
      }
      
      // 提取参数
      const congestionControl = url.searchParams.get('congestion_control') || 'cubic';
      const alpn = url.searchParams.get('alpn') || 'h3';
      const udpRelayMode = url.searchParams.get('udp_relay_mode') || 'native';
      const sni = url.searchParams.get('sni') || '';
      
      return {
        type: 'tuic',
        name: name || `TUIC ${server}:${port}`,
        server: server,
        port: parseInt(port),
        protocol: 'tuic',
        settings: {
          uuid: uuid,
          password: password,
          congestionControl: congestionControl,
          alpn: alpn,
          udpRelayMode: udpRelayMode,
          sni: sni
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse TUIC node:', error);
      return null;
    }
  }

  /**
   * 解析Hysteria节点
   * @param {string} line Hysteria节点文本
   * @returns {Object} 解析后的Hysteria节点对象
   */
  parseHysteria(line) {
    try {
      // hysteria://host:port?auth=x&peer=sni&insecure=1&upmbps=100&downmbps=100#remarks
      const url = new URL(line);
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || 443;
      
      // 提取参数
      const auth = url.searchParams.get('auth') || '';
      const peer = url.searchParams.get('peer') || '';
      const insecure = url.searchParams.get('insecure') === '1';
      const upmbps = url.searchParams.get('upmbps') || '10';
      const downmbps = url.searchParams.get('downmbps') || '50';
      const obfs = url.searchParams.get('obfs') || '';
      const protocol = url.searchParams.get('protocol') || 'udp';
      
      return {
        type: 'hysteria',
        name: name || `Hysteria ${server}:${port}`,
        server: server,
        port: parseInt(port),
        protocol: 'hysteria',
        settings: {
          auth: auth,
          peer: peer,
          insecure: insecure,
          upmbps: parseInt(upmbps),
          downmbps: parseInt(downmbps),
          obfs: obfs,
          protocol: protocol
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse Hysteria node:', error);
      return null;
    }
  }
}
