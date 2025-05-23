/**
 * 节点分析器
 * 用于从节点名称和属性中提取信息，如国家、协议、编号等
 */
export class NodeAnalyzer {
  constructor(options = {}) {
    // 国家/地区代码和名称映射
    this.countryMap = options.countryMap || {
      // emoji到代码映射
      '🇺🇸': 'US', '🇭🇰': 'HK', '🇹🇼': 'TW', '🇯🇵': 'JP', '🇸🇬': 'SG', '🇰🇷': 'KR',
      '🇬🇧': 'UK', '🇩🇪': 'DE', '🇫🇷': 'FR', '🇮🇳': 'IN', '🇷🇺': 'RU', '🇨🇦': 'CA',
      '🇦🇺': 'AU', '🇮🇹': 'IT', '🇧🇷': 'BR', '🇳🇱': 'NL', '🇹🇷': 'TR', '🇮🇩': 'ID',
      '🇻🇳': 'VN', '🇹🇭': 'TH', '🇵🇭': 'PH', '🇲🇾': 'MY', '🇦🇷': 'AR', '🇲🇽': 'MX',
      '🇨🇱': 'CL', '🇿🇦': 'ZA', '🇦🇪': 'AE', '🇮🇱': 'IL', '🇨🇭': 'CH', '🇸🇪': 'SE',
      '🇳🇴': 'NO', '🇫🇮': 'FI', '🇩🇰': 'DK', '🇵🇱': 'PL', '🇭🇺': 'HU', '🇨🇿': 'CZ',
      '🇦🇹': 'AT', '🇮🇪': 'IE', '🇵🇹': 'PT', '🇬🇷': 'GR', '🇪🇸': 'ES', '🇧🇪': 'BE',
      '🇱🇺': 'LU', '🇮🇸': 'IS', '🇲🇴': 'MO', '🇨🇳': 'CN',
      
      // 中文地名到代码映射
      '美国': 'US', '香港': 'HK', '台湾': 'TW', '日本': 'JP', '新加坡': 'SG', '韩国': 'KR',
      '英国': 'UK', '德国': 'DE', '法国': 'FR', '印度': 'IN', '俄罗斯': 'RU', '加拿大': 'CA',
      '澳大利亚': 'AU', '意大利': 'IT', '巴西': 'BR', '荷兰': 'NL', '土耳其': 'TR', '印尼': 'ID',
      '印度尼西亚': 'ID', '越南': 'VN', '泰国': 'TH', '菲律宾': 'PH', '马来西亚': 'MY',
      '阿根廷': 'AR', '墨西哥': 'MX', '智利': 'CL', '南非': 'ZA', '阿联酋': 'AE', '以色列': 'IL',
      '瑞士': 'CH', '瑞典': 'SE', '挪威': 'NO', '芬兰': 'FI', '丹麦': 'DK', '波兰': 'PL',
      '匈牙利': 'HU', '捷克': 'CZ', '奥地利': 'AT', '爱尔兰': 'IE', '葡萄牙': 'PT', '希腊': 'GR',
      '西班牙': 'ES', '比利时': 'BE', '卢森堡': 'LU', '冰岛': 'IS', '澳门': 'MO', '中国': 'CN',
      
      // 英文地名到代码映射
      'United States': 'US', 'USA': 'US', 'America': 'US',
      'Hong Kong': 'HK', 'HongKong': 'HK',
      'Taiwan': 'TW',
      'Japan': 'JP',
      'Singapore': 'SG',
      'Korea': 'KR', 'South Korea': 'KR',
      'United Kingdom': 'UK', 'UK': 'UK', 'Britain': 'UK', 'England': 'UK',
      'Germany': 'DE', 'Deutschland': 'DE',
      'France': 'FR',
      'India': 'IN',
      'Russia': 'RU', 'Russian': 'RU',
      'Canada': 'CA',
      'Australia': 'AU',
      'Italy': 'IT',
      'Brazil': 'BR',
      'Netherlands': 'NL', 'Holland': 'NL',
      'Turkey': 'TR',
      'Indonesia': 'ID',
      'Vietnam': 'VN',
      'Thailand': 'TH',
      'Philippines': 'PH',
      'Malaysia': 'MY',
      'Argentina': 'AR',
      'Mexico': 'MX',
      'Chile': 'CL',
      'South Africa': 'ZA',
      'United Arab Emirates': 'AE', 'UAE': 'AE',
      'Israel': 'IL',
      'Switzerland': 'CH',
      'Sweden': 'SE',
      'Norway': 'NO',
      'Finland': 'FI',
      'Denmark': 'DK',
      'Poland': 'PL',
      'Hungary': 'HU',
      'Czech Republic': 'CZ', 'Czech': 'CZ',
      'Austria': 'AT',
      'Ireland': 'IE',
      'Portugal': 'PT',
      'Greece': 'GR',
      'Spain': 'ES',
      'Belgium': 'BE',
      'Luxembourg': 'LU',
      'Iceland': 'IS',
      'Macao': 'MO', 'Macau': 'MO',
      'China': 'CN',
      
      // 代码映射
      'US': 'US', 'HK': 'HK', 'TW': 'TW', 'JP': 'JP', 'SG': 'SG', 'KR': 'KR',
      'UK': 'UK', 'DE': 'DE', 'FR': 'FR', 'IN': 'IN', 'RU': 'RU', 'CA': 'CA',
      'AU': 'AU', 'IT': 'IT', 'BR': 'BR', 'NL': 'NL', 'TR': 'TR', 'ID': 'ID',
      'VN': 'VN', 'TH': 'TH', 'PH': 'PH', 'MY': 'MY', 'AR': 'AR', 'MX': 'MX',
      'CL': 'CL', 'ZA': 'ZA', 'AE': 'AE', 'IL': 'IL', 'CH': 'CH', 'SE': 'SE',
      'NO': 'NO', 'FI': 'FI', 'DK': 'DK', 'PL': 'PL', 'HU': 'HU', 'CZ': 'CZ',
      'AT': 'AT', 'IE': 'IE', 'PT': 'PT', 'GR': 'GR', 'ES': 'ES', 'BE': 'BE',
      'LU': 'LU', 'IS': 'IS', 'MO': 'MO', 'CN': 'CN'
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

    // CDN服务商识别模式
    this.cdnPatterns = [
      /cloudflare/i,
      /cdn/i,
      /fastly/i,
      /amazon.+cloudfront/i,
      /azure.+cdn/i,
      /google.+cloud.+cdn/i,
      /akamai/i,
      /jsdelivr/i,
      /unpkg/i,
      /maxcdn/i,
      /keycdn/i,
      /bunnycdn/i,
      /stackpath/i,
      /chinacache/i,
      /蓝汛/i,
      /网宿/i,
      /阿里云.+cdn/i,
      /腾讯云.+cdn/i,
      /百度云.+cdn/i,
      /又拍云/i,
      /七牛云/i
    ];

    // 运营商识别模式
    this.ispPatterns = [
      /移动/i,
      /联通/i,
      /电信/i,
      /mobile/i,
      /unicom/i,
      /telecom/i,
      /广东.+移动/i,
      /江苏.+移动/i,
      /北京.+移动/i,
      /上海.+移动/i,
      /浙江.+移动/i,
      /广东.+联通/i,
      /江苏.+联通/i,
      /北京.+联通/i,
      /上海.+联通/i,
      /浙江.+联通/i,
      /广东.+电信/i,
      /江苏.+电信/i,
      /北京.+电信/i,
      /上海.+电信/i,
      /浙江.+电信/i,
      /中国.+移动/i,
      /中国.+联通/i,
      /中国.+电信/i,
      /cmcc/i,
      /china.+mobile/i,
      /china.+unicom/i,
      /china.+telecom/i
    ];
  }

  /**
   * 构建国家/地区正则表达式
   */
  buildCountryRegex() {
    // 按长度排序，长的优先匹配，避免短词被误匹配
    const patterns = Object.keys(this.countryMap)
      .filter(key => key.length > 1) // 过滤掉单字符的映射，避免误匹配
      .sort((a, b) => b.length - a.length) // 按长度降序排列
      .map(key => {
        // 转义特殊字符
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped;
      });
    
    // 使用单词边界或特殊字符边界来确保精确匹配
    return new RegExp(`(?:^|[\\s\\-_（）()\\[\\]【】])((${patterns.join('|')}))(?=[\\s\\-_（）()\\[\\]【】]|$)`, 'i');
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
      nodeType: 'normal', // 新增节点类型字段
    };

    // 获取节点名称
    const name = node.name || '';

    // 1. 首先检查是否为CDN节点
    const isCdnNode = this.cdnPatterns.some(pattern => pattern.test(name));
    if (isCdnNode) {
      result.nodeType = 'cdn';
      result.countryCode = 'CDN';
      result.country = 'CDN';
      // CDN节点不需要进一步的地理位置识别，直接跳到协议识别
    }
    // 2. 检查是否为运营商节点
    else if (this.ispPatterns.some(pattern => pattern.test(name))) {
      result.nodeType = 'isp';
      result.countryCode = 'Others';
      result.country = 'Others';
      // 运营商节点不需要进一步的地理位置识别，直接跳到协议识别
    }
    // 3. 优先从节点的地理位置信息中获取国家信息（通过IP检测获得）
    else if (node.country && node.countryName) {
      result.countryCode = node.country;
      result.country = node.countryName;
      
      // 添加国家/地区图标
      if (this.countryIconMap[result.countryCode]) {
        result.icons.push({
          type: 'country',
          name: result.country,
          url: this.countryIconMap[result.countryCode]
        });
      }
    } else {
      // 4. 如果没有IP检测信息，从节点名称中提取国家/地区信息
      const countryMatch = name.match(this.countryRegex);
      if (countryMatch) {
        const countryKey = countryMatch[2]; // 修改为第2个捕获组
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
    }

    // 提取协议信息
    const protocolMatch = name.match(this.protocolRegex);
    if (protocolMatch) {
      const protocolKey = protocolMatch[1].toLowerCase();
      result.protocol = this.protocolMap[protocolKey];
    } else if (node.type) {
      // 优先使用节点的type字段
      const protocolKey = node.type.toLowerCase();
      if (this.protocolMap[protocolKey]) {
        result.protocol = this.protocolMap[protocolKey];
      } else {
        result.protocol = node.type;
      }
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
   * @param {number} index 节点索引（用于生成顺序编号）
   * @returns {string} 生成的节点名称
   */
  generateName(analysis, options = {}, index = null) {
    // 默认配置
    const config = {
      format: options.format || '{country}-{protocol}-{number}',
      includeCountry: options.includeCountry !== false,
      includeProtocol: options.includeProtocol !== false,
      includeNumber: options.includeNumber !== false,
      includeTags: options.includeTags === true,
      tagLimit: options.tagLimit || 2,
      ...options
    };

    // 特殊处理CDN节点
    if (analysis.nodeType === 'cdn') {
      const protocol = analysis.protocol || 'Unknown';
      const number = index !== null ? (index + 1).toString().padStart(2, '0') : '01';
      return `cdn-${protocol}-${number}`;
    }

    // 特殊处理运营商节点
    if (analysis.nodeType === 'isp') {
      const protocol = analysis.protocol || 'Unknown';
      const number = index !== null ? (index + 1).toString().padStart(2, '0') : '01';
      return `others-${protocol}-${number}`;
    }

    // 获取国家/地区代码或名称
    let country = '';
    if (config.includeCountry) {
      if (analysis.countryCode) {
        // 优先使用国家代码
        country = analysis.countryCode;
      } else if (analysis.country) {
        // 如果没有国家代码，则使用国家名称
        country = analysis.country;
      } else {
        // 如果都没有，则使用"Unknown"
        country = 'Unknown';
      }
    }

    // 获取协议
    let protocol = '';
    if (config.includeProtocol) {
      protocol = analysis.protocol || 'Unknown';
    }

    // 生成编号（从1开始，保证两位数）
    let number = '';
    if (config.includeNumber && index !== null) {
      number = (index + 1).toString().padStart(2, '0');
    }

    // 获取标签
    let tags = '';
    if (config.includeTags && analysis.tags && analysis.tags.length > 0) {
      // 过滤掉国家和协议标签，避免重复
      const filteredTags = analysis.tags.filter(tag => 
        tag !== analysis.country && 
        tag !== analysis.protocol &&
        tag !== analysis.countryCode
      );
      
      // 限制标签数量
      const limitedTags = filteredTags.slice(0, config.tagLimit);
      if (limitedTags.length > 0) {
        tags = limitedTags.join('-');
      }
    }

    // 如果有format模板，使用模板替换
    if (config.format && typeof config.format === 'string') {
      let name = config.format;
      
      // 替换占位符
      name = name.replace(/\{country\}/g, country);
      name = name.replace(/\{protocol\}/g, protocol);
      name = name.replace(/\{number\}/g, number);
      name = name.replace(/\{tags\}/g, tags);
      
      // 清理多余的分隔符
      name = name.replace(/[-_]{2,}/g, '-'); // 多个分隔符合并为一个
      name = name.replace(/^[-_]+|[-_]+$/g, ''); // 去掉开头和结尾的分隔符
      name = name.replace(/[-_]$/, ''); // 去掉末尾的分隔符
      
      return name || 'Unknown-Node';
    }

    // 如果没有format模板，按照默认格式组合
    const parts = [];
    if (country) parts.push(country);
    if (protocol) parts.push(protocol);
    if (number) parts.push(number);
    if (tags) parts.push(tags);
    
    return parts.length > 0 ? parts.join('-') : 'Unknown-Node';
  }
}

export default NodeAnalyzer;
