/**
 * 节点筛选器
 * 用于根据各种条件筛选节点
 */
export class NodeFilter {
  constructor() {
    // 预定义筛选器
    this.filters = {
      // 按国家/地区筛选
      country: (node, value) => {
        if (!node.analysis || !node.analysis.country) return false;
        return node.analysis.country === value;
      },

      // 按国家/地区代码筛选
      countryCode: (node, value) => {
        if (!node.analysis || !node.analysis.countryCode) return false;
        return node.analysis.countryCode === value;
      },

      // 按协议筛选
      protocol: (node, value) => {
        if (!node.analysis || !node.analysis.protocol) return false;
        return node.analysis.protocol === value;
      },

      // 按编号筛选
      number: (node, value) => {
        if (!node.analysis || node.analysis.number === null) return false;
        return node.analysis.number === value;
      },

      // 按标签筛选
      tag: (node, value) => {
        if (!node.tags || node.tags.length === 0) return false;
        return node.tags.includes(value);
      },

      // 按名称关键词筛选
      keyword: (node, value) => {
        if (!node.name) return false;
        return node.name.toLowerCase().includes(value.toLowerCase());
      },

      // 按服务器地址筛选
      server: (node, value) => {
        if (!node.server) return false;
        return node.server === value;
      },

      // 按端口筛选
      port: (node, value) => {
        if (!node.port) return false;
        return node.port === value;
      },

      // 按延迟筛选
      latency: (node, value) => {
        if (!node.latency) return false;
        return node.latency <= value;
      },

      // 按速度筛选
      speed: (node, value) => {
        if (!node.speed) return false;
        return node.speed >= value;
      },

      // 过滤示例节点（默认为true表示保留非示例节点）
      notExample: (node, value = true) => {
        if (!node.name) return true;

        // 检查节点名称是否包含"示例"或"自定义"
        const isExample = node.name.includes('示例') || node.name.includes('自定义');

        // 如果value为true，则过滤掉示例节点；如果为false，则保留示例节点
        return value ? !isExample : isExample;
      },

      // 垃圾广告过滤 (Spam Filter)
      isSpam: (node, value = true) => {
        if (!node.name) return false;

        const name = node.name.toLowerCase();
        const spamKeywords = [
          't.me/', 'telegram.me', 'join', 'chat', // Telegram相关
          '官网', '频道', '群组', '加群', '免费', '公益', 'vpn', // 推广词
          'http://', 'https://', 'www.', '.com', '.xyz', '.top', // 网址
          '👉', '🔥', '🆔', // 特殊符号组合 (需谨慎)
          '@farah_vpn', '@moftconfig' // 特定已知垃圾源
        ];

        // 检查是否包含垃圾关键词
        // 如果是网址类节点，也视为 Spam (通常是推广链接而非节点)
        const isSpamNode = spamKeywords.some(keyword => name.includes(keyword.toLowerCase()));

        // 此外，检查通过 @ 引用用户名的模式 (如 @Username)
        // 只有当名称中包含 @ 且不包含标准分隔符 " | " 时，才进一步检查
        // 且要求用户名长度较长，或者位置非常靠前/靠后，才判定为广告
        if (name.includes(' | ')) return isSpamNode;

        const userMentionPattern = /@[a-zA-Z0-9_]{5,}/; // 至少5个字符
        const hasUserMention = userMentionPattern.test(name);

        return isSpamNode || (hasUserMention && name.length > 20); // 结合长度判断
      }
    };
  }

  /**
   * 添加自定义筛选器
   * @param {string} name 筛选器名称
   * @param {Function} filterFn 筛选函数
   */
  addFilter(name, filterFn) {
    if (typeof filterFn !== 'function') {
      throw new Error('Filter must be a function');
    }

    this.filters[name] = filterFn;
  }

  /**
   * 移除筛选器
   * @param {string} name 筛选器名称
   */
  removeFilter(name) {
    delete this.filters[name];
  }

  /**
   * 获取筛选器
   * @param {string} name 筛选器名称
   * @returns {Function} 筛选函数
   */
  getFilter(name) {
    return this.filters[name];
  }

  /**
   * 获取所有筛选器
   * @returns {Object} 所有筛选器
   */
  getAllFilters() {
    return { ...this.filters };
  }

  /**
   * 应用单个筛选条件
   * @param {Array} nodes 节点数组
   * @param {string} filterName 筛选器名称
   * @param {any} value 筛选值
   * @returns {Array} 筛选后的节点数组
   */
  applyFilter(nodes, filterName, value) {
    const filter = this.filters[filterName];

    if (!filter) {
      throw new Error(`Filter '${filterName}' not found`);
    }

    return nodes.filter(node => filter(node, value));
  }

  /**
   * 应用多个筛选条件（AND 逻辑）
   * @param {Array} nodes 节点数组
   * @param {Object} conditions 筛选条件对象
   * @returns {Array} 筛选后的节点数组
   */
  applyFilters(nodes, conditions) {
    let result = [...nodes];

    for (const [filterName, value] of Object.entries(conditions)) {
      result = this.applyFilter(result, filterName, value);
    }

    return result;
  }

  /**
   * 创建复合筛选器
   * @param {Object} conditions 筛选条件对象
   * @returns {Function} 复合筛选函数
   */
  createCompositeFilter(conditions) {
    return (node) => {
      for (const [filterName, value] of Object.entries(conditions)) {
        const filter = this.filters[filterName];

        if (!filter) {
          throw new Error(`Filter '${filterName}' not found`);
        }

        if (!filter(node, value)) {
          return false;
        }
      }

      return true;
    };
  }

  /**
   * 创建 OR 逻辑的复合筛选器
   * @param {Array} filtersList 筛选条件对象数组
   * @returns {Function} 复合筛选函数
   */
  createOrFilter(filtersList) {
    const compositeFilters = filtersList.map(conditions =>
      this.createCompositeFilter(conditions)
    );

    return (node) => {
      for (const filter of compositeFilters) {
        if (filter(node)) {
          return true;
        }
      }

      return false;
    };
  }

  /**
   * 创建 NOT 逻辑的筛选器
   * @param {Function} filter 筛选函数
   * @returns {Function} 取反的筛选函数
   */
  createNotFilter(filter) {
    return (node) => !filter(node);
  }

  /**
   * 解析筛选表达式
   * @param {string} expression 筛选表达式
   * @returns {Function} 筛选函数
   */
  parseExpression(expression) {
    // 简单的表达式解析器，支持 AND, OR, NOT 操作
    // 格式: country=US AND (protocol=vmess OR protocol=trojan) AND NOT tag=netflix

    // 这里只是一个简化的实现，实际应用中可能需要更复杂的解析器
    try {
      // 将表达式转换为 JavaScript 函数
      const jsExpression = expression
        .replace(/(\w+)=(\w+)/g, 'this.filters["$1"](node, "$2")')
        .replace(/AND/g, '&&')
        .replace(/OR/g, '||')
        .replace(/NOT/g, '!');

      // 创建函数
      return new Function('node', `return ${jsExpression}`).bind(this);
    } catch (error) {
      throw new Error(`Failed to parse filter expression: ${error.message}`);
    }
  }
}

export default NodeFilter;
