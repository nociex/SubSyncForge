import { Base64Parser } from './formats/Base64Parser';
import { JsonParser } from './formats/JsonParser';
import { YamlParser } from './formats/YamlParser';
import { PlainTextParser } from './formats/PlainTextParser';

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
    
    // 检测输入格式
    const format = this.detectFormat(raw);
    this.logger.log(`检测到订阅格式: ${format}`);
    
    const parser = this.parsers[format];
    
    if (!parser) {
      this.logger.error(`不支持的格式: ${format}`);
      throw new Error(`Unsupported format: ${format}`);
    }

    try {
      // 解析数据并转换为统一格式
      this.logger.log(`使用 ${format} 解析器解析数据...`);
      const nodes = await parser.parse(raw);
      this.logger.log(`解析成功，获取到 ${nodes.length} 个节点`);
      
      const normalizedNodes = this.normalize(nodes);
      this.logger.log(`规范化后节点数: ${normalizedNodes.length}`);
      
      return normalizedNodes;
    } catch (error) {
      this.logger.error(`解析错误 (${format}): ${error.message}`);
      // 尝试使用其他解析器
      this.logger.log(`尝试备用解析器...`);
      
      for (const [backupFormat, backupParser] of Object.entries(this.parsers)) {
        if (backupFormat !== format) {
          try {
            this.logger.log(`尝试使用 ${backupFormat} 解析器...`);
            const nodes = await backupParser.parse(raw);
            this.logger.log(`使用备用解析器 ${backupFormat} 成功，获取到 ${nodes.length} 个节点`);
            return this.normalize(nodes);
          } catch (backupError) {
            // 忽略备用解析器错误，继续尝试下一个
          }
        }
      }
      
      // 所有解析器都失败
      throw new Error(`Failed to parse subscription data: ${error.message}`);
    }
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
    
    // 检查纯文本格式（v2ray、ss、ssr等）
    if (raw.includes('vmess://') || raw.includes('ss://') || 
        raw.includes('ssr://') || raw.includes('trojan://') ||
        raw.includes('http://') || raw.includes('https://')) {
      this.logger.log(`检测到纯文本格式 (含有URI链接)`);
      return 'plain';
    }
    
    // 检查JSON格式
    try {
      JSON.parse(raw);
      this.logger.log(`检测到JSON格式`);
      return 'json';
    } catch (e) {
      // 不是有效JSON
    }
    
    // 检查YAML格式 (有一些关键特征)
    if (raw.includes('proxies:') || raw.includes('Proxy:') || 
        (raw.includes('- name:') && raw.includes('type:'))) {
      this.logger.log(`检测到YAML格式`);
      return 'yaml';
    }
    
    // 尝试base64解码
    try {
      const base64Regex = /^[A-Za-z0-9+/=]+$/;
      // 移除所有换行和空格
      const cleanedRaw = raw.replace(/[\s\r\n]/g, '');
      
      // 检查是否是纯base64字符
      if (base64Regex.test(cleanedRaw)) {
        const decoded = atob(cleanedRaw);
        if (decoded && decoded.length > 0) {
          this.logger.log(`检测到Base64格式`);
          return 'base64';
        }
      }
    } catch (e) {
      // 解码失败
    }
    
    // 默认YAML，因为它最灵活
    this.logger.log(`无法确定格式，默认使用YAML解析器`);
    return 'yaml';
  }

  normalize(nodes) {
    if (!Array.isArray(nodes)) {
      this.logger.warn(`Expected array of nodes, got: ${typeof nodes}`);
      return [];
    }
    
    return nodes.filter(node => {
      const isValid = node && node.type && node.server && node.port;
      if (!isValid) {
        this.logger.warn(`忽略无效节点: ${JSON.stringify(node)}`);
      }
      return isValid;
    }).map(node => ({
      id: node.id || this.generateId(),
      type: node.type,
      name: node.name || `${node.type}-${node.server}:${node.port}`,
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

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}