/**
 * 配置生成器
 * 负责生成各种格式的配置文件
 */

import fs from 'fs';
import path from 'path';
import { ensureDirectoryExists } from '../utils/FileSystem.js';

export class ConfigGenerator {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.outputDir = options.outputDir || 'output';
    this.dataDir = options.dataDir || 'data';
    this.githubUser = options.githubUser || '';
    this.repoName = options.repoName || 'SubSyncForge';
    this.converter = options.converter || null;
    this.logger = options.logger || console;
  }

  /**
   * 生成配置文件
   * @param {Array} nodes 节点数组
   * @param {Array} outputConfigs 输出配置数组
   * @returns {Promise<Array>} 生成的文件列表
   */
  async generateConfigs(nodes, outputConfigs) {
    // 添加更详细的日志
    this.logger.info(`=== 开始生成配置文件 ===`);
    this.logger.info(`输出配置详情: ${JSON.stringify(outputConfigs, null, 2)}`);
    
    const outputDir = path.join(this.rootDir, this.outputDir);
    ensureDirectoryExists(outputDir);
    
    this.logger.info(`准备生成 ${outputConfigs.length} 个配置文件`);
    this.logger.info(`输出目录: ${outputDir} (完整路径: ${path.resolve(outputDir)})`);
    this.logger.info(`节点数量: ${nodes ? nodes.length : 0}`);
    
    // 生成的文件列表
    const generatedFiles = [];
    
    // 如果节点数组为空或未定义，创建空的配置文件
    if (!nodes || nodes.length === 0) {
      this.logger.info(`节点数组为空，将创建空的配置文件`);
      
      for (const output of outputConfigs) {
        // 如果配置被禁用，则跳过
        if (output.enabled === false) {
          this.logger.info(`跳过禁用的输出配置: ${output.name}`);
          continue;
        }
        
        const { name, path: outputFile } = output;
        
        if (!outputFile) {
          this.logger.error(`输出配置缺少必要参数: ${JSON.stringify(output)}`);
          continue;
        }
        
        const outputPath = path.join(outputDir, outputFile);
        ensureDirectoryExists(path.dirname(outputPath));
        
        try {
          // 为不同类型的配置创建基本的空内容
          let emptyContent = '';
          
          if (outputFile.endsWith('.yaml') || outputFile.endsWith('.yml')) {
            emptyContent = `# 空的配置文件 - 自动生成\nproxies: []\n`;
          } else if (outputFile.endsWith('.json')) {
            emptyContent = `{\n  "proxies": []\n}`;
          } else if (outputFile.endsWith('.conf')) {
            emptyContent = `# 空的配置文件 - 自动生成\n`;
          } else {
            emptyContent = `# 空的配置文件 - 自动生成\n`;
          }
          
          fs.writeFileSync(outputPath, emptyContent);
          this.logger.info(`已创建空的配置文件: ${outputFile}`);
          generatedFiles.push(outputPath);
        } catch (error) {
          this.logger.error(`创建空配置文件失败: ${outputFile} - ${error.message}`);
        }
      }
      
      this.logger.info(`所有空配置文件创建完成`);
      return generatedFiles;
    }
    
    // 有节点的情况下，生成实际的配置文件
    for (const output of outputConfigs) {
      try {
        // 如果配置被禁用，则跳过
        if (output.enabled === false) {
          this.logger.info(`跳过禁用的输出配置: ${output.name}`);
          continue;
        }
        
        const { name, format, template: templateFile, path: outputFile } = output;
        const actualFormat = format || name; // 兼容旧格式，使用name作为format的备选
        
        if (!actualFormat || !outputFile) {
          this.logger.error(`输出配置缺少必要参数: ${JSON.stringify(output)}`);
          continue;
        }
        
        this.logger.info(`生成 ${actualFormat} 格式配置: ${outputFile}`);
        
        const outputPath = path.join(outputDir, outputFile);
        ensureDirectoryExists(path.dirname(outputPath));
        
        // 根据配置选项过滤节点
        let filteredNodes = [...nodes];
        
        // 处理按地区过滤选项
        if (output.options && output.options.filter_by_region && output.options.filter_by_region.length > 0) {
          this.logger.info(`按地区过滤节点: ${output.options.filter_by_region.join(', ')}`);
          filteredNodes = this.filterNodesByRegion(filteredNodes, output.options.filter_by_region);
          this.logger.info(`地区过滤后节点数量: ${filteredNodes.length}`);
        }
        
        // 处理按地区排除选项
        if (output.options && output.options.exclude_regions && output.options.exclude_regions.length > 0) {
          this.logger.info(`按地区排除节点: ${output.options.exclude_regions.join(', ')}`);
          filteredNodes = this.excludeNodesByRegion(filteredNodes, output.options.exclude_regions);
          this.logger.info(`地区排除后节点数量: ${filteredNodes.length}`);
        }
        
        // 处理按服务过滤选项
        if (output.options && output.options.filter_by_service && output.options.filter_by_service.length > 0) {
          this.logger.info(`按服务过滤节点: ${output.options.filter_by_service.join(', ')}`);
          filteredNodes = this.filterNodesByService(filteredNodes, output.options.filter_by_service);
          this.logger.info(`服务过滤后节点数量: ${filteredNodes.length}`);
        }
        
        // 如果过滤后没有节点，记录警告并继续但创建空文件
        if (filteredNodes.length === 0) {
          this.logger.warn(`警告: 过滤后没有节点符合条件，将创建空的 ${outputFile} 文件`);
          
          // 创建空的配置文件
          let emptyContent = '';
          
          if (outputFile.endsWith('.yaml') || outputFile.endsWith('.yml')) {
            emptyContent = `# 空的配置文件 - 自动生成\nproxies: []\n`;
          } else if (outputFile.endsWith('.json')) {
            emptyContent = `{\n  "proxies": []\n}`;
          } else if (outputFile.endsWith('.conf')) {
            emptyContent = `# 空的配置文件 - 自动生成\n`;
          } else {
            emptyContent = `# 空的配置文件 - 自动生成\n`;
          }
          
          fs.writeFileSync(outputPath, emptyContent);
          this.logger.info(`已创建空的配置文件: ${outputFile}`);
          generatedFiles.push(outputPath);
          continue;
        }
        
        // 生成配置内容
        let content = '';
        
        // 处理模板
        if (templateFile) {
          // 加载模板内容
          const templatePath = this.findTemplatePath(templateFile);
          
          if (!templatePath || !fs.existsSync(templatePath)) {
            this.logger.error(`模板文件不存在: ${templatePath}`);
            continue;
          }
          
          this.logger.info(`使用模板: ${templatePath}`);
          
          const templateContent = fs.readFileSync(templatePath, 'utf-8');
          this.logger.info(`模板大小: ${templateContent.length} 字节`);
          
          // 根据格式生成内容
          content = await this.generateContentFromTemplate(
            actualFormat, 
            templateContent, 
            filteredNodes, 
            output.options || {}
          );
        } else {
          // 无模板，只输出节点列表
          this.logger.info(`无模板，直接输出节点列表: ${outputFile}`);
          
          if (actualFormat.toUpperCase() === 'URL') {
            const base64Nodes = Buffer.from(JSON.stringify(filteredNodes)).toString('base64');
            content = base64Nodes;
          } else {
            const nodeList = filteredNodes.map(node => JSON.stringify(node)).join('\n');
            content = nodeList;
          }
        }
        
        // 写入文件
        fs.writeFileSync(outputPath, content);
        this.logger.info(`已生成 ${actualFormat} 配置: ${outputPath} (${filteredNodes.length} 个节点)`);
        this.logger.info(`文件大小: ${fs.statSync(outputPath).size} 字节`);
        
        generatedFiles.push(outputPath);
      } catch (error) {
        this.logger.error(`生成配置文件时出错:`, error);
      }
    }
    
    this.logger.info(`=== 配置文件生成完成 ===`);
    return generatedFiles;
  }

  /**
   * 查找模板文件路径
   * @param {string} templateFile 模板文件名
   * @returns {string} 完整的模板文件路径
   */
  findTemplatePath(templateFile) {
    // 支持多种模板路径格式
    if (path.isAbsolute(templateFile)) {
      // 绝对路径
      return templateFile;
    } else if (templateFile.startsWith('templates/')) {
      // 相对于项目根目录的templates目录
      return path.join(this.rootDir, templateFile);
    } else {
      // 尝试其他可能的路径
      const possiblePaths = [
        path.join(this.rootDir, templateFile),
        path.join(this.rootDir, 'templates', templateFile),
        path.join(this.rootDir, 'config', 'templates', templateFile)
      ];
      
      this.logger.info(`尝试查找模板文件，可能的路径: ${possiblePaths.join(', ')}`);
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          return possiblePath;
        }
      }
      
      // 尝试创建模板
      return this.createTemplateIfNeeded(templateFile);
    }
  }

  /**
   * 如果需要，创建基本模板
   * @param {string} templateFile 模板文件名
   * @returns {string} 模板文件路径
   */
  createTemplateIfNeeded(templateFile) {
    // 模板文件不存在，尝试创建基本模板
    const templatesDir = path.join(this.rootDir, 'templates');
    this.logger.info(`尝试创建基本模板文件...`);
    ensureDirectoryExists(templatesDir);
    
    // 创建基本模板
    const templates = {
      'mihomo.yaml': '# 基础Mihomo模板\nport: 7890\nproxy-groups:\n  - name: PROXY\n    proxies: []\nproxies: []',
      'surge.conf': '[General]\n[Proxy]\n[Proxy Group]\n[Rule]',
      'singbox.json': '{"log":{"level":"info"},"inbounds":[],"outbounds":[]}',
      'v2ray.json': '{"inbounds":[],"outbounds":[]}',
      'txt_list.txt': '# 节点链接列表'
    };
    
    // 如果没有指定扩展名，尝试猜测
    let filename = templateFile;
    if (!path.extname(filename)) {
      const format = path.basename(filename).toLowerCase();
      if (format === 'mihomo' || format === 'clash') {
        filename += '.yaml';
      } else if (format === 'surge') {
        filename += '.conf';
      } else if (format === 'singbox' || format === 'v2ray') {
        filename += '.json';
      } else {
        filename += '.txt';
      }
    }
    
    const templatePath = path.join(templatesDir, filename);
    
    // 如果模板不存在，创建基本模板
    if (!fs.existsSync(templatePath)) {
      const ext = path.extname(filename).toLowerCase();
      let content = '';
      
      if (ext === '.yaml' || ext === '.yml') {
        content = templates['mihomo.yaml'];
      } else if (ext === '.conf') {
        content = templates['surge.conf'];
      } else if (ext === '.json') {
        if (filename.includes('singbox')) {
          content = templates['singbox.json'];
        } else {
          content = templates['v2ray.json'];
        }
      } else {
        content = templates['txt_list.txt'];
      }
      
      fs.writeFileSync(templatePath, content);
      this.logger.info(`创建基本模板文件: ${templatePath}`);
    }
    
    return templatePath;
  }

  /**
   * 根据模板生成配置内容
   * @param {string} format 格式类型
   * @param {string} templateContent 模板内容
   * @param {Array} nodes 节点数组
   * @param {Object} options 选项
   * @returns {Promise<string>} 生成的内容
   */
  async generateContentFromTemplate(format, templateContent, nodes, options = {}) {
    this.logger.info(`根据 ${format} 模板生成配置内容`);
    
    // 根据不同格式调用不同的生成函数
    let content = '';
    
    try {
      if (this.converter) {
        // 使用转换器生成配置
        this.logger.info(`使用现有转换器生成 ${format} 格式配置`);
        content = await this.converter.convert(nodes, format, templateContent, options);
      } else {
        // 按照格式类型生成配置
        this.logger.info(`使用内置方法生成 ${format} 格式配置`);
        
        const { FormatConverter } = await import('../../converter/formats/FormatConverter.js');
        const converter = new FormatConverter({
          logger: this.logger,
          githubUser: this.githubUser,
          repoName: this.repoName,
          outputDir: this.outputDir
        });
        
        content = await converter.convert(nodes, format, templateContent, options);
      }
    } catch (error) {
      this.logger.error(`生成配置内容失败: ${error.message}`);
      content = templateContent; // 失败时返回原始模板
    }
    
    return content;
  }

  /**
   * 生成Clash/Mihomo格式内容
   * @param {string} template 模板内容
   * @param {Array} nodes 节点数组
   * @param {Object} options 选项
   * @returns {string} 生成的Clash内容
   */
  generateClashContent(template, nodes, options = {}) {
    // 使用转换器格式化节点
    let formattedNodes = '';
    
    if (this.converter) {
      formattedNodes = nodes.map(node => 
        this.converter.formatNodeForTarget(node, 'clash')
      ).filter(Boolean).join('\n');
    } else {
      // 基本格式化
      formattedNodes = nodes.map(node => {
        // 简单的 Clash 节点格式化
        const name = node.name.replace(/"/g, '\\"');
        let formatted = '';
        
        if (node.type === 'ss') {
          formatted = `  - name: "${name}"\n`;
          formatted += `    type: ss\n`;
          formatted += `    server: ${node.server}\n`;
          formatted += `    port: ${node.port}\n`;
          if (node.settings) {
            formatted += `    cipher: ${node.settings.method || 'aes-256-gcm'}\n`;
            formatted += `    password: ${node.settings.password}\n`;
          }
        } else if (node.type === 'vmess') {
          formatted = `  - name: "${name}"\n`;
          formatted += `    type: vmess\n`;
          formatted += `    server: ${node.server}\n`;
          formatted += `    port: ${node.port}\n`;
          if (node.settings) {
            formatted += `    uuid: ${node.settings.id}\n`;
            formatted += `    alterId: ${node.settings.alterId || 0}\n`;
            formatted += `    cipher: auto\n`;
            if (node.settings.network) {
              formatted += `    network: ${node.settings.network}\n`;
            }
            if (node.settings.tls) {
              formatted += `    tls: true\n`;
            }
          }
        } else if (node.type === 'trojan') {
          formatted = `  - name: "${name}"\n`;
          formatted += `    type: trojan\n`;
          formatted += `    server: ${node.server}\n`;
          formatted += `    port: ${node.port}\n`;
          if (node.settings) {
            formatted += `    password: ${node.settings.password}\n`;
            if (node.settings.sni) {
              formatted += `    sni: ${node.settings.sni}\n`;
            }
          }
        }
        
        return formatted;
      }).filter(Boolean).join('\n');
    }
    
    // 检查模板中是否包含proxies标记
    if (template.includes('proxies:')) {
      // 替换proxies部分
      return template.replace(/proxies:(\s*\[.*?\]|\s*\n(\s+-.*?\n)+)?/s, `proxies:\n${formattedNodes}`);
    } else {
      // 在文件末尾添加proxies部分
      return template + `\n\nproxies:\n${formattedNodes}`;
    }
  }

  /**
   * 生成Surge格式内容
   * @param {string} template 模板内容
   * @param {Array} nodes 节点数组
   * @param {Object} options 选项
   * @returns {string} 生成的Surge内容
   */
  generateSurgeContent(template, nodes, options = {}) {
    // 使用转换器格式化节点
    let formattedNodes = '';
    
    if (this.converter) {
      formattedNodes = nodes.map(node => 
        this.converter.formatNodeForTarget(node, 'surge')
      ).filter(Boolean).join('\n');
    } else {
      // 基本格式化
      formattedNodes = nodes.map(node => {
        const name = node.name.replace(/=/g, '').replace(/,/g, '');
        let formatted = '';
        
        if (node.type === 'ss') {
          formatted = `${name} = ss, ${node.server}, ${node.port}, encrypt-method=${node.settings?.method || 'aes-256-gcm'}, password=${node.settings?.password}`;
        } else if (node.type === 'vmess') {
          formatted = `${name} = vmess, ${node.server}, ${node.port}, username=${node.settings?.id}`;
          if (node.settings?.tls) {
            formatted += ', tls=true';
          }
        } else if (node.type === 'trojan') {
          formatted = `${name} = trojan, ${node.server}, ${node.port}, password=${node.settings?.password}`;
          if (node.settings?.sni) {
            formatted += `, sni=${node.settings.sni}`;
          }
        }
        
        return formatted;
      }).filter(Boolean).join('\n');
    }
    
    // 检查模板中是否包含[Proxy]标记
    if (template.includes('[Proxy]')) {
      // 替换[Proxy]部分
      return template.replace(/\[Proxy\](.*?)(\[|\Z)/s, `[Proxy]\n${formattedNodes}\n\n$2`);
    } else {
      // 在文件末尾添加[Proxy]部分
      return template + `\n\n[Proxy]\n${formattedNodes}`;
    }
  }

  /**
   * 生成Sing-box格式内容
   * @param {string} template 模板内容
   * @param {Array} nodes 节点数组
   * @param {Object} options 选项
   * @returns {string} 生成的Sing-box内容
   */
  generateSingboxContent(template, nodes, options = {}) {
    try {
      // 解析模板为JSON
      const config = JSON.parse(template);
      
      // 确保存在outbounds数组
      if (!config.outbounds) {
        config.outbounds = [];
      }
      
      // 寻找selector和urltest的索引
      const selectorIndex = config.outbounds.findIndex(ob => ob.type === 'selector');
      const urltestIndex = config.outbounds.findIndex(ob => ob.type === 'urltest');
      
      // 转换节点为outbound配置
      const proxyOutbounds = nodes.map(node => {
        if (node.type === 'ss') {
          return {
            type: 'shadowsocks',
            tag: node.name,
            server: node.server,
            server_port: parseInt(node.port),
            method: node.settings?.method || 'aes-256-gcm',
            password: node.settings?.password
          };
        } else if (node.type === 'vmess') {
          return {
            type: 'vmess',
            tag: node.name,
            server: node.server,
            server_port: parseInt(node.port),
            uuid: node.settings?.id,
            security: 'auto',
            alter_id: parseInt(node.settings?.alterId || 0)
          };
        } else if (node.type === 'trojan') {
          return {
            type: 'trojan',
            tag: node.name,
            server: node.server,
            server_port: parseInt(node.port),
            password: node.settings?.password,
            tls: {
              enabled: true,
              server_name: node.settings?.sni
            }
          };
        } else {
          return null;
        }
      }).filter(Boolean);
      
      // 节点标签数组
      const proxyTags = proxyOutbounds.map(p => p.tag);
      
      // 在开头插入所有节点
      config.outbounds = [...proxyOutbounds, ...config.outbounds];
      
      // 更新selector和urltest的outbounds
      if (selectorIndex !== -1) {
        config.outbounds[selectorIndex + proxyOutbounds.length].outbounds = 
          ['auto', ...proxyTags];
      }
      
      if (urltestIndex !== -1) {
        config.outbounds[urltestIndex + proxyOutbounds.length].outbounds = proxyTags;
      }
      
      // 序列化回JSON
      return JSON.stringify(config, null, 2);
    } catch (error) {
      this.logger.error(`生成Sing-box配置失败: ${error.message}`);
      return template;
    }
  }

  /**
   * 生成V2Ray格式内容
   * @param {string} template 模板内容
   * @param {Array} nodes 节点数组
   * @param {Object} options 选项
   * @returns {string} 生成的V2Ray内容
   */
  generateV2rayContent(template, nodes, options = {}) {
    try {
      // 解析模板为JSON
      const config = JSON.parse(template);
      
      // 确保outbounds数组存在
      if (!config.outbounds) {
        config.outbounds = [];
      }
      
      // 如果只使用第一个节点
      const useFirstNode = options.use_first_node === true;
      
      if (useFirstNode && nodes.length > 0) {
        // 创建一个outbound
        const node = nodes[0];
        let outbound = {
          tag: 'proxy',
          protocol: node.protocol || node.type,
          settings: {},
          streamSettings: {}
        };
        
        if (node.type === 'vmess') {
          outbound.settings.vnext = [{
            address: node.server,
            port: parseInt(node.port),
            users: [{
              id: node.settings?.id,
              alterId: parseInt(node.settings?.alterId || 0),
              security: node.settings?.security || 'auto'
            }]
          }];
          
          // 流设置
          if (node.settings?.network) {
            outbound.streamSettings.network = node.settings.network;
          }
          if (node.settings?.tls) {
            outbound.streamSettings.security = 'tls';
          }
        } else if (node.type === 'ss') {
          outbound.settings.servers = [{
            address: node.server,
            port: parseInt(node.port),
            method: node.settings?.method,
            password: node.settings?.password
          }];
        }
        
        // 替换或添加outbound
        const existingIndex = config.outbounds.findIndex(o => o.tag === 'proxy');
        if (existingIndex !== -1) {
          config.outbounds[existingIndex] = outbound;
        } else {
          config.outbounds.unshift(outbound);
        }
      } else {
        // 多节点，创建多个outbound
        const newOutbounds = nodes.map((node, index) => {
          const tag = `proxy_${index}`;
          let outbound = {
            tag: tag,
            protocol: node.protocol || node.type,
            settings: {},
            streamSettings: {}
          };
          
          if (node.type === 'vmess') {
            outbound.settings.vnext = [{
              address: node.server,
              port: parseInt(node.port),
              users: [{
                id: node.settings?.id,
                alterId: parseInt(node.settings?.alterId || 0),
                security: node.settings?.security || 'auto'
              }]
            }];
            
            // 流设置
            if (node.settings?.network) {
              outbound.streamSettings.network = node.settings.network;
            }
            if (node.settings?.tls) {
              outbound.streamSettings.security = 'tls';
            }
          } else if (node.type === 'ss') {
            outbound.settings.servers = [{
              address: node.server,
              port: parseInt(node.port),
              method: node.settings?.method,
              password: node.settings?.password
            }];
          }
          
          return outbound;
        });
        
        // 添加到配置
        config.outbounds = [...newOutbounds, ...config.outbounds];
      }
      
      // 序列化回JSON
      return JSON.stringify(config, null, 2);
    } catch (error) {
      this.logger.error(`生成V2Ray配置失败: ${error.message}`);
      return template;
    }
  }

  /**
   * 生成纯文本格式内容（通常用于URI列表）
   * @param {string} template 模板内容
   * @param {Array} nodes 节点数组
   * @param {Object} options 选项
   * @returns {string} 生成的文本内容
   */
  generateTextContent(template, nodes, options = {}) {
    // 生成URI列表
    const uriList = nodes.map(node => {
      // 优先使用原始URI
      if (node.extra?.raw && typeof node.extra.raw === 'string' && node.extra.raw.trim().length > 0) {
        return node.extra.raw;
      }
      
      // 尝试构造URI
      if (node.type === 'vmess' && node.settings?.id) {
        const vmessInfo = { 
          v: "2", 
          ps: node.name, 
          add: node.server, 
          port: parseInt(node.port) || 443, 
          id: node.settings.id, 
          aid: parseInt(node.settings.alterId) || 0, 
          net: node.settings.network || "tcp", 
          type: "none", 
          host: (node.settings.wsHeaders && node.settings.wsHeaders.Host) || "", 
          path: node.settings.wsPath || "/", 
          tls: node.settings.tls ? "tls" : "none" 
        };
        return `vmess://${Buffer.from(JSON.stringify(vmessInfo)).toString('base64')}`;
      } else if (node.type === 'ss' && node.settings?.method && node.settings?.password) {
        const userInfo = `${node.settings.method}:${node.settings.password}`;
        const base64UserInfo = Buffer.from(userInfo).toString('base64');
        return `ss://${base64UserInfo}@${node.server}:${parseInt(node.port) || 443}#${encodeURIComponent(node.name || 'Node')}`;
      } else if (node.type === 'trojan' && node.settings?.password) {
        return `trojan://${node.settings.password}@${node.server}:${parseInt(node.port) || 443}?sni=${node.settings.sni || ''}&allowInsecure=${node.settings.allowInsecure ? '1' : '0'}#${encodeURIComponent(node.name || 'Node')}`;
      }
      
      this.logger.warn(`无法为节点 ${node.name} 构造URI (类型: ${node.type})，在文本输出中跳过`);
      return '';
    }).filter(Boolean).join('\n');
    
    // 如果模板是空的或只有注释，直接返回URI列表
    if (!template || template.trim().startsWith('#') && template.trim().split('\n').every(line => !line.trim() || line.trim().startsWith('#'))) {
      return uriList;
    }
    
    // 否则附加到模板后
    return `${template}\n\n${uriList}`;
  }

  /**
   * 按地区过滤节点
   * @param {Array} nodes 节点数组
   * @param {Array} regions 地区列表
   * @returns {Array} 过滤后的节点
   */
  filterNodesByRegion(nodes, regions) {
    return nodes.filter(node => {
      // 检查节点的地区信息
      if (node.analysis) {
        // 尝试匹配地区代码或地区名称
        if (node.analysis.countryCode && regions.some(r => r.toUpperCase() === node.analysis.countryCode.toUpperCase())) {
          return true;
        }
        
        if (node.analysis.country && regions.some(r => node.analysis.country.includes(r))) {
          return true;
        }
      }
      
      // 尝试匹配节点名称中的地区信息
      const name = (node.name || '').toUpperCase();
      return regions.some(r => {
        const region = r.toUpperCase();
        return name.includes(region);
      });
    });
  }

  /**
   * 按地区排除节点
   * @param {Array} nodes 节点数组
   * @param {Array} regions 要排除的地区列表
   * @returns {Array} 过滤后的节点
   */
  excludeNodesByRegion(nodes, regions) {
    return nodes.filter(node => {
      // 如果节点没有地区信息，则不排除
      if (!node.analysis || (!node.analysis.countryCode && !node.analysis.country)) {
        return true;
      }
      
      // 检查节点的地区代码是否在排除列表中
      if (node.analysis.countryCode && regions.some(r => r.toUpperCase() === node.analysis.countryCode.toUpperCase())) {
        return false; // 排除
      }
      
      // 检查节点的地区名称是否在排除列表中
      if (node.analysis.country && regions.some(r => node.analysis.country.includes(r))) {
        return false; // 排除
      }
      
      // 检查节点名称中是否包含排除的地区信息
      const name = (node.name || '').toUpperCase();
      if (regions.some(r => name.includes(r.toUpperCase()))) {
         return false; // 排除
      }
      
      // 如果都不匹配，则保留该节点
      return true;
    });
  }

  /**
   * 按服务过滤节点
   * @param {Array} nodes 节点数组
   * @param {Array} services 服务列表
   * @returns {Array} 过滤后的节点
   */
  filterNodesByService(nodes, services) {
    return nodes.filter(node => {
      // 检查节点名称中是否包含指定服务
      const name = (node.name || '').toUpperCase();
      return services.some(service => name.includes(service.toUpperCase()));
    });
  }
} 