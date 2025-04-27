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
      const decoded = this.decodeBase64(cleanedRaw);
      
      // 尝试按行分割，每行是一个节点
      const lines = decoded.split(/[\r\n]+/).filter(line => line.trim());
      
      // 解析每个节点
      return lines.map(line => this.parseNode(line)).filter(node => node);
    } catch (error) {
      console.error('Base64 parsing error:', error);
      return [];
    }
  }

  /**
   * 解码Base64字符串
   * @param {string} str Base64字符串
   * @returns {string} 解码后的字符串
   */
  decodeBase64(str) {
    // 在Node.js和浏览器环境中使用不同的解码方法
    if (typeof window !== 'undefined' && window.atob) {
      return window.atob(str);
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'base64').toString('utf-8');
    } else {
      throw new Error('No Base64 decode method available');
    }
  }

  /**
   * 解析单个节点
   * @param {string} line 节点文本行
   * @returns {Object|null} 解析后的节点对象
   */
  parseNode(line) {
    // 识别节点类型
    if (line.startsWith('vmess://')) {
      return this.parseVmess(line);
    } else if (line.startsWith('ss://')) {
      return this.parseShadowsocks(line);
    } else if (line.startsWith('trojan://')) {
      return this.parseTrojan(line);
    } else {
      // 其他类型或无法识别的类型
      return null;
    }
  }

  /**
   * 解析Vmess节点
   * @param {string} line Vmess节点文本
   * @returns {Object} 解析后的Vmess节点对象
   */
  parseVmess(line) {
    try {
      // vmess://后面是Base64编码的JSON
      const base64Json = line.replace('vmess://', '');
      const jsonStr = this.decodeBase64(base64Json);
      const data = JSON.parse(jsonStr);
      
      return {
        type: 'vmess',
        name: data.ps || data.name || '',
        server: data.add || data.host || data.server || '',
        port: data.port,
        protocol: 'vmess',
        settings: {
          id: data.id,
          alterId: data.aid || 0,
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
      console.error('Failed to parse Vmess node:', error);
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
      const url = new URL(line);
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port;
      
      // 提取方法和密码
      let method, password;
      if (url.username.includes(':')) {
        // 未编码格式
        [method, password] = url.username.split(':');
      } else {
        // Base64编码格式
        const decodedUserInfo = this.decodeBase64(url.username);
        [method, password] = decodedUserInfo.split(':');
      }
      
      return {
        type: 'ss',
        name: name,
        server: server,
        port: port,
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
   * 解析Trojan节点
   * @param {string} line Trojan节点文本
   * @returns {Object} 解析后的Trojan节点对象
   */
  parseTrojan(line) {
    try {
      // trojan://password@server:port?allowInsecure=1&sni=sni#name
      const url = new URL(line);
      
      // 提取名称
      const name = decodeURIComponent(url.hash.substring(1) || '');
      
      // 提取服务器和端口
      const server = url.hostname;
      const port = url.port;
      
      // 提取密码
      const password = url.username;
      
      // 提取SNI和其他参数
      const params = new URLSearchParams(url.search);
      const sni = params.get('sni') || '';
      const allowInsecure = params.get('allowInsecure') === '1';
      
      return {
        type: 'trojan',
        name: name,
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
      console.error('Failed to parse Trojan node:', error);
      return null;
    }
  }
} 