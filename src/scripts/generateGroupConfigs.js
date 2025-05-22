/**
 * 生成包含分组节点的配置文件
 * 此脚本用于读取output目录下的节点文件，
 * 然后将这些节点插入到各个代理软件的配置模板中
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import IconGenerator from '../utils/IconGenerator.js';
import { GroupManager } from '../converter/analyzer/GroupManager.js';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

/**
 * 从节点文件读取节点数据
 * @param {string} filePath 文件路径
 * @returns {Array} 节点数组，如果读取失败则返回空数组
 */
function readNodesFromFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`文件不存在: ${filePath}`);
      return [];
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // 尝试检测内容是否为base64编码(兼容旧格式文件)
    let rawContent = fileContent;
    if (/^[A-Za-z0-9+/=]+$/.test(fileContent.trim())) {
      // 看起来是base64编码，尝试解码
      try {
        console.log(`文件 ${path.basename(filePath)} 似乎是base64编码，尝试解码`);
        rawContent = Buffer.from(fileContent, 'base64').toString('utf8');
      } catch (decodeError) {
        console.log(`解码失败，将作为普通文本处理: ${decodeError.message}`);
        rawContent = fileContent;
      }
    } else {
      console.log(`文件 ${path.basename(filePath)} 使用普通文本格式解析`);
    }
    
    // 检查内容是否为节点URI链接或JSON字符串
    if (rawContent.trim().startsWith('{') || rawContent.trim().startsWith('[')) {
      // JSON格式：直接解析
      console.log(`文件 ${path.basename(filePath)} 使用JSON格式解析`);
      return JSON.parse(rawContent);
    } else {
      // 节点URI链接格式：需要解析
      console.log(`文件 ${path.basename(filePath)} 使用URI链接格式解析`);
      
      // 按行分割URI
      const lines = rawContent.split('\n').filter(line => line.trim().length > 0);
      console.log(`  发现 ${lines.length} 个节点链接`);
      
      return lines.map(line => {
        const nodeType = getNodeTypeFromURI(line);
        const name = getNodeNameFromURI(line);
        
        return {
          name: name || `未命名节点`,
          type: nodeType || 'unknown',
          server: '127.0.0.1', // 由于无法完全解析，使用占位符
          port: 1080,          // 由于无法完全解析，使用占位符
          extra: {
            raw: line          // 保存原始URI便于后续处理
          }
        };
      });
    }
  } catch (error) {
    console.error(`读取节点文件出错 ${filePath}:`, error.message);
    return [];
  }
}

/**
 * 从URI中获取节点类型
 * @param {string} uri 节点URI
 * @returns {string} 节点类型
 */
function getNodeTypeFromURI(uri) {
  if (uri.startsWith('vmess://')) return 'vmess';
  if (uri.startsWith('ss://')) return 'ss';
  if (uri.startsWith('ssr://')) return 'ssr';
  if (uri.startsWith('trojan://')) return 'trojan';
  if (uri.startsWith('http://') || uri.startsWith('https://')) return 'http';
  return 'unknown';
}

/**
 * 从URI中获取节点名称
 * @param {string} uri 节点URI
 * @returns {string} 节点名称
 */
function getNodeNameFromURI(uri) {
  try {
    // 尝试从URI的hash部分获取名称
    const hashIndex = uri.indexOf('#');
    if (hashIndex > 0) {
      return decodeURIComponent(uri.substring(hashIndex + 1));
    }
    
    // 无法获取名称
    return null;
  } catch (error) {
    console.error(`解析节点名称出错:`, error.message);
    return null;
  }
}

/**
 * 读取所有分组节点
 * @returns {Object} 分组节点数据
 */
function readAllGroupNodes() {
  const outputDir = path.join(rootDir, 'output');
  
  if (!fs.existsSync(outputDir)) {
    console.warn(`输出目录不存在: ${outputDir}`);
    return { region: {}, media: {} };
  }
  
  // 初始化结果对象
  const result = {
    region: {},
    media: {}
  };
  
  // 区域映射 - 文件名到内部键
  const regionFileMapping = {
    'HK.txt': { key: 'HK', name: '香港' },
    'TW.txt': { key: 'TW', name: '台湾' },
    'SG.txt': { key: 'SG', name: '新加坡' },
    'US.txt': { key: 'US', name: '美国' },
    'JP.txt': { key: 'JP', name: '日本' },
    'Others.txt': { key: 'OTHER', name: '其他' }
  };
  
  // 流媒体映射 - 保持不变
  const mediaMapping = {
    'OpenAI.txt': { key: 'OpenAI', name: 'OpenAI' },
    'Disney+.txt': { key: 'Disney+', name: 'Disney+' },
    'Netflix.txt': { key: 'Netflix', name: 'Netflix' },
    'YouTube.txt': { key: 'YouTube', name: 'YouTube' },
    'Hulu.txt': { key: 'Hulu', name: 'Hulu' },
    'HBO.txt': { key: 'HBO', name: 'HBO' },
    'AmazonPrime.txt': { key: 'AmazonPrime', name: 'Amazon Prime' },
    'BBC.txt': { key: 'BBC', name: 'BBC' },
    'Emby.txt': { key: 'Emby', name: 'Emby' },
    'Spotify.txt': { key: 'Spotify', name: 'Spotify' },
    'Bilibili.txt': { key: 'Bilibili', name: 'Bilibili' }
  };
  
  // 读取所有文件
  const files = fs.readdirSync(outputDir);
  
  for (const file of files) {
    if (!file.endsWith('.txt')) continue;
    if (file === '.gitkeep') continue;
    
    const filePath = path.join(outputDir, file);
    // 忽略目录
    if (fs.statSync(filePath).isDirectory()) continue;
    
    const nodes = readNodesFromFile(filePath);
    
    // 处理文件名的大小写，以匹配映射
    const normalizedFile = file.charAt(0).toUpperCase() + file.slice(1);
    
    // 检查是哪种分组类型
    if (regionFileMapping[normalizedFile] || regionFileMapping[file]) {
      const mappingKey = regionFileMapping[normalizedFile] ? normalizedFile : file;
      const { key, name } = regionFileMapping[mappingKey];
      result.region[key] = {
        name: name,
        nodes: nodes
      };
    } else if (mediaMapping[normalizedFile] || mediaMapping[file]) {
      const mappingKey = mediaMapping[normalizedFile] ? normalizedFile : file;
      const { key, name } = mediaMapping[mappingKey];
      result.media[key] = {
        name: name,
        nodes: nodes
      };
    } else {
      console.log(`未知分组类型文件: ${file}`);
    }
  }
  
  return result;
}

/**
 * 生成包含分组节点的配置文件
 */
async function generateGroupConfigs() {
  console.log('开始生成分组节点配置...');
  
  // 创建目录如果不存在
  const outputDir = path.join(rootDir, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 读取分组节点
  const groupNodes = readAllGroupNodes();
  console.log('读取到的分组节点:');
  
  // 输出各分组的节点数量
  console.log('区域分组:');
  Object.keys(groupNodes.region).forEach(key => {
    console.log(`  - ${groupNodes.region[key].name}: ${groupNodes.region[key].nodes.length} 个节点`);
  });
  
  console.log('流媒体分组:');
  Object.keys(groupNodes.media).forEach(key => {
    console.log(`  - ${groupNodes.media[key].name}: ${groupNodes.media[key].nodes.length} 个节点`);
  });
  
  // 获取所有图标数据
  const iconGenerator = IconGenerator;
  const categories = iconGenerator.getAllCategories();
  
  // 更新各个配置模板
  try {
    // 更新Clash/Mihomo模板
    updateMihomoTemplate(groupNodes, categories);
    
    // 更新Surge模板
    updateSurgeTemplate(groupNodes, categories);
    
    console.log('分组节点配置生成完成！');
  } catch (error) {
    console.error('生成分组节点配置时出错:', error.message);
  }
}

/**
 * 更新Clash/Mihomo模板
 * @param {Object} groupNodes 分组节点数据
 * @param {Object} categories 分类图标数据
 */
function updateMihomoTemplate(groupNodes, categories) {
  try {
    const templatePath = path.join(rootDir, 'templates', 'mihomo.yaml');
    const outputPath = path.join(rootDir, 'output', 'mihomo-groups.yaml');
    
    // 检查模板文件是否存在
    if (!fs.existsSync(templatePath)) {
      console.warn(`警告: Mihomo模板文件不存在: ${templatePath}`);
      return;
    }
    
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // 生成代理节点列表
    let proxiesSection = '\nproxies:\n';
    let proxyNames = [];
    
    // 处理区域分组节点
    for (const key in groupNodes.region) {
      const group = groupNodes.region[key];
      if (!group || !group.nodes || group.nodes.length === 0) continue;
      
      for (const node of group.nodes) {
        if (!node || !node.name) continue;
        
        // 添加到代理列表
        proxiesSection += `  - name: ${node.name}\n`;
        
        // 根据节点类型添加配置
        if (node.type === 'vmess') {
          proxiesSection += `    type: vmess\n`;
          proxiesSection += `    server: ${node.server}\n`;
          proxiesSection += `    port: ${node.port}\n`;
          proxiesSection += `    uuid: ${node.settings.id}\n`;
          proxiesSection += `    alterId: ${node.settings.alterId || 0}\n`;
          proxiesSection += `    cipher: ${node.settings.security || 'auto'}\n`;
          
          // 处理WS设置
          if (node.settings.network === 'ws') {
            proxiesSection += `    network: ws\n`;
            proxiesSection += `    ws-opts:\n`;
            proxiesSection += `      path: ${node.settings.wsPath || '/'}\n`;
            
            if (node.settings.wsHeaders && node.settings.wsHeaders.Host) {
              proxiesSection += `      headers:\n`;
              proxiesSection += `        Host: ${node.settings.wsHeaders.Host}\n`;
            }
          }
          
          // 处理TLS设置
          if (node.settings.tls) {
            proxiesSection += `    tls: true\n`;
            
            if (node.settings.serverName) {
              proxiesSection += `    servername: ${node.settings.serverName}\n`;
            }
            
            if (node.settings.allowInsecure) {
              proxiesSection += `    skip-cert-verify: true\n`;
            }
          }
        } else if (node.type === 'ss') {
          proxiesSection += `    type: ss\n`;
          proxiesSection += `    server: ${node.server}\n`;
          proxiesSection += `    port: ${node.port}\n`;
          proxiesSection += `    cipher: ${node.settings.method}\n`;
          proxiesSection += `    password: ${node.settings.password}\n`;
        } else if (node.type === 'trojan') {
          proxiesSection += `    type: trojan\n`;
          proxiesSection += `    server: ${node.server}\n`;
          proxiesSection += `    port: ${node.port}\n`;
          proxiesSection += `    password: ${node.settings.password}\n`;
          
          if (node.settings.sni) {
            proxiesSection += `    sni: ${node.settings.sni}\n`;
          }
          
          if (node.settings.allowInsecure) {
            proxiesSection += `    skip-cert-verify: true\n`;
          }
        }
        
        proxiesSection += '\n';
        proxyNames.push(node.name);
      }
    }
    
    // 添加流媒体分组节点
    for (const key in groupNodes.media) {
      const group = groupNodes.media[key];
      if (!group || !group.nodes || group.nodes.length === 0) continue;
      
      for (const node of group.nodes) {
        // 如果该节点名称已经在列表中，则跳过
        if (proxyNames.includes(node.name)) continue;
        
        // 添加到代理列表
        proxiesSection += `  - name: ${node.name}\n`;
        
        // 根据节点类型添加配置
        if (node.type === 'vmess') {
          proxiesSection += `    type: vmess\n`;
          proxiesSection += `    server: ${node.server}\n`;
          proxiesSection += `    port: ${node.port}\n`;
          proxiesSection += `    uuid: ${node.settings.id}\n`;
          proxiesSection += `    alterId: ${node.settings.alterId || 0}\n`;
          proxiesSection += `    cipher: ${node.settings.security || 'auto'}\n`;
          
          // 处理WS设置
          if (node.settings.network === 'ws') {
            proxiesSection += `    network: ws\n`;
            proxiesSection += `    ws-opts:\n`;
            proxiesSection += `      path: ${node.settings.wsPath || '/'}\n`;
            
            if (node.settings.wsHeaders && node.settings.wsHeaders.Host) {
              proxiesSection += `      headers:\n`;
              proxiesSection += `        Host: ${node.settings.wsHeaders.Host}\n`;
            }
          }
          
          // 处理TLS设置
          if (node.settings.tls) {
            proxiesSection += `    tls: true\n`;
            
            if (node.settings.serverName) {
              proxiesSection += `    servername: ${node.settings.serverName}\n`;
            }
            
            if (node.settings.allowInsecure) {
              proxiesSection += `    skip-cert-verify: true\n`;
            }
          }
        } else if (node.type === 'ss') {
          proxiesSection += `    type: ss\n`;
          proxiesSection += `    server: ${node.server}\n`;
          proxiesSection += `    port: ${node.port}\n`;
          proxiesSection += `    cipher: ${node.settings.method}\n`;
          proxiesSection += `    password: ${node.settings.password}\n`;
        } else if (node.type === 'trojan') {
          proxiesSection += `    type: trojan\n`;
          proxiesSection += `    server: ${node.server}\n`;
          proxiesSection += `    port: ${node.port}\n`;
          proxiesSection += `    password: ${node.settings.password}\n`;
          
          if (node.settings.sni) {
            proxiesSection += `    sni: ${node.settings.sni}\n`;
          }
          
          if (node.settings.allowInsecure) {
            proxiesSection += `    skip-cert-verify: true\n`;
          }
        }
        
        proxiesSection += '\n';
        proxyNames.push(node.name);
      }
    }
    
    // 在模板中添加分组定义
    let groupsSection = '\nproxy-groups:\n';
    
    // 添加区域分组
    for (const key in groupNodes.region) {
      const group = groupNodes.region[key];
      if (!group || !group.nodes || group.nodes.length === 0) continue;
      
      const nodeNames = group.nodes.map(node => node.name);
      
      groupsSection += `  - name: ${group.name}\n`;
      groupsSection += `    type: select\n`;
      groupsSection += `    icon: ${categories[key] || ''}\n`;
      groupsSection += `    proxies:\n`;
      nodeNames.forEach(name => {
        groupsSection += `      - ${name}\n`;
      });
      groupsSection += `      - DIRECT\n\n`;
    }
    
    // 添加流媒体服务分组
    for (const key in groupNodes.media) {
      const group = groupNodes.media[key];
      if (!group || !group.nodes || group.nodes.length === 0) continue;
      
      const nodeNames = group.nodes.map(node => node.name);
      
      groupsSection += `  - name: ${group.name}\n`;
      groupsSection += `    type: select\n`;
      groupsSection += `    icon: ${categories[key] || ''}\n`;
      groupsSection += `    proxies:\n`;
      nodeNames.forEach(name => {
        groupsSection += `      - ${name}\n`;
      });
      groupsSection += `      - DIRECT\n\n`;
    }
    
    // 替换或添加节点和分组部分
    if (template.includes('proxies:')) {
      template = template.replace(/proxies:[\s\S]*?(?=\n\w|$)/, proxiesSection);
    } else {
      template += proxiesSection;
    }
    
    if (template.includes('proxy-groups:')) {
      template = template.replace(/proxy-groups:[\s\S]*?(?=\n\w|$)/, groupsSection);
    } else {
      template += groupsSection;
    }
    
    fs.writeFileSync(outputPath, template);
    console.log(`已生成Mihomo分组配置: ${outputPath}`);
  } catch (error) {
    console.error('更新Mihomo模板时出错:', error.message);
  }
}

/**
 * 更新Surge模板
 * @param {Object} groupNodes 分组节点数据
 * @param {Object} categories 分类图标数据
 */
function updateSurgeTemplate(groupNodes, categories) {
  try {
    const templatePath = path.join(rootDir, 'templates', 'surge.conf');
    const outputPath = path.join(rootDir, 'output', 'surge-groups.conf');
    
    // 检查模板文件是否存在
    if (!fs.existsSync(templatePath)) {
      console.warn(`警告: Surge模板文件不存在: ${templatePath}`);
      return;
    }
    
    // 安全地获取base64部分，防止undefined错误
    const getBase64Part = (iconString) => {
      if (!iconString) return '';
      const matches = iconString.match(/data:image\/png;base64,(.+)/);
      return matches && matches[1] ? matches[1] : '';
    };
    
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // 生成代理节点列表
    let proxySection = '\n[Proxy]\n';
    
    // 处理所有区域分组节点
    let allNodes = [];
    
    // 收集区域分组节点
    for (const key in groupNodes.region) {
      const group = groupNodes.region[key];
      if (!group || !group.nodes || group.nodes.length === 0) continue;
      
      allNodes = [...allNodes, ...group.nodes];
    }
    
    // 收集流媒体分组节点
    for (const key in groupNodes.media) {
      const group = groupNodes.media[key];
      if (!group || !group.nodes || group.nodes.length === 0) continue;
      
      // 过滤掉重复节点
      const newNodes = group.nodes.filter(node => 
        !allNodes.some(existingNode => existingNode.name === node.name)
      );
      
      allNodes = [...allNodes, ...newNodes];
    }
    
    // 生成节点配置
    for (const node of allNodes) {
      if (node.type === 'vmess') {
        proxySection += `${node.name} = vmess, ${node.server}, ${node.port}, username=${node.settings.id}`;
        
        if (node.settings.alterId) {
          proxySection += `, alterId=${node.settings.alterId}`;
        }
        
        if (node.settings.security) {
          proxySection += `, encrypt-method=${node.settings.security}`;
        }
        
        if (node.settings.network === 'ws') {
          proxySection += `, ws=true, ws-path=${node.settings.wsPath || '/'}`;
          
          if (node.settings.wsHeaders && node.settings.wsHeaders.Host) {
            proxySection += `, ws-headers=Host:${node.settings.wsHeaders.Host}`;
          }
        }
        
        if (node.settings.tls) {
          proxySection += `, tls=true`;
          
          if (node.settings.serverName) {
            proxySection += `, sni=${node.settings.serverName}`;
          }
          
          if (node.settings.allowInsecure) {
            proxySection += `, skip-cert-verify=true`;
          }
        }
      } else if (node.type === 'ss') {
        proxySection += `${node.name} = ss, ${node.server}, ${node.port}, encrypt-method=${node.settings.method}, password=${node.settings.password}`;
      } else if (node.type === 'trojan') {
        proxySection += `${node.name} = trojan, ${node.server}, ${node.port}, password=${node.settings.password}`;
        
        if (node.settings.sni) {
          proxySection += `, sni=${node.settings.sni}`;
        }
        
        if (node.settings.allowInsecure) {
          proxySection += `, skip-cert-verify=true`;
        }
      }
      
      proxySection += '\n';
    }
    
    // 生成分组配置
    let groupSection = '\n[Proxy Group]\n';
    
    // 添加区域分组
    for (const key in groupNodes.region) {
      const group = groupNodes.region[key];
      if (!group || !group.nodes || group.nodes.length === 0) continue;
      
      const nodeNames = group.nodes.map(node => node.name).join(', ');
      
      groupSection += `${group.name} = select, ${nodeNames}, DIRECT, icon-base64=${getBase64Part(categories[key])}\n`;
    }
    
    // 添加流媒体服务分组
    for (const key in groupNodes.media) {
      const group = groupNodes.media[key];
      if (!group || !group.nodes || group.nodes.length === 0) continue;
      
      const nodeNames = group.nodes.map(node => node.name).join(', ');
      
      groupSection += `${group.name} = select, ${nodeNames}, DIRECT, icon-base64=${getBase64Part(categories[key])}\n`;
    }
    
    // 替换或添加节点和分组部分
    if (template.includes('[Proxy]')) {
      template = template.replace(/\[Proxy\][\s\S]*?(?=\n\[\w|$)/, proxySection);
    } else {
      template += proxySection;
    }
    
    if (template.includes('[Proxy Group]')) {
      template = template.replace(/\[Proxy Group\][\s\S]*?(?=\n\[\w|$)/, groupSection);
    } else {
      template += groupSection;
    }
    
    fs.writeFileSync(outputPath, template);
    console.log(`已生成Surge分组配置: ${outputPath}`);
  } catch (error) {
    console.error('更新Surge模板时出错:', error.message);
  }
}

// 直接执行脚本
generateGroupConfigs().catch(error => {
  console.error('生成分组配置文件出错:', error);
  process.exit(1);
}); 