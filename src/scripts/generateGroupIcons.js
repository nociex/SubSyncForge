/**
 * 生成分组图标并将其插入到配置模板中
 * 此脚本用于创建常用地区和流媒体服务的分组，并为每个分组生成Base64编码的图标
 * 然后将这些图标信息插入到各个代理软件的配置模板中
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
 * 将分组图标插入到配置文件中
 */
async function generateGroupIcons() {
  console.log('开始生成分组图标...');
  
  // 创建目录如果不存在
  const outputDir = path.join(rootDir, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 获取所有可用的分类图标
  try {
    const groupManager = new GroupManager();
    const { categories } = groupManager.groupNodes([]);
    
    if (!categories || Object.keys(categories).length === 0) {
      console.warn('警告: 未能获取到分类图标数据，将使用内置默认图标');
    }
    
    // 生成包含所有图标的JSON文件
    const iconsJsonPath = path.join(outputDir, 'group-icons.json');
    fs.writeFileSync(iconsJsonPath, JSON.stringify(categories, null, 2));
    console.log(`图标JSON文件已保存到: ${iconsJsonPath}`);
    
    // 更新各个配置模板
    await updateTemplates(categories);
    
    console.log('分组图标生成完成！');
  } catch (error) {
    console.error('生成图标时发生错误:', error.message);
    console.log('尝试使用图标生成器直接获取图标数据...');
    
    // 出错时尝试直接使用IconGenerator
    const iconGenerator = IconGenerator;
    const categories = iconGenerator.getAllCategories();
    
    // 生成包含所有图标的JSON文件
    const iconsJsonPath = path.join(outputDir, 'group-icons.json');
    fs.writeFileSync(iconsJsonPath, JSON.stringify(categories, null, 2));
    console.log(`图标JSON文件已保存到: ${iconsJsonPath}`);
    
    // 更新各个配置模板
    await updateTemplates(categories);
    
    console.log('分组图标生成完成（使用备用方法）！');
  }
}

/**
 * 更新所有配置模板
 * @param {Object} categories 分类图标数据
 */
async function updateTemplates(categories) {
  if (!categories || Object.keys(categories).length === 0) {
    console.error('错误: 无法更新配置模板，分类图标数据为空');
    return;
  }

  try {
    // 更新Clash/Mihomo模板
    updateMihomoTemplate(categories);
    
    // 更新Surge模板
    updateSurgeTemplate(categories);
    
    // 更新SingBox模板
    updateSingBoxTemplate(categories);
    
    // 更新V2Ray模板
    updateV2RayTemplate(categories);
  } catch (error) {
    console.error('更新配置模板时出错:', error.message);
  }
}

/**
 * 更新Clash/Mihomo模板
 * @param {Object} categories 分类图标数据
 */
function updateMihomoTemplate(categories) {
  try {
    const templatePath = path.join(rootDir, 'templates', 'mihomo.yaml');
    const outputPath = path.join(rootDir, 'output', 'mihomo.yaml');
    
    // 检查模板文件是否存在
    if (!fs.existsSync(templatePath)) {
      console.warn(`警告: Mihomo模板文件不存在: ${templatePath}`);
      return;
    }
    
    let template = fs.readFileSync(templatePath, 'utf8');
    
    // 在模板中添加图标定义
    let iconSection = '\n# 分组图标\nproxy-groups:\n';
    
    // 添加区域分组
    iconSection += `  - name: 香港节点\n    type: select\n    icon: ${categories.HK || ''}\n    proxies: [自动选择, DIRECT]\n\n`;
    iconSection += `  - name: 台湾节点\n    type: select\n    icon: ${categories.TW || ''}\n    proxies: [自动选择, DIRECT]\n\n`;
    iconSection += `  - name: 新加坡节点\n    type: select\n    icon: ${categories.SG || ''}\n    proxies: [自动选择, DIRECT]\n\n`;
    iconSection += `  - name: 美国节点\n    type: select\n    icon: ${categories.US || ''}\n    proxies: [自动选择, DIRECT]\n\n`;
    iconSection += `  - name: 日本节点\n    type: select\n    icon: ${categories.JP || ''}\n    proxies: [自动选择, DIRECT]\n\n`;
    iconSection += `  - name: 其他节点\n    type: select\n    icon: ${categories.OTHER || ''}\n    proxies: [自动选择, DIRECT]\n\n`;
    
    // 添加流媒体服务分组
    iconSection += `  - name: OpenAI\n    type: select\n    icon: ${categories.OpenAI || ''}\n    proxies: [美国节点, DIRECT]\n\n`;
    iconSection += `  - name: Disney+\n    type: select\n    icon: ${categories['Disney+'] || ''}\n    proxies: [香港节点, 新加坡节点, DIRECT]\n\n`;
    iconSection += `  - name: Netflix\n    type: select\n    icon: ${categories.Netflix || ''}\n    proxies: [香港节点, 新加坡节点, 台湾节点, DIRECT]\n\n`;
    
    // 检查模板中是否已有proxy-groups部分
    if (template.includes('proxy-groups:')) {
      // 替换现有的proxy-groups部分
      template = template.replace(/proxy-groups:[\s\S]*?(?=\n\w|$)/, iconSection);
    } else {
      // 添加到模板末尾
      template += iconSection;
    }
    
    fs.writeFileSync(outputPath, template);
    console.log(`已更新Mihomo配置模板: ${outputPath}`);
  } catch (error) {
    console.error('更新Mihomo模板时出错:', error.message);
  }
}

/**
 * 更新Surge模板
 * @param {Object} categories 分类图标数据
 */
function updateSurgeTemplate(categories) {
  try {
    const templatePath = path.join(rootDir, 'templates', 'surge.conf');
    const outputPath = path.join(rootDir, 'output', 'surge.conf');
    
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
    
    // 在模板中添加图标定义
    let iconSection = '\n# 分组图标\n[Proxy Group]\n';
    
    // 添加区域分组
    iconSection += `香港节点 = select, policy-path=example.com, update-interval=0, icon-base64=${getBase64Part(categories.HK)}\n`;
    iconSection += `台湾节点 = select, policy-path=example.com, update-interval=0, icon-base64=${getBase64Part(categories.TW)}\n`;
    iconSection += `新加坡节点 = select, policy-path=example.com, update-interval=0, icon-base64=${getBase64Part(categories.SG)}\n`;
    iconSection += `美国节点 = select, policy-path=example.com, update-interval=0, icon-base64=${getBase64Part(categories.US)}\n`;
    iconSection += `日本节点 = select, policy-path=example.com, update-interval=0, icon-base64=${getBase64Part(categories.JP)}\n`;
    iconSection += `其他节点 = select, policy-path=example.com, update-interval=0, icon-base64=${getBase64Part(categories.OTHER)}\n`;
    
    // 添加流媒体服务分组
    iconSection += `OpenAI = select, 美国节点, DIRECT, icon-base64=${getBase64Part(categories.OpenAI)}\n`;
    iconSection += `Disney+ = select, 香港节点, 新加坡节点, DIRECT, icon-base64=${getBase64Part(categories['Disney+'])}\n`;
    iconSection += `Netflix = select, 香港节点, 新加坡节点, 台湾节点, DIRECT, icon-base64=${getBase64Part(categories.Netflix)}\n`;
    
    // 检查模板中是否已有[Proxy Group]部分
    if (template.includes('[Proxy Group]')) {
      // 替换现有的[Proxy Group]部分
      template = template.replace(/\[Proxy Group\][\s\S]*?(?=\n\[\w|$)/, iconSection);
    } else {
      // 添加到模板末尾
      template += iconSection;
    }
    
    fs.writeFileSync(outputPath, template);
    console.log(`已更新Surge配置模板: ${outputPath}`);
  } catch (error) {
    console.error('更新Surge模板时出错:', error.message);
  }
}

/**
 * 更新SingBox模板
 * @param {Object} categories 分类图标数据
 */
function updateSingBoxTemplate(categories) {
  try {
    const templatePath = path.join(rootDir, 'templates', 'singbox.json');
    const outputPath = path.join(rootDir, 'output', 'singbox.json');
    
    // 检查模板文件是否存在
    if (!fs.existsSync(templatePath)) {
      console.warn(`警告: SingBox模板文件不存在: ${templatePath}`);
      return;
    }
    
    let template;
    try {
      template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    } catch (parseError) {
      console.error('解析SingBox模板JSON时出错:', parseError.message);
      console.log('尝试创建新的SingBox配置...');
      template = {};
    }
    
    // 确保有route部分
    if (!template.route) {
      template.route = {};
    }
    
    // 确保有规则组数组
    if (!template.route.rule_set) {
      template.route.rule_set = [];
    }
    
    // 定义分组
    if (!template.outbounds) {
      template.outbounds = [];
    } else {
      // 清空现有的outbounds，避免重复添加
      template.outbounds = [];
    }
    
    // 添加区域分组
    template.outbounds.push({
      "tag": "香港节点",
      "type": "selector",
      "outbounds": ["direct"],
      "default": "direct",
      "icon": categories.HK || ""
    });
    
    template.outbounds.push({
      "tag": "台湾节点",
      "type": "selector",
      "outbounds": ["direct"],
      "default": "direct",
      "icon": categories.TW || ""
    });
    
    template.outbounds.push({
      "tag": "新加坡节点",
      "type": "selector",
      "outbounds": ["direct"],
      "default": "direct",
      "icon": categories.SG || ""
    });
    
    template.outbounds.push({
      "tag": "美国节点",
      "type": "selector",
      "outbounds": ["direct"],
      "default": "direct",
      "icon": categories.US || ""
    });
    
    template.outbounds.push({
      "tag": "日本节点",
      "type": "selector",
      "outbounds": ["direct"],
      "default": "direct",
      "icon": categories.JP || ""
    });
    
    template.outbounds.push({
      "tag": "其他节点",
      "type": "selector",
      "outbounds": ["direct"],
      "default": "direct",
      "icon": categories.OTHER || ""
    });
    
    // 添加流媒体服务分组
    template.outbounds.push({
      "tag": "OpenAI",
      "type": "selector",
      "outbounds": ["美国节点", "direct"],
      "default": "美国节点",
      "icon": categories.OpenAI || ""
    });
    
    template.outbounds.push({
      "tag": "Disney+",
      "type": "selector",
      "outbounds": ["香港节点", "新加坡节点", "direct"],
      "default": "香港节点",
      "icon": categories['Disney+'] || ""
    });
    
    template.outbounds.push({
      "tag": "Netflix",
      "type": "selector",
      "outbounds": ["香港节点", "新加坡节点", "台湾节点", "direct"],
      "default": "香港节点",
      "icon": categories.Netflix || ""
    });
    
    fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
    console.log(`已更新SingBox配置模板: ${outputPath}`);
  } catch (error) {
    console.error('更新SingBox模板时出错:', error.message);
  }
}

/**
 * 更新V2Ray模板
 * @param {Object} categories 分类图标数据
 */
function updateV2RayTemplate(categories) {
  try {
    const templatePath = path.join(rootDir, 'templates', 'v2ray.json');
    const outputPath = path.join(rootDir, 'output', 'v2ray.json');
    
    // 检查模板文件是否存在
    if (!fs.existsSync(templatePath)) {
      console.warn(`警告: V2Ray模板文件不存在: ${templatePath}`);
      return;
    }
    
    let template;
    try {
      template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    } catch (parseError) {
      console.error('解析V2Ray模板JSON时出错:', parseError.message);
      console.log('尝试创建新的V2Ray配置...');
      template = {};
    }
    
    // V2Ray配置不支持图标，但我们可以在注释中添加信息
    if (!template.remarks) {
      template.remarks = {};
    }
    
    template.remarks.groups = {
      "regionGroups": [
        {"name": "香港节点", "icon": "HK"},
        {"name": "台湾节点", "icon": "TW"},
        {"name": "新加坡节点", "icon": "SG"},
        {"name": "美国节点", "icon": "US"},
        {"name": "日本节点", "icon": "JP"},
        {"name": "其他节点", "icon": "OTHER"}
      ],
      "mediaGroups": [
        {"name": "OpenAI", "icon": "OpenAI"},
        {"name": "Disney+", "icon": "Disney+"},
        {"name": "Netflix", "icon": "Netflix"}
      ]
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
    console.log(`已更新V2Ray配置模板: ${outputPath}`);
  } catch (error) {
    console.error('更新V2Ray模板时出错:', error.message);
  }
}

// 执行主函数
generateGroupIcons().catch(error => {
  console.error('生成图标时出错:', error);
  process.exit(1);
}); 