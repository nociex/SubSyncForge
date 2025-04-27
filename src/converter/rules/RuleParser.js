/**
 * 规则解析器
 * 用于解析和应用规则集
 */
export class RuleParser {
  constructor(options = {}) {
    this.ruleCache = new Map();
    this.ruleSetCache = new Map();
    this.cacheExpiry = options.cacheExpiry || 3600000; // 默认缓存1小时
    this.fetchTimeout = options.fetchTimeout || 10000; // 默认10秒超时
    this.maxRetries = options.maxRetries || 3; // 默认最大重试次数
  }

  /**
   * 解析规则文件
   * @param {string} filePath 规则文件路径
   * @returns {Array} 解析后的规则数组
   */
  async parseRuleFile(filePath) {
    try {
      // 检查缓存
      if (this.ruleCache.has(filePath)) {
        const cached = this.ruleCache.get(filePath);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.rules;
        }
      }

      // 读取文件内容
      let content;
      if (filePath.startsWith('http')) {
        content = await this.fetchRuleFile(filePath);
      } else {
        content = await this.readLocalFile(filePath);
      }

      // 解析规则
      const rules = this.parseRuleContent(content);

      // 更新缓存
      this.ruleCache.set(filePath, {
        rules,
        timestamp: Date.now()
      });

      return rules;
    } catch (error) {
      console.error(`Failed to parse rule file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * 获取远程规则文件
   * @param {string} url 规则文件URL
   * @returns {string} 规则文件内容
   */
  async fetchRuleFile(url) {
    let retries = 0;
    let lastError;

    while (retries < this.maxRetries) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeout);

        const response = await fetch(url, {
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.text();
      } catch (error) {
        lastError = error;
        retries++;
        // 指数退避重试
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries - 1)));
      }
    }

    throw lastError || new Error(`Failed to fetch rule file after ${this.maxRetries} retries`);
  }

  /**
   * 读取本地规则文件
   * @param {string} filePath 规则文件路径
   * @returns {string} 规则文件内容
   */
  async readLocalFile(filePath) {
    // 在浏览器环境中，使用fetch读取本地文件
    if (typeof window !== 'undefined') {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to read local file: ${filePath}`);
      }
      return await response.text();
    }

    // 在Node.js环境中，使用fs模块读取文件
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      const fs = await import('fs/promises');
      return await fs.readFile(filePath, 'utf-8');
    }

    throw new Error('Unsupported environment for reading local files');
  }

  /**
   * 解析规则内容
   * @param {string} content 规则内容
   * @returns {Array} 解析后的规则数组
   */
  parseRuleContent(content) {
    const rules = [];
    const lines = content.split('\n');

    for (let line of lines) {
      // 去除空白字符
      line = line.trim();

      // 跳过空行和注释
      if (!line || line.startsWith('#')) {
        continue;
      }

      // 解析规则
      const rule = this.parseRule(line);
      if (rule) {
        rules.push(rule);
      }
    }

    return rules;
  }

  /**
   * 解析单条规则
   * @param {string} line 规则行
   * @returns {Object|null} 解析后的规则对象
   */
  parseRule(line) {
    // 支持的规则类型
    const ruleTypes = [
      'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-SET',
      'IP-CIDR', 'IP-CIDR6', 'IP-ASN', 'GEOIP',
      'RULE-SET', 'URL-REGEX', 'USER-AGENT', 'AND', 'OR', 'NOT',
      'PROTOCOL', 'DEST-PORT', 'SRC-PORT', 'SRC-IP', 'FINAL'
    ];

    // 尝试匹配规则类型
    for (const type of ruleTypes) {
      if (line.startsWith(type + ',')) {
        const parts = this.splitCSV(line);
        
        // 基本规则格式：类型,值,策略[,选项]
        if (parts.length >= 3) {
          return {
            type,
            value: parts[1],
            policy: parts[2],
            options: parts.slice(3)
          };
        }
      }
    }

    // 特殊处理 AND, OR, NOT 复合规则
    if (line.startsWith('AND,') || line.startsWith('OR,') || line.startsWith('NOT,')) {
      const type = line.split(',')[0];
      const match = line.match(/^(AND|OR|NOT),\((.*)\),(.*?)(?:,(.*))?$/);
      
      if (match) {
        return {
          type,
          value: match[2], // 括号内的内容
          policy: match[3],
          options: match[4] ? [match[4]] : []
        };
      }
    }

    return null;
  }

  /**
   * 分割CSV行，处理引号内的逗号
   * @param {string} line CSV行
   * @returns {Array} 分割后的字段数组
   */
  splitCSV(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    if (current) {
      result.push(current);
    }

    return result;
  }

  /**
   * 应用规则到节点
   * @param {Array} nodes 节点数组
   * @param {Array} rules 规则数组
   * @param {Object} groups 分组对象
   * @returns {Object} 应用规则后的结果
   */
  async applyRules(nodes, rules, groups) {
    const result = {
      nodes: [...nodes],
      groups: { ...groups },
      ruleMatches: []
    };

    // 创建分组映射
    const groupMap = new Map();
    for (const [name, group] of Object.entries(groups)) {
      groupMap.set(name, group);
    }

    // 应用规则
    for (const rule of rules) {
      // 跳过不支持的规则类型
      if (!this.isSupportedRuleType(rule.type)) {
        continue;
      }

      // 处理 RULE-SET 规则
      if (rule.type === 'RULE-SET') {
        const ruleSetRules = await this.fetchRuleSet(rule.value);
        const ruleSetResult = await this.applyRules(result.nodes, ruleSetRules, result.groups);
        
        // 合并结果
        result.ruleMatches.push(...ruleSetResult.ruleMatches);
        continue;
      }

      // 应用单条规则
      const matches = this.matchRule(rule, result.nodes);
      
      if (matches.length > 0) {
        result.ruleMatches.push({
          rule,
          matches: matches.map(node => node.name || node.id)
        });

        // 将匹配的节点添加到对应的分组
        if (groupMap.has(rule.policy)) {
          const group = groupMap.get(rule.policy);
          
          // 确保节点不重复
          for (const node of matches) {
            if (!group.nodes.includes(node)) {
              group.nodes.push(node);
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * 检查规则类型是否支持
   * @param {string} type 规则类型
   * @returns {boolean} 是否支持
   */
  isSupportedRuleType(type) {
    // 当前支持的规则类型
    const supportedTypes = [
      'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD',
      'GEOIP', 'FINAL', 'RULE-SET'
    ];

    return supportedTypes.includes(type);
  }

  /**
   * 获取规则集
   * @param {string} ruleSetUrl 规则集URL
   * @returns {Array} 规则集规则数组
   */
  async fetchRuleSet(ruleSetUrl) {
    try {
      // 检查缓存
      if (this.ruleSetCache.has(ruleSetUrl)) {
        const cached = this.ruleSetCache.get(ruleSetUrl);
        if (Date.now() - cached.timestamp < this.cacheExpiry) {
          return cached.rules;
        }
      }

      // 获取规则集内容
      const content = await this.fetchRuleFile(ruleSetUrl);
      
      // 解析规则
      const rules = this.parseRuleContent(content);

      // 更新缓存
      this.ruleSetCache.set(ruleSetUrl, {
        rules,
        timestamp: Date.now()
      });

      return rules;
    } catch (error) {
      console.error(`Failed to fetch rule set ${ruleSetUrl}:`, error);
      return [];
    }
  }

  /**
   * 匹配规则
   * @param {Object} rule 规则对象
   * @param {Array} nodes 节点数组
   * @returns {Array} 匹配的节点数组
   */
  matchRule(rule, nodes) {
    const matches = [];

    for (const node of nodes) {
      if (this.nodeMatchesRule(node, rule)) {
        matches.push(node);
      }
    }

    return matches;
  }

  /**
   * 检查节点是否匹配规则
   * @param {Object} node 节点对象
   * @param {Object} rule 规则对象
   * @returns {boolean} 是否匹配
   */
  nodeMatchesRule(node, rule) {
    switch (rule.type) {
      case 'DOMAIN':
        return node.server === rule.value;
      
      case 'DOMAIN-SUFFIX':
        return node.server && node.server.endsWith(rule.value);
      
      case 'DOMAIN-KEYWORD':
        return node.server && node.server.includes(rule.value);
      
      case 'GEOIP':
        // 需要 GeoIP 数据库支持，这里简化处理
        if (rule.value === 'CN') {
          // 简单判断是否为中国 IP
          return node.server && (
            node.server.startsWith('192.168.') || 
            node.server.startsWith('10.') || 
            node.server.startsWith('172.16.')
          );
        }
        return false;
      
      case 'FINAL':
        // FINAL 规则匹配所有节点
        return true;
      
      default:
        return false;
    }
  }
}

export default RuleParser;
