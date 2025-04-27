/**
 * 明文解析器
 * 用于解析纯文本格式的订阅内容
 */
export class PlainTextParser {
  /**
   * 解析纯文本格式的数据
   * @param {string} raw 原始文本
   * @returns {Array} 解析后的节点数组
   */
  async parse(raw) {
    try {
      // 按行分割输入
      const lines = raw.split(/[\r\n]+/).filter(line => line.trim());
      
      // 解析每一行，提取节点信息
      const nodes = [];
      
      for (const line of lines) {
        const node = this.parseLine(line);
        if (node) {
          nodes.push(node);
        }
      }
      
      return nodes;
    } catch (error) {
      console.error('Plain text parsing error:', error);
      return [];
    }
  }

  /**
   * 解析单行数据
   * @param {string} line 单行文本
   * @returns {Object|null} 解析后的节点对象
   */
  parseLine(line) {
    // 支持的URI格式
    if (line.startsWith('vmess://')) {
      return this.parseVmess(line);
    } else if (line.startsWith('ss://')) {
      return this.parseShadowsocks(line);
    } else if (line.startsWith('ssr://')) {
      return this.parseShadowsocksR(line);
    } else if (line.startsWith('trojan://')) {
      return this.parseTrojan(line);
    } else if (line.startsWith('http://') || line.startsWith('https://')) {
      return this.parseHttp(line);
    } else if (line.startsWith('socks://') || line.startsWith('socks5://')) {
      return this.parseSocks(line);
    }
    
    return null;
  }

  /**
   * 解析Vmess URI
   * @param {string} uri Vmess URI
   * @returns {Object|null} 解析后的节点对象
   */
  parseVmess(uri) {
    try {
      // vmess://后面是Base64编码的JSON
      const base64Json = uri.replace('vmess://', '');
      let jsonStr;
      
      try {
        // 浏览器环境
        if (typeof window !== 'undefined' && window.atob) {
          jsonStr = window.atob(base64Json);
        } 
        // Node.js环境
        else if (typeof Buffer !== 'undefined') {
          jsonStr = Buffer.from(base64Json, 'base64').toString('utf-8');
        } else {
          throw new Error('No Base64 decode method available');
        }
      } catch (e) {
        // 对于无法解码的情况，尝试去除填充字符再解码
        const cleanedBase64 = base64Json.replace(/=/g, '');
        if (typeof window !== 'undefined' && window.atob) {
          jsonStr = window.atob(cleanedBase64);
        } else if (typeof Buffer !== 'undefined') {
          jsonStr = Buffer.from(cleanedBase64, 'base64').toString('utf-8');
        } else {
          throw new Error('No Base64 decode method available');
        }
      }
      
      const data = JSON.parse(jsonStr);
      
      return {
        type: 'vmess',
        name: data.ps || data.name || '',
        server: data.add || data.host || data.server || '',
        port: parseInt(data.port),
        protocol: 'vmess',
        settings: {
          id: data.id,
          alterId: parseInt(data.aid || 0),
          security: data.scy || data.security || 'auto',
          network: data.net || 'tcp',
          wsPath: data.path || '',
          wsHeaders: data.host ? { Host: data.host } : {},
          tls: data.tls === 'tls',
          serverName: data.sni || ''
        },
        extra: {
          raw: data
        }
      };
    } catch (error) {
      console.error('Failed to parse Vmess URI:', error);
      return null;
    }
  }

  /**
   * 解析Shadowsocks URI
   * @param {string} uri Shadowsocks URI
   * @returns {Object|null} 解析后的节点对象
   */
  parseShadowsocks(uri) {
    try {
      // ss://BASE64(method:password)@server:port#name
      // 或者 ss://BASE64(method:password@server:port)#name
      let url;
      
      try {
        // 标准格式
        url = new URL(uri);
      } catch (e) {
        // 可能是旧格式，尝试提取和解码
        const match = uri.match(/^ss:\/\/([^#]+)(#(.*))?$/);
        if (!match) return null;
        
        let decoded;
        try {
          if (typeof window !== 'undefined' && window.atob) {
            decoded = window.atob(match[1]);
          } else if (typeof Buffer !== 'undefined') {
            decoded = Buffer.from(match[1], 'base64').toString('utf-8');
          }
        } catch (e2) {
          // 处理异常字符
          const cleanedBase64 = match[1].replace(/=/g, '');
          if (typeof window !== 'undefined' && window.atob) {
            decoded = window.atob(cleanedBase64);
          } else if (typeof Buffer !== 'undefined') {
            decoded = Buffer.from(cleanedBase64, 'base64').toString('utf-8');
          }
        }
        
        // 从解码后的字符串创建伪URL
        if (decoded.includes('@')) {
          url = new URL('ss://' + 'user:pass@example.com');
          const parts = decoded.split('@');
          const serverParts = parts[1].split(':');
          url.username = parts[0];
          url.hostname = serverParts[0];
          url.port = serverParts[1];
          if (match[3]) url.hash = '#' + match[3];
        } else {
          // 无法解析的格式
          return null;
        }
      }
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port;
      
      // 提取方法和密码
      let method, password;
      try {
        if (url.username.includes(':')) {
          // 未编码格式
          [method, password] = url.username.split(':');
        } else {
          // Base64编码格式
          let decodedUserInfo;
          try {
            if (typeof window !== 'undefined' && window.atob) {
              decodedUserInfo = window.atob(url.username);
            } else if (typeof Buffer !== 'undefined') {
              decodedUserInfo = Buffer.from(url.username, 'base64').toString('utf-8');
            }
          } catch (e) {
            // 处理异常字符
            const cleanedBase64 = url.username.replace(/=/g, '');
            if (typeof window !== 'undefined' && window.atob) {
              decodedUserInfo = window.atob(cleanedBase64);
            } else if (typeof Buffer !== 'undefined') {
              decodedUserInfo = Buffer.from(cleanedBase64, 'base64').toString('utf-8');
            }
          }
          
          [method, password] = decodedUserInfo.split(':');
        }
      } catch (e) {
        // 如果分割失败，可能是SIP002格式
        method = url.searchParams.get('method') || 'aes-256-gcm';
        password = url.password;
      }
      
      return {
        type: 'ss',
        name: name,
        server: server,
        port: parseInt(port),
        protocol: 'shadowsocks',
        settings: {
          method: method,
          password: password
        },
        extra: {
          raw: uri
        }
      };
    } catch (error) {
      console.error('Failed to parse Shadowsocks URI:', error);
      return null;
    }
  }

  /**
   * 解析ShadowsocksR URI
   * @param {string} uri ShadowsocksR URI
   * @returns {Object|null} 解析后的节点对象
   */
  parseShadowsocksR(uri) {
    try {
      // ssr://BASE64(server:port:protocol:method:obfs:BASE64(password)/?obfsparam=BASE64(obfsparam)&protoparam=BASE64(protoparam)&remarks=BASE64(remarks))
      const base64Str = uri.replace('ssr://', '');
      
      let decoded;
      try {
        if (typeof window !== 'undefined' && window.atob) {
          decoded = window.atob(base64Str);
        } else if (typeof Buffer !== 'undefined') {
          decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
        }
      } catch (e) {
        // 处理异常字符
        const cleanedBase64 = base64Str.replace(/=/g, '');
        if (typeof window !== 'undefined' && window.atob) {
          decoded = window.atob(cleanedBase64);
        } else if (typeof Buffer !== 'undefined') {
          decoded = Buffer.from(cleanedBase64, 'base64').toString('utf-8');
        }
      }
      
      // 分割主要部分和参数部分
      const [mainPart, paramsPart] = decoded.split('/?');
      
      // 解析主要部分
      const mainParts = mainPart.split(':');
      if (mainParts.length < 6) return null;
      
      const server = mainParts[0];
      const port = parseInt(mainParts[1]);
      const protocol = mainParts[2];
      const method = mainParts[3];
      const obfs = mainParts[4];
      
      // 解码密码
      let password;
      try {
        if (typeof window !== 'undefined' && window.atob) {
          password = window.atob(mainParts[5]);
        } else if (typeof Buffer !== 'undefined') {
          password = Buffer.from(mainParts[5], 'base64').toString('utf-8');
        }
      } catch (e) {
        // 处理异常字符
        const cleanedBase64 = mainParts[5].replace(/=/g, '');
        if (typeof window !== 'undefined' && window.atob) {
          password = window.atob(cleanedBase64);
        } else if (typeof Buffer !== 'undefined') {
          password = Buffer.from(cleanedBase64, 'base64').toString('utf-8');
        }
      }
      
      // 解析参数部分
      let obfsparam = '';
      let protoparam = '';
      let remarks = '';
      
      if (paramsPart) {
        const params = new URLSearchParams(paramsPart);
        
        // 解码参数
        const decodeParam = (param) => {
          if (!param) return '';
          try {
            if (typeof window !== 'undefined' && window.atob) {
              return window.atob(param);
            } else if (typeof Buffer !== 'undefined') {
              return Buffer.from(param, 'base64').toString('utf-8');
            }
            return '';
          } catch (e) {
            // 处理异常字符
            const cleanedBase64 = param.replace(/=/g, '');
            if (typeof window !== 'undefined' && window.atob) {
              return window.atob(cleanedBase64);
            } else if (typeof Buffer !== 'undefined') {
              return Buffer.from(cleanedBase64, 'base64').toString('utf-8');
            }
            return '';
          }
        };
        
        obfsparam = decodeParam(params.get('obfsparam'));
        protoparam = decodeParam(params.get('protoparam'));
        remarks = decodeParam(params.get('remarks'));
      }
      
      return {
        type: 'ssr',
        name: remarks,
        server: server,
        port: port,
        protocol: 'shadowsocksr',
        settings: {
          method: method,
          password: password,
          protocol: protocol,
          protocolParam: protoparam,
          obfs: obfs,
          obfsParam: obfsparam
        },
        extra: {
          raw: uri
        }
      };
    } catch (error) {
      console.error('Failed to parse ShadowsocksR URI:', error);
      return null;
    }
  }

  /**
   * 解析Trojan URI
   * @param {string} uri Trojan URI
   * @returns {Object|null} 解析后的节点对象
   */
  parseTrojan(uri) {
    try {
      // trojan://password@server:port?allowInsecure=1&sni=sni#name
      const url = new URL(uri);
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || '443';
      
      // 提取密码
      const password = url.username;
      
      // 提取SNI和其他参数
      const params = url.searchParams;
      const sni = params.get('sni') || params.get('peer') || '';
      const allowInsecure = params.get('allowInsecure') === '1' || params.get('tls-verification') === 'false';
      
      return {
        type: 'trojan',
        name: name,
        server: server,
        port: parseInt(port),
        protocol: 'trojan',
        settings: {
          password: password,
          sni: sni,
          allowInsecure: allowInsecure
        },
        extra: {
          raw: uri
        }
      };
    } catch (error) {
      console.error('Failed to parse Trojan URI:', error);
      return null;
    }
  }

  /**
   * 解析HTTP/HTTPS URI
   * @param {string} uri HTTP/HTTPS URI
   * @returns {Object|null} 解析后的节点对象
   */
  parseHttp(uri) {
    try {
      // http://username:password@server:port#name
      const url = new URL(uri);
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      
      // 提取用户名和密码
      const username = url.username;
      const password = url.password;
      
      return {
        type: url.protocol === 'https:' ? 'https' : 'http',
        name: name,
        server: server,
        port: parseInt(port),
        protocol: url.protocol === 'https:' ? 'https' : 'http',
        settings: {
          username: username,
          password: password,
          tls: url.protocol === 'https:'
        },
        extra: {
          raw: uri
        }
      };
    } catch (error) {
      console.error('Failed to parse HTTP/HTTPS URI:', error);
      return null;
    }
  }

  /**
   * 解析Socks URI
   * @param {string} uri Socks URI
   * @returns {Object|null} 解析后的节点对象
   */
  parseSocks(uri) {
    try {
      // socks://username:password@server:port#name
      const url = new URL(uri);
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port || '1080';
      
      // 提取用户名和密码
      const username = url.username;
      const password = url.password;
      
      return {
        type: 'socks',
        name: name,
        server: server,
        port: parseInt(port),
        protocol: 'socks',
        settings: {
          username: username,
          password: password
        },
        extra: {
          raw: uri
        }
      };
    } catch (error) {
      console.error('Failed to parse Socks URI:', error);
      return null;
    }
  }
} 