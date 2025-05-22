/**
 * SOCKS节点转换器
 * 将其他类型的节点转换为SOCKS节点
 */

import { logger } from '../index.js';

const defaultLogger = logger?.defaultLogger || console;

export class SocksNodeConverter {
  /**
   * 构造函数
   * @param {Object} options 选项
   */
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger.child({ component: 'SocksNodeConverter' });
    this.defaultSocksPort = options.defaultSocksPort || 1080;
  }

  /**
   * 将任意类型节点转换为SOCKS节点
   * @param {Object} node 原始节点
   * @returns {Promise<Object|null>} 转换后的SOCKS节点，失败返回null
   */
  async convertToSocks(node) {
    if (!node || !node.server) {
      return null;
    }

    try {
      // 创建一个新的SOCKS节点
      const socksNode = {
        name: `${node.name || node.server}-SOCKS`,
        type: 'socks5',
        server: node.server,
        port: this.defaultSocksPort,
        udp: true
      };

      // 复制元数据
      if (node.metadata) {
        socksNode.metadata = { ...node.metadata };
      } else {
        socksNode.metadata = {};
      }

      // 标记这是一个转换的节点
      socksNode.metadata.converted = true;
      socksNode.metadata.original_type = node.type;
      socksNode.metadata.original_port = node.port;
      socksNode.metadata.is_china_socks = true;

      // 设置一些默认选项
      socksNode.settings = {
        udp: true,
        ip_version: 'ipv4'
      };

      // 如果原节点有用户名密码，复制过来
      if (node.username) socksNode.settings.username = node.username;
      if (node.password) socksNode.settings.password = node.password;

      this.logger.debug(`已将节点 ${node.name || node.server} 转换为SOCKS5节点`);

      return socksNode;
    } catch (error) {
      this.logger.error(`转换节点为SOCKS失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 批量转换节点为SOCKS
   * @param {Array<Object>} nodes 节点数组
   * @returns {Promise<Array<Object>>} 转换后的SOCKS节点数组
   */
  async batchConvert(nodes) {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return [];
    }

    const results = await Promise.all(
      nodes.map(node => this.convertToSocks(node))
    );

    // 过滤掉转换失败的节点
    return results.filter(node => node !== null);
  }
}

export default SocksNodeConverter; 