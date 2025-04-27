import { NodeAnalyzer } from './NodeAnalyzer';

/**
 * 节点标签器
 * 用于为节点添加标签，支持自动和手动标签
 */
export class NodeTagger {
  constructor(options = {}) {
    this.analyzer = options.analyzer || new NodeAnalyzer();
    this.customTags = options.customTags || {};
    this.autoTagging = options.autoTagging !== false;
  }

  /**
   * 为节点添加标签
   * @param {Object} node 节点对象
   * @returns {Object} 添加标签后的节点
   */
  tagNode(node) {
    // 如果节点已经有标签，则直接返回
    if (node.tags) {
      return node;
    }

    // 创建标签数组
    const tags = [];

    // 自动标签
    if (this.autoTagging) {
      const analysis = this.analyzer.analyze(node);
      
      // 添加国家/地区标签
      if (analysis.country) {
        tags.push(analysis.country);
      }
      
      // 添加协议标签
      if (analysis.protocol) {
        tags.push(analysis.protocol);
      }
      
      // 添加特殊标签
      tags.push(...analysis.tags);
    }

    // 添加自定义标签
    const nodeId = node.id || '';
    if (this.customTags[nodeId]) {
      tags.push(...this.customTags[nodeId]);
    }

    // 去重
    const uniqueTags = [...new Set(tags)];

    // 返回添加标签后的节点
    return {
      ...node,
      tags: uniqueTags,
    };
  }

  /**
   * 批量为节点添加标签
   * @param {Array} nodes 节点数组
   * @returns {Array} 添加标签后的节点数组
   */
  tagNodes(nodes) {
    return nodes.map(node => this.tagNode(node));
  }

  /**
   * 手动为节点添加标签
   * @param {string} nodeId 节点ID
   * @param {Array} tags 标签数组
   */
  addCustomTags(nodeId, tags) {
    if (!this.customTags[nodeId]) {
      this.customTags[nodeId] = [];
    }
    
    // 添加新标签
    for (const tag of tags) {
      if (!this.customTags[nodeId].includes(tag)) {
        this.customTags[nodeId].push(tag);
      }
    }
  }

  /**
   * 手动移除节点标签
   * @param {string} nodeId 节点ID
   * @param {Array} tags 要移除的标签数组
   */
  removeCustomTags(nodeId, tags) {
    if (!this.customTags[nodeId]) {
      return;
    }
    
    // 移除标签
    this.customTags[nodeId] = this.customTags[nodeId].filter(
      tag => !tags.includes(tag)
    );
    
    // 如果没有标签了，则删除该节点的自定义标签记录
    if (this.customTags[nodeId].length === 0) {
      delete this.customTags[nodeId];
    }
  }

  /**
   * 清除节点的所有自定义标签
   * @param {string} nodeId 节点ID
   */
  clearCustomTags(nodeId) {
    delete this.customTags[nodeId];
  }

  /**
   * 获取节点的自定义标签
   * @param {string} nodeId 节点ID
   * @returns {Array} 标签数组
   */
  getCustomTags(nodeId) {
    return this.customTags[nodeId] || [];
  }

  /**
   * 获取所有自定义标签
   * @returns {Object} 自定义标签对象
   */
  getAllCustomTags() {
    return { ...this.customTags };
  }

  /**
   * 设置所有自定义标签
   * @param {Object} customTags 自定义标签对象
   */
  setAllCustomTags(customTags) {
    this.customTags = { ...customTags };
  }

  /**
   * 导出自定义标签
   * @returns {string} JSON 字符串
   */
  exportCustomTags() {
    return JSON.stringify(this.customTags);
  }

  /**
   * 导入自定义标签
   * @param {string} json JSON 字符串
   */
  importCustomTags(json) {
    try {
      const customTags = JSON.parse(json);
      this.customTags = customTags;
    } catch (error) {
      throw new Error(`Failed to import custom tags: ${error.message}`);
    }
  }
}

export default NodeTagger;
