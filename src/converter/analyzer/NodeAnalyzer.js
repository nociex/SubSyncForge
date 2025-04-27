/**
 * 节点分析器
 * 用于从节点名称和属性中提取信息，如国家、协议、编号等
 */
export class NodeAnalyzer {
  constructor(options = {}) {
    // 国家/地区代码和名称映射
    this.countryMap = options.countryMap || {
      '🇺🇸': 'US', '美国': 'US', 'United States': 'US', 'USA': 'US',
      '🇭🇰': 'HK', '香港': 'HK', 'Hong Kong': 'HK',
      '🇹🇼': 'TW', '台湾': 'TW', 'Taiwan': 'TW',
      '🇯🇵': 'JP', '日本': 'JP', 'Japan': 'JP',
      '🇸🇬': 'SG', '新加坡': 'SG', 'Singapore': 'SG',
      '🇰🇷': 'KR', '韩国': 'KR', 'Korea': 'KR',
      '🇬🇧': 'UK', '英国': 'UK', 'United Kingdom': 'UK',
      '🇩🇪': 'DE', '德国': 'DE', 'Germany': 'DE',
      '🇫🇷': 'FR', '法国': 'FR', 'France': 'FR',
      '🇮🇳': 'IN', '印度': 'IN', 'India': 'IN',
      '🇷🇺': 'RU', '俄罗斯': 'RU', 'Russia': 'RU',
      '🇨🇦': 'CA', '加拿大': 'CA', 'Canada': 'CA',
      '🇦🇺': 'AU', '澳大利亚': 'AU', 'Australia': 'AU',
      '🇮🇹': 'IT', '意大利': 'IT', 'Italy': 'IT',
      '🇧🇷': 'BR', '巴西': 'BR', 'Brazil': 'BR',
      '🇳🇱': 'NL', '荷兰': 'NL', 'Netherlands': 'NL',
      '🇹🇷': 'TR', '土耳其': 'TR', 'Turkey': 'TR',
      '🇮🇩': 'ID', '印尼': 'ID', '印度尼西亚': 'ID', 'Indonesia': 'ID',
      '🇻🇳': 'VN', '越南': 'VN', 'Vietnam': 'VN',
      '🇹🇭': 'TH', '泰国': 'TH', 'Thailand': 'TH',
      '🇵🇭': 'PH', '菲律宾': 'PH', 'Philippines': 'PH',
      '🇲🇾': 'MY', '马来西亚': 'MY', 'Malaysia': 'MY',
      '🇦🇷': 'AR', '阿根廷': 'AR', 'Argentina': 'AR',
      '🇲🇽': 'MX', '墨西哥': 'MX', 'Mexico': 'MX',
      '🇨🇱': 'CL', '智利': 'CL', 'Chile': 'CL',
      '🇿🇦': 'ZA', '南非': 'ZA', 'South Africa': 'ZA',
      '🇦🇪': 'AE', '阿联酋': 'AE', 'United Arab Emirates': 'AE', 'UAE': 'AE',
      '🇮🇱': 'IL', '以色列': 'IL', 'Israel': 'IL',
      '🇨🇭': 'CH', '瑞士': 'CH', 'Switzerland': 'CH',
      '🇸🇪': 'SE', '瑞典': 'SE', 'Sweden': 'SE',
      '🇳🇴': 'NO', '挪威': 'NO', 'Norway': 'NO',
      '🇫🇮': 'FI', '芬兰': 'FI', 'Finland': 'FI',
      '🇩🇰': 'DK', '丹麦': 'DK', 'Denmark': 'DK',
      '🇵🇱': 'PL', '波兰': 'PL', 'Poland': 'PL',
      '🇭🇺': 'HU', '匈牙利': 'HU', 'Hungary': 'HU',
      '🇨🇿': 'CZ', '捷克': 'CZ', 'Czech Republic': 'CZ',
      '🇦🇹': 'AT', '奥地利': 'AT', 'Austria': 'AT',
      '🇮🇪': 'IE', '爱尔兰': 'IE', 'Ireland': 'IE',
      '🇵🇹': 'PT', '葡萄牙': 'PT', 'Portugal': 'PT',
      '🇬🇷': 'GR', '希腊': 'GR', 'Greece': 'GR',
      '🇪🇸': 'ES', '西班牙': 'ES', 'Spain': 'ES',
      '🇧🇪': 'BE', '比利时': 'BE', 'Belgium': 'BE',
      '🇱🇺': 'LU', '卢森堡': 'LU', 'Luxembourg': 'LU',
      '🇮🇸': 'IS', '冰岛': 'IS', 'Iceland': 'IS',
      '🇲🇴': 'MO', '澳门': 'MO', 'Macao': 'MO',
      '🇨🇳': 'CN', '中国': 'CN', 'China': 'CN',
    };

    // 协议名称映射
    this.protocolMap = options.protocolMap || {
      'vmess': 'VMess',
      'vless': 'VLESS',
      'trojan': 'Trojan',
      'ss': 'Shadowsocks', 'shadowsocks': 'Shadowsocks',
      'ssr': 'ShadowsocksR', 'shadowsocksr': 'ShadowsocksR',
      'http': 'HTTP',
      'https': 'HTTPS',
      'socks': 'SOCKS', 'socks5': 'SOCKS5',
      'wireguard': 'WireGuard', 'wg': 'WireGuard',
      'hysteria': 'Hysteria', 'hysteria2': 'Hysteria2', 'hy2': 'Hysteria2',
      'tuic': 'TUIC',
      'reality': 'REALITY',
      'naive': 'NaiveProxy',
    };

    // 特殊标签映射
    this.tagMap = options.tagMap || {
      'netflix': 'Netflix', 'nf': 'Netflix', 'netfilx': 'Netflix', 'nflx': 'Netflix',
      'disney': 'Disney+', 'disney+': 'Disney+', 'disneyplus': 'Disney+',
      'hbo': 'HBO', 'hbomax': 'HBO Max', 'hbo max': 'HBO Max',
      'hulu': 'Hulu',
      'youtube': 'YouTube', 'ytb': 'YouTube',
      'prime': 'Prime Video', 'amazon': 'Prime Video', 'amazon prime': 'Prime Video',
      'openai': 'OpenAI', 'chatgpt': 'OpenAI', 'ai': 'OpenAI',
      'gpt': 'OpenAI', 'gpt-4': 'OpenAI', 'gpt-3': 'OpenAI',
      'bing': 'Bing', 'newbing': 'Bing',
      'google': 'Google',
      'bard': 'Google Bard',
      'claude': 'Claude', 'anthropic': 'Claude',
      'gemini': 'Google Gemini',
      'streaming': '流媒体', '流媒体': '流媒体', 'stream': '流媒体',
      'game': '游戏', '游戏': '游戏', 'gaming': '游戏',
      'unlock': '解锁', '解锁': '解锁', 'unblock': '解锁',
      'direct': '直连', '直连': '直连',
      'relay': '中转', '中转': '中转',
      'premium': '高级', '高级': '高级', 'pro': '高级',
      'standard': '标准', '标准': '标准', 'std': '标准',
      'basic': '基础', '基础': '基础',
      'emby': 'Emby',
      'tiktok': 'TikTok', 'tt': 'TikTok',
      'telegram': 'Telegram', 'tg': 'Telegram',
      'twitter': 'Twitter', 'x': 'Twitter',
      'instagram': 'Instagram', 'ig': 'Instagram',
      'facebook': 'Facebook', 'fb': 'Facebook',
      'whatsapp': 'WhatsApp',
      'line': 'Line',
      'spotify': 'Spotify',
      'bilibili': 'Bilibili', 'bili': 'Bilibili', 'b站': 'Bilibili',
      'iqiyi': 'iQiyi', '爱奇艺': 'iQiyi',
      'youku': 'Youku', '优酷': 'Youku',
      'tencent': 'Tencent Video', '腾讯视频': 'Tencent Video',
      'mgtv': 'MGTV', '芒果': 'MGTV',
      'paypal': 'PayPal',
      'steam': 'Steam',
      'xbox': 'Xbox',
      'playstation': 'PlayStation', 'ps': 'PlayStation',
      'nintendo': 'Nintendo', 'switch': 'Nintendo',
      'twitch': 'Twitch',
      'speedtest': 'Speedtest',
      'github': 'GitHub',
      'microsoft': 'Microsoft', 'ms': 'Microsoft',
      'apple': 'Apple',
      'icloud': 'iCloud',
      'onedrive': 'OneDrive',
      'dropbox': 'Dropbox',
      'office': 'Office', 'office365': 'Office',
      'azure': 'Azure',
      'aws': 'AWS', 'amazon web services': 'AWS',
      'gcp': 'GCP', 'google cloud': 'GCP',
      'cloudflare': 'Cloudflare', 'cf': 'Cloudflare',
      'zoom': 'Zoom',
      'teams': 'Teams', 'microsoft teams': 'Teams',
      'skype': 'Skype',
      'discord': 'Discord',
      'slack': 'Slack',
      'wechat': 'WeChat', '微信': 'WeChat',
      'weibo': 'Weibo', '微博': 'Weibo',
      'qq': 'QQ',
      'douyin': 'Douyin', '抖音': 'Douyin',
      'kuaishou': 'Kuaishou', '快手': 'Kuaishou',
      'zhihu': 'Zhihu', '知乎': 'Zhihu',
      'baidu': 'Baidu', '百度': 'Baidu',
      'taobao': 'Taobao', '淘宝': 'Taobao',
      'jd': 'JD', '京东': 'JD',
      'alipay': 'Alipay', '支付宝': 'Alipay',
      'wepay': 'WeChat Pay', '微信支付': 'WeChat Pay',
      'unionpay': 'UnionPay', '银联': 'UnionPay',
    };

    // 国家/地区图标映射
    this.countryIconMap = options.countryIconMap || {
      'US': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/US.png',
      'HK': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/Hongkong.png',
      'TW': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/taiwan.png',
      'JP': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/Japan.png',
      'SG': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/singapore(1).png',
      'KR': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/Korea.png'
    };

    // 特殊标签图标映射
    this.tagIconMap = options.tagIconMap || {
      'Netflix': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/netflix.png',
      'Disney+': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/disney(blue).png',
      'HBO Max': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/HBO.png',
      'YouTube': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/Youtube.png',
      'OpenAI': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/ChatGPT.png',
      'Telegram': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/telegram.png',
      'TikTok': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/tiktok.png',
      '游戏': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/game.png',
      '流媒体': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/play.png',
      '解锁': 'https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/lige47/rocket.png'
    };

    // 正则表达式
    this.countryRegex = this.buildCountryRegex();
    this.protocolRegex = this.buildProtocolRegex();
    this.tagRegex = this.buildTagRegex();
    this.numberRegex = /(?:[^a-zA-Z0-9]|^)(\d+)(?:[^a-zA-Z0-9]|$)/;
  }

  /**
   * 构建国家/地区正则表达式
   */
  buildCountryRegex() {
    const patterns = Object.keys(this.countryMap).map(key => {
      // 转义特殊字符
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return escaped;
    });
    return new RegExp(`(${patterns.join('|')})`, 'i');
  }

  /**
   * 构建协议正则表达式
   */
  buildProtocolRegex() {
    const patterns = Object.keys(this.protocolMap).map(key => {
      // 转义特殊字符
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return escaped;
    });
    return new RegExp(`(${patterns.join('|')})`, 'i');
  }

  /**
   * 构建标签正则表达式
   */
  buildTagRegex() {
    const patterns = Object.keys(this.tagMap).map(key => {
      // 转义特殊字符
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return escaped;
    });
    return new RegExp(`(${patterns.join('|')})`, 'i');
  }

  /**
   * 分析节点
   * @param {Object} node 节点对象
   * @returns {Object} 分析结果
   */
  analyze(node) {
    const result = {
      country: null,
      countryCode: null,
      protocol: null,
      number: null,
      tags: [],
      icons: [],
      originalName: node.name || '',
    };

    // 获取节点名称
    const name = node.name || '';

    // 提取国家/地区信息
    const countryMatch = name.match(this.countryRegex);
    if (countryMatch) {
      const countryKey = countryMatch[1];
      result.countryCode = this.countryMap[countryKey];

      // 根据国家代码获取国家名称
      switch (result.countryCode) {
        case 'US': result.country = '美国'; break;
        case 'HK': result.country = '香港'; break;
        case 'TW': result.country = '台湾'; break;
        case 'JP': result.country = '日本'; break;
        case 'SG': result.country = '新加坡'; break;
        case 'KR': result.country = '韩国'; break;
        case 'UK': result.country = '英国'; break;
        case 'DE': result.country = '德国'; break;
        case 'FR': result.country = '法国'; break;
        case 'IN': result.country = '印度'; break;
        case 'RU': result.country = '俄罗斯'; break;
        case 'CA': result.country = '加拿大'; break;
        case 'AU': result.country = '澳大利亚'; break;
        case 'IT': result.country = '意大利'; break;
        case 'BR': result.country = '巴西'; break;
        case 'NL': result.country = '荷兰'; break;
        case 'TR': result.country = '土耳其'; break;
        case 'ID': result.country = '印度尼西亚'; break;
        case 'VN': result.country = '越南'; break;
        case 'TH': result.country = '泰国'; break;
        case 'PH': result.country = '菲律宾'; break;
        case 'MY': result.country = '马来西亚'; break;
        case 'AR': result.country = '阿根廷'; break;
        case 'MX': result.country = '墨西哥'; break;
        case 'CL': result.country = '智利'; break;
        case 'ZA': result.country = '南非'; break;
        case 'AE': result.country = '阿联酋'; break;
        case 'IL': result.country = '以色列'; break;
        case 'CH': result.country = '瑞士'; break;
        case 'SE': result.country = '瑞典'; break;
        case 'NO': result.country = '挪威'; break;
        case 'FI': result.country = '芬兰'; break;
        case 'DK': result.country = '丹麦'; break;
        case 'PL': result.country = '波兰'; break;
        case 'HU': result.country = '匈牙利'; break;
        case 'CZ': result.country = '捷克'; break;
        case 'AT': result.country = '奥地利'; break;
        case 'IE': result.country = '爱尔兰'; break;
        case 'PT': result.country = '葡萄牙'; break;
        case 'GR': result.country = '希腊'; break;
        case 'ES': result.country = '西班牙'; break;
        case 'BE': result.country = '比利时'; break;
        case 'LU': result.country = '卢森堡'; break;
        case 'IS': result.country = '冰岛'; break;
        case 'MO': result.country = '澳门'; break;
        case 'CN': result.country = '中国'; break;
        default: result.country = countryKey;
      }

      // 添加国家/地区图标
      if (result.countryCode && this.countryIconMap[result.countryCode]) {
        result.icons.push({
          type: 'country',
          name: result.country,
          url: this.countryIconMap[result.countryCode]
        });
      }
    }

    // 提取协议信息
    const protocolMatch = name.match(this.protocolRegex);
    if (protocolMatch) {
      const protocolKey = protocolMatch[1].toLowerCase();
      result.protocol = this.protocolMap[protocolKey];
    } else if (node.protocol) {
      // 如果节点名称中没有协议信息，但节点对象中有协议字段
      const protocolKey = node.protocol.toLowerCase();
      if (this.protocolMap[protocolKey]) {
        result.protocol = this.protocolMap[protocolKey];
      } else {
        result.protocol = node.protocol;
      }
    }

    // 提取编号信息
    const numberMatch = name.match(this.numberRegex);
    if (numberMatch) {
      result.number = parseInt(numberMatch[1], 10);
    }

    // 提取标签信息
    const tagMatches = [...name.matchAll(new RegExp(this.tagRegex, 'gi'))];
    for (const match of tagMatches) {
      const tagKey = match[1].toLowerCase();
      const tag = this.tagMap[tagKey];
      if (tag && !result.tags.includes(tag)) {
        result.tags.push(tag);

        // 添加标签图标
        if (this.tagIconMap[tag]) {
          result.icons.push({
            type: 'tag',
            name: tag,
            url: this.tagIconMap[tag]
          });
        }
      }
    }

    // 根据节点类型添加协议标签
    if (result.protocol && !result.tags.includes(result.protocol)) {
      result.tags.push(result.protocol);
    }

    // 根据国家/地区添加地区标签
    if (result.country && !result.tags.includes(result.country)) {
      result.tags.push(result.country);
    }

    // 添加分类信息
    result.categories = this.categorizeNode(result);

    return result;
  }

  /**
   * 对节点进行分类
   * @param {Object} analysis 节点分析结果
   * @returns {Object} 分类结果
   */
  categorizeNode(analysis) {
    const categories = {
      region: analysis.country || 'Unknown',
      protocol: analysis.protocol || 'Unknown',
      number: analysis.number !== null ? `${analysis.number}` : null,
      special: []
    };

    // 添加特殊标签分类
    for (const tag of analysis.tags) {
      // 跳过国家和协议标签
      if (tag === analysis.country || tag === analysis.protocol) {
        continue;
      }

      // 添加特殊标签
      if (!categories.special.includes(tag)) {
        categories.special.push(tag);
      }
    }

    return categories;
  }

  /**
   * 批量分析节点
   * @param {Array} nodes 节点数组
   * @returns {Array} 分析结果数组
   */
  analyzeNodes(nodes) {
    return nodes.map(node => {
      const analysis = this.analyze(node);
      return {
        ...node,
        analysis,
      };
    });
  }

  /**
   * 根据分析结果生成节点名称
   * @param {Object} analysis 分析结果
   * @param {Object} options 选项
   * @returns {string} 生成的节点名称
   */
  generateName(analysis, options = {}) {
    const {
      includeCountry = true,
      includeProtocol = true,
      includeNumber = true,
      includeTags = true,
      tagLimit = 2,
      format = '{country}{protocol}{number}{tags}'
    } = options;

    let name = format;

    // 替换国家/地区
    if (includeCountry && analysis.country) {
      const countryEmoji = Object.keys(this.countryMap).find(
        key => this.countryMap[key] === analysis.countryCode && key.startsWith('�')
      );
      name = name.replace('{country}', countryEmoji ? `${countryEmoji}${analysis.country}` : analysis.country);
    } else {
      name = name.replace('{country}', '');
    }

    // 替换协议
    if (includeProtocol && analysis.protocol) {
      name = name.replace('{protocol}', `-${analysis.protocol}`);
    } else {
      name = name.replace('{protocol}', '');
    }

    // 替换编号
    if (includeNumber && analysis.number !== null) {
      name = name.replace('{number}', `-${analysis.number.toString().padStart(2, '0')}`);
    } else {
      name = name.replace('{number}', '');
    }

    // 替换标签
    if (includeTags && analysis.tags.length > 0) {
      const specialTags = analysis.tags.filter(tag =>
        tag !== analysis.protocol &&
        tag !== analysis.country &&
        !['VMess', 'VLESS', 'Trojan', 'Shadowsocks', 'ShadowsocksR', 'HTTP', 'HTTPS', 'SOCKS', 'SOCKS5', 'WireGuard', 'Hysteria', 'Hysteria2', 'TUIC', 'REALITY', 'NaiveProxy'].includes(tag) &&
        !Object.values(this.countryMap).includes(tag)
      );

      const limitedTags = specialTags.slice(0, tagLimit);
      if (limitedTags.length > 0) {
        name = name.replace('{tags}', `-${limitedTags.join('/')}`);
      } else {
        name = name.replace('{tags}', '');
      }
    } else {
      name = name.replace('{tags}', '');
    }

    // 清理多余的连字符
    name = name.replace(/--+/g, '-').replace(/^-|-$/g, '');

    return name || analysis.originalName;
  }
}

export default NodeAnalyzer;
