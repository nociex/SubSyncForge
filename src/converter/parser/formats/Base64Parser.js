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
   * @param {string} str Base64编码的字符串
   * @returns {string} 解码后的字符串
   */
  decodeBase64(str) {
    try {
      return Buffer.from(str, 'base64').toString('utf8');
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
    } else if (line.startsWith('vless://')) {
      return this.parseVless(line);
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
      const configStr = this.decodeBase64(base64Config);
      const config = JSON.parse(configStr);
      
      return {
        type: 'vmess',
        name: config.ps || config.remarks || `VMess ${config.add}:${config.port}`,
        server: config.add,
        port: config.port,
        protocol: 'vmess',
        settings: {
          id: config.id,
          alterId: config.aid || 0,
          security: config.security || 'auto',
          network: config.net || 'tcp',
          ws: config.net === 'ws',
          wsPath: config.path || '/',
          wsHeaders: config.host ? { Host: config.host } : {},
          tls: config.tls === 'tls'
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
   * 解析ShadowsocksR节点
   * @param {string} line ShadowsocksR节点文本
   * @returns {Object} 解析后的ShadowsocksR节点对象
   */
  parseShadowsocksR(line) {
    try {
      // ssr://后面是Base64编码的所有配置
      const base64Config = line.substring(6);
      const config = this.decodeBase64(base64Config);
      
      // 从配置字符串中提取各部分
      // 格式: server:port:protocol:method:obfs:base64pass/?params
      const mainParts = config.split('/?');
      const baseParts = mainParts[0].split(':');
      const paramsPart = mainParts.length > 1 ? mainParts[1] : '';
      
      // 解析参数
      const params = new URLSearchParams(paramsPart);
      const remarks = params.get('remarks') ? this.decodeBase64(params.get('remarks')) : '';
      
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
          password: this.decodeBase64(baseParts[5]),
          obfsParam: params.get('obfsparam') ? this.decodeBase64(params.get('obfsparam')) : '',
          protocolParam: params.get('protoparam') ? this.decodeBase64(params.get('protoparam')) : ''
        },
        extra: {
          raw: line
        }
      };
    } catch (error) {
      console.error('Failed to parse ShadowsocksR node:', error);
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
}
