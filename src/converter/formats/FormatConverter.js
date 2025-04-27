import fs from 'fs';
import path from 'path';

/**
 * 格式转换器
 * 负责将节点转换为不同的配置格式
 */
export class FormatConverter {
  constructor(options = {}) {
    this.templatesDir = options.templatesDir || 'templates';
    this.templates = {};
  }

  /**
   * 转换节点到指定格式
   * @param {Array} nodes 节点数组
   * @param {string} format 目标格式
   * @param {string} templatePath 可选的模板路径
   * @returns {string} 转换后的配置
   */
  async convert(nodes, format, templatePath) {
    // 获取模板
    const template = await this.getTemplate(format, templatePath);
    
    // 根据格式调用不同的转换方法
    switch (format) {
      case 'mihomo':
      case 'clash':
        return this.convertToMihomo(nodes, template);
      case 'surge':
        return this.convertToSurge(nodes, template);
      case 'singbox':
        return this.convertToSingBox(nodes, template);
      case 'v2ray':
        return this.convertToV2Ray(nodes, template);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * 获取模板内容
   * @param {string} format 格式
   * @param {string} templatePath 可选的模板路径
   * @returns {string} 模板内容
   */
  async getTemplate(format, templatePath) {
    // 如果已经缓存了模板，直接返回
    if (this.templates[format]) {
      return this.templates[format];
    }
    
    // 如果提供了模板路径，使用提供的路径
    if (templatePath) {
      try {
        const template = fs.readFileSync(templatePath, 'utf8');
        this.templates[format] = template;
        return template;
      } catch (error) {
        throw new Error(`Failed to read template: ${error.message}`);
      }
    }
    
    // 否则使用默认模板
    const extensions = {
      mihomo: 'yaml',
      clash: 'yaml',
      surge: 'conf',
      singbox: 'json',
      v2ray: 'json'
    };
    
    const ext = extensions[format] || 'txt';
    const defaultPath = path.join(this.templatesDir, `${format}.${ext}`);
    
    try {
      const template = fs.readFileSync(defaultPath, 'utf8');
      this.templates[format] = template;
      return template;
    } catch (error) {
      throw new Error(`Failed to read default template: ${error.message}`);
    }
  }

  /**
   * 转换为Mihomo/Clash格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @returns {string} 转换后的配置
   */
  convertToMihomo(nodes, template) {
    // 生成节点配置
    const proxiesStr = nodes.map(node => {
      // 基本节点配置
      let nodeConfig = `  - name: "${node.name || 'Node'}"
    type: ${node.type || 'vmess'}
    server: ${node.server || '127.0.0.1'}
    port: ${node.port || 443}`;
      
      // 添加其他属性
      if (node.uuid) {
        nodeConfig += `\n    uuid: ${node.uuid}`;
      }
      if (node.alterId !== undefined) {
        nodeConfig += `\n    alterId: ${node.alterId}`;
      }
      if (node.cipher) {
        nodeConfig += `\n    cipher: ${node.cipher}`;
      }
      if (node.tls !== undefined) {
        nodeConfig += `\n    tls: ${node.tls}`;
      }
      if (node.network) {
        nodeConfig += `\n    network: ${node.network}`;
      }
      if (node['ws-opts']) {
        nodeConfig += `\n    ws-opts:`;
        if (node['ws-opts'].path) {
          nodeConfig += `\n      path: ${node['ws-opts'].path}`;
        }
        if (node['ws-opts'].headers) {
          nodeConfig += `\n      headers:`;
          for (const [key, value] of Object.entries(node['ws-opts'].headers)) {
            nodeConfig += `\n        ${key}: ${value}`;
          }
        }
      }
      
      return nodeConfig;
    }).join('\n');
    
    // 生成节点名称列表
    const proxyNames = nodes.map(node => {
      return `      - ${node.name || 'Node'}`;
    }).join('\n');
    
    // 替换模板中的占位符
    return template
      .replace('{{proxies}}', proxiesStr)
      .replace(/{{proxyNames}}/g, proxyNames);
  }

  /**
   * 转换为Surge格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @returns {string} 转换后的配置
   */
  convertToSurge(nodes, template) {
    // 生成节点配置
    const proxiesStr = nodes.map(node => {
      // 基本节点配置
      let nodeConfig = `${node.name || 'Node'} = ${node.type || 'vmess'}, ${node.server || '127.0.0.1'}, ${node.port || 443}`;
      
      // 添加其他属性
      if (node.uuid) {
        nodeConfig += `, username=${node.uuid}`;
      }
      if (node.tls) {
        nodeConfig += `, tls=true`;
      }
      if (node.network === 'ws') {
        nodeConfig += `, ws=true`;
        if (node['ws-opts'] && node['ws-opts'].path) {
          nodeConfig += `, ws-path=${node['ws-opts'].path}`;
        }
        if (node['ws-opts'] && node['ws-opts'].headers && node['ws-opts'].headers.Host) {
          nodeConfig += `, ws-headers=Host:${node['ws-opts'].headers.Host}`;
        }
      }
      
      return nodeConfig;
    }).join('\n');
    
    // 生成节点名称列表
    const proxyNames = nodes.map(node => {
      return node.name || 'Node';
    }).join(', ');
    
    // 替换模板中的占位符
    return template
      .replace('{{proxies}}', proxiesStr)
      .replace(/{{proxyNames}}/g, proxyNames);
  }

  /**
   * 转换为SingBox格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @returns {string} 转换后的配置
   */
  convertToSingBox(nodes, template) {
    // 生成节点配置
    const outboundsStr = nodes.map(node => {
      // 基本节点配置
      let nodeConfig = `    {
      "type": "${node.type || 'vmess'}",
      "tag": "${node.name || 'Node'}",
      "server": "${node.server || '127.0.0.1'}",
      "port": ${node.port || 443}`;
      
      // 添加其他属性
      if (node.uuid) {
        nodeConfig += `,
      "uuid": "${node.uuid}"`;
      }
      if (node.alterId !== undefined) {
        nodeConfig += `,
      "alter_id": ${node.alterId}`;
      }
      if (node.cipher) {
        nodeConfig += `,
      "security": "${node.cipher}"`;
      }
      if (node.tls) {
        nodeConfig += `,
      "tls": {
        "enabled": true
      }`;
      }
      if (node.network === 'ws') {
        nodeConfig += `,
      "transport": {
        "type": "ws"`;
        
        if (node['ws-opts']) {
          if (node['ws-opts'].path) {
            nodeConfig += `,
        "path": "${node['ws-opts'].path}"`;
          }
          if (node['ws-opts'].headers && node['ws-opts'].headers.Host) {
            nodeConfig += `,
        "headers": {
          "Host": "${node['ws-opts'].headers.Host}"
        }`;
          }
        }
        
        nodeConfig += `
      }`;
      }
      
      // 关闭节点配置
      nodeConfig += `
    }`;
      
      return nodeConfig;
    }).join(',\n');
    
    // 生成节点标签列表
    const proxyTags = nodes.map(node => {
      return `        "${node.name || 'Node'}"`;
    }).join(',\n');
    
    // 替换模板中的占位符
    return template
      .replace('{{outbounds}}', outboundsStr)
      .replace(/{{proxyTags}}/g, proxyTags);
  }

  /**
   * 转换为V2Ray格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @returns {string} 转换后的配置
   */
  convertToV2Ray(nodes, template) {
    // 生成节点配置
    const outboundsStr = nodes.map(node => {
      return `    {
      "protocol": "${node.type || 'vmess'}",
      "tag": "${node.name || 'Node'}",
      "settings": {
        "vnext": [
          {
            "address": "${node.server || '127.0.0.1'}",
            "port": ${node.port || 443},
            "users": [
              {
                "id": "${node.uuid || '00000000-0000-0000-0000-000000000000'}",
                "alterId": ${node.alterId || 0}
              }
            ]
          }
        ]
      }
    }`;
    }).join(',\n');
    
    // 替换模板中的占位符
    return template.replace('{{outbounds}}', outboundsStr);
  }
}

export default FormatConverter;
