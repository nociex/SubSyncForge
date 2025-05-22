/**
 * 配置加载器
 * 负责从配置文件加载设置并合并默认配置
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { defaultConfig } from './ConfigDefaults.js';

export class ConfigLoader {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.configPath = options.configPath || path.resolve(this.rootDir, 'config/custom.yaml');
    this.logger = options.logger || console;
  }

  /**
   * 加载配置
   * @returns {Object} 加载的配置
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.logger.warn(`配置文件不存在: ${this.configPath}`);
        
        // 尝试在当前工作目录下查找
        const cwdConfigPath = path.resolve(process.cwd(), 'config/custom.yaml');
        this.logger.log(`尝试在当前工作目录查找配置: ${cwdConfigPath}`);
        
        if (fs.existsSync(cwdConfigPath)) {
          this.configPath = cwdConfigPath;
          this.logger.log(`找到配置文件: ${this.configPath}`);
        } else {
          this.logger.warn('未找到配置文件，使用默认配置');
          return this.mergeWithDefaults({});
        }
      }

      const content = fs.readFileSync(this.configPath, 'utf-8');
      const config = yaml.load(content);

      if (!config) {
        this.logger.warn('配置文件内容为空');
        return this.mergeWithDefaults({});
      }

      return this.mergeWithDefaults(config);
    } catch (error) {
      this.logger.error('解析配置文件失败:', error.message);
      return this.mergeWithDefaults({});
    }
  }

  /**
   * 将用户配置与默认配置合并
   * @param {Object} userConfig 用户配置
   * @returns {Object} 合并后的配置
   */
  mergeWithDefaults(userConfig) {
    const finalConfig = { ...defaultConfig };

    // 合并订阅源
    if (userConfig.subscriptions) {
      if (Array.isArray(userConfig.subscriptions)) {
        finalConfig.subscriptions = userConfig.subscriptions;
      } else if (typeof userConfig.subscriptions === 'object') {
        // 处理对象格式的订阅源
        finalConfig.subscriptions = Object.entries(userConfig.subscriptions).map(([key, sub]) => ({
          name: key,
          url: sub.url,
          enabled: sub.enabled !== false,
          type: 'url'
        }));
      }
    }

    // 合并输出配置
    if (userConfig.output) {
      if (userConfig.output.deduplication !== undefined) {
        finalConfig.options.deduplication = userConfig.output.deduplication;
      }
      
      if (userConfig.output.filterIrrelevant !== undefined) {
        finalConfig.options.filterIrrelevant = userConfig.output.filterIrrelevant;
      }
      
      if (userConfig.output.dir) {
        finalConfig.options.outputDir = userConfig.output.dir;
      }
      
      if (userConfig.output.data_dir) {
        finalConfig.options.dataDir = userConfig.output.data_dir;
      }
      
      if (userConfig.output.configs && Array.isArray(userConfig.output.configs)) {
        finalConfig.outputConfigs = userConfig.output.configs;
      }
      
      // 合并 GitHub 相关配置
      if (userConfig.output.github_user) {
        finalConfig.options.githubUser = userConfig.output.github_user;
      }
      
      if (userConfig.output.repo_name) {
        finalConfig.options.repoName = userConfig.output.repo_name;
      }
    }

    // 合并高级设置
    if (userConfig.advanced) {
      if (userConfig.advanced.log_level) {
        finalConfig.advanced.logLevel = userConfig.advanced.log_level;
      }
      
      if (userConfig.advanced.cache_ttl) {
        finalConfig.advanced.cacheTtl = userConfig.advanced.cache_ttl;
      }
      
      if (userConfig.advanced.proxy_for_subscription !== undefined) {
        finalConfig.advanced.proxyForSubscription = userConfig.advanced.proxy_for_subscription;
      }
      
      if (userConfig.advanced.sort_nodes !== undefined) {
        finalConfig.advanced.sortNodes = userConfig.advanced.sort_nodes;
      }
      
      if (userConfig.advanced.sync_interval) {
        finalConfig.advanced.syncInterval = userConfig.advanced.sync_interval;
      }
    }

    // 合并测试配置
    if (userConfig.testing) {
      finalConfig.testing.enabled = userConfig.testing.enabled !== false;
      
      if (userConfig.testing.concurrency) {
        finalConfig.testing.concurrency = userConfig.testing.concurrency;
      }
      
      if (userConfig.testing.timeout) {
        finalConfig.testing.timeout = userConfig.testing.timeout;
      }
      
      if (userConfig.testing.test_url) {
        finalConfig.testing.test_url = userConfig.testing.test_url;
      }
      
      if (userConfig.testing.filter_invalid !== undefined) {
        finalConfig.testing.filter_invalid = userConfig.testing.filter_invalid;
      }
      
      if (userConfig.testing.sort_by_latency !== undefined) {
        finalConfig.testing.sort_by_latency = userConfig.testing.sort_by_latency;
      }
      
      if (userConfig.testing.max_latency !== undefined) {
        finalConfig.testing.max_latency = userConfig.testing.max_latency;
      }
      
      if (userConfig.testing.max_nodes !== undefined) {
        finalConfig.testing.max_nodes = userConfig.testing.max_nodes;
      }
      
      if (userConfig.testing.verify_location !== undefined) {
        finalConfig.testing.verify_location = userConfig.testing.verify_location;
      }
      
      if (userConfig.testing.ip_location) {
        finalConfig.testing.ip_location = {
          api_url: userConfig.testing.ip_location.api_url || 'https://ipinfo.io/{ip}/json',
          api_key: userConfig.testing.ip_location.api_key || '',
          cache_time: userConfig.testing.ip_location.cache_time || 604800000 // 默认7天
        };
      }
    }

    return finalConfig;
  }
} 