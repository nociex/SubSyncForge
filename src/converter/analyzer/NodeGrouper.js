/**
 * 节点分组器
 * 用于将节点按照不同的规则分组
 */
export class NodeGrouper {
  constructor(options = {}) {
    // 默认分组模式：basic(基础), advanced(高级), custom(自定义)
    this.groupingMode = options.groupingMode || 'advanced';

    // 基础分组
    this.basicGroups = [
      { name: '全部节点', type: 'select' },
      { name: '自动选择', type: 'url-test', url: 'http://www.gstatic.com/generate_204', interval: 300 },
      { name: '负载均衡', type: 'load-balance', strategy: 'round-robin' },
      { name: '故障转移', type: 'fallback', url: 'http://www.gstatic.com/generate_204', interval: 300 },
    ];

    // 高级分组（参考用户提供的标准）
    this.advancedGroups = [
      // 主要选择组 - 添加 JP 和 TW
      { name: '🛫 节点切换', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true },
      { name: '🌈 手动选择', type: 'select', includeGroups: [], includeDirect: true }, // Manual select should probably include all nodes implicitly, but let's keep it consistent for now.

      // 应用/服务专用组 - 添加 JP 和 TW where appropriate
      { name: '📲 电报消息', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true },
      // OpenAI often restricts HK/TW, let's keep them out unless specifically requested
      { name: '🧬 OpenAi', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇯🇵 日本节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true, includeByTag: ['OpenAI'] },
      { name: '📹 油管视频', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true, includeByTag: ['YouTube'] },
      { name: '🎥 奈飞视频', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true, includeByTag: ['Netflix'] },
      { name: '🎬 迪士尼+', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true, includeByTag: ['Disney+'] },
      { name: '📢 谷歌FCM', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true },
      { name: 'Ⓜ️ 微软服务', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true, includeByTag: ['Microsoft'] },
      { name: '🍎 苹果服务', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true, includeByTag: ['Apple'] },
      { name: '🎮 游戏平台', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🇸🇬 新加坡节点', '🇭🇰 香港节点', '🇯🇵 日本节点', '🇹🇼 台湾节点', '🇺🇲 美国节点', '🌍 其他节点'], includeDirect: true, includeByTag: ['游戏'] },

      // 特殊用途组
      { name: '🕋 自建节点', type: 'select', includeCustom: true },
      { name: '🚈 全球直连', type: 'select', includeDirect: true, includeGroups: ['🕋 自建节点'] },
      { name: '🛑 广告拦截', type: 'select', includeReject: true, includeDirect: true },
      // 漏网之鱼 should probably include all region groups now? Or keep it simple? Let's keep it simple for now.
      { name: '🌀 漏网之鱼', type: 'select', includeGroups: ['🕋 自建节点', '🌈 手动选择', '🌍 其他节点'], includeDirect: true },
    ];

    // 区域节点组会在 generateGroups 方法中动态创建

    // 使用用户提供的默认分组或根据模式选择
    this.defaultGroups = options.defaultGroups ||
      (this.groupingMode === 'basic' ? this.basicGroups :
        this.groupingMode === 'advanced' ? this.advancedGroups : []);

    this.customGroups = options.customGroups || [];
  }

  /**
   * 按国家/地区分组
   * @param {Array} nodes 节点数组
   * @returns {Object} 分组结果
   */
  groupByCountry(nodes) {
    const groups = {};

    for (const node of nodes) {
      if (!node.analysis || !node.analysis.country) continue;

      const country = node.analysis.country;

      if (!groups[country]) {
        groups[country] = {
          name: country,
          type: 'select',
          nodes: []
        };
      }

      groups[country].nodes.push(node);
    }

    return groups;
  }

  /**
   * 按协议分组
   * @param {Array} nodes 节点数组
   * @returns {Object} 分组结果
   */
  groupByProtocol(nodes) {
    const groups = {};

    for (const node of nodes) {
      if (!node.analysis || !node.analysis.protocol) continue;

      const protocol = node.analysis.protocol;

      if (!groups[protocol]) {
        groups[protocol] = {
          name: protocol,
          type: 'select',
          nodes: []
        };
      }

      groups[protocol].nodes.push(node);
    }

    return groups;
  }

  /**
   * 按标签分组
   * @param {Array} nodes 节点数组
   * @returns {Object} 分组结果
   */
  groupByTag(nodes) {
    const groups = {};

    for (const node of nodes) {
      if (!node.tags || node.tags.length === 0) continue;

      for (const tag of node.tags) {
        // 跳过国家和协议标签，因为它们已经在其他分组中处理
        if (node.analysis && (tag === node.analysis.country || tag === node.analysis.protocol)) {
          continue;
        }

        if (!groups[tag]) {
          groups[tag] = {
            name: tag,
            type: 'select',
            nodes: []
          };
        }

        groups[tag].nodes.push(node);
      }
    }

    return groups;
  }

  /**
   * 创建自定义分组
   * @param {string} name 分组名称
   * @param {string} type 分组类型
   * @param {Function} filter 过滤函数
   * @param {Object} options 其他选项
   * @returns {Object} 分组对象
   */
  createCustomGroup(name, type, filter, options = {}) {
    const group = {
      name,
      type,
      filter,
      ...options
    };

    this.customGroups.push(group);

    return group;
  }

  /**
   * 删除自定义分组
   * @param {string} name 分组名称
   * @returns {boolean} 是否成功删除
   */
  removeCustomGroup(name) {
    const index = this.customGroups.findIndex(group => group.name === name);

    if (index !== -1) {
      this.customGroups.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * 应用自定义分组
   * @param {Array} nodes 节点数组
   * @returns {Object} 分组结果
   */
  applyCustomGroups(nodes) {
    const groups = {};

    for (const group of this.customGroups) {
      const { name, type, filter, ...options } = group;

      const filteredNodes = nodes.filter(filter);

      if (filteredNodes.length > 0) {
        groups[name] = {
          name,
          type,
          nodes: filteredNodes,
          ...options
        };
      }
    }

    return groups;
  }

  /**
   * 按分类分组
   * @param {Array} nodes 节点数组
   * @returns {Object} 分组结果
   */
  groupByCategory(nodes) {
    const groups = {};

    // 区域分组
    const regionGroups = {};

    // 协议分组
    const protocolGroups = {};

    // 特殊标签分组
    const specialGroups = {};

    for (const node of nodes) {
      if (!node.analysis || !node.analysis.categories) continue;

      const { region, protocol, special } = node.analysis.categories;

      // 添加到区域分组
      if (region && region !== 'Unknown') {
        if (!regionGroups[region]) {
          regionGroups[region] = {
            name: region,
            type: 'select',
            nodes: [],
            icon: node.analysis.icons?.find(icon => icon.type === 'country')?.url
          };
        }
        regionGroups[region].nodes.push(node);
      }

      // 添加到协议分组
      if (protocol && protocol !== 'Unknown') {
        if (!protocolGroups[protocol]) {
          protocolGroups[protocol] = {
            name: protocol,
            type: 'select',
            nodes: []
          };
        }
        protocolGroups[protocol].nodes.push(node);
      }

      // 添加到特殊标签分组
      if (special && special.length > 0) {
        for (const tag of special) {
          if (!specialGroups[tag]) {
            specialGroups[tag] = {
              name: tag,
              type: 'select',
              nodes: [],
              icon: node.analysis.icons?.find(icon => icon.name === tag)?.url
            };
          }
          specialGroups[tag].nodes.push(node);
        }
      }
    }

    // 合并所有分组
    groups.region = Object.values(regionGroups);
    groups.protocol = Object.values(protocolGroups);
    groups.special = Object.values(specialGroups);

    return groups;
  }

  /**
   * 生成所有分组
   * @param {Array} nodes 节点数组
   * @returns {Array} 分组数组
   */
  generateGroups(nodes) {
    // 根据分组模式选择不同的生成方法
    if (this.groupingMode === 'advanced') {
      return this.generateAdvancedGroups(nodes);
    } else if (this.groupingMode === 'basic') {
      return this.generateBasicGroups(nodes);
    } else {
      return this.generateCategoryGroups(nodes);
    }
  }

  /**
   * 生成基础分组
   * @param {Array} nodes 节点数组
   * @returns {Array} 分组数组
   */
  generateBasicGroups(nodes) {
    const result = [];

    // 添加默认分组
    for (const group of this.basicGroups) {
      const { name, type, ...options } = group;

      result.push({
        name,
        type,
        nodes: nodes,
        ...options
      });
    }

    // 添加国家/地区分组
    const countryGroups = this.groupByCountry(nodes);
    for (const key in countryGroups) {
      result.push(countryGroups[key]);
    }

    // 添加协议分组
    const protocolGroups = this.groupByProtocol(nodes);
    for (const key in protocolGroups) {
      result.push(protocolGroups[key]);
    }

    // 添加自定义分组
    const customGroups = this.applyCustomGroups(nodes);
    for (const key in customGroups) {
      result.push(customGroups[key]);
    }

    return result;
  }

  /**
   * 生成分类分组
   * @param {Array} nodes 节点数组
   * @returns {Array} 分组数组
   */
  generateCategoryGroups(nodes) {
    const result = [];

    // 添加默认分组
    for (const group of this.defaultGroups) {
      const { name, type, ...options } = group;

      result.push({
        name,
        type,
        nodes: nodes,
        ...options
      });
    }

    // 使用分类方式分组
    const categoryGroups = this.groupByCategory(nodes);

    // 添加区域分组
    if (categoryGroups.region && categoryGroups.region.length > 0) {
      // 添加区域分组文件夹
      result.push({
        name: '按地区分组',
        type: 'folder',
        groups: categoryGroups.region
      });

      // 也将区域分组添加到顶层
      for (const group of categoryGroups.region) {
        result.push(group);
      }
    } else {
      // 如果没有分类分组，则使用旧的方式
      const countryGroups = this.groupByCountry(nodes);
      for (const key in countryGroups) {
        result.push(countryGroups[key]);
      }
    }

    // 添加协议分组
    if (categoryGroups.protocol && categoryGroups.protocol.length > 0) {
      // 添加协议分组文件夹
      result.push({
        name: '按协议分组',
        type: 'folder',
        groups: categoryGroups.protocol
      });
    } else {
      // 如果没有分类分组，则使用旧的方式
      const protocolGroups = this.groupByProtocol(nodes);
      for (const key in protocolGroups) {
        result.push(protocolGroups[key]);
      }
    }

    // 添加特殊标签分组
    if (categoryGroups.special && categoryGroups.special.length > 0) {
      // 添加特殊标签分组文件夹
      result.push({
        name: '按标签分组',
        type: 'folder',
        groups: categoryGroups.special
      });

      // 也将特殊标签分组添加到顶层
      for (const group of categoryGroups.special) {
        result.push(group);
      }
    } else {
      // 如果没有分类分组，则使用旧的方式
      const tagGroups = this.groupByTag(nodes);
      for (const key in tagGroups) {
        result.push(tagGroups[key]);
      }
    }

    // 添加自定义分组
    const customGroups = this.applyCustomGroups(nodes);
    for (const key in customGroups) {
      result.push(customGroups[key]);
    }

    return result;
  }

  /**
   * 生成高级分组（按照用户提供的标准）
   * @param {Array} nodes 节点数组
   * @returns {Array} 分组数组
   */
  generateAdvancedGroups(nodes) {
    const result = [];
    const groupMap = new Map();

    // 首先创建特殊标签分组（如Netflix、Disney+、OpenAI等）
    this.createSpecialTagGroups(nodes, result, groupMap);

    // 创建区域节点组
    const regionGroups = {};

    // 获取所有国家/地区
    const countries = new Set();
    for (const node of nodes) {
      if (node.analysis && node.analysis.country) {
        countries.add(node.analysis.country);
      }
    }

    // 创建区域节点组
    for (const country of countries) {
      let emoji = '';
      let countryCode = '';

      // 获取国家/地区的 emoji
      if (nodes.some(node => node.analysis && node.analysis.country === country)) {
        const node = nodes.find(node => node.analysis && node.analysis.country === country);
        countryCode = node.analysis.countryCode;

        // 根据国家代码设置 emoji
        switch (countryCode) {
          case 'US': emoji = '🇺🇸'; break;
          case 'HK': emoji = '🇭🇰'; break;
          case 'TW': emoji = '🇹🇼'; break;
          case 'JP': emoji = '🇯🇵'; break;
          case 'SG': emoji = '🇸🇬'; break;
          case 'KR': emoji = '🇰🇷'; break;
          default: emoji = '';
        }
      }

      const groupName = `${emoji} ${country}节点`;
      const filteredNodes = nodes.filter(node => node.analysis && node.analysis.country === country);

      regionGroups[groupName] = {
        name: groupName,
        type: 'select',
        nodes: filteredNodes,
        url: 'http://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 150
      };

      // 将区域组添加到映射表
      groupMap.set(groupName, regionGroups[groupName]);
    }

    // 添加区域节点组到结果
    for (const key in regionGroups) {
      result.push(regionGroups[key]);
    }

    // 创建其他节点组（不是香港、新加坡和美国的节点）
    const otherNodes = nodes.filter(node => {
      if (!node.analysis || !node.analysis.country || !node.analysis.countryCode) {
        return true; // 没有国家信息的节点也归为其他节点
      }
      const code = node.analysis.countryCode;
      // Exclude HK, SG, US, JP, TW from the 'Others' group
      return code !== 'HK' && code !== 'SG' && code !== 'US' && code !== 'JP' && code !== 'TW';
    });

    if (otherNodes.length > 0) {
      const otherNodeGroup = {
        name: '🌍 其他节点',
        type: 'select',
        nodes: otherNodes,
        url: 'http://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 150
      };
      groupMap.set('🌍 其他节点', otherNodeGroup);
      result.push(otherNodeGroup);
    }

    // 创建自建节点组
    const customNodeGroup = {
      name: '🕋 自建节点',
      type: 'select',
      nodes: nodes.filter(node => node.custom === true || (node.name && node.name.includes('自建')))
    };
    groupMap.set('🕋 自建节点', customNodeGroup);
    result.push(customNodeGroup);

    // 创建手动选择组
    const manualSelectGroup = {
      name: '🌈 手动选择',
      type: 'select',
      nodes: nodes
    };
    groupMap.set('🌈 手动选择', manualSelectGroup);
    result.push(manualSelectGroup);

    // 处理高级分组
    for (const group of this.advancedGroups) {
      // 跳过已经创建的组
      if (groupMap.has(group.name)) {
        continue;
      }

      const { name, type, includeGroups, includeDirect, includeReject, includeByTag, includeCustom, ...options } = group;
      const groupNodes = [];

      // 添加其他组的节点
      if (includeGroups) {
        for (const includedGroupName of includeGroups) {
          const includedGroup = groupMap.get(includedGroupName);
          if (includedGroup && includedGroup.nodes) {
            groupNodes.push(...includedGroup.nodes);
          }
        }
      }

      // 添加标签匹配的节点
      if (includeByTag) {
        for (const tag of includeByTag) {
          const taggedNodes = nodes.filter(node =>
            node.tags && node.tags.some(nodeTag =>
              nodeTag.toLowerCase() === tag.toLowerCase()
            )
          );
          groupNodes.push(...taggedNodes);
        }
      }

      // 添加自定义节点
      if (includeCustom) {
        groupNodes.push(...nodes.filter(node => node.custom === true));
      }

      // 去重
      const uniqueNodes = [...new Set(groupNodes)];

      // 创建分组
      const newGroup = {
        name,
        type,
        nodes: uniqueNodes,
        ...options
      };

      // 添加 DIRECT 策略
      if (includeDirect) {
        newGroup.includeDirect = true;
      }

      // 添加 REJECT 策略
      if (includeReject) {
        newGroup.includeReject = true;
      }

      // 将组添加到映射表
      groupMap.set(name, newGroup);
      result.push(newGroup);
    }

    // 添加自定义分组
    const customGroups = this.applyCustomGroups(nodes);
    for (const key in customGroups) {
      if (!groupMap.has(key)) {
        result.push(customGroups[key]);
      }
    }

    return result;
  }

  /**
   * 创建特殊标签分组（如Netflix、Disney+、OpenAI等）
   * @param {Array} nodes 节点数组
   * @param {Array} result 结果数组
   * @param {Map} groupMap 分组映射
   */
  createSpecialTagGroups(nodes, result, groupMap) {
    // 定义特殊标签及其图标
    const specialTags = [
      { tag: 'Netflix', name: '🎬 Netflix节点', icon: '🎬' },
      { tag: 'Disney+', name: '🎪 Disney+节点', icon: '🎪' },
      { tag: 'OpenAI', name: '🤖 OpenAI节点', icon: '🤖' },
      { tag: 'YouTube', name: '📺 YouTube节点', icon: '📺' },
      { tag: 'Telegram', name: '📨 Telegram节点', icon: '📨' },
      { tag: '流媒体', name: '🎭 流媒体节点', icon: '🎭' },
      { tag: '游戏', name: '🎮 游戏节点', icon: '🎮' },
      { tag: 'TikTok', name: '📱 TikTok节点', icon: '📱' }
    ];

    // 为每个特殊标签创建分组
    for (const { tag, name, icon } of specialTags) {
      // 找出包含该标签的所有节点
      const taggedNodes = nodes.filter(node =>
        node.analysis &&
        node.analysis.tags &&
        node.analysis.tags.includes(tag)
      );

      // 如果找到了包含该标签的节点，创建对应的分组
      if (taggedNodes.length > 0) {
        const tagGroup = {
          name,
          type: 'select',
          nodes: taggedNodes,
          url: 'http://www.gstatic.com/generate_204',
          interval: 300,
          tolerance: 150
        };

        // 将分组添加到结果和映射
        groupMap.set(name, tagGroup);
        result.push(tagGroup);
      }
    }
  }

  /**
   * 导出分组配置
   * @returns {Object} 分组配置
   */
  exportConfig() {
    return {
      defaultGroups: this.defaultGroups,
      customGroups: this.customGroups.map(({ filter, ...rest }) => ({
        ...rest,
        filterString: filter.toString()
      }))
    };
  }

  /**
   * 导入分组配置
   * @param {Object} config 分组配置
   */
  importConfig(config) {
    if (config.defaultGroups) {
      this.defaultGroups = config.defaultGroups;
    }

    if (config.customGroups) {
      this.customGroups = config.customGroups.map(group => {
        const { filterString, ...rest } = group;

        // 将字符串转换回函数
        let filter;
        try {
          // 注意：这种方式存在安全风险，仅在可信环境中使用
          filter = new Function('return ' + filterString)();
        } catch (error) {
          console.error(`Failed to parse filter function: ${error.message}`);
          filter = () => true;
        }

        return {
          ...rest,
          filter
        };
      });
    }
  }
}

export default NodeGrouper;
