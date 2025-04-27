import { SubscriptionFetcher } from './fetcher/SubscriptionFetcher.js';
import { SubscriptionParser } from './parser/SubscriptionParser.js';
import { NodeDeduplicator } from './dedup/NodeDeduplicator.js';
import { FormatConverter } from './formats/FormatConverter.js';
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

// 确保指标记录函数存在
if (!metrics?.recordFetch) {
  metrics.recordFetch = () => {};
}
if (!metrics?.recordParse) {
  metrics.recordParse = () => {};
}
if (!metrics?.recordDedup) {
  metrics.recordDedup = () => {};
}
if (!metrics?.recordConversion) {
  metrics.recordConversion = () => {};
}

export class SubscriptionConverter {
  constructor(options = {}) {
    // 初始化组件
    this.fetcher = new SubscriptionFetcher(options.fetch);
    this.parser = new SubscriptionParser();
    this.deduplicator = new NodeDeduplicator();
    this.converter = new FormatConverter();

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
          if (metrics?.recordFetch) {
            metrics.recordFetch(source, true, fetchTime, fetchData.data.length);
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
          if (metrics?.recordFetch) {
            metrics.recordFetch(source, false);
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
          if (metrics?.recordParse) {
            metrics.recordParse('auto', true, parseTime, nodes.length);
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
          if (metrics?.recordParse) {
            metrics.recordParse('auto', false);
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
          if (metrics?.recordDedup) {
            metrics.recordDedup(beforeCount, afterCount, dedupTime);
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
        result = await this.converter.convert(nodes, targetFormat, convertOptions.template);

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
        if (metrics?.recordConversion) {
          metrics.recordConversion(targetFormat, true, totalTime, nodes.length);
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
        if (metrics?.recordConversion) {
          metrics.recordConversion(targetFormat, false);
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
        case 'singbox':
          return this.formatNodeForSingBox(node);
        case 'v2ray':
          return this.formatNodeForV2Ray(node);
        case 'raw':
          // 直接返回原始节点数据的字符串表示
          return JSON.stringify(node);
        default:
          this.logger.warn(`Unsupported format: ${format}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Error formatting node for ${format}: ${error.message}`, {
        nodeName: node?.name,
        error: error.message
      });
      return null;
    }
  }

  /**
   * 将节点格式化为Clash/Mihomo格式
   * @param {Object} node 节点对象
   * @returns {string} Clash格式的节点配置
   */
  formatNodeForClash(node) {
    try {
      // 基本配置
      let config = `  - name: ${node.name}\n    type: ${node.type}\n    server: ${node.server}\n    port: ${node.port}`;

      // 根据不同协议添加特定配置
      switch (node.type) {
        case 'vmess':
          config += `\n    uuid: ${node.settings.id}`;
          if (node.settings.alterId !== undefined) {
            config += `\n    alterId: ${node.settings.alterId}`;
          }
          if (node.settings.network) {
            config += `\n    network: ${node.settings.network}`;
          }
          if (node.settings.tls) {
            config += `\n    tls: true`;
            if (node.settings.serverName) {
              config += `\n    servername: ${node.settings.serverName}`;
            }
          }
          if (node.settings.network === 'ws') {
            config += `\n    ws-opts:`;
            if (node.settings.wsPath) {
              config += `\n      path: ${node.settings.wsPath}`;
            }
            if (node.settings.wsHeaders && Object.keys(node.settings.wsHeaders).length > 0) {
              config += `\n      headers:`;
              for (const [key, value] of Object.entries(node.settings.wsHeaders)) {
                config += `\n        ${key}: ${value}`;
              }
            }
          }
          break;
        case 'ss':
          config += `\n    cipher: ${node.settings.method}`;
          config += `\n    password: ${node.settings.password}`;
          break;
        case 'ssr':
          config += `\n    cipher: ${node.settings.method}`;
          config += `\n    password: ${node.settings.password}`;
          config += `\n    obfs: ${node.settings.obfs}`;
          config += `\n    protocol: ${node.settings.protocol}`;
          if (node.settings.obfsParam) {
            config += `\n    obfs-param: ${node.settings.obfsParam}`;
          }
          if (node.settings.protocolParam) {
            config += `\n    protocol-param: ${node.settings.protocolParam}`;
          }
          break;
        case 'trojan':
          config += `\n    password: ${node.settings.password}`;
          if (node.settings.sni) {
            config += `\n    sni: ${node.settings.sni}`;
          }
          if (node.settings.skipCertVerify !== undefined) {
            config += `\n    skip-cert-verify: ${node.settings.skipCertVerify}`;
          }
          break;
        case 'http':
          config += `\n    username: ${node.settings.username || ''}`;
          config += `\n    password: ${node.settings.password || ''}`;
          if (node.settings.tls) {
            config += `\n    tls: true`;
            if (node.settings.skipCertVerify !== undefined) {
              config += `\n    skip-cert-verify: ${node.settings.skipCertVerify}`;
            }
          }
          break;
        case 'socks':
          if (node.settings.username) {
            config += `\n    username: ${node.settings.username}`;
          }
          if (node.settings.password) {
            config += `\n    password: ${node.settings.password}`;
          }
          if (node.settings.tls) {
            config += `\n    tls: true`;
            if (node.settings.skipCertVerify !== undefined) {
              config += `\n    skip-cert-verify: ${node.settings.skipCertVerify}`;
            }
          }
          break;
        default:
          throw new Error(`Unsupported node type for Clash: ${node.type}`);
      }

      // 添加标签和分组信息
      if (node.extra && node.extra.tags && Array.isArray(node.extra.tags) && node.extra.tags.length > 0) {
        config += `\n    tags: [${node.extra.tags.map(tag => `"${tag}"`).join(', ')}]`;
      }

      return config;
    } catch (error) {
      this.logger.error(`Error formatting node for Clash: ${error.message}`);
      return null;
    }
  }

  /**
   * 将节点格式化为Surge格式
   * @param {Object} node 节点对象
   * @returns {string} Surge格式的节点配置
   */
  formatNodeForSurge(node) {
    try {
      let config = '';
      
      switch (node.type) {
        case 'vmess':
          config = `${node.name} = vmess, ${node.server}, ${node.port}, username=${node.settings.id}`;
          if (node.settings.network === 'ws') {
            config += `, ws=true`;
            if (node.settings.wsPath) {
              config += `, ws-path=${node.settings.wsPath}`;
            }
            if (node.settings.wsHeaders && node.settings.wsHeaders.Host) {
              config += `, ws-headers=Host:${node.settings.wsHeaders.Host}`;
            }
          }
          if (node.settings.tls) {
            config += `, tls=true`;
            if (node.settings.serverName) {
              config += `, sni=${node.settings.serverName}`;
            }
          }
          break;
        case 'ss':
          config = `${node.name} = ss, ${node.server}, ${node.port}, encrypt-method=${node.settings.method}, password=${node.settings.password}`;
          break;
        case 'trojan':
          config = `${node.name} = trojan, ${node.server}, ${node.port}, password=${node.settings.password}`;
          if (node.settings.sni) {
            config += `, sni=${node.settings.sni}`;
          }
          break;
        case 'http':
          config = `${node.name} = http, ${node.server}, ${node.port}`;
          if (node.settings.username) {
            config += `, username=${node.settings.username}`;
          }
          if (node.settings.password) {
            config += `, password=${node.settings.password}`;
          }
          if (node.settings.tls) {
            config += `, tls=true`;
            if (node.settings.skipCertVerify !== undefined && node.settings.skipCertVerify) {
              config += `, skip-cert-verify=true`;
            }
          }
          break;
        case 'socks':
          config = `${node.name} = socks5, ${node.server}, ${node.port}`;
          if (node.settings.username) {
            config += `, username=${node.settings.username}`;
          }
          if (node.settings.password) {
            config += `, password=${node.settings.password}`;
          }
          if (node.settings.tls) {
            config += `, tls=true`;
            if (node.settings.skipCertVerify !== undefined && node.settings.skipCertVerify) {
              config += `, skip-cert-verify=true`;
            }
          }
          break;
        default:
          throw new Error(`Unsupported node type for Surge: ${node.type}`);
      }
      
      return config;
    } catch (error) {
      this.logger.error(`Error formatting node for Surge: ${error.message}`);
      return null;
    }
  }

  /**
   * 将节点格式化为SingBox格式
   * @param {Object} node 节点对象
   * @returns {string} SingBox格式的节点配置JSON字符串
   */
  formatNodeForSingBox(node) {
    try {
      // 这个方法通常直接在generateConfigs中使用，不需要单独格式化为字符串
      // 但为了保持API一致性，这里返回一个JSON字符串
      let config = {};
      
      switch (node.type) {
        case 'vmess':
          config = {
            type: 'vmess',
            tag: node.name,
            server: node.server,
            server_port: parseInt(node.port),
            uuid: node.settings.id,
            security: node.settings.security || 'auto',
            alter_id: parseInt(node.settings.alterId || 0)
          };
          
          if (node.settings.network === 'ws') {
            config.transport = {
              type: 'ws',
              path: node.settings.wsPath || '/',
              headers: {
                Host: (node.settings.wsHeaders && node.settings.wsHeaders.Host) || node.server
              }
            };
          }
          
          if (node.settings.tls) {
            config.tls = {
              enabled: true,
              server_name: node.settings.serverName || node.server,
              insecure: node.settings.allowInsecure || false
            };
          }
          break;
        case 'ss':
          config = {
            type: 'shadowsocks',
            tag: node.name,
            server: node.server,
            server_port: parseInt(node.port),
            method: node.settings.method,
            password: node.settings.password
          };
          break;
        case 'trojan':
          config = {
            type: 'trojan',
            tag: node.name,
            server: node.server,
            server_port: parseInt(node.port),
            password: node.settings.password
          };
          
          if (node.settings.sni) {
            config.tls = {
              enabled: true,
              server_name: node.settings.sni,
              insecure: node.settings.allowInsecure || false
            };
          }
          break;
        case 'http':
          config = {
            type: 'http',
            tag: node.name,
            server: node.server,
            server_port: parseInt(node.port)
          };
          
          if (node.settings.username) {
            config.username = node.settings.username;
          }
          
          if (node.settings.password) {
            config.password = node.settings.password;
          }
          
          if (node.settings.tls) {
            config.tls = {
              enabled: true,
              insecure: node.settings.skipCertVerify || false
            };
          }
          break;
        case 'socks':
          config = {
            type: 'socks',
            tag: node.name,
            server: node.server,
            server_port: parseInt(node.port)
          };
          
          if (node.settings.username) {
            config.username = node.settings.username;
          }
          
          if (node.settings.password) {
            config.password = node.settings.password;
          }
          
          if (node.settings.tls) {
            config.tls = {
              enabled: true,
              insecure: node.settings.skipCertVerify || false
            };
          }
          break;
        default:
          return null;
      }
      
      return JSON.stringify(config);
    } catch (error) {
      this.logger.error(`Error formatting node for SingBox: ${error.message}`);
      return null;
    }
  }

  /**
   * 将节点格式化为V2Ray格式
   * @param {Object} node 节点对象
   * @returns {string} V2Ray格式的节点配置JSON字符串
   */
  formatNodeForV2Ray(node) {
    try {
      // 这个方法通常直接在generateConfigs中使用，不需要单独格式化为字符串
      // 但为了保持API一致性，这里返回一个JSON字符串
      let config = {};
      
      switch (node.type) {
        case 'vmess':
          config = {
            protocol: 'vmess',
            tag: node.name,
            settings: {
              vnext: [{
                address: node.server,
                port: parseInt(node.port),
                users: [{
                  id: node.settings.id,
                  alterId: parseInt(node.settings.alterId || 0),
                  security: node.settings.security || 'auto'
                }]
              }]
            }
          };
          
          if (node.settings.network === 'ws' || node.settings.tls) {
            config.streamSettings = {};
            
            if (node.settings.network === 'ws') {
              config.streamSettings.network = 'ws';
              config.streamSettings.wsSettings = {
                path: node.settings.wsPath || '/',
                headers: {
                  Host: (node.settings.wsHeaders && node.settings.wsHeaders.Host) || node.server
                }
              };
            }
            
            if (node.settings.tls) {
              config.streamSettings.security = 'tls';
              config.streamSettings.tlsSettings = {
                serverName: node.settings.serverName || node.server,
                allowInsecure: node.settings.allowInsecure || false
              };
            }
          }
          break;
        case 'ss':
          config = {
            protocol: 'shadowsocks',
            tag: node.name,
            settings: {
              servers: [{
                address: node.server,
                port: parseInt(node.port),
                method: node.settings.method,
                password: node.settings.password
              }]
            }
          };
          break;
        case 'trojan':
          config = {
            protocol: 'trojan',
            tag: node.name,
            settings: {
              servers: [{
                address: node.server,
                port: parseInt(node.port),
                password: node.settings.password
              }]
            }
          };
          
          if (node.settings.sni) {
            config.streamSettings = {
              security: 'tls',
              tlsSettings: {
                serverName: node.settings.sni,
                allowInsecure: node.settings.allowInsecure || false
              }
            };
          }
          break;
        case 'http':
          config = {
            protocol: 'http',
            tag: node.name,
            settings: {
              servers: [{
                address: node.server,
                port: parseInt(node.port)
              }]
            }
          };
          
          if (node.settings.username && node.settings.password) {
            config.settings.servers[0].users = [{
              user: node.settings.username,
              pass: node.settings.password
            }];
          }
          
          if (node.settings.tls) {
            config.streamSettings = {
              security: 'tls',
              tlsSettings: {
                allowInsecure: node.settings.skipCertVerify || false
              }
            };
          }
          break;
        case 'socks':
          config = {
            protocol: 'socks',
            tag: node.name,
            settings: {
              servers: [{
                address: node.server,
                port: parseInt(node.port)
              }]
            }
          };
          
          if (node.settings.username && node.settings.password) {
            config.settings.servers[0].users = [{
              user: node.settings.username,
              pass: node.settings.password
            }];
          }
          
          if (node.settings.tls) {
            config.streamSettings = {
              security: 'tls',
              tlsSettings: {
                allowInsecure: node.settings.skipCertVerify || false
              }
            };
          }
          break;
        default:
          return null;
      }
      
      return JSON.stringify(config);
    } catch (error) {
      this.logger.error(`Error formatting node for V2Ray: ${error.message}`);
      return null;
    }
  }
}