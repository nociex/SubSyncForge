import { NodeAnalyzer } from './NodeAnalyzer';
import { NodeTagger } from './NodeTagger';
import { NodeGrouper } from './NodeGrouper';
import { NodeFilter } from './NodeFilter';

/**
 * 节点管理器
 * 整合节点分析、标签、分组和筛选功能
 */
export class NodeManager {
  constructor(options = {}) {
    this.analyzer = options.analyzer || new NodeAnalyzer();
    this.tagger = options.tagger || new NodeTagger({ analyzer: this.analyzer });
    this.grouper = options.grouper || new NodeGrouper();
    this.filter = options.filter || new NodeFilter();
  }

  /**
   * 处理节点
   * @param {Array} nodes 原始节点数组
   * @returns {Object} 处理结果
   */
  processNodes(nodes) {
    // 0. 过滤示例节点
    const filteredNodes = this.filter.applyFilter(nodes, 'notExample', true);

    // 1. 分析节点
    const analyzedNodes = filteredNodes.map(node => {
      const analysis = this.analyzer.analyze(node);
      return {
        ...node,
        analysis
      };
    });

    // 2. 添加标签
    const taggedNodes = this.tagger.tagNodes(analyzedNodes);

    // 3. 生成分组
    const groups = this.grouper.generateGroups(taggedNodes);

    return {
      nodes: taggedNodes,
      groups
    };
  }

  /**
   * 筛选节点
   * @param {Array} nodes 节点数组
   * @param {Object|Function} conditions 筛选条件或筛选函数
   * @returns {Array} 筛选后的节点数组
   */
  filterNodes(nodes, conditions) {
    if (typeof conditions === 'function') {
      return nodes.filter(conditions);
    } else {
      return this.filter.applyFilters(nodes, conditions);
    }
  }

  /**
   * 重命名节点
   * @param {Array} nodes 节点数组
   * @param {Object} options 重命名选项
   * @returns {Array} 重命名后的节点数组
   */
  renameNodes(nodes, options = {}) {
    return nodes.map((node, index) => {
      if (!node.analysis) {
        node.analysis = this.analyzer.analyze(node);
      }

      const newName = this.analyzer.generateName(node.analysis, options, index);

      return {
        ...node,
        name: newName
      };
    });
  }

  /**
   * 导出配置
   * @returns {Object} 配置对象
   */
  exportConfig() {
    return {
      tagger: {
        customTags: this.tagger.getAllCustomTags()
      },
      grouper: this.grouper.exportConfig()
    };
  }

  /**
   * 导入配置
   * @param {Object} config 配置对象
   */
  importConfig(config) {
    if (config.tagger && config.tagger.customTags) {
      this.tagger.setAllCustomTags(config.tagger.customTags);
    }

    if (config.grouper) {
      this.grouper.importConfig(config.grouper);
    }
  }
}

export { NodeAnalyzer, NodeTagger, NodeGrouper, NodeFilter };
export default NodeManager;
