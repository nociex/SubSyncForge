/**
 * 同步订阅脚本
 * 用于从配置的订阅源获取数据，转换为目标格式并保存
 */

// 导入依赖
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SubscriptionConverter } from '../converter/SubscriptionConverter.js';
import yaml from 'js-yaml';

// 设置 ES 模块中的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置日志级别
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
console.log(`[Logger] Setting log level to: ${LOG_LEVEL}`);
const DEBUG = LOG_LEVEL === 'debug';

// 获取项目根目录
const rootDir = path.resolve(__dirname, '../..');
console.log(`项目根目录: ${rootDir}`);

// 订阅类型
const SubscriptionType = {
  URL: 'url',
  BASE64: 'base64',
  VMESS: 'vmess',
  SS: 'ss',
  SSR: 'ssr',
  TROJAN: 'trojan'
};

// 目标转换格式
const ConversionFormat = {
  CLASH: 'clash',
  MIHOMO: 'mihomo',
  SURGE: 'surge',
  SINGBOX: 'singbox',
  V2RAY: 'v2ray'
};

// 基本配置
const CONFIG = {
  rootDir: rootDir,
  configFile: path.resolve(rootDir, 'config/custom.yaml'),
  subscriptions: [],
  outputConfigs: [],
  options: {
    deduplication: true,
    dataDir: 'data',
    outputDir: 'output'
  },
  advanced: {
    logLevel: 'info',
    cacheTtl: 3600,
    proxyForSubscription: false,
    sortNodes: true,
    syncInterval: 360
  }
};

// 确保目录存在
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    console.log(`创建目录: ${directory}`);
  }
}

// 从配置文件中读取订阅源和配置
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG.configFile)) {
      console.warn(`配置文件不存在: ${CONFIG.configFile}`);
      
      // 尝试在当前工作目录下查找
      const cwdConfigPath = path.resolve(process.cwd(), 'config/custom.yaml');
      console.log(`尝试在当前工作目录查找配置: ${cwdConfigPath}`);
      
      if (fs.existsSync(cwdConfigPath)) {
        CONFIG.configFile = cwdConfigPath;
        console.log(`找到配置文件: ${CONFIG.configFile}`);
      } else {
        return false;
      }
    }

    const content = fs.readFileSync(CONFIG.configFile, 'utf-8');
    const config = yaml.load(content);

    if (!config) {
      console.warn('配置文件内容为空');
      return false;
    }

    // 加载订阅源
    if (config.subscriptions && Array.isArray(config.subscriptions)) {
      CONFIG.subscriptions = config.subscriptions;
    } else if (typeof config.subscriptions === 'object') {
      // 处理对象格式的订阅源
      CONFIG.subscriptions = Object.entries(config.subscriptions).map(([key, sub]) => ({
        name: key,
        url: sub.url,
        enabled: sub.enabled !== false,
        type: 'url'
      }));
    } else {
      console.warn('配置文件中未找到有效的订阅源配置');
      CONFIG.subscriptions = [];
    }

    // 加载输出配置
    if (config.output) {
      if (config.output.deduplication !== undefined) {
        CONFIG.options.deduplication = config.output.deduplication;
      }
      
      if (config.output.dir) {
        CONFIG.options.outputDir = config.output.dir;
      }
      
      if (config.output.data_dir) {
        CONFIG.options.dataDir = config.output.data_dir;
      }
      
      if (config.output.configs && Array.isArray(config.output.configs)) {
        CONFIG.outputConfigs = config.output.configs;
      }
    }

    // 加载高级设置
    if (config.advanced) {
      if (config.advanced.log_level) {
        CONFIG.advanced.logLevel = config.advanced.log_level;
      }
      
      if (config.advanced.cache_ttl) {
        CONFIG.advanced.cacheTtl = config.advanced.cache_ttl;
      }
      
      if (config.advanced.proxy_for_subscription !== undefined) {
        CONFIG.advanced.proxyForSubscription = config.advanced.proxy_for_subscription;
      }
      
      if (config.advanced.sort_nodes !== undefined) {
        CONFIG.advanced.sortNodes = config.advanced.sort_nodes;
      }
      
      if (config.advanced.sync_interval) {
        CONFIG.advanced.syncInterval = config.advanced.sync_interval;
      }
    }

    return CONFIG.subscriptions.length > 0;
  } catch (error) {
    console.error('解析配置文件失败:', error.message);
    return false;
  }
}

// 合并所有订阅节点
async function fetchAndMergeAllNodes(converter) {
  const allNodes = [];
  
  console.log(`准备获取 ${CONFIG.subscriptions.length} 个订阅源的节点`);
  
  for (const subscription of CONFIG.subscriptions) {
    if (!subscription.enabled) {
      console.log(`跳过禁用的订阅: ${subscription.name}`);
      continue;
    }
    
    try {
      console.log(`处理订阅: ${subscription.name}, 类型: ${subscription.type || 'url'}, URL: ${subscription.url || '(BASE64/直接内容)'}`);
      
      let result;
      
      // 根据订阅类型处理
      if (subscription.type === SubscriptionType.BASE64 && subscription.content) {
        // 处理Base64内容
        console.log(`解析Base64订阅内容: ${subscription.name}`);
        result = await converter.parser.parse(subscription.content);
        console.log(`解析Base64订阅: ${subscription.name}, 获取 ${result.length} 个节点`);
      } else if ([SubscriptionType.VMESS, SubscriptionType.SS, SubscriptionType.SSR, SubscriptionType.TROJAN].includes(subscription.type) && subscription.content) {
        // 处理单个节点
        console.log(`解析单个${subscription.type}节点: ${subscription.name}`);
        const node = await converter.parser.parseLine(subscription.content);
        result = node ? [node] : [];
        console.log(`解析${subscription.type}节点: ${subscription.name}, 成功: ${result.length > 0}`);
      } else if (subscription.url) {
        // 获取URL订阅
        console.log(`从URL获取订阅: ${subscription.url}`);
        try {
          // 直接使用fetcher获取数据，而不是通过convert方法
          const fetchResult = await converter.fetcher.fetch(subscription.url);
          const rawData = fetchResult.data;
          
          console.log(`成功获取订阅: ${subscription.name}, 原始数据大小: ${rawData.length} 字节`);
          
          // 保存原始数据
          const dataDir = path.join(CONFIG.rootDir, CONFIG.options.dataDir);
          ensureDirectoryExists(dataDir);
          const rawFile = path.join(dataDir, `${subscription.name}.txt`);
          fs.writeFileSync(rawFile, rawData);
          
          // 解析节点
          console.log(`解析订阅数据...`);
          result = await converter.parser.parse(rawData);
          console.log(`从 ${subscription.name} 解析出 ${result.length} 个节点`);
          
          console.log(`保存原始订阅到: ${rawFile} (${result.length} 个节点)`);
        } catch (fetchError) {
          console.error(`获取订阅 ${subscription.url} 时出错:`, fetchError);
          throw new Error(`获取订阅失败: ${fetchError.message}`);
        }
      }
      
      if (result && result.length > 0) {
        console.log(`从 ${subscription.name} 获取到 ${result.length} 个节点`);
        
        // 添加订阅源信息
        result.forEach(node => {
          if (!node.extra) node.extra = {};
          node.extra.source = subscription.name;
        });
        
        allNodes.push(...result);
      } else {
        console.warn(`从 ${subscription.name} 未获取到任何节点`);
      }
    } catch (error) {
      console.error(`处理订阅 ${subscription.name} 时出错:`, error.message);
    }
  }
  
  console.log(`从所有订阅源共获取到 ${allNodes.length} 个节点`);
  
  // 如果启用去重，进行节点去重
  let finalNodes = allNodes;
  if (CONFIG.options.deduplication && allNodes.length > 0) {
    console.log(`正在进行节点去重...`);
    finalNodes = await converter.deduplicator.dedup(allNodes);
    console.log(`节点去重: ${allNodes.length} -> ${finalNodes.length}`);
  }
  
  return finalNodes;
}

/**
 * 生成各种配置文件
 * @param {Array} nodes 所有节点
 * @param {Object} outputConfigs 输出配置
 * @param {Object} options 全局选项
 */
async function generateConfigs(nodes, outputConfigs, options) {
  const converter = new SubscriptionConverter();
  const rootDir = options.rootDir || process.cwd();
  const outputDir = path.join(rootDir, options.outputDir || 'output');
  ensureDirectoryExists(outputDir);
  
  console.log(`准备生成 ${outputConfigs.length} 个配置文件`);
  console.log(`输出目录: ${outputDir}`);
  
  for (const output of outputConfigs) {
    try {
      // 如果配置被禁用，则跳过
      if (output.enabled === false) {
        console.log(`跳过禁用的输出配置: ${output.name}`);
        continue;
      }
      
      const { name, format, template: templateFile, path: outputFile } = output;
      const actualFormat = format || name; // 兼容旧格式，使用name作为format的备选
      
      if (!actualFormat || !outputFile) {
        console.error(`输出配置缺少必要参数: ${JSON.stringify(output)}`);
        continue;
      }
      
      console.log(`生成 ${actualFormat} 格式配置: ${outputFile}`);
      
      const outputPath = path.join(outputDir, outputFile);
      ensureDirectoryExists(path.dirname(outputPath));
      
      // 处理模板
      if (templateFile) {
        const templatePath = path.join(rootDir, templateFile);
        console.log(`使用模板: ${templatePath}`);
        
        if (!fs.existsSync(templatePath)) {
          console.error(`模板文件不存在: ${templatePath}`);
          continue;
        }
        
        let templateContent = fs.readFileSync(templatePath, 'utf-8');
        console.log(`模板大小: ${templateContent.length} 字节`);
        
        // 替换一些通用变量
        templateContent = templateContent.replace(/\{\{random\}\}/g, Math.random().toString(36).substring(2));
        templateContent = templateContent.replace(/\{\{generateUrl\}\}/g, `https://example.com/${name}.conf`);
        
        // 根据不同格式处理模板
        if (actualFormat.toUpperCase() === 'SINGBOX' || actualFormat.toUpperCase() === 'V2RAY') {
          // JSON 格式的配置
          try {
            console.log(`处理JSON格式模板: ${actualFormat}`);
            const templateJson = JSON.parse(templateContent);
            let configWithNodes = { ...templateJson };
            
            if (actualFormat.toUpperCase() === 'SINGBOX') {
              // Sing-box 格式处理
              console.log(`处理SingBox格式，节点数: ${nodes.length}`);
              if (!configWithNodes.outbounds) {
                configWithNodes.outbounds = [];
              }
              
              // 添加代理节点
              const proxyOutbounds = nodes.map(node => {
                switch (node.type) {
                  case 'vmess':
                    return {
                      type: 'vmess',
                      tag: node.name,
                      server: node.server,
                      server_port: parseInt(node.port),
                      uuid: node.settings.id,
                      security: node.settings.security || 'auto',
                      alter_id: parseInt(node.settings.alterId || 0),
                      ...(node.settings.network === 'ws' && {
                        transport: {
                          type: 'ws',
                          path: node.settings.wsPath || '/',
                          headers: {
                            Host: (node.settings.wsHeaders && node.settings.wsHeaders.Host) || node.server
                          }
                        }
                      }),
                      ...(node.settings.tls && {
                        tls: {
                          enabled: true,
                          server_name: node.settings.serverName || node.server,
                          insecure: node.settings.allowInsecure || false
                        }
                      })
                    };
                  case 'ss':
                    return {
                      type: 'shadowsocks',
                      tag: node.name,
                      server: node.server,
                      server_port: parseInt(node.port),
                      method: node.settings.method,
                      password: node.settings.password
                    };
                  case 'trojan':
                    return {
                      type: 'trojan',
                      tag: node.name,
                      server: node.server,
                      server_port: parseInt(node.port),
                      password: node.settings.password,
                      ...(node.settings.sni && {
                        tls: {
                          enabled: true,
                          server_name: node.settings.sni,
                          insecure: node.settings.allowInsecure || false
                        }
                      })
                    };
                  default:
                    return null;
                }
              }).filter(Boolean);
              
              // 找到模板中的outbounds占位符位置
              const existingOutboundsIndex = configWithNodes.outbounds.findIndex(outbound => outbound === '{{outbounds}}');
              if (existingOutboundsIndex !== -1) {
                // 在占位符位置插入节点
                configWithNodes.outbounds.splice(existingOutboundsIndex, 1, ...proxyOutbounds);
              } else {
                // 没有占位符，直接添加到outbounds数组
                configWithNodes.outbounds = [
                  ...configWithNodes.outbounds,
                  ...proxyOutbounds
                ];
              }
              
              // 添加代理群组标签
              const proxyTags = nodes.map(node => `"${node.name}"`).join(', ');
              
              // 替换proxyTags占位符
              if (templateContent.includes('{{proxyTags}}')) {
                const configStr = JSON.stringify(configWithNodes, null, 2).replace(/"{{proxyTags}}"/g, proxyTags);
                fs.writeFileSync(outputPath, configStr);
              } else {
                // 添加节点到现有selector
                const existingSelectors = configWithNodes.outbounds.filter(outbound => outbound.type === 'selector');
                if (existingSelectors.length > 0) {
                  for (const selector of existingSelectors) {
                    selector.outbounds = [
                      ...(selector.outbounds || []),
                      ...proxyOutbounds.map(p => p.tag)
                    ];
                  }
                }
                
                fs.writeFileSync(outputPath, JSON.stringify(configWithNodes, null, 2));
              }
              
              console.log(`已生成 ${actualFormat} 配置: ${outputPath} (${nodes.length} 个节点)`);
            } else if (actualFormat.toUpperCase() === 'V2RAY') {
              // V2Ray 格式处理
              console.log(`处理V2Ray格式，节点数: ${nodes.length}`);
              // 如果只使用第一个节点
              const useFirstNode = output.options?.use_first_node === true;
              const nodeToUse = useFirstNode ? nodes[0] : null;
              
              if (useFirstNode && nodeToUse) {
                // 使用第一个节点替换模板中的变量
                let contentStr = JSON.stringify(configWithNodes, null, 2);
                
                // 替换变量
                contentStr = contentStr.replace(/{{server}}/g, nodeToUse.server)
                  .replace(/{{port}}/g, nodeToUse.port)
                  .replace(/{{uuid}}/g, nodeToUse.settings.id || '')
                  .replace(/{{alterId}}/g, nodeToUse.settings.alterId || 0)
                  .replace(/{{network}}/g, nodeToUse.settings.network || 'tcp')
                  .replace(/{{security}}/g, nodeToUse.settings.tls ? 'tls' : 'none')
                  .replace(/{{serverName}}/g, nodeToUse.settings.serverName || nodeToUse.server)
                  .replace(/{{path}}/g, (nodeToUse.settings.wsPath || '/'))
                  .replace(/{{host}}/g, (nodeToUse.settings.wsHeaders && nodeToUse.settings.wsHeaders.Host) || nodeToUse.server);
                
                fs.writeFileSync(outputPath, contentStr);
                console.log(`已生成 ${actualFormat} 配置: ${outputPath} (使用第1个节点)`);
              } else {
                // 添加全部节点
                if (!configWithNodes.outbounds) {
                  configWithNodes.outbounds = [];
                }
                
                // 添加代理节点
                const proxyOutbounds = nodes.map(node => {
                  switch (node.type) {
                    case 'vmess':
                      return {
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
                        },
                        ...(node.settings.network === 'ws' && {
                          streamSettings: {
                            network: 'ws',
                            wsSettings: {
                              path: node.settings.wsPath || '/',
                              headers: {
                                Host: (node.settings.wsHeaders && node.settings.wsHeaders.Host) || node.server
                              }
                            },
                            ...(node.settings.tls && {
                              security: 'tls',
                              tlsSettings: {
                                serverName: node.settings.serverName || node.server,
                                allowInsecure: node.settings.allowInsecure || false
                              }
                            })
                          }
                        })
                      };
                    case 'ss':
                      return {
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
                    case 'trojan':
                      return {
                        protocol: 'trojan',
                        tag: node.name,
                        settings: {
                          servers: [{
                            address: node.server,
                            port: parseInt(node.port),
                            password: node.settings.password
                          }]
                        },
                        ...(node.settings.sni && {
                          streamSettings: {
                            security: 'tls',
                            tlsSettings: {
                              serverName: node.settings.sni,
                              allowInsecure: node.settings.allowInsecure || false
                            }
                          }
                        })
                      };
                    default:
                      return null;
                  }
                }).filter(Boolean);
                
                // 在第一个outbound前插入所有代理节点
                if (configWithNodes.outbounds.length > 0) {
                  configWithNodes.outbounds.splice(1, 0, ...proxyOutbounds);
                } else {
                  configWithNodes.outbounds = proxyOutbounds;
                }
                
                fs.writeFileSync(outputPath, JSON.stringify(configWithNodes, null, 2));
                console.log(`已生成 ${actualFormat} 配置: ${outputPath} (${nodes.length} 个节点)`);
              }
            }
          } catch (error) {
            console.error(`处理 ${actualFormat} 模板时出错:`, error);
            console.error(`错误堆栈: ${error.stack}`);
          }
        } else {
          // 文本格式使用字符串替换
          console.log(`处理文本格式模板: ${actualFormat}`);
          let formattedNodes = '';
          
          if (actualFormat.toUpperCase() === 'SURGE') {
            // Surge格式
            console.log(`处理Surge格式，节点数: ${nodes.length}`);
            formattedNodes = nodes.map(node => {
              const formatted = converter.formatNodeForTarget(node, 'surge');
              if (!formatted) {
                console.warn(`无法格式化节点 ${node.name} 为Surge格式`);
              }
              return formatted;
            }).filter(Boolean).join('\n');
            
            console.log(`生成的Surge节点数: ${formattedNodes.split('\n').length}`);
            
            // 在模板中查找 [Proxy] 部分并插入节点
            const proxySection = templateContent.match(/\[Proxy\]([\s\S]*?)(?=\[)/);
            if (proxySection) {
              // 如果存在[Proxy]部分，保留它的任何现有内容
              console.log(`在[Proxy]部分插入节点`);
              const existingProxies = proxySection[1].trim();
              const newProxies = existingProxies ? existingProxies + "\n" + formattedNodes : formattedNodes;
              templateContent = templateContent.replace(/\[Proxy\]([\s\S]*?)(?=\[)/, `[Proxy]\n${newProxies}\n\n`);
            } else {
              // 如果不存在，直接查找{{NODES}}标记
              console.log(`替换{{NODES}}标记`);
              templateContent = templateContent.replace(/\{\{\s*NODES\s*\}\}/gi, formattedNodes);
            }
          } else if (actualFormat.toUpperCase() === 'CLASH' || actualFormat.toUpperCase() === 'MIHOMO') {
            // Clash/Mihomo格式
            console.log(`处理${actualFormat}格式，节点数: ${nodes.length}`);
            formattedNodes = nodes.map(node => {
              const formatted = converter.formatNodeForTarget(node, 'clash');
              if (!formatted) {
                console.warn(`无法格式化节点 ${node.name} 为Clash格式`);
              }
              return formatted;
            }).filter(Boolean).join('\n');
            
            console.log(`生成的${actualFormat}节点数: ${formattedNodes.split('\n').length / 4}`); // 每个节点大约4行
            
            // 替换代理部分
            if (templateContent.includes('proxies:')) {
              console.log(`替换proxies部分`);
              templateContent = templateContent.replace(/proxies:\s*(\{\{\s*proxies\s*\}\})/gi, `proxies:\n${formattedNodes}`);
            }
            templateContent = templateContent.replace(/\{\{\s*proxies\s*\}\}/gi, formattedNodes);
            
            // 替换代理名称列表
            const proxyNames = nodes.map(node => `  - ${node.name}`).join('\n');
            console.log(`生成代理名称列表，数量: ${nodes.length}`);
            templateContent = templateContent.replace(/\{\{\s*proxyNames\s*\}\}/gi, proxyNames);
          } else {
            console.error(`不支持的格式: ${actualFormat}`);
            continue;
          }
          
          fs.writeFileSync(outputPath, templateContent);
          console.log(`已生成 ${actualFormat} 配置: ${outputPath} (${nodes.length} 个节点)`);
          console.log(`配置文件大小: ${fs.statSync(outputPath).size} 字节`);
        }
      } else {
        // 无模板，只输出节点列表
        console.log(`无模板，直接输出节点列表: ${outputFile}`);
        if (actualFormat.toUpperCase() === 'URL') {
          const base64Nodes = Buffer.from(JSON.stringify(nodes)).toString('base64');
          fs.writeFileSync(outputPath, base64Nodes);
        } else {
          const nodeList = nodes.map(node => JSON.stringify(node)).join('\n');
          fs.writeFileSync(outputPath, nodeList);
        }
        console.log(`已生成节点列表: ${outputPath} (${nodes.length} 个节点)`);
        console.log(`文件大小: ${fs.statSync(outputPath).size} 字节`);
      }
    } catch (error) {
      console.error(`生成配置文件时出错:`, error);
      console.error(`错误堆栈: ${error.stack}`);
    }
  }
}

// 主函数
async function main() {
  console.log('开始同步订阅...');
  
  // 加载配置
  if (!loadConfig()) {
    return;
  }
  
  console.log(`发现 ${CONFIG.subscriptions.length} 个订阅源`);

  // 创建转换器实例
  const converter = new SubscriptionConverter({
    dedup: CONFIG.options.deduplication,
    validateInput: true,
    validateOutput: true,
    recordMetrics: true,
    emitEvents: true,
    nodeManagement: CONFIG.advanced.sortNodes,
    renameNodes: false,
    groupingMode: 'advanced',
    applyRules: true
  });
  
  // 获取并合并所有节点
  const allNodes = await fetchAndMergeAllNodes(converter);
  
  if (allNodes.length === 0) {
    console.warn('未获取到任何有效节点，生成过程已终止');
    return;
  }
  
  console.log(`共获取 ${allNodes.length} 个有效节点`);
  
  // 生成各种格式的配置文件
  await generateConfigs(allNodes, CONFIG.outputConfigs, CONFIG.options);
  
  console.log('订阅同步完成');
}

// 执行主函数
main().catch(error => {
  console.error('同步过程中发生错误:', error);
  process.exit(1);
}); 