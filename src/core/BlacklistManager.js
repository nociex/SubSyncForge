import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/index.js';

const defaultLogger = logger?.defaultLogger || console;

export class BlacklistManager {
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger.child({ component: 'BlacklistManager' });
    this.blacklistFile = options.blacklistFile || path.join(process.cwd(), 'config', 'blacklist.json');
    this.maxFailures = options.maxFailures || 3; // 连续失败3次进入黑名单
    this.blacklistDuration = options.blacklistDuration || 24 * 60 * 60 * 1000; // 24小时后可重试
    this.autoCleanup = options.autoCleanup !== false; // 自动清理过期黑名单
    
    // 内存中的黑名单数据
    this.blacklist = {
      nodes: {}, // 节点失败记录 { nodeKey: { failures: number, lastFailure: timestamp, blacklisted: boolean } }
      lastUpdated: Date.now()
    };
    
    this.loaded = false;
  }

  /**
   * 加载黑名单数据
   */
  async load() {
    try {
      // 确保配置目录存在
      await fs.mkdir(path.dirname(this.blacklistFile), { recursive: true });
      
      const data = await fs.readFile(this.blacklistFile, 'utf8');
      this.blacklist = JSON.parse(data);
      this.loaded = true;
      
      if (this.autoCleanup) {
        await this.cleanup();
      }
      
      const blacklistedCount = Object.values(this.blacklist.nodes).filter(n => n.blacklisted).length;
      this.logger.info(`已加载黑名单: ${blacklistedCount} 个节点`);
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.info('黑名单文件不存在，创建新的黑名单');
        await this.save();
      } else {
        this.logger.error(`加载黑名单失败: ${error.message}`);
      }
      this.loaded = true;
    }
  }

  /**
   * 保存黑名单数据
   */
  async save() {
    try {
      this.blacklist.lastUpdated = Date.now();
      await fs.writeFile(this.blacklistFile, JSON.stringify(this.blacklist, null, 2));
      this.logger.debug('黑名单已保存');
    } catch (error) {
      this.logger.error(`保存黑名单失败: ${error.message}`);
    }
  }

  /**
   * 生成节点唯一标识
   */
  getNodeKey(node) {
    return `${node.type}://${node.server}:${node.port}`;
  }

  /**
   * 检查节点是否在黑名单中
   */
  isBlacklisted(node) {
    if (!this.loaded) return false;
    
    const nodeKey = this.getNodeKey(node);
    const record = this.blacklist.nodes[nodeKey];
    
    if (!record || !record.blacklisted) return false;
    
    // 检查黑名单是否已过期
    const now = Date.now();
    if (now - record.lastFailure > this.blacklistDuration) {
      this.logger.debug(`节点 ${node.name} 黑名单已过期，恢复使用`);
      record.blacklisted = false;
      record.failures = 0;
      return false;
    }
    
    return true;
  }

  /**
   * 记录节点测试结果
   */
  async recordResult(node, isSuccess, error = null) {
    if (!this.loaded) await this.load();
    
    const nodeKey = this.getNodeKey(node);
    const now = Date.now();
    
    if (!this.blacklist.nodes[nodeKey]) {
      this.blacklist.nodes[nodeKey] = {
        name: node.name,
        server: node.server,
        port: node.port,
        type: node.type,
        failures: 0,
        lastFailure: null,
        blacklisted: false,
        firstSeen: now,
        lastTested: now
      };
    }
    
    const record = this.blacklist.nodes[nodeKey];
    record.lastTested = now;
    record.name = node.name; // 更新节点名称
    
    if (isSuccess) {
      // 测试成功，重置失败计数
      if (record.failures > 0) {
        this.logger.debug(`节点 ${node.name} 测试成功，重置失败计数`);
        record.failures = 0;
        record.blacklisted = false;
      }
    } else {
      // 测试失败，增加失败计数
      record.failures++;
      record.lastFailure = now;
      record.lastError = error;
      
      this.logger.warn(`节点 ${node.name} 测试失败 (${record.failures}/${this.maxFailures}): ${error}`);
      
      // 检查是否需要加入黑名单
      if (record.failures >= this.maxFailures && !record.blacklisted) {
        record.blacklisted = true;
        this.logger.warn(`节点 ${node.name} 连续失败 ${record.failures} 次，加入黑名单`);
      }
    }
    
    await this.save();
  }

  /**
   * 过滤黑名单节点
   */
  filterNodes(nodes) {
    if (!this.loaded || !Array.isArray(nodes)) return nodes;
    
    const originalCount = nodes.length;
    const filteredNodes = nodes.filter(node => !this.isBlacklisted(node));
    const filteredCount = originalCount - filteredNodes.length;
    
    if (filteredCount > 0) {
      this.logger.info(`已过滤 ${filteredCount} 个黑名单节点，剩余 ${filteredNodes.length} 个节点`);
    }
    
    return filteredNodes;
  }

  /**
   * 手动添加节点到黑名单
   */
  async addToBlacklist(node, reason = '手动添加') {
    if (!this.loaded) await this.load();
    
    const nodeKey = this.getNodeKey(node);
    const now = Date.now();
    
    this.blacklist.nodes[nodeKey] = {
      name: node.name,
      server: node.server,
      port: node.port,
      type: node.type,
      failures: this.maxFailures,
      lastFailure: now,
      blacklisted: true,
      firstSeen: now,
      lastTested: now,
      lastError: reason
    };
    
    await this.save();
    this.logger.info(`已手动将节点 ${node.name} 加入黑名单: ${reason}`);
  }

  /**
   * 手动从黑名单移除节点
   */
  async removeFromBlacklist(node) {
    if (!this.loaded) await this.load();
    
    const nodeKey = this.getNodeKey(node);
    if (this.blacklist.nodes[nodeKey]) {
      this.blacklist.nodes[nodeKey].blacklisted = false;
      this.blacklist.nodes[nodeKey].failures = 0;
      await this.save();
      this.logger.info(`已将节点 ${node.name} 从黑名单中移除`);
      return true;
    }
    return false;
  }

  /**
   * 清理过期的黑名单记录
   */
  async cleanup() {
    if (!this.loaded) return;
    
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [nodeKey, record] of Object.entries(this.blacklist.nodes)) {
      // 清理超过30天没有测试的记录
      if (now - record.lastTested > 30 * 24 * 60 * 60 * 1000) {
        delete this.blacklist.nodes[nodeKey];
        cleanedCount++;
      }
      // 清理过期的黑名单状态
      else if (record.blacklisted && now - record.lastFailure > this.blacklistDuration) {
        record.blacklisted = false;
        record.failures = 0;
        this.logger.debug(`节点 ${record.name} 黑名单已过期，状态已重置`);
      }
    }
    
    if (cleanedCount > 0) {
      this.logger.info(`已清理 ${cleanedCount} 个过期黑名单记录`);
      await this.save();
    }
  }

  /**
   * 获取黑名单统计信息
   */
  getStatistics() {
    if (!this.loaded) return null;
    
    const nodes = Object.values(this.blacklist.nodes);
    const blacklisted = nodes.filter(n => n.blacklisted);
    const recentFailures = nodes.filter(n => n.failures > 0 && !n.blacklisted);
    
    return {
      total: nodes.length,
      blacklisted: blacklisted.length,
      recentFailures: recentFailures.length,
      lastUpdated: this.blacklist.lastUpdated,
      topFailures: nodes
        .sort((a, b) => b.failures - a.failures)
        .slice(0, 10)
        .map(n => ({
          name: n.name,
          server: n.server,
          failures: n.failures,
          blacklisted: n.blacklisted,
          lastError: n.lastError
        }))
    };
  }

  /**
   * 导出黑名单报告
   */
  async exportReport() {
    if (!this.loaded) await this.load();
    
    const stats = this.getStatistics();
    const report = {
      summary: {
        总节点数: stats.total,
        黑名单节点数: stats.blacklisted,
        近期失败节点数: stats.recentFailures,
        最后更新: new Date(stats.lastUpdated).toLocaleString('zh-CN')
      },
      blacklistedNodes: Object.values(this.blacklist.nodes)
        .filter(n => n.blacklisted)
        .map(n => ({
          节点名称: n.name,
          服务器: n.server,
          端口: n.port,
          类型: n.type,
          失败次数: n.failures,
          最后失败时间: new Date(n.lastFailure).toLocaleString('zh-CN'),
          错误信息: n.lastError
        })),
      recentFailures: Object.values(this.blacklist.nodes)
        .filter(n => n.failures > 0 && !n.blacklisted)
        .map(n => ({
          节点名称: n.name,
          服务器: n.server,
          失败次数: n.failures,
          最后测试: new Date(n.lastTested).toLocaleString('zh-CN'),
          错误信息: n.lastError
        }))
    };
    
    return report;
  }

  /**
   * 重置所有黑名单状态（慎用）
   */
  async reset() {
    this.blacklist = {
      nodes: {},
      lastUpdated: Date.now()
    };
    await this.save();
    this.logger.warn('已重置所有黑名单数据');
  }
}

export default BlacklistManager; 