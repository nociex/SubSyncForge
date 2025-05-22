import { Base64Parser } from './formats/Base64Parser.js';
import { JsonParser } from './formats/JsonParser.js';
import { YamlParser } from './formats/YamlParser.js';
import { PlainTextParser } from './formats/PlainTextParser.js';

export class SubscriptionParser {
  constructor(options = {}) {
    this.parsers = {
      base64: new Base64Parser(),
      json: new JsonParser(),
      yaml: new YamlParser(),
      plain: new PlainTextParser(),
    };
    this.logger = options.logger || console;
  }

  async parse(raw) {
    if (!raw || typeof raw !== 'string') {
      this.logger.error('Invalid subscription data: empty or not a string');
      throw new Error('Invalid subscription data: empty or not a string');
    }
    
    this.logger.log(`开始解析订阅数据，长度: ${raw.length}`);
    
    // 预处理订阅数据（修复常见问题）
    const processedRaw = this._preprocessSubscriptionData(raw);
    
    // 检测输入格式
    const format = this.detectFormat(processedRaw);
    this.logger.log(`检测到订阅格式: ${format}`);
    
    const parser = this.parsers[format];
    
    if (!parser) {
      this.logger.error(`不支持的格式: ${format}`);
      throw new Error(`Unsupported format: ${format}`);
    }

    try {
      // 解析数据并转换为统一格式
      this.logger.log(`使用 ${format} 解析器解析数据...`);
      const nodes = await parser.parse(processedRaw);
      
      // 检查解析结果
      if (!nodes || !Array.isArray(nodes)) {
        this.logger.warn(`解析结果不是有效的节点数组, 返回空数组`);
        return [];
      }
      
      this.logger.log(`解析成功，获取到 ${nodes.length} 个节点`);
      
      // 添加详细日志，输出节点类型分布
      if (nodes.length > 0) {
        const typeCount = {};
        nodes.forEach(node => {
          if (node && node.type) {
            typeCount[node.type] = (typeCount[node.type] || 0) + 1;
          }
        });
        this.logger.log(`节点类型分布: ${JSON.stringify(typeCount)}`);
      }
      
      const normalizedNodes = this.normalize(nodes);
      this.logger.log(`规范化后节点数: ${normalizedNodes.length}`);
      
      // 如果规范化后节点数明显减少，输出详细信息
      if (normalizedNodes.length < nodes.length * 0.8) {
        this.logger.warn(`规范化过程中丢失了${nodes.length - normalizedNodes.length}个节点，请检查节点格式`);
      }
      
      return normalizedNodes;
    } catch (error) {
      this.logger.error(`解析数据失败: ${error.message}`);
      this.logger.error(`错误堆栈: ${error.stack}`);
      
      // 尝试查找问题原因
      this.logger.log(`尝试进行故障排查...`);
      
      // 检查格式是否正确识别
      this.logger.log(`再次检查数据格式...`);
      
      if (format === 'yaml') {
        this.logger.log(`对于YAML格式，尝试检查数据结构...`);
        try {
          // 使用更宽松的方式解析
          const yaml = await import('js-yaml');
          const data = yaml.load(processedRaw, { schema: yaml.JSON_SCHEMA });
          
          if (data) {
            this.logger.log(`YAML基本解析成功，数据结构: ${typeof data}, 顶级键: ${Object.keys(data).join(', ')}`);
            
            // 检查是否包含proxies或类似字段
            const hasProxies = data.proxies || data.Proxy || data['proxy-providers'] || data['proxy-groups'];
            this.logger.log(`是否包含代理字段: ${hasProxies ? '是' : '否'}`);
          }
        } catch (yamlError) {
          this.logger.error(`YAML解析诊断失败: ${yamlError.message}`);
        }
      }
      
      // 如果无法解析，返回空数组
      return [];
    }
  }

  /**
   * 预处理订阅数据，修复常见问题
   * @private
   */
  _preprocessSubscriptionData(raw) {
    if (!raw) return raw;
    
    // 处理Windows行尾
    let processed = raw.replace(/\r\n/g, '\n');
    
    // 移除UTF-8 BOM
    if (processed.charCodeAt(0) === 0xFEFF) {
      processed = processed.slice(1);
    }
    
    // 尝试检测并修复截断的Base64
    if (/^[A-Za-z0-9+/=]+$/.test(processed.trim())) {
      // 修复Base64填充
      const length = processed.trim().length;
      if (length % 4 !== 0) {
        const paddingNeeded = 4 - (length % 4);
        processed = processed.trim() + '='.repeat(paddingNeeded);
        this.logger.log(`修复了Base64填充，添加了 ${paddingNeeded} 个'='`);
      }
    }
    
    return processed;
  }

  async parseLine(line) {
    if (!line) return null;
    
    this.logger.log(`解析单行数据: ${line.substring(0, 30)}...`);
    
    try {
      const nodes = await this.parsers.plain.parseLine(line);
      if (nodes && nodes.length > 0) {
        this.logger.log(`成功解析单行为 ${nodes.length} 个节点`);
        return this.normalize(nodes)[0];
      }
    } catch (error) {
      this.logger.error(`解析单行失败: ${error.message}`);
    }
    
    return null;
  }

  detectFormat(raw) {
    this.logger.log(`检测订阅格式...`);
    
    // 首先检查是否是纯文本URI格式（vmess://, ss://等）
    // 这样的格式更好识别，应该优先检查
    const protocolUrls = (raw.match(/(vmess|ss|ssr|trojan|hysteria2|hysteria|vless|socks|tuic):\/\/[^\s]+/g) || []);
    if (protocolUrls.length > 0) {
      this.logger.log(`检测到纯文本格式 (含有 ${protocolUrls.length} 个协议URI链接)`);
      return 'plain';
    }
    
    // 检查是否是Clash/YAML格式(优先级较高)
    if (
        (raw.includes('proxies:') && (raw.includes('rules:') || raw.includes('proxy-groups:'))) || 
        raw.includes('port: ') && raw.includes('mode: ') && raw.includes('proxies:') ||
        (raw.includes('- name:') && raw.includes('server:') && raw.includes('port:') && raw.includes('type:'))
    ) {
      this.logger.log(`检测到Clash/YAML格式配置`);
      return 'yaml';
    }
    
    // 检查JSON格式
    try {
      if ((raw.trim().startsWith('{') && raw.trim().endsWith('}')) || 
          (raw.trim().startsWith('[') && raw.trim().endsWith(']'))) {
        JSON.parse(raw);
        this.logger.log(`检测到JSON格式`);
        return 'json';
      }
    } catch (e) {
      // 不是有效JSON
      this.logger.log(`JSON解析失败: ${e.message}`);
    }
    
    // 检查是否是Surge配置
    if (
      (raw.includes('[Proxy]') || raw.includes('[Proxy Group]')) &&
      /[^=]+=\s*(http|https|trojan|vmess|ss|socks5)/.test(raw)
    ) {
      this.logger.log(`检测到Surge格式配置`);
      // Surge配置也由YAML解析器处理
      return 'yaml';
    }
    
    // 检查是否是Quantumult X配置
    if (raw.includes('[server_local]') || raw.includes('[server_remote]')) {
      this.logger.log(`检测到QuantumultX格式配置`);
      // Quantumult X配置也由YAML解析器处理
      return 'yaml';
    }
    
    // 尝试base64解码
    try {
      const base64Regex = /^[A-Za-z0-9+/=]+$/;
      // 移除所有换行和空格
      const cleanedRaw = raw.replace(/[\s\r\n]/g, '');
      
      // 检查是否是纯base64字符
      if (base64Regex.test(cleanedRaw)) {
        // 尝试解码
        let decoded;
        if (typeof atob !== 'undefined') {
          decoded = atob(cleanedRaw);
        } else if (typeof Buffer !== 'undefined') {
          decoded = Buffer.from(cleanedRaw, 'base64').toString('utf-8');
        }
        
        if (decoded && decoded.length > 0) {
          // 检查解码后内容是否包含协议前缀
          if (decoded.includes('vmess://') || decoded.includes('ss://') || 
              decoded.includes('ssr://') || decoded.includes('trojan://') ||
              decoded.includes('hysteria2://') || decoded.includes('vless://') ||
              decoded.includes('hysteria://') || decoded.includes('socks://') ||
              decoded.includes('tuic://')) {
            this.logger.log(`检测到Base64格式，解码后包含节点URI`);
            return 'base64';
          }
          
          // 检查解码后是否是JSON
          try {
            if ((decoded.trim().startsWith('{') && decoded.trim().endsWith('}')) || 
                (decoded.trim().startsWith('[') && decoded.trim().endsWith(']'))) {
              JSON.parse(decoded);
              this.logger.log(`检测到Base64编码的JSON格式`);
              return 'base64';
            }
          } catch (e) {
            // 不是有效JSON
          }
          
          // 检查解码后是否是YAML
          if (decoded.includes('proxies:') || decoded.includes('Proxy:')) {
            this.logger.log(`检测到Base64编码的YAML格式`);
            return 'base64';
          }
        }
      }
    } catch (e) {
      // 解码失败
      this.logger.warn(`Base64解码尝试失败: ${e.message}`);
    }
    
    // 再次检查是否是其他类型的YAML
    if (raw.includes('Proxy:') || 
        (raw.includes('- name:') && raw.includes('type:'))) {
      this.logger.log(`检测到其他YAML格式`);
      return 'yaml';
    }
    
    // 检查是否是SIP008格式（JSON）
    if (raw.includes('"version"') && raw.includes('"servers"') && 
        (raw.includes('"method"') || raw.includes('"password"'))) {
      this.logger.log(`检测到可能的SIP008格式`);
      return 'json';
    }
    
    // 最后检查是否是Base64（可能是编码后的其他格式）
    const base64Pattern = /^[A-Za-z0-9+/=\s]+$/;
    if (base64Pattern.test(raw)) {
      this.logger.log(`内容看起来像Base64编码，尝试Base64解析器`);
      return 'base64';
    }
    
    // 默认使用YAML解析器
    this.logger.log(`无法确定格式，默认使用YAML解析器`);
    return 'yaml';
  }

  normalize(nodes) {
    if (!Array.isArray(nodes)) {
      this.logger.warn(`Expected array of nodes, got: ${typeof nodes}`);
      return [];
    }
    
    return nodes.filter(node => {
      // 基本有效性检查
      const isValid = node && node.type && node.server && node.port;
      if (!isValid) {
        this.logger.warn(`忽略无效节点: ${JSON.stringify(node)}`);
        return false;
      }
      
      // 额外检查：服务器不应该是保留IP或明显无效域名
      if (
        node.server === '0.0.0.0' || 
        node.server === '127.0.0.1' || 
        node.server === 'localhost' || 
        node.server === 'example.com' ||
        node.server.startsWith('192.168.') ||
        node.server.startsWith('10.') ||
        node.server === 'www.example.com'
      ) {
        this.logger.warn(`忽略使用保留IP或示例域名的节点: ${node.server}`);
        return false;
      }
      
      // 端口检查
      const port = parseInt(node.port);
      if (isNaN(port) || port <= 0 || port > 65535) {
        this.logger.warn(`忽略无效端口的节点: ${node.port}`);
        return false;
      }
      
      return true;
    }).map(node => ({
      id: node.id || this.generateId(),
      type: node.type,
      name: this._sanitizeNodeName(node.name) || `${node.type}-${node.server}:${node.port}`,
      server: node.server,
      port: parseInt(node.port),
      protocol: node.protocol,
      settings: node.settings || {},
      extra: {
        ...(node.extra || {}),
        addedAt: new Date().toISOString()
      }
    }));
  }

  /**
   * 清理节点名称，移除不安全字符
   * @private
   */
  _sanitizeNodeName(name) {
    if (!name) return '';
    
    // 移除不可见字符、控制字符和特殊字符
    return name
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // 控制字符
      .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')         // 无效Unicode
      .replace(/[\u200B-\u200D\uFEFF]/g, '')        // 零宽字符
      .trim();
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}