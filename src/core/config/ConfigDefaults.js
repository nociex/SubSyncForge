/**
 * 默认配置
 * 提供系统所有配置项的默认值
 */

export const defaultConfig = {
  rootDir: process.cwd(),
  configFile: 'config/custom.yaml',
  subscriptions: [],
  outputConfigs: [],
  options: {
    deduplication: true,
    filterIrrelevant: true,  // 过滤掉包含"剩余流量"、"重置时间"等无关信息的节点
    dataDir: 'data',
    outputDir: 'output',
    githubUser: '',         // GitHub 用户名，用于生成默认 URL
    repoName: 'SubSyncForge' // GitHub 仓库名，用于生成默认 URL
  },
  advanced: {
    logLevel: 'info',
    cacheTtl: 3600,
    proxyForSubscription: false,
    sortNodes: true,
    syncInterval: 360
  },
  testing: {
    enabled: true,
    concurrency: 5,
    timeout: 5000,
    test_url: "http://www.google.com/generate_204",
    filter_invalid: true,
    sort_by_latency: true,
    max_latency: 2000,
    max_nodes: 100,
    verify_location: false,
    ip_location: {
      api_url: 'https://ipinfo.io/{ip}/json',
      api_key: '',
      cache_time: 604800000 // 7天
    }
  }
};

// 订阅类型常量
export const SubscriptionType = {
  URL: 'url',
  BASE64: 'base64',
  VMESS: 'vmess',
  SS: 'ss',
  SSR: 'ssr',
  TROJAN: 'trojan'
};

// 目标转换格式常量
export const ConversionFormat = {
  CLASH: 'clash',
  MIHOMO: 'mihomo',
  SURGE: 'surge',
  SINGBOX: 'singbox',
  V2RAY: 'v2ray'
}; 