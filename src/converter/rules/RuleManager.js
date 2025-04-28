import { RuleParser } from './RuleParser.js';

/**
 * 规则管理器
 * 用于管理和应用规则
 */
export class RuleManager {
  constructor(options = {}) {
    this.parser = options.parser || new RuleParser();
    this.defaultRuleFile = options.defaultRuleFile || 'config/rules.conf';
    this.customRuleFiles = options.customRuleFiles || [];
    this.rules = [];
    this.initialized = false;
  }

  /**
   * 初始化规则管理器
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // 加载默认规则
      const defaultRules = await this.parser.parseRuleFile(this.defaultRuleFile);
      this.rules.push(...defaultRules);

      // 加载自定义规则
      for (const ruleFile of this.customRuleFiles) {
        const customRules = await this.parser.parseRuleFile(ruleFile);
        this.rules.push(...customRules);
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize rule manager:', error);
      throw error;
    }
  }

  /**
   * 添加规则文件
   * @param {string} ruleFile 规则文件路径
   */
  async addRuleFile(ruleFile) {
    try {
      const rules = await this.parser.parseRuleFile(ruleFile);
      this.rules.push(...rules);
      this.customRuleFiles.push(ruleFile);
    } catch (error) {
      console.error(`Failed to add rule file ${ruleFile}:`, error);
      throw error;
    }
  }

  /**
   * 添加规则
   * @param {Object|Array} rule 规则对象或规则数组
   */
  addRule(rule) {
    if (Array.isArray(rule)) {
      this.rules.push(...rule);
    } else {
      this.rules.push(rule);
    }
  }

  /**
   * 清除规则
   */
  clearRules() {
    this.rules = [];
    this.customRuleFiles = [];
    this.initialized = false;
  }

  /**
   * 应用规则到节点
   * @param {Array} nodes 节点数组
   * @param {Object} groups 分组对象
   * @returns {Object} 应用规则后的结果
   */
  async applyRules(nodes, groups) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.parser.applyRules(nodes, this.rules, groups);
  }

  /**
   * 获取所有规则
   * @returns {Array} 规则数组
   */
  getRules() {
    return [...this.rules];
  }

  /**
   * 获取规则数量
   * @returns {number} 规则数量
   */
  getRuleCount() {
    return this.rules.length;
  }

  /**
   * 导出规则
   * @returns {string} 规则文本
   */
  exportRules() {
    return this.rules.map(rule => {
      const { type, value, policy, options = [] } = rule;
      return [type, value, policy, ...options].join(',');
    }).join('\n');
  }
}

export default RuleManager;
