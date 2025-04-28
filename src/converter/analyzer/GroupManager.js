/**
 * 节点分组管理器
 * 用于将节点按照地区和流媒体服务进行分组，并添加相应图标
 */

import IconGenerator from '../../utils/IconGenerator.js';

export class GroupManager {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.iconGenerator = IconGenerator;
  }

  /**
   * 对节点进行分组并添加图标
   * @param {Array} nodes 节点列表
   * @returns {Object} 分组后的节点数据
   */
  groupNodes(nodes) {
    // 获取所有分类图标
    const allCategories = this.iconGenerator.getAllCategories();
    
    if (!Array.isArray(nodes) || nodes.length === 0) {
      this.logger.warn('无节点数据可供分组');
      return {
        groups: [],
        categories: allCategories
      };
    }

    // 初始化分组数据结构
    const groups = {
      region: {},
      media: {}
    };

    // 区域分组
    const regionMap = {
      'HK': { name: '香港', icon: this.iconGenerator.getIcon('HK'), nodes: [] },
      'TW': { name: '台湾', icon: this.iconGenerator.getIcon('TW'), nodes: [] },
      'SG': { name: '新加坡', icon: this.iconGenerator.getIcon('SG'), nodes: [] },
      'US': { name: '美国', icon: this.iconGenerator.getIcon('US'), nodes: [] },
      'JP': { name: '日本', icon: this.iconGenerator.getIcon('JP'), nodes: [] },
      'OTHER': { name: '其他', icon: this.iconGenerator.getIcon('OTHER'), nodes: [] }
    };

    // 流媒体分组
    const mediaMap = {
      'OpenAI': { name: 'OpenAI', icon: this.iconGenerator.getIcon('OpenAI'), nodes: [] },
      'Disney+': { name: 'Disney+', icon: this.iconGenerator.getIcon('Disney+'), nodes: [] },
      'Netflix': { name: 'Netflix', icon: this.iconGenerator.getIcon('Netflix'), nodes: [] },
      'YouTube': { name: 'YouTube', icon: this.iconGenerator.getIcon('YouTube'), nodes: [] },
      'Hulu': { name: 'Hulu', icon: this.iconGenerator.getIcon('Hulu'), nodes: [] },
      'HBO': { name: 'HBO', icon: this.iconGenerator.getIcon('HBO'), nodes: [] },
      'AmazonPrime': { name: 'Amazon Prime', icon: this.iconGenerator.getIcon('AmazonPrime'), nodes: [] },
      'BBC': { name: 'BBC', icon: this.iconGenerator.getIcon('BBC'), nodes: [] },
      'Emby': { name: 'Emby', icon: this.iconGenerator.getIcon('Emby'), nodes: [] },
      'Spotify': { name: 'Spotify', icon: this.iconGenerator.getIcon('Spotify'), nodes: [] },
      'Bilibili': { name: 'Bilibili', icon: this.iconGenerator.getIcon('Bilibili'), nodes: [] }
    };

    // 遍历节点进行分类
    for (const node of nodes) {
      this._categorizeNode(node, regionMap, mediaMap);
    }

    // 过滤掉没有节点的分组
    groups.region = Object.values(regionMap).filter(group => group.nodes.length > 0);
    groups.media = Object.values(mediaMap).filter(group => group.nodes.length > 0);

    // 返回分组结果及所有可用的分类图标
    return {
      groups,
      categories: allCategories
    };
  }

  /**
   * 对单个节点进行分类
   * @param {Object} node 节点数据
   * @param {Object} regionMap 地区分组映射
   * @param {Object} mediaMap 流媒体分组映射
   * @private
   */
  _categorizeNode(node, regionMap, mediaMap) {
    // 根据节点名称和服务器信息判断地区
    let regionKey = 'OTHER';
    
    // 如果节点有分析数据
    if (node.analysis && node.analysis.categories && node.analysis.categories.region) {
      const region = node.analysis.categories.region;
      if (region === 'Hong Kong' || region.includes('HK')) regionKey = 'HK';
      else if (region === 'Taiwan' || region.includes('TW')) regionKey = 'TW';
      else if (region === 'Singapore' || region.includes('SG')) regionKey = 'SG';
      else if (region === 'United States' || region.includes('US')) regionKey = 'US';
      else if (region === 'Japan' || region.includes('JP')) regionKey = 'JP';
    } else {
      // 通过节点名称判断
      const name = (node.name || '').toUpperCase();
      
      if (name.includes('香港') || name.includes('HK') || name.includes('HONG') || name.includes('KONG')) regionKey = 'HK';
      else if (name.includes('台湾') || name.includes('台') || name.includes('TW') || name.includes('TAIWAN')) regionKey = 'TW';
      else if (name.includes('新加坡') || name.includes('狮城') || name.includes('SG') || name.includes('SINGAPORE')) regionKey = 'SG';
      else if (name.includes('美国') || name.includes('美') || name.includes('US') || name.includes('UNITED') || name.includes('STATES')) regionKey = 'US';
      else if (name.includes('日本') || name.includes('JP') || name.includes('JAPAN')) regionKey = 'JP';
    }
    
    // 添加到地区分组
    if (regionMap[regionKey]) {
      regionMap[regionKey].nodes.push(node);
    } else {
      regionMap.OTHER.nodes.push(node);
    }

    // 分类到流媒体组
    const name = (node.name || '').toUpperCase();
    
    // OpenAI 相关节点
    if (name.includes('OPENAI') || name.includes('GPT') || name.includes('CHATGPT') || name.includes('AI')) {
      mediaMap['OpenAI'].nodes.push(node);
    }
    
    // Disney+ 相关节点
    if (name.includes('DISNEY') || name.includes('DISNEY+')) {
      mediaMap['Disney+'].nodes.push(node);
    }
    
    // Netflix 相关节点
    if (name.includes('NETFLIX') || name.includes('NF')) {
      mediaMap['Netflix'].nodes.push(node);
    }

    // YouTube 相关节点
    if (name.includes('YOUTUBE') || name.includes('YT')) {
      mediaMap['YouTube'].nodes.push(node);
    }
    
    // Hulu 相关节点
    if (name.includes('HULU')) {
      mediaMap['Hulu'].nodes.push(node);
    }
    
    // HBO 相关节点
    if (name.includes('HBO') || name.includes('MAX')) {
      mediaMap['HBO'].nodes.push(node);
    }
    
    // Amazon Prime 相关节点
    if (name.includes('AMAZON') || name.includes('PRIME')) {
      mediaMap['AmazonPrime'].nodes.push(node);
    }
    
    // BBC 相关节点
    if (name.includes('BBC')) {
      mediaMap['BBC'].nodes.push(node);
    }
    
    // Emby 相关节点
    if (name.includes('EMBY')) {
      mediaMap['Emby'].nodes.push(node);
    }
    
    // Spotify 相关节点
    if (name.includes('SPOTIFY') || name.includes('MUSIC')) {
      mediaMap['Spotify'].nodes.push(node);
    }
    
    // Bilibili 相关节点
    if (name.includes('BILIBILI') || name.includes('B站') || name.includes('哔哩')) {
      mediaMap['Bilibili'].nodes.push(node);
    }
  }
}

export default GroupManager; 