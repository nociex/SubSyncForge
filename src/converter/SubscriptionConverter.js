import { SubscriptionFetcher } from './fetcher/SubscriptionFetcher.js';
import { SubscriptionParser } from './parser/SubscriptionParser.js';
import { NodeDeduplicator } from './dedup/NodeDeduplicator.js';
import { NodeManager } from './analyzer/index.js';
import { RuleManager } from './rules/index.js';

// 导入工具模块
import {
  logger,
  events,
  validation,
  metrics
} from '../utils/index.js';

// 导入具体类和常量（使用防御性编程方式）
// 如果模块不存在，提供默认实现
const defaultLogger = logger?.defaultLogger || console;
const FetchError = logger?.FetchError || Error;
const ParseError = logger?.ParseError || Error;
const ConversionError = logger?.ConversionError || Error;
const ValidationError = logger?.ValidationError || Error;

// 事件相关
const eventEmitter = events?.eventEmitter || {
  emit: () => false, // 空实现
  on: () => ({})
};
const EventType = events?.EventType || {
  CONVERSION_START: 'conversion:start',
  CONVERSION_PROGRESS: 'conversion:progress',
  CONVERSION_COMPLETE: 'conversion:complete',
  CONVERSION_ERROR: 'conversion:error',
  FETCH_START: 'fetch:start',
  FETCH_COMPLETE: 'fetch:complete',
  FETCH_ERROR: 'fetch:error',
  PARSE_START: 'parse:start',
  PARSE_COMPLETE: 'parse:complete',
  PARSE_ERROR: 'parse:error',
  DEDUP_START: 'dedup:start',
  DEDUP_COMPLETE: 'dedup:complete'
};

// 验证相关
const validate = validation?.validate || ((data) => ({ valid: true, data }));
const ValidationSchemas = validation?.ValidationSchemas || {
  ConversionRequest: {
    url: ['required', 'string'],
    format: ['required', 'string']
  }
};

// 指标相关
const metricsCollector = metrics?.metrics || {
  startTimer: () => ({ stop: () => 0 }),
  histogram: () => 0,
  increment: () => 0,
  gauge: () => 0
};
const MetricName = metrics?.MetricName || {
  CONVERSION_TIME: 'conversion.time',
  FETCH_TIME: 'fetch.time',
  PARSE_TIME: 'parse.time',
  DEDUP_TIME: 'dedup.time'
};

// 不再在全局作用域设置this属性，移除这些代码
// 而是在构造函数中进行初始化

export class SubscriptionConverter {
  constructor(options = {}) {
    // 初始化组件
    this.fetcher = new SubscriptionFetcher(options.fetch);
    this.parser = new SubscriptionParser();
    this.deduplicator = new NodeDeduplicator();

    // 初始化节点管理器，传递分组模式
    this.nodeManager = new NodeManager({
      ...options.nodeManager,
      groupingMode: options.groupingMode || 'advanced'
    });

    // 初始化规则管理器
    this.ruleManager = new RuleManager({
      defaultRuleFile: options.defaultRuleFile || 'config/rules.conf',
      customRuleFiles: options.customRuleFiles || []
    });

    // 初始化日志器
    this.logger = options.logger || defaultLogger.child({ component: 'SubscriptionConverter' });

    // 初始化指标记录函数
    this.recordFetch = metrics?.recordFetch || (() => {});
    this.recordParse = metrics?.recordParse || (() => {});
    this.recordDedup = metrics?.recordDedup || (() => {});
    this.recordConversion = metrics?.recordConversion || (() => {});

    // 配置选项
    this.options = {
      dedup: true,
      validateInput: true,
      validateOutput: true,
      recordMetrics: true,
      emitEvents: true,
      nodeManagement: true,  // 启用节点管理功能
      renameNodes: false,    // 是否重命名节点
      renameFormat: '{country}{protocol}{number}{tags}', // 重命名格式
      groupingMode: 'advanced', // 使用高级分组模式（按照用户提供的标准）
      applyRules: true,      // 是否应用规则
      defaultRuleFile: 'config/rules.conf', // 默认规则文件
      customRuleFiles: [],   // 自定义规则文件
      ...options
    };
  }

  /**
   * 转换订阅
   * @param {string} source 订阅源URL
   * @param {string} targetFormat 目标格式
   * @param {Object} options 转换选项
   * @returns {Object} 转换结果
   */
  async convert(source, targetFormat, options = {}) {
    const startTime = Date.now();
    let timer = null;

    // 记录性能指标
    if (this.options.recordMetrics) {
      timer = metricsCollector.startTimer(MetricName.CONVERSION_TIME, {
        format: targetFormat
      });
    }

    // 合并选项
    const convertOptions = {
      ...this.options,
      ...options
    };

    try {
      // 验证输入
      if (convertOptions.validateInput) {
        const validationResult = validate({
          url: source,
          format: targetFormat
        }, ValidationSchemas.ConversionRequest);

        if (!validationResult.valid) {
          throw new ValidationError('Invalid conversion request', {
            code: 'INVALID_CONVERSION_REQUEST',
            context: { errors: validationResult.errors }
          });
        }
      }

      // 发出转换开始事件
      if (convertOptions.emitEvents) {
        eventEmitter.emit(EventType.CONVERSION_START, {
          source,
          targetFormat,
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info(`Starting conversion from ${source} to ${targetFormat}`, {
        source,
        targetFormat
      });

      // 1. 获取订阅内容
      let fetchData;
      try {
        const fetchStartTime = Date.now();

        if (convertOptions.emitEvents) {
          eventEmitter.emit(EventType.FETCH_START, { source });
        }

        fetchData = await this.fetcher.fetch(source);
        const fetchTime = Date.now() - fetchStartTime;

        if (this.options.recordMetrics) {
          // 使用安全的方式调用指标记录函数
          if (this.recordFetch) {
            this.recordFetch(source, true, fetchTime, fetchData.data.length);
          }
        }

        if (convertOptions.emitEvents) {
          eventEmitter.emit(EventType.FETCH_COMPLETE, {
            source,
            size: fetchData.data.length,
            time: fetchTime
          });
        }

        this.logger.debug(`Fetched subscription data from ${source}`, {
          size: fetchData.data.length,
          time: fetchTime
        });
      } catch (error) {
        const fetchError = new FetchError(`Failed to fetch subscription: ${error.message}`, {
          cause: error,
          context: { source }
        });

        if (this.options.recordMetrics) {
          // 使用安全的方式调用指标记录函数
          if (this.recordFetch) {
            this.recordFetch(source, false);
          }
        }

        if (convertOptions.emitEvents) {
          eventEmitter.emit(EventType.FETCH_ERROR, {
            source,
            error: fetchError.message
          });
        }

        this.logger.error(`Failed to fetch subscription from ${source}`, {
          error: fetchError.message,
          stack: fetchError.stack
        });

        throw fetchError;
      }

      // 2. 解析节点
      let nodes;
      try {
        const parseStartTime = Date.now();

        if (convertOptions.emitEvents) {
          eventEmitter.emit(EventType.PARSE_START, {
            source,
            dataSize: fetchData.data.length
          });
        }

        nodes = await this.parser.parse(fetchData.data);
        const parseTime = Date.now() - parseStartTime;

        if (this.options.recordMetrics) {
          // 使用安全的方式调用指标记录函数
          if (this.recordParse) {
            this.recordParse('auto', true, parseTime, nodes.length);
          }
        }

        if (convertOptions.emitEvents) {
          eventEmitter.emit(EventType.PARSE_COMPLETE, {
            source,
            nodeCount: nodes.length,
            time: parseTime
          });
        }

        this.logger.debug(`Parsed ${nodes.length} nodes from subscription`, {
          nodeCount: nodes.length,
          time: parseTime
        });
      } catch (error) {
        const parseError = new ParseError(`Failed to parse subscription: ${error.message}`, {
          cause: error,
          context: { source }
        });

        if (this.options.recordMetrics) {
          // 使用安全的方式调用指标记录函数
          if (this.recordParse) {
            this.recordParse('auto', false);
          }
        }

        if (convertOptions.emitEvents) {
          eventEmitter.emit(EventType.PARSE_ERROR, {
            source,
            error: parseError.message
          });
        }

        this.logger.error(`Failed to parse subscription data`, {
          error: parseError.message,
          stack: parseError.stack
        });

        throw parseError;
      }

      // 3. 去重处理
      if (convertOptions.dedup) {
        const dedupStartTime = Date.now();

        if (convertOptions.emitEvents) {
          eventEmitter.emit(EventType.DEDUP_START, {
            nodeCount: nodes.length
          });
        }

        const beforeCount = nodes.length;
        nodes = this.deduplicator.deduplicate(nodes, convertOptions.dedupOptions);
        const afterCount = nodes.length;
        const dedupTime = Date.now() - dedupStartTime;

        if (this.options.recordMetrics) {
          // 使用安全的方式调用指标记录函数
          if (this.recordDedup) {
            this.recordDedup(beforeCount, afterCount, dedupTime);
          }
        }

        if (convertOptions.emitEvents) {
          eventEmitter.emit(EventType.DEDUP_COMPLETE, {
            beforeCount,
            afterCount,
            time: dedupTime
          });
        }

        this.logger.debug(`Deduplicated nodes from ${beforeCount} to ${afterCount}`, {
          beforeCount,
          afterCount,
          time: dedupTime
        });
      }

      // 3.5 节点管理（分析、标签、分组）
      if (convertOptions.nodeManagement) {
        this.logger.debug('Processing nodes with NodeManager');

        try {
          // 处理节点（分析、添加标签、生成分组）
          const processedResult = this.nodeManager.processNodes(nodes);
          nodes = processedResult.nodes;

          // 如果需要重命名节点
          if (convertOptions.renameNodes) {
            this.logger.debug('Renaming nodes based on analysis');

            nodes = this.nodeManager.renameNodes(nodes, {
              format: convertOptions.renameFormat,
              includeCountry: true,
              includeProtocol: true,
              includeNumber: true,
              includeTags: true,
              tagLimit: 2
            });

            this.logger.debug(`Renamed ${nodes.length} nodes with sequential numbers`);
          }

          // 将分组信息添加到转换选项中，以便在转换时使用
          convertOptions.groups = processedResult.groups;

          this.logger.debug(`Processed ${nodes.length} nodes with NodeManager`, {
            groupCount: processedResult.groups.length
          });

          // 3.6 应用规则
          if (convertOptions.applyRules !== false) {
            this.logger.debug('Applying rules to nodes and groups');

            try {
              // 应用规则
              const ruleResult = await this.ruleManager.applyRules(nodes, convertOptions.groups);

              // 更新分组信息
              convertOptions.groups = ruleResult.groups;

              this.logger.debug(`Applied ${this.ruleManager.getRuleCount()} rules to nodes`, {
                matchCount: ruleResult.ruleMatches.length
              });
            } catch (error) {
              this.logger.warn(`Rule application failed: ${error.message}`, {
                error: error.stack
              });
              // 继续处理，不中断转换流程
            }
          }
        } catch (error) {
          this.logger.warn(`Node management processing failed: ${error.message}`, {
            error: error.stack
          });
          // 继续处理，不中断转换流程
        }
      }

      // 4. 转换格式
      let result;
      try {
        // 使用内部方法格式化节点
        // 注意：这可能是一个简化实现，实际输出可能需要根据 targetFormat、template 和 groups 进行更复杂的组装
        const formattedNodes = nodes.map(node => this.formatNodeForTarget(node, targetFormat)).filter(Boolean);
        // 简单的换行符连接，可能需要根据具体格式调整（例如 Clash/Surge 需要特定结构）
        result = formattedNodes.join('\n');

        this.logger.debug(`Converted ${nodes.length} nodes to ${targetFormat} format`);
      } catch (error) {
        const conversionError = new ConversionError(`Failed to convert to ${targetFormat}: ${error.message}`, {
          cause: error,
          context: { targetFormat, nodeCount: nodes.length }
        });

        this.logger.error(`Failed to convert to ${targetFormat} format`, {
          error: conversionError.message,
          stack: conversionError.stack
        });

        throw conversionError;
      }

      // 计算总耗时
      const totalTime = Date.now() - startTime;

      // 记录性能指标
      if (this.options.recordMetrics && timer) {
        timer.stop();
        // 使用安全的方式调用指标记录函数
        if (this.recordConversion) {
          this.recordConversion(targetFormat, true, totalTime, nodes.length);
        }
      }

      // 发出转换完成事件
      if (convertOptions.emitEvents) {
        eventEmitter.emit(EventType.CONVERSION_COMPLETE, {
          source,
          targetFormat,
          nodeCount: nodes.length,
          time: totalTime,
          timestamp: new Date().toISOString()
        });
      }

      this.logger.info(`Completed conversion from ${source} to ${targetFormat}`, {
        nodeCount: nodes.length,
        time: totalTime
      });

      return {
        success: true,
        data: result,
        nodeCount: nodes.length,
        time: totalTime
      };

    } catch (error) {
      // 记录性能指标
      if (this.options.recordMetrics && timer) {
        timer.stop();
        // 使用安全的方式调用指标记录函数
        if (this.recordConversion) {
          this.recordConversion(targetFormat, false);
        }
      }

      // 发出转换错误事件
      if (convertOptions.emitEvents) {
        eventEmitter.emit(EventType.CONVERSION_ERROR, {
          source,
          targetFormat,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }

      this.logger.error(`Conversion failed`, {
        source,
        targetFormat,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        code: error.code || 'UNKNOWN_ERROR',
        context: error.context || {}
      };
    }
  }

  /**
   * 将节点格式化为指定目标格式
   * @param {Object} node 节点对象
   * @param {string} format 目标格式
   * @returns {string} 格式化后的节点配置字符串
   */
  formatNodeForTarget(node, format) {
    try {
      // 确保节点有效
      if (!node || !node.type || !node.name) {
        this.logger.warn(`Invalid node object: missing required fields`);
        return null;
      }

      // 按照目标格式调用对应的格式化函数
      switch (format.toLowerCase()) {
        case 'clash':
        case 'mihomo':
          return this.formatNodeForClash(node);
        case 'surge':
          return this.formatNodeForSurge(node);
        case 'sing-box':
        case 'singbox':
          return this.formatNodeForSingBox(node);
        case 'v2ray':
        case 'v2fly':
        case 'xray':
          return this.formatNodeForV2Ray(node);
        case 'plain':
        case 'text':
          return node.raw; // 纯文本格式直接返回原始链接
        default:
          this.logger.warn(`Unsupported target format: ${format}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Error formatting node for ${format}: ${error.message}`, {
        nodeName: node.name,
        error: error.stack
      });
      return null; // 返回 null 表示格式化失败
    }
  }

  /**
   * 将节点格式化为 Clash 配置格式
   * @param {Object} node 节点对象
   * @returns {Object} Clash 节点配置对象
   */
  formatNodeForClash(node) {
    let clashNode = {
      name: node.name,
      type: node.type,
      server: node.server,
      port: node.port
    };

    // 根据协议类型添加特定字段
    switch (node.type) {
      case 'ss':
        clashNode.cipher = node.cipher;
        clashNode.password = node.password;
        if (node.plugin) {
          clashNode.plugin = node.plugin;
          clashNode['plugin-opts'] = node.pluginOpts;
        }
        break;
      case 'ssr':
        clashNode.cipher = node.cipher;
        clashNode.password = node.password;
        clashNode.protocol = node.protocol;
        clashNode['protocol-param'] = node.protocolParam;
        clashNode.obfs = node.obfs;
        clashNode['obfs-param'] = node.obfsParam;
        break;
      case 'vmess':
        clashNode.uuid = node.uuid;
        clashNode.alterId = node.alterId;
        clashNode.cipher = node.cipher || 'auto'; // Clash 中 vmess cipher 通常为 auto
        if (node.tls) {
          clashNode.tls = true;
          clashNode['skip-cert-verify'] = node.skipCertVerify || false;
          if (node.serverName) {
            clashNode.servername = node.serverName;
          }
        }
        if (node.network === 'ws') {
          clashNode.network = 'ws';
          clashNode['ws-opts'] = node.wsOpts || {};
          if (node.wsHeaders) { // 旧版字段兼容
            clashNode['ws-opts'].headers = node.wsHeaders;
          }
        } else if (node.network === 'h2') {
          clashNode.network = 'h2';
          clashNode['h2-opts'] = node.h2Opts || {};
        } else if (node.network === 'grpc') {
          clashNode.network = 'grpc';
          clashNode['grpc-opts'] = node.grpcOpts || {};
        }
        break;
      case 'trojan':
        clashNode.password = node.password;
        clashNode.sni = node.sni || node.serverName; // 优先使用 sni 字段
        clashNode['skip-cert-verify'] = node.skipCertVerify || false;
        if (node.network === 'ws') {
          clashNode.network = 'ws';
          clashNode['ws-opts'] = node.wsOpts || {};
        } else if (node.network === 'grpc') {
          clashNode.network = 'grpc';
          clashNode['grpc-opts'] = node.grpcOpts || {};
        }
        break;
      case 'vless':
        clashNode.uuid = node.uuid;
        clashNode.flow = node.flow || ''; // Clash 中 VLESS flow 通常为空或 'xtls-rprx-vision'
        if (node.tls) {
          clashNode.tls = true;
          clashNode.servername = node.serverName || node.sni;
          clashNode['skip-cert-verify'] = node.skipCertVerify || false;
          if (node.realityOpts) {
            clashNode.reality = true; // 假设 realityOpts 存在即启用 reality
            clashNode['reality-opts'] = node.realityOpts;
          } else if (node.fingerprint) {
            clashNode.client_fingerprint = node.fingerprint; // 使用 client_fingerprint
          }
        }
        clashNode.network = node.network || 'tcp';
        if (node.network === 'ws') {
          clashNode['ws-opts'] = node.wsOpts || {};
        } else if (node.network === 'grpc') {
          clashNode['grpc-opts'] = node.grpcOpts || {};
        }
        break;
      case 'http':
      case 'https':
        // Clash 支持 HTTP/HTTPS 代理
        clashNode.type = 'http'; // Clash 中统一为 http 类型
        if (node.username && node.password) {
          clashNode.username = node.username;
          clashNode.password = node.password;
        }
        if (node.tls) {
          clashNode.tls = true;
          clashNode['skip-cert-verify'] = node.skipCertVerify || false;
          if (node.sni) {
            clashNode.sni = node.sni;
          }
        }
        break;
      case 'socks5':
        clashNode.type = 'socks5';
        if (node.username && node.password) {
          clashNode.username = node.username;
          clashNode.password = node.password;
        }
        if (node.tls) {
          clashNode.tls = true;
          clashNode['skip-cert-verify'] = node.skipCertVerify || false;
          if (node.sni) {
            clashNode.sni = node.sni;
          }
        }
        break;
      default:
        this.logger.warn(`Unsupported node type for Clash: ${node.type}`, { nodeName: node.name });
        return null; // 不支持的类型返回 null
    }

    // 添加 UDP 支持标志（如果节点信息中有）
    if (node.udp !== undefined) {
      clashNode.udp = node.udp;
    }

    return clashNode;
  }

  /**
   * 将节点格式化为 Surge 配置格式
   * @param {Object} node 节点对象
   * @returns {string} Surge 节点配置行
   */
  formatNodeForSurge(node) {
    let surgeLine = `${node.name} = `;

    switch (node.type) {
      case 'ss':
        surgeLine += `ss, ${node.server}, ${node.port}, encrypt-method=${node.cipher}, password=${node.password}`;
        if (node.obfs) {
          surgeLine += `, obfs=${node.obfs}`;
          if (node.obfsParam) {
            surgeLine += `, obfs-host=${node.obfsParam}`; // Surge 使用 obfs-host
          }
        }
        if (node.udpRelay !== undefined) { // Surge 使用 udp-relay
          surgeLine += `, udp-relay=${node.udpRelay}`;
        }
        if (node.tfo !== undefined) {
          surgeLine += `, tfo=${node.tfo}`;
        }
        break;
      case 'vmess':
        surgeLine += `vmess, ${node.server}, ${node.port}, username=${node.uuid}`; // Surge 使用 username 作为 uuid
        if (node.alterId) {
          surgeLine += `, alterId=${node.alterId}`; // Surge 支持 alterId
        }
        if (node.cipher) {
          surgeLine += `, encrypt-method=${node.cipher}`; // Surge 支持指定加密方法
        }
        if (node.tls) {
          surgeLine += `, tls=true`;
          if (node.skipCertVerify) {
            surgeLine += `, skip-cert-verify=true`;
          }
          if (node.serverName) {
            surgeLine += `, sni=${node.serverName}`; // Surge 使用 sni
          }
        }
        if (node.network === 'ws') {
          surgeLine += `, ws=true`;
          if (node.wsOpts?.path) {
            surgeLine += `, ws-path=${node.wsOpts.path}`;
          }
          if (node.wsOpts?.headers?.Host) {
            surgeLine += `, ws-headers=Host:${node.wsOpts.headers.Host}`; // Surge 的 ws-headers 格式
          }
        }
        if (node.udpRelay !== undefined) {
          surgeLine += `, udp-relay=${node.udpRelay}`;
        }
        break;
      case 'trojan':
        surgeLine += `trojan, ${node.server}, ${node.port}, password=${node.password}`;
        if (node.sni) {
          surgeLine += `, sni=${node.sni}`;
        }
        if (node.skipCertVerify) {
          surgeLine += `, skip-cert-verify=true`;
        }
        if (node.udpRelay !== undefined) {
          surgeLine += `, udp-relay=${node.udpRelay}`;
        }
        if (node.tfo !== undefined) {
          surgeLine += `, tfo=${node.tfo}`;
        }
        if (node.network === 'ws') {
          surgeLine += `, ws=true`;
          if (node.wsOpts?.path) {
            surgeLine += `, ws-path=${node.wsOpts.path}`;
          }
          if (node.wsOpts?.headers?.Host) {
            surgeLine += `, ws-headers=Host:${node.wsOpts.headers.Host}`;
          }
        }
        break;
      case 'http':
        surgeLine += `http, ${node.server}, ${node.port}`;
        if (node.username) {
          surgeLine += `, ${node.username}`;
          if (node.password) {
            surgeLine += `, ${node.password}`;
          }
        }
        if (node.tls) {
          surgeLine = `${node.name} = https, ${node.server}, ${node.port}`; // HTTPS 代理
          if (node.username) {
            surgeLine += `, ${node.username}, ${node.password}`;
          }
          if (node.skipCertVerify) {
            surgeLine += `, skip-cert-verify=true`;
          }
          if (node.sni) {
            surgeLine += `, sni=${node.sni}`;
          }
        }
        if (node.tfo !== undefined) {
          surgeLine += `, tfo=${node.tfo}`;
        }
        break;
      case 'https': // 明确处理 https 类型
        surgeLine += `https, ${node.server}, ${node.port}`;
        if (node.username) {
          surgeLine += `, ${node.username}`;
          if (node.password) {
            surgeLine += `, ${node.password}`;
          }
        }
        if (node.skipCertVerify) {
          surgeLine += `, skip-cert-verify=true`;
        }
        if (node.sni) {
          surgeLine += `, sni=${node.sni}`;
        }
        if (node.tfo !== undefined) {
          surgeLine += `, tfo=${node.tfo}`;
        }
        break;
      case 'socks5':
        surgeLine += `socks5, ${node.server}, ${node.port}`;
        if (node.username) {
          surgeLine += `, ${node.username}`;
          if (node.password) {
            surgeLine += `, ${node.password}`;
          }
        }
        if (node.tls) {
          surgeLine += `, tls=true`; // SOCKS5 over TLS
          if (node.skipCertVerify) {
            surgeLine += `, skip-cert-verify=true`;
          }
          if (node.sni) {
            surgeLine += `, sni=${node.sni}`;
          }
        }
        if (node.udpRelay !== undefined) {
          surgeLine += `, udp-relay=${node.udpRelay}`;
        }
        break;
      case 'ssr': // Surge 不直接支持 SSR，可以尝试转换为 SS
        this.logger.warn(`SSR node type is not directly supported by Surge, attempting conversion to SS: ${node.name}`);
        surgeLine += `ss, ${node.server}, ${node.port}, encrypt-method=${node.cipher}, password=${node.password}`;
        if (node.obfs && node.obfs !== 'plain') { // 如果有混淆且不是 plain
          surgeLine += `, obfs=${node.obfs}`;
          if (node.obfsParam) {
            surgeLine += `, obfs-host=${node.obfsParam}`;
          }
        }
        // SSR 的 UDP 行为可能与 Surge 的 udp-relay 不同，这里不添加
        break;
      case 'vless': // Surge 不直接支持 VLESS
        this.logger.warn(`VLESS node type is not supported by Surge: ${node.name}`);
        return null;
      default:
        this.logger.warn(`Unsupported node type for Surge: ${node.type}`, { nodeName: node.name });
        return null;
    }

    // 添加通用 Surge 参数
    if (node.testUrl) {
      surgeLine += `, test-url=${node.testUrl}`;
    }
    if (node.hidden !== undefined) {
      surgeLine += `, hidden=${node.hidden}`;
    }
    // ... 可以添加更多 Surge 支持的通用参数

    return surgeLine;
  }

  /**
   * 将节点格式化为 Sing-Box 配置格式
   * @param {Object} node 节点对象
   * @returns {Object} Sing-Box 出站配置对象
   */
  formatNodeForSingBox(node) {
    let config = {
      tag: node.name,
      type: node.type,
      server: node.server,
      server_port: node.port,
    };

    switch (node.type) {
      case 'ss':
        config.method = node.cipher;
        config.password = node.password;
        if (node.plugin === 'obfs') {
          config.plugin = 'obfs';
          config.plugin_opts = `obfs=${node.pluginOpts?.mode || 'http'};obfs-host=${node.pluginOpts?.host || node.server}`;
        } else if (node.plugin === 'v2ray-plugin') {
          config.plugin = 'v2ray-plugin';
          config.plugin_opts = `mode=websocket;tls=${node.pluginOpts?.tls || false};host=${node.pluginOpts?.host || node.server};path=${node.pluginOpts?.path || '/'};skip-cert-verify=${node.pluginOpts?.skipCertVerify || false}`;
        }
        break;
      case 'ssr':
        config.type = 'shadowsocksr'; // Sing-Box 中 SSR 类型为 shadowsocksr
        config.method = node.cipher;
        config.password = node.password;
        config.protocol = node.protocol;
        config.protocol_param = node.protocolParam;
        config.obfs = node.obfs;
        config.obfs_param = node.obfsParam;
        config.udp = node.udp ?? true; // SSR 默认支持 UDP
        break;
      case 'vmess':
        config.uuid = node.uuid;
        config.alter_id = node.alterId;
        config.security = node.cipher || 'auto';
        config.udp = node.udp ?? false;
        if (node.network) {
          config.transport = {
            type: node.network,
          };
          if (node.network === 'ws') {
            config.transport.path = node.wsOpts?.path || '/';
            config.transport.headers = node.wsOpts?.headers || {};
          } else if (node.network === 'h2') {
            config.transport.host = node.h2Opts?.host || node.server;
            config.transport.path = node.h2Opts?.path || '/';
          } else if (node.network === 'grpc') {
            config.transport.service_name = node.grpcOpts?.serviceName;
          }
        }
        if (node.tls) {
          config.tls = {
            enabled: true,
            server_name: node.serverName || node.sni,
            insecure: node.skipCertVerify || false,
          };
          if (node.fingerprint) {
            config.tls.utls = { enabled: true, fingerprint: node.fingerprint };
          }
        }
        break;
      case 'trojan':
        config.password = node.password;
        config.udp = node.udp ?? false;
        config.tls = {
          enabled: true,
          server_name: node.sni || node.serverName,
          insecure: node.skipCertVerify || false,
        };
        if (node.fingerprint) {
          config.tls.utls = { enabled: true, fingerprint: node.fingerprint };
        }
        if (node.network) {
          config.transport = {
            type: node.network,
          };
          if (node.network === 'ws') {
            config.transport.path = node.wsOpts?.path || '/';
            config.transport.headers = node.wsOpts?.headers || {};
          } else if (node.network === 'grpc') {
            config.transport.service_name = node.grpcOpts?.serviceName;
          }
        }
        break;
      case 'vless':
        config.uuid = node.uuid;
        config.flow = node.flow || '';
        config.udp = node.udp ?? false;
        if (node.network) {
          config.transport = {
            type: node.network,
          };
          if (node.network === 'ws') {
            config.transport.path = node.wsOpts?.path || '/';
            config.transport.headers = node.wsOpts?.headers || {};
          } else if (node.network === 'grpc') {
            config.transport.service_name = node.grpcOpts?.serviceName;
          }
        }
        if (node.tls) {
          config.tls = {
            enabled: true,
            server_name: node.serverName || node.sni,
            insecure: node.skipCertVerify || false,
          };
          if (node.realityOpts) {
            config.tls.reality = {
              enabled: true,
              public_key: node.realityOpts.publicKey,
              short_id: node.realityOpts.shortId,
            };
          } else if (node.fingerprint) {
            config.tls.utls = { enabled: true, fingerprint: node.fingerprint };
          }
        }
        break;
      case 'http':
      case 'https':
        config.type = 'http'; // Sing-Box 统一为 http
        if (node.username) {
          config.username = node.username;
          config.password = node.password;
        }
        if (node.tls) {
          config.tls = {
            enabled: true,
            server_name: node.sni,
            insecure: node.skipCertVerify || false,
          };
        }
        break;
      case 'socks5':
        config.type = 'socks'; // Sing-Box SOCKS5 类型为 socks
        if (node.username) {
          config.username = node.username;
          config.password = node.password;
        }
        if (node.tls) {
          config.tls = {
            enabled: true,
            server_name: node.sni,
            insecure: node.skipCertVerify || false,
          };
        }
        config.udp = node.udp ?? true; // SOCKS5 默认支持 UDP
        break;
      default:
        this.logger.warn(`Unsupported node type for Sing-Box: ${node.type}`, { nodeName: node.name });
        return null;
    }

    return config;
  }

  /**
   * 将节点格式化为 V2Ray (V2Fly / Xray) 配置格式
   * @param {Object} node 节点对象
   * @returns {Object} V2Ray 出站配置对象
   */
  formatNodeForV2Ray(node) {
    let config = {
      tag: node.name,
      protocol: node.type,
      settings: {},
      streamSettings: {
        network: node.network || 'tcp',
        security: node.tls ? 'tls' : 'none',
      },
    };

    switch (node.type) {
      case 'vmess':
        config.settings = {
          vnext: [{
            address: node.server,
            port: node.port,
            users: [{
              id: node.uuid,
              alterId: node.alterId,
              security: node.cipher || 'auto',
            }]
          }]
        };
        if (config.streamSettings.network === 'ws') {
          config.streamSettings.wsSettings = {
            path: node.wsOpts?.path || '/',
            headers: node.wsOpts?.headers || {},
          };
        } else if (config.streamSettings.network === 'h2') {
          config.streamSettings.httpSettings = { // V2Ray 使用 httpSettings for h2
            host: [node.h2Opts?.host || node.server],
            path: node.h2Opts?.path || '/',
          };
        } else if (config.streamSettings.network === 'grpc') {
          config.streamSettings.grpcSettings = {
            serviceName: node.grpcOpts?.serviceName,
            multiMode: node.grpcOpts?.mode === 'multi', // 假设 multiMode
          };
        }
        if (config.streamSettings.security === 'tls') {
          config.streamSettings.tlsSettings = {
            serverName: node.serverName || node.sni,
            allowInsecure: node.skipCertVerify || false,
            fingerprint: node.fingerprint || '', // V2Ray/Xray fingerprint
          };
        }
        break;
      case 'vless':
        config.settings = {
          vnext: [{
            address: node.server,
            port: node.port,
            users: [{
              id: node.uuid,
              flow: node.flow || '',
              encryption: node.encryption || 'none', // VLESS encryption 通常是 none
            }]
          }]
        };
        if (config.streamSettings.network === 'ws') {
          config.streamSettings.wsSettings = {
            path: node.wsOpts?.path || '/',
            headers: node.wsOpts?.headers || {},
          };
        } else if (config.streamSettings.network === 'grpc') {
          config.streamSettings.grpcSettings = {
            serviceName: node.grpcOpts?.serviceName,
            multiMode: node.grpcOpts?.mode === 'multi',
          };
        }
        if (config.streamSettings.security === 'tls') {
          config.streamSettings.tlsSettings = {
            serverName: node.serverName || node.sni,
            allowInsecure: node.skipCertVerify || false,
            fingerprint: node.fingerprint || '',
          };
          if (node.realityOpts) {
            config.streamSettings.realitySettings = { // Xray REALITY
              show: false, // 通常 show 为 false
              fingerprint: node.fingerprint || 'chrome', // 需要 fingerprint
              serverName: config.streamSettings.tlsSettings.serverName,
              publicKey: node.realityOpts.publicKey,
              shortId: node.realityOpts.shortId,
              spiderX: node.realityOpts.spiderX || '',
            };
            config.streamSettings.security = 'reality'; // 覆盖 security
          }
        }
        break;
      case 'trojan':
        config.settings = {
          servers: [{
            address: node.server,
            port: node.port,
            password: node.password,
            flow: node.flow || '', // Trojan flow
          }]
        };
        // Trojan 必须使用 TLS
        config.streamSettings.security = 'tls';
        config.streamSettings.tlsSettings = {
          serverName: node.sni || node.serverName,
          allowInsecure: node.skipCertVerify || false,
          fingerprint: node.fingerprint || '',
        };
        if (config.streamSettings.network === 'ws') {
          config.streamSettings.wsSettings = {
            path: node.wsOpts?.path || '/',
            headers: node.wsOpts?.headers || {},
          };
        } else if (config.streamSettings.network === 'grpc') {
          config.streamSettings.grpcSettings = {
            serviceName: node.grpcOpts?.serviceName,
            multiMode: node.grpcOpts?.mode === 'multi',
          };
        }
        break;
      case 'ss': // Shadowsocks
        config.protocol = 'shadowsocks';
        config.settings = {
          servers: [{
            address: node.server,
            port: node.port,
            method: node.cipher,
            password: node.password,
            ota: false, // V2Ray/Xray SS 不支持 OTA
            level: 1,
          }]
        };
        // SS over TLS/WS (需要 v2ray-plugin 或类似实现，这里简化处理)
        if (node.plugin === 'obfs' || node.plugin === 'v2ray-plugin') {
          this.logger.warn(`SS with plugin (${node.plugin}) is complex to convert directly to V2Ray/Xray format. Skipping stream settings for ${node.name}`);
        }
        // V2Ray/Xray 的 SS 出站默认支持 UDP
        break;
      case 'socks': // SOCKS5
        config.protocol = 'socks';
        config.settings = {
          servers: [{
            address: node.server,
            port: node.port,
            users: node.username ? [{ user: node.username, pass: node.password, level: 1 }] : [],
          }]
        };
        if (node.tls) {
          config.streamSettings.security = 'tls';
          config.streamSettings.tlsSettings = {
            serverName: node.sni,
            allowInsecure: node.skipCertVerify || false,
          };
        }
        // V2Ray/Xray 的 SOCKS 出站默认支持 UDP
        break;
      case 'http': // HTTP/HTTPS
        config.protocol = 'http';
        config.settings = {
          servers: [{
            address: node.server,
            port: node.port,
            users: node.username ? [{ user: node.username, pass: node.password, level: 1 }] : [],
          }]
        };
        if (node.tls) {
          config.streamSettings.security = 'tls';
          config.streamSettings.tlsSettings = {
            serverName: node.sni,
            allowInsecure: node.skipCertVerify || false,
          };
        }
        break;
      default:
        this.logger.warn(`Unsupported node type for V2Ray/Xray: ${node.type}`, { nodeName: node.name });
        return null;
    }

    // 清理空的 streamSettings
    if (Object.keys(config.streamSettings).length === 2 && config.streamSettings.network === 'tcp' && config.streamSettings.security === 'none') {
      delete config.streamSettings;
    } else if (config.streamSettings.security === 'none') {
      delete config.streamSettings.security; // 如果是 none，则不需要 security 字段
    }

    return config;
  }
}