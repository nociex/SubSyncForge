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

  _sanitizeString(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[\uFFFD\uFFFE\uFFFF]/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '');
  }

  _sanitizeObjectStrings(value) {
    if (Array.isArray(value)) return value.map(item => this._sanitizeObjectStrings(item));
    if (value && typeof value === 'object') {
      const result = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this._sanitizeObjectStrings(val);
      }
      return result;
    }
    return this._sanitizeString(value);
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
    // 如果format为空或者undefined，使用默认格式
    if (!format) {
      this.logger.warn('没有指定格式，默认使用text格式');
      format = 'text';
    }

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
      case 'other_nodes': // 增加对other_nodes格式的支持
        return this.convertToTextList(nodes, template, options);
      default:
        this.logger.warn(`不支持的格式: ${format}，转为使用文本格式`);
        return this.convertToTextList(nodes, template, options);
    }
  }

  /**
   * 获取模板内容
   * @param {string} format 格式
   * @param {string} templatePath 可选的模板路径
   * @returns {string} 模板内容
   */
  async getTemplate(format, templatePath) {
    // 确保format是有效的字符串
    format = format || 'text';

    // 如果已经传入了模板内容而不是路径，直接使用
    if (templatePath && typeof templatePath === 'string' && !templatePath.includes('/') && !templatePath.includes('\\')) {
      return templatePath;
    }

    // 如果已经缓存了模板，直接返回
    if (this.templates[format]) {
      return this.templates[format];
    }

    // 如果提供了模板路径，使用提供的路径
    if (templatePath && fs.existsSync(templatePath)) {
      try {
        const template = fs.readFileSync(templatePath, 'utf8');
        this.templates[format] = template;
        return template;
      } catch (error) {
        this.logger.error(`读取模板文件失败: ${error.message}`);
        // 失败时返回默认的空模板
        return '# 空的配置文件 - 自动生成';
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
      plain: 'txt',
      other_nodes: 'txt'  // 增加对other_nodes格式的支持
    };

    const ext = extensions[format.toLowerCase()] || 'txt';
    const defaultPath = path.join(this.templatesDir, `${format.toLowerCase()}.${ext}`);

    try {
      if (fs.existsSync(defaultPath)) {
        const template = fs.readFileSync(defaultPath, 'utf8');
        this.templates[format] = template;
        return template;
      } else {
        // 如果默认模板不存在，返回一个基本模板
        this.logger.warn(`模板文件不存在: ${defaultPath}，使用默认空模板`);
        const defaultTemplate = '# 空的配置文件 - 自动生成';
        this.templates[format] = defaultTemplate;
        return defaultTemplate;
      }
    } catch (error) {
      this.logger.error(`读取默认模板失败: ${error.message}`);
      // 失败时返回默认的空模板
      return '# 空的配置文件 - 自动生成';
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
    const nodeUris = nodes.map(node => {
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

      return node.uri || '';
    }).filter(Boolean);

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

    // 将节点转换为 Clash YAML 格式
    const clashNodes = nodes.map(node => {
      try {
        return this.formatNodeForClash(node);
      } catch (e) {
        this.logger.warn(`节点转换失败: ${node.name} - ${e.message}`);
        return null;
      }
    }).filter(Boolean);

    // 生成 proxies YAML 内容 (Block Style)
    // 这种格式更稳定，兼容性更好
    let proxiesYaml = '';

    if (clashNodes.length > 0) {
      proxiesYaml = clashNodes.map(node => {
        const lines = [`  - name: ${JSON.stringify(node.name)}`];

        for (const [key, value] of Object.entries(node)) {
          if (key === 'name' || value === undefined || value === null || value === '') continue;

          if (typeof value === 'object') {
            // 处理嵌套对象 (如 ws-opts)
            const hasRenderableEntries = (obj) => {
              for (const [, v] of Object.entries(obj)) {
                if (v === undefined || v === null || v === '') continue;
                if (typeof v === 'object' && !Array.isArray(v)) {
                  if (hasRenderableEntries(v)) return true;
                  continue;
                }
                return true;
              }
              return false;
            };
            if (!hasRenderableEntries(value)) continue;

            lines.push(`    ${key}:`);
            const addObj = (obj, indent) => {
              for (const [k, v] of Object.entries(obj)) {
                if (v === undefined || v === null || v === '') continue;
                if (k === 'headers' && (v === null || Array.isArray(v) || typeof v !== 'object')) {
                  continue;
                }
                if (typeof v === 'object' && !Array.isArray(v)) {
                  const hasChildren = hasRenderableEntries(v);
                  if (!hasChildren) continue;
                  lines.push(`${indent}  ${k}:`);
                  addObj(v, indent + '  ');
                } else {
                  lines.push(`${indent}  ${k}: ${JSON.stringify(v)}`);
                }
              }
            };
            addObj(value, '    ');
          } else {
            lines.push(`    ${key}: ${JSON.stringify(value)}`);
          }
        }
        return lines.join('\n');
      }).join('\n');
    }

    // 替换 proxies 部分
    if (result.includes('proxies:')) {
      // 查找 proxies: ~ 或 proxies: [] 或 proxies:\n  - ... 模式
      result = result.replace(/proxies:\s*(?:~|\[\]|(?:\n\s+-[^\n]+)+)?/m, `proxies:\n${proxiesYaml}`);
    } else {
      // 在文件开头添加 proxies
      result = `proxies:\n${proxiesYaml}\n\n${result}`;
    }

    this.logger.info(`Mihomo配置生成完成，共 ${clashNodes.length} 个节点`);
    return result;
  }

  /**
   * 将节点格式化为 Clash 格式对象
   * @param {Object} node 节点对象
   * @returns {Object} Clash 格式的节点
   */
  formatNodeForClash(node) {
    const base = {
      name: node.name,
      type: node.type,
      server: node.server,
      port: parseInt(node.port) || 443
    };

    let result = base;

    switch (node.type) {
      case 'ss':
        result = {
          ...base,
          cipher: node.settings?.method || 'aes-256-gcm',
          password: node.settings?.password
        };
        break;
      case 'vmess':
        result = {
          ...base,
          uuid: node.settings?.id,
          alterId: parseInt(node.settings?.alterId) || 0,
          cipher: node.settings?.security || 'auto',
          ...(node.settings?.network && { network: node.settings.network }),
          ...(node.settings?.tls && { tls: true }),
          ...(node.settings?.wsPath && { 'ws-opts': { path: node.settings.wsPath, headers: node.settings.wsHeaders } })
        };
        break;
      case 'trojan':
        result = {
          ...base,
          password: node.settings?.password,
          ...(node.settings?.sni && { sni: node.settings.sni }),
          ...(node.settings?.allowInsecure && { 'skip-cert-verify': true })
        };
        break;
      case 'ssr':
        result = {
          ...base,
          cipher: node.settings?.method || 'aes-256-gcm',
          password: node.settings?.password,
          ...(node.settings?.obfs && { obfs: node.settings.obfs }),
          ...(node.settings?.protocol && { protocol: node.settings.protocol }),
          ...(node.settings?.obfsParam && { obfsParam: node.settings.obfsParam }),
          ...(node.settings?.protocolParam && { protocolParam: node.settings.protocolParam })
        };
        break;
      case 'hysteria':
      case 'hysteria2':
        result = {
          ...base,
          type: 'hysteria2',
          password: node.settings?.auth || node.settings?.password,
          ...(node.settings?.sni && { sni: node.settings.sni }),
          ...(node.settings?.alpn && { alpn: node.settings.alpn }),
          'skip-cert-verify': node.settings?.insecure || false
        };
        break;
      case 'vless':
        result = {
          ...base,
          uuid: node.settings?.id,
          flow: node.settings?.flow || '',
          ...(node.settings?.network && { network: node.settings.network }),
          ...(node.settings?.tls && { tls: true }),
          ...(node.settings?.sni && { servername: node.settings.sni })
        };
        break;
      default:
        result = base;
    }

    return this._sanitizeObjectStrings(result);
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
        { pattern: /https:\/\/your-server\/output\/HK\.txt/g, replacement: `${baseUrl}/output/HK.txt` },
        { pattern: /https:\/\/your-server\/output\/TW\.txt/g, replacement: `${baseUrl}/output/TW.txt` },
        { pattern: /https:\/\/your-server\/output\/SG\.txt/g, replacement: `${baseUrl}/output/SG.txt` },
        { pattern: /https:\/\/your-server\/output\/JP\.txt/g, replacement: `${baseUrl}/output/JP.txt` },
        { pattern: /https:\/\/your-server\/output\/US\.txt/g, replacement: `${baseUrl}/output/US.txt` },
        { pattern: /https:\/\/your-server\/output\/Others\.txt/g, replacement: `${baseUrl}/output/Others.txt` },
        { pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g, replacement: `${baseUrl}/output/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/output\/Netflix\.txt/g, replacement: `${baseUrl}/output/Netflix.txt` },
        { pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g, replacement: `${baseUrl}/output/Disney+.txt` }
      );
    }
    // 2. GitHub Raw模式
    else if (options.useGithub && githubUser) {
      replacements.push(
        {
          pattern: /https:\/\/your-server\/output\/HK\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/HK.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/TW\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/TW.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/SG\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/SG.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/JP\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/JP.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/US\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/US.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Others\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Others.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/OpenAI.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Netflix\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Netflix.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Disney+.txt`
        }
      );
    }
    // 3. 本地文件模式
    else {
      replacements.push(
        {
          pattern: /https:\/\/your-server\/output\/HK\.txt/g,
          replacement: `${outputDir}/HK.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/TW\.txt/g,
          replacement: `${outputDir}/TW.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/SG\.txt/g,
          replacement: `${outputDir}/SG.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/JP\.txt/g,
          replacement: `${outputDir}/JP.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/US\.txt/g,
          replacement: `${outputDir}/US.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Others\.txt/g,
          replacement: `${outputDir}/Others.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g,
          replacement: `${outputDir}/OpenAI.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Netflix\.txt/g,
          replacement: `${outputDir}/Netflix.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g,
          replacement: `${outputDir}/Disney+.txt`
        }
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
        { pattern: /https:\/\/your-server\/output\/HK\.txt/g, replacement: `${baseUrl}/output/HK.txt` },
        { pattern: /https:\/\/your-server\/output\/TW\.txt/g, replacement: `${baseUrl}/output/TW.txt` },
        { pattern: /https:\/\/your-server\/output\/SG\.txt/g, replacement: `${baseUrl}/output/SG.txt` },
        { pattern: /https:\/\/your-server\/output\/JP\.txt/g, replacement: `${baseUrl}/output/JP.txt` },
        { pattern: /https:\/\/your-server\/output\/US\.txt/g, replacement: `${baseUrl}/output/US.txt` },
        { pattern: /https:\/\/your-server\/output\/Others\.txt/g, replacement: `${baseUrl}/output/Others.txt` },
        { pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g, replacement: `${baseUrl}/output/OpenAI.txt` },
        { pattern: /https:\/\/your-server\/output\/Netflix\.txt/g, replacement: `${baseUrl}/output/Netflix.txt` },
        { pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g, replacement: `${baseUrl}/output/Disney+.txt` }
      );
    }
    // 2. GitHub Raw模式
    else if (options.useGithub && githubUser) {
      replacements.push(
        {
          pattern: /https:\/\/your-server\/output\/HK\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/HK.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/TW\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/TW.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/SG\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/SG.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/JP\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/JP.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/US\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/US.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Others\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Others.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/OpenAI.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Netflix\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Netflix.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g,
          replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Disney+.txt`
        }
      );
    }
    // 3. 本地文件模式
    else {
      replacements.push(
        {
          pattern: /https:\/\/your-server\/output\/HK\.txt/g,
          replacement: `${outputDir}/HK.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/TW\.txt/g,
          replacement: `${outputDir}/TW.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/SG\.txt/g,
          replacement: `${outputDir}/SG.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/JP\.txt/g,
          replacement: `${outputDir}/JP.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/US\.txt/g,
          replacement: `${outputDir}/US.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Others\.txt/g,
          replacement: `${outputDir}/Others.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g,
          replacement: `${outputDir}/OpenAI.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Netflix\.txt/g,
          replacement: `${outputDir}/Netflix.txt`
        },
        {
          pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g,
          replacement: `${outputDir}/Disney+.txt`
        }
      );
    }

    // 应用替换
    for (const { pattern, replacement } of replacements) {
      result = result.replace(pattern, replacement);
    }

    let config;
    try {
      config = JSON.parse(result);
    } catch (error) {
      this.logger.error(`SingBox模板JSON解析失败: ${error.message}`);
      return result;
    }

    const normalizeTag = (name, fallback) => {
      const base = (typeof name === 'string' && name.trim()) ? name.trim() : fallback;
      return base || 'node';
    };

    const usedTags = new Set();
    const ensureUniqueTag = (tag) => {
      let finalTag = tag;
      let counter = 1;
      while (usedTags.has(finalTag)) {
        finalTag = `${tag}-${counter++}`;
      }
      usedTags.add(finalTag);
      return finalTag;
    };

    const getRegionKey = (node) => {
      const code = (node.analysis?.countryCode || node.region || '').toUpperCase();
      if (['HK', 'TW', 'SG', 'JP', 'US'].includes(code)) return code;
      const country = (node.analysis?.country || '').toUpperCase();
      if (country.includes('HONG KONG') || country.includes('HK')) return 'HK';
      if (country.includes('TAIWAN') || country.includes('TW')) return 'TW';
      if (country.includes('SINGAPORE') || country.includes('SG')) return 'SG';
      if (country.includes('JAPAN') || country.includes('JP')) return 'JP';
      if (country.includes('UNITED STATES') || country.includes('US')) return 'US';
      const name = (node.name || '').toUpperCase();
      if (name.includes('HK') || name.includes('香港')) return 'HK';
      if (name.includes('TW') || name.includes('台湾')) return 'TW';
      if (name.includes('SG') || name.includes('新加坡')) return 'SG';
      if (name.includes('JP') || name.includes('日本')) return 'JP';
      if (name.includes('US') || name.includes('美国')) return 'US';
      return 'OTHERS';
    };

    const buildOutbound = (node) => {
      const type = (node.type || '').toLowerCase();
      const tag = ensureUniqueTag(normalizeTag(node.name, `${type}-${node.server}-${node.port}`));
      const base = {
        tag,
        type,
        server: node.server,
        server_port: parseInt(node.port, 10)
      };

      switch (type) {
        case 'ss':
        case 'shadowsocks':
          return {
            ...base,
            type: 'shadowsocks',
            method: node.settings?.method || node.method,
            password: node.settings?.password || node.password
          };
        case 'vmess': {
          const outbound = {
            ...base,
            type: 'vmess',
            uuid: node.settings?.id || node.uuid || node.id,
            security: node.settings?.security || node.cipher || 'auto',
            alter_id: parseInt(node.settings?.alterId || node.alterId || node.aid || 0, 10)
          };
          const network = node.settings?.network || node.network;
          if (network === 'ws') {
            outbound.transport = {
              type: 'ws',
              path: node.settings?.wsPath || node.settings?.path || node.wsPath || '/',
              headers: {}
            };
            const host = node.settings?.wsHeaders?.Host || node.settings?.host || node.host;
            if (host) outbound.transport.headers.Host = host;
          }
          if (node.settings?.tls || node.tls) {
            outbound.tls = {
              enabled: true,
              server_name: node.settings?.serverName || node.settings?.sni || node.server,
              insecure: node.settings?.allowInsecure || false
            };
          }
          return outbound;
        }
        case 'trojan':
          return {
            ...base,
            type: 'trojan',
            password: node.settings?.password || node.password,
            tls: {
              enabled: true,
              server_name: node.settings?.sni || node.server,
              insecure: node.settings?.allowInsecure || false
            }
          };
        case 'vless': {
          const outbound = {
            ...base,
            type: 'vless',
            uuid: node.settings?.id || node.uuid || node.id
          };
          const network = node.settings?.network || node.network;
          if (network === 'ws') {
            outbound.transport = {
              type: 'ws',
              path: node.settings?.path || node.settings?.wsPath || '/',
              headers: {}
            };
            const host = node.settings?.host || node.settings?.wsHeaders?.Host || node.host;
            if (host) outbound.transport.headers.Host = host;
          }
          if (node.settings?.tls || node.settings?.security === 'tls') {
            outbound.tls = {
              enabled: true,
              server_name: node.settings?.sni || node.server,
              insecure: node.settings?.allowInsecure || false
            };
          }
          if (node.settings?.flow) {
            outbound.flow = node.settings.flow;
          }
          return outbound;
        }
        case 'hysteria2':
          return {
            ...base,
            type: 'hysteria2',
            password: node.settings?.auth || node.settings?.password
          };
        case 'tuic':
          return {
            ...base,
            type: 'tuic',
            uuid: node.settings?.uuid || node.uuid,
            password: node.settings?.password || node.password
          };
        default:
          return null;
      }
    };

    config.outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
    delete config.providers;
    for (const outbound of config.outbounds) {
      if (outbound && typeof outbound === 'object' && outbound.providers) {
        delete outbound.providers;
      }
    }

    const groupTags = {
      HK: 'hk-group',
      TW: 'tw-group',
      SG: 'sg-group',
      JP: 'jp-group',
      US: 'us-group',
      OTHERS: 'others-group'
    };

    const groupOutboundMap = new Map();
    for (const outbound of config.outbounds) {
      if (outbound && typeof outbound === 'object' && typeof outbound.tag === 'string') {
        groupOutboundMap.set(outbound.tag, outbound);
      }
    }

    const nodeOutbounds = [];
    const groupMembers = {
      'hk-group': [],
      'tw-group': [],
      'sg-group': [],
      'jp-group': [],
      'us-group': [],
      'others-group': []
    };

    for (const node of nodes) {
      const outbound = buildOutbound(node);
      if (!outbound) continue;
      nodeOutbounds.push(outbound);
      const regionKey = getRegionKey(node);
      const groupTag = groupTags[regionKey] || 'others-group';
      if (groupMembers[groupTag]) {
        groupMembers[groupTag].push(outbound.tag);
      }
    }

    for (const [tag, members] of Object.entries(groupMembers)) {
      const group = groupOutboundMap.get(tag);
      if (group) {
        group.outbounds = members;
      }
    }

    config.outbounds = [
      ...config.outbounds,
      ...nodeOutbounds
    ];

    return JSON.stringify(config, null, 2);
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
          { pattern: /https:\/\/your-server\/output\/HK\.txt/g, replacement: `${baseUrl}/output/HK.txt` },
          { pattern: /https:\/\/your-server\/output\/TW\.txt/g, replacement: `${baseUrl}/output/TW.txt` },
          { pattern: /https:\/\/your-server\/output\/SG\.txt/g, replacement: `${baseUrl}/output/SG.txt` },
          { pattern: /https:\/\/your-server\/output\/JP\.txt/g, replacement: `${baseUrl}/output/JP.txt` },
          { pattern: /https:\/\/your-server\/output\/US\.txt/g, replacement: `${baseUrl}/output/US.txt` },
          { pattern: /https:\/\/your-server\/output\/Others\.txt/g, replacement: `${baseUrl}/output/Others.txt` },
          { pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g, replacement: `${baseUrl}/output/OpenAI.txt` },
          { pattern: /https:\/\/your-server\/output\/Netflix\.txt/g, replacement: `${baseUrl}/output/Netflix.txt` },
          { pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g, replacement: `${baseUrl}/output/Disney+.txt` }
        );
      }
      // 2. GitHub Raw模式
      else if (options.useGithub && githubUser) {
        replacements.push(
          {
            pattern: /https:\/\/your-server\/output\/HK\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/HK.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/TW\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/TW.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/SG\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/SG.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/JP\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/JP.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/US\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/US.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/Others\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Others.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/OpenAI.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/Netflix\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Netflix.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g,
            replacement: `https://raw.githubusercontent.com/${githubUser}/${repoName}/output/Disney+.txt`
          }
        );
      }
      // 3. 本地文件模式
      else {
        replacements.push(
          {
            pattern: /https:\/\/your-server\/output\/HK\.txt/g,
            replacement: `${outputDir}/HK.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/TW\.txt/g,
            replacement: `${outputDir}/TW.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/SG\.txt/g,
            replacement: `${outputDir}/SG.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/JP\.txt/g,
            replacement: `${outputDir}/JP.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/US\.txt/g,
            replacement: `${outputDir}/US.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/Others\.txt/g,
            replacement: `${outputDir}/Others.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/OpenAI\.txt/g,
            replacement: `${outputDir}/OpenAI.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/Netflix\.txt/g,
            replacement: `${outputDir}/Netflix.txt`
          },
          {
            pattern: /https:\/\/your-server\/output\/Disney\+\.txt/g,
            replacement: `${outputDir}/Disney+.txt`
          }
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
