import { Base64Parser } from './formats/Base64Parser';
import { JsonParser } from './formats/JsonParser';
import { YamlParser } from './formats/YamlParser';
import { PlainTextParser } from './formats/PlainTextParser';

export class SubscriptionParser {
  constructor() {
    this.parsers = {
      base64: new Base64Parser(),
      json: new JsonParser(),
      yaml: new YamlParser(),
      plain: new PlainTextParser(),
    };
  }

  async parse(raw) {
    // 检测输入格式
    const format = this.detectFormat(raw);
    const parser = this.parsers[format];
    
    if (!parser) {
      throw new Error(`Unsupported format: ${format}`);
    }

    // 解析数据并转换为统一格式
    const nodes = await parser.parse(raw);
    return this.normalize(nodes);
  }

  detectFormat(raw) {
    if (raw.startsWith('vmess://') || raw.startsWith('ss://')) {
      return 'plain';
    }
    
    try {
      JSON.parse(raw);
      return 'json';
    } catch (e) {}
    
    // 尝试base64解码
    try {
      atob(raw.replace(/[\n\r]/g, ''));
      return 'base64';
    } catch (e) {}
    
    // 假设其他情况为YAML
    return 'yaml';
  }

  normalize(nodes) {
    return nodes.map(node => ({
      id: node.id || this.generateId(),
      type: node.type,
      name: node.name || '',
      server: node.server,
      port: parseInt(node.port),
      protocol: node.protocol,
      settings: node.settings || {},
      extra: node.extra || {},
    }));
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}