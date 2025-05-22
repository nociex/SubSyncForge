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
    this.logger = options.logger || console;
    this.githubUser = options.githubUser || '';
    this.repoName = options.repoName || 'SubSyncForge';
    
    // 基于 githubUser 设置默认的 baseUrl
    if (this.githubUser) {
      this.baseUrl = options.baseUrl || `https://raw.githubusercontent.com/${this.githubUser}/${this.repoName}`;
    } else {
      this.baseUrl = options.baseUrl || 'https://your-server';
    }
    
    this.outputDir = options.outputDir || './output';
  }

  /**
   * 转换节点到指定格式
   * @param {Array} nodes 节点数组
   * @param {string} format 目标格式
   * @param {string} templatePath 可选的模板路径
   * @param {Object} options 转换选项
   * @returns {string} 转换后的配置
   */
  async convert(nodes, format, templatePath, options = {}) {
    // 获取模板
    const template = await this.getTemplate(format, templatePath);
    
    // 根据格式调用不同的转换方法
    switch (format.toLowerCase()) {
      case 'mihomo':
      case 'clash':
        return this.convertToMihomo(nodes, template, options);
      case 'surge':
        return this.convertToSurge(nodes, template, options);
      case 'singbox':
        return this.convertToSingBox(nodes, template, options);
      case 'v2ray':
        return this.convertToV2Ray(nodes, template, options);
      case 'txt':
      case 'text':
      case 'plain':
        return this.convertToTextList(nodes, template, options);
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
      v2ray: 'json',
      txt: 'txt',
      text: 'txt',
      plain: 'txt'
    };
    
    const ext = extensions[format.toLowerCase()] || 'txt';
    const defaultPath = path.join(this.templatesDir, `${format.toLowerCase()}.${ext}`);
    
    try {
      const template = fs.readFileSync(defaultPath, 'utf8');
      this.templates[format] = template;
      return template;
    } catch (error) {
      throw new Error(`Failed to read default template: ${error.message}`);
    }
  }

  /**
   * 转换为简单文本列表格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @param {Object} options 转换选项
   * @returns {string} 转换后的配置
   */
  convertToTextList(nodes, template, options = {}) {
    // 将节点转换为URI字符串
    const nodeUris = nodes.map(node => node.uri || '').filter(Boolean);
    
    // 生成节点列表
    const nodesList = nodeUris.join('\n');
    
    // 设置名称和更新时间
    const name = options.name || 'Nodes';
    const updateTime = new Date().toISOString();
    const count = nodeUris.length;

    // 替换模板中的占位符
    return template
      .replace(/{{name}}/g, name)
      .replace(/{{updateTime}}/g, updateTime)
      .replace(/{{count}}/g, count)
      .replace(/{{nodes}}/g, nodesList);
  }

  /**
   * 转换为Mihomo/Clash格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @param {Object} options 转换选项
   * @returns {string} 转换后的配置
   */
  convertToMihomo(nodes, template, options = {}) {
    let result = template;
    const baseUrl = options.baseUrl || this.baseUrl;
    const outputDir = options.outputDir || this.outputDir;
    const githubUser = options.githubUser || this.githubUser;
    const repoName = options.repoName || this.repoName;
    
    // 三种路径模式
    const replacements = [];
    
    // 1. HTTP服务器模式
    if (baseUrl.startsWith('http')) {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, replacement: `${baseUrl}/output/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `${baseUrl}/output/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `${baseUrl}/output/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `${baseUrl}/output/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `${baseUrl}/output/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `${baseUrl}/output/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `${baseUrl}/output/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `${baseUrl}/output/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `${baseUrl}/output/Disney+.txt` }
      );
    } 
    // 2. GitHub Raw模式
    else if (options.useGithub && githubUser) {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, 
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Disney+.txt` }
      );
    } 
    // 3. 本地文件模式
    else {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, 
          replacement: `${outputDir}/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `${outputDir}/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `${outputDir}/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `${outputDir}/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `${outputDir}/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `${outputDir}/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `${outputDir}/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `${outputDir}/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `${outputDir}/Disney+.txt` }
      );
    }
    
    // 应用替换
    for (const { pattern, replacement } of replacements) {
      result = result.replace(pattern, replacement);
    }
    
    return result;
  }

  /**
   * 转换为Surge格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @param {Object} options 转换选项
   * @returns {string} 转换后的配置
   */
  convertToSurge(nodes, template, options = {}) {
    let result = template;
    const baseUrl = options.baseUrl || this.baseUrl;
    const outputDir = options.outputDir || this.outputDir;
    const githubUser = options.githubUser || this.githubUser;
    const repoName = options.repoName || this.repoName;
    
    // 三种路径模式
    const replacements = [];
    
    // 1. HTTP服务器模式
    if (baseUrl.startsWith('http')) {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, replacement: `${baseUrl}/output/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `${baseUrl}/output/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `${baseUrl}/output/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `${baseUrl}/output/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `${baseUrl}/output/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `${baseUrl}/output/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `${baseUrl}/output/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `${baseUrl}/output/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `${baseUrl}/output/Disney+.txt` }
      );
    } 
    // 2. GitHub Raw模式
    else if (options.useGithub && githubUser) {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, 
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Disney+.txt` }
      );
    } 
    // 3. 本地文件模式
    else {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, 
          replacement: `${outputDir}/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `${outputDir}/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `${outputDir}/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `${outputDir}/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `${outputDir}/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `${outputDir}/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `${outputDir}/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `${outputDir}/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `${outputDir}/Disney+.txt` }
      );
    }
    
    // 应用替换
    for (const { pattern, replacement } of replacements) {
      result = result.replace(pattern, replacement);
    }
    
    return result;
  }

  /**
   * 转换为SingBox格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @param {Object} options 转换选项
   * @returns {string} 转换后的配置
   */
  convertToSingBox(nodes, template, options = {}) {
    let result = template;
    const baseUrl = options.baseUrl || this.baseUrl;
    const outputDir = options.outputDir || this.outputDir;
    const githubUser = options.githubUser || this.githubUser;
    const repoName = options.repoName || this.repoName;
    
    // 三种路径模式
    const replacements = [];
    
    // 1. HTTP服务器模式
    if (baseUrl.startsWith('http')) {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, replacement: `${baseUrl}/output/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `${baseUrl}/output/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `${baseUrl}/output/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `${baseUrl}/output/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `${baseUrl}/output/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `${baseUrl}/output/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `${baseUrl}/output/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `${baseUrl}/output/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `${baseUrl}/output/Disney+.txt` }
      );
    } 
    // 2. GitHub Raw模式
    else if (options.useGithub && githubUser) {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, 
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Disney+.txt` }
      );
    } 
    // 3. 本地文件模式
    else {
      replacements.push(
        { pattern: /https:\/\/your-server\/groups\/HK/g, 
          replacement: `${outputDir}/HK.txt` },
        { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `${outputDir}/TW.txt` },
        { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `${outputDir}/SG.txt` },
        { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `${outputDir}/JP.txt` },
        { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `${outputDir}/US.txt` },
        { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `${outputDir}/Others.txt` },
        { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `${outputDir}/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `${outputDir}/Netflix.txt` },
        { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `${outputDir}/Disney+.txt` }
      );
    }
    
    // 应用替换
    for (const { pattern, replacement } of replacements) {
      result = result.replace(pattern, replacement);
    }
    
    return result;
  }

  /**
   * 转换为V2Ray格式
   * @param {Array} nodes 节点数组
   * @param {string} template 模板
   * @param {Object} options 转换选项
   * @returns {string} 转换后的配置
   */
  convertToV2Ray(nodes, template, options = {}) {
    // 对于V2Ray，如果options中指定了use_first_node，则只使用第一个节点
    if (options.use_first_node && nodes.length > 0) {
      const node = nodes[0];
      
      // 将第一个节点的配置替换到模板中
      let result = template;
      
      // 基本节点信息替换
      if (node.name) result = result.replace(/{{nodeName}}/g, node.name);
      if (node.server) result = result.replace(/{{nodeServer}}/g, node.server);
      if (node.port) result = result.replace(/{{nodePort}}/g, node.port);
      if (node.uuid) result = result.replace(/{{nodeId}}/g, node.uuid);
      
      return result;
    } else {
      // 分组订阅模式，与其他格式类似，替换URL
      let result = template;
      const baseUrl = options.baseUrl || this.baseUrl;
      const outputDir = options.outputDir || this.outputDir;
      const githubUser = options.githubUser || this.githubUser;
      const repoName = options.repoName || this.repoName;
      
      // 三种路径模式
      const replacements = [];
      
      // 1. HTTP服务器模式
      if (baseUrl.startsWith('http')) {
        replacements.push(
          { pattern: /https:\/\/your-server\/groups\/HK/g, replacement: `${baseUrl}/output/HK.txt` },
          { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `${baseUrl}/output/TW.txt` },
          { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `${baseUrl}/output/SG.txt` },
          { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `${baseUrl}/output/JP.txt` },
          { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `${baseUrl}/output/US.txt` },
          { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `${baseUrl}/output/Others.txt` },
          { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `${baseUrl}/output/OpenAI.txt` },
          { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `${baseUrl}/output/Netflix.txt` },
          { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `${baseUrl}/output/Disney+.txt` }
        );
      } 
      // 2. GitHub Raw模式
      else if (options.useGithub && githubUser) {
        replacements.push(
          { pattern: /https:\/\/your-server\/groups\/HK/g, 
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/HK.txt` },
          { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/TW.txt` },
          { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/SG.txt` },
          { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/JP.txt` },
          { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/US.txt` },
          { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Others.txt` },
          { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/OpenAI.txt` },
          { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Netflix.txt` },
          { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Disney+.txt` }
        );
      } 
      // 3. 本地文件模式
      else {
        replacements.push(
          { pattern: /https:\/\/your-server\/groups\/HK/g, 
            replacement: `${outputDir}/HK.txt` },
          { pattern: /https:\/\/your-server\/groups\/TW/g, replacement: `${outputDir}/TW.txt` },
          { pattern: /https:\/\/your-server\/groups\/SG/g, replacement: `${outputDir}/SG.txt` },
          { pattern: /https:\/\/your-server\/groups\/JP/g, replacement: `${outputDir}/JP.txt` },
          { pattern: /https:\/\/your-server\/groups\/US/g, replacement: `${outputDir}/US.txt` },
          { pattern: /https:\/\/your-server\/groups\/Others/g, replacement: `${outputDir}/Others.txt` },
          { pattern: /https:\/\/your-server\/groups\/OpenAI/g, replacement: `${outputDir}/OpenAI.txt` },
          { pattern: /https:\/\/your-server\/groups\/Netflix/g, replacement: `${outputDir}/Netflix.txt` },
          { pattern: /https:\/\/your-server\/groups\/Disney\+/g, replacement: `${outputDir}/Disney+.txt` }
        );
      }
      
      // 应用替换
      for (const { pattern, replacement } of replacements) {
        result = result.replace(pattern, replacement);
      }
      
      return result;
    }
  }
}

export default FormatConverter;
