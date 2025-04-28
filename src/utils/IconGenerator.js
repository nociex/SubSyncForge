/**
 * 图标生成器
 * 用于生成各种分类的图标
 */

// 内置的分类图标（使用emoji和Unicode符号）
const ICONS = {
  // 地区图标
  'HK': '🇭🇰',
  'TW': '🇹🇼',
  'SG': '🇸🇬',
  'US': '🇺🇸',
  'JP': '🇯🇵',
  'OTHER': '🌐',

  // 流媒体图标
  'OpenAI': '🤖',
  'Disney+': '🏰',
  'Netflix': '📺',
  'YouTube': '▶️',
  'Hulu': '🟢',
  'HBO': '🎬',
  'AmazonPrime': '📦',
  'BBC': '📡',
  'Emby': '🎞️',
  'Spotify': '🎵',
  'Bilibili': '📹'
};

/**
 * 图标生成器类，用于生成和管理分类图标
 */
export class IconGenerator {
  constructor() {
    this.icons = { ...ICONS };  // 创建ICONS的副本
  }

  /**
   * 获取指定分类的图标
   * @param {string} category 分类名称
   * @returns {string} 图标字符
   */
  getIcon(category) {
    // 标准化分类名称
    const normalizedCategory = this.normalizeCategory(category);
    
    // 返回对应的图标，如果没有则返回默认图标
    return this.icons[normalizedCategory] || this.icons['OTHER'];
  }

  /**
   * 根据规则标准化分类名称
   * @param {string} category 原始分类名称
   * @returns {string} 标准化后的分类名称
   */
  normalizeCategory(category) {
    if (!category) return 'OTHER';
    
    // 转换为大写以便匹配
    const upperCategory = String(category).toUpperCase();
    
    // 地区匹配
    if (upperCategory.includes('HONG KONG') || upperCategory === 'HK') return 'HK';
    if (upperCategory.includes('TAIWAN') || upperCategory === 'TW') return 'TW';
    if (upperCategory.includes('SINGAPORE') || upperCategory === 'SG') return 'SG';
    if (upperCategory.includes('UNITED STATES') || upperCategory === 'USA' || upperCategory === 'US') return 'US';
    if (upperCategory.includes('JAPAN') || upperCategory === 'JP') return 'JP';
    
    // 流媒体匹配
    if (upperCategory.includes('OPENAI') || upperCategory.includes('CHATGPT')) return 'OpenAI';
    if (upperCategory.includes('DISNEY')) return 'Disney+';
    if (upperCategory.includes('NETFLIX')) return 'Netflix';
    if (upperCategory.includes('YOUTUBE')) return 'YouTube';
    if (upperCategory.includes('HULU')) return 'Hulu';
    if (upperCategory.includes('HBO') || upperCategory === 'HBO') return 'HBO';
    if (upperCategory.includes('AMAZON') || upperCategory.includes('PRIME')) return 'AmazonPrime';
    if (upperCategory.includes('BBC')) return 'BBC';
    if (upperCategory.includes('EMBY')) return 'Emby';
    if (upperCategory.includes('SPOTIFY')) return 'Spotify';
    if (upperCategory.includes('BILIBILI')) return 'Bilibili';
    
    return 'OTHER';
  }

  /**
   * 获取所有可用的图标分类
   * @returns {Object} 所有可用的图标分类对象
   */
  getAllCategories() {
    return { ...this.icons };
  }

  /**
   * 添加自定义图标
   * @param {string} category 分类名称
   * @param {string} icon 图标字符
   */
  addCustomIcon(category, icon) {
    if (category && icon) {
      this.icons[category] = icon;
    }
  }
}

// 创建一个单例实例并导出
const iconGenerator = new IconGenerator();
export default iconGenerator;