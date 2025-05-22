# 中国大陆代理功能使用说明

本文档说明了如何使用SubSyncForge的中国大陆代理功能，该功能允许通过中国大陆的SOCKS代理获取订阅内容和测试节点速度。

## 功能特点

1. **使用中国IP获取订阅**：部分机场网站限制非中国IP获取订阅内容，此功能可以绕过此限制。
2. **从中国角度测速**：通过中国大陆网络测试节点延迟，获得更准确的实际使用体验数据。
3. **缓存支持**：自动缓存获取的订阅内容，减少重复请求。
4. **自动环境检测**：能够识别是否在中国大陆环境中运行，根据环境自动调整策略。
5. **自动代理选择**：可以从已缓存节点中自动发现并使用中国大陆节点作为代理。
6. **完善的容错机制**：即使找不到中国大陆节点，也能通过多种降级策略确保功能正常运行。
7. **自动检测中国节点**：检测所有节点的IP地理位置，识别中国大陆节点并标记。
8. **自动转换为SOCKS节点**：将发现的中国大陆节点自动转换为SOCKS类型，方便作为代理使用。
9. **专用缓存**：维护专用的中国SOCKS节点缓存，提高后续使用效率。

## 配置说明

### 1. 基本配置文件

创建或编辑 `config/china_proxies.json` 文件：

```json
{
  "version": "1.0",
  "description": "中国大陆SOCKS代理列表，用于获取订阅和测速",
  "enabled": true,
  "auto_detect_environment": true,
  "use_local_connection_if_in_china": true,
  "auto_find_china_nodes_from_cache": true,
  "fallback_to_direct": true,
  "allow_non_china_socks_nodes": true,
  "china_node_keywords": [
    "中国", "CN", "China", "大陆", "国内", "回国", "电信", "联通", "移动"
  ],
  "backup_proxies": [
    {
      "name": "备用本地代理",
      "server": "127.0.0.1",
      "port": 7890,
      "type": "socks5"
    }
  ],
  "proxies": [
    {
      "name": "本地代理",
      "server": "127.0.0.1",
      "port": 7891,
      "type": "socks5"
    }
  ],
  "use_for_subscription": true,
  "use_for_testing": true,
  "subscription": {
    "cache_ttl": 21600,
    "timeout": 10000,
    "retries": 3
  },
  "testing": {
    "timeout": 5000,
    "test_url": "http://www.gstatic.com/generate_204"
  }
}
```

### 2. 配置选项说明

| 选项 | 类型 | 说明 |
|-----|------|------|
| `enabled` | 布尔值 | 是否启用中国代理功能 |
| `auto_detect_environment` | 布尔值 | 是否自动检测运行环境 |
| `use_local_connection_if_in_china` | 布尔值 | 如检测到在中国环境中是否直接使用本地连接 |
| `auto_find_china_nodes_from_cache` | 布尔值 | 是否从缓存中自动查找中国节点作为代理 |
| `fallback_to_direct` | 布尔值 | 如果找不到可用代理是否直接连接 |
| `allow_non_china_socks_nodes` | 布尔值 | 找不到中国节点时是否使用其他SOCKS节点 |
| `china_node_keywords` | 数组 | 用于识别中国节点的关键词列表 |
| `backup_proxies` | 数组 | 备用代理列表，当找不到其他代理时使用 |
| `proxies` | 数组 | 优先使用的代理列表 |
| `use_for_subscription` | 布尔值 | 是否用于获取订阅 |
| `use_for_testing` | 布尔值 | 是否用于测速 |
| `subscription` | 对象 | 订阅相关设置 |
| `testing` | 对象 | 测速相关设置 |

### 3. 代理配置格式

每个代理可以使用以下格式：

```json
{
  "name": "代理名称",
  "server": "服务器地址",
  "port": 端口号,
  "type": "socks5", 
  "username": "用户名", // 可选
  "password": "密码"    // 可选
}
```

### 4. 订阅配置选项

在订阅配置中可以添加以下选项来控制中国节点检测和代理使用：

```json
{
  "name": "example-sub",
  "url": "https://example.com/sub",
  "type": "url",
  "enabled": true,
  "detect_chinese_nodes": true, // 启用中国节点检测和转换
  "use_china_proxy": true       // 使用中国代理获取此订阅
}
```

### 5. 中国节点检测和转换

系统会自动检测订阅中的节点IP地址，识别位于中国大陆的节点，并执行以下操作：

1. 标记节点的地理位置信息
2. 将中国大陆节点转换为SOCKS类型
3. 将转换后的节点添加到节点列表和专用缓存中
4. 后续可以将这些SOCKS节点用作代理

## 容错机制

系统提供了多层容错机制，确保即使找不到中国大陆节点也能正常运行：

1. **优先级策略**：
   - 首先使用配置文件中的指定代理
   - 然后尝试从缓存中查找中国节点
   - 如果允许，尝试使用非中国SOCKS节点
   - 最后使用备用代理
   - 如果都失败，可配置为直接连接

2. **环境变量控制**：
   - `RUNNING_IN_CHINA=true/false` - 强制指定是否在中国环境
   - `USE_CHINA_PROXY=false` - 禁用中国代理功能
   - `BACKUP_PROXY_SERVER`/`BACKUP_PROXY_PORT` - 指定备用代理

3. **多API检测**：使用多个IP信息API检测当前运行环境位置，提高可靠性。

4. **多重后备**：
   - 自动识别中国节点时支持多种匹配方式
   - 尝试访问中国特有网站检测网络环境
   - 系统语言和时区识别

## 使用方法

### 1. 在代码中启用中国代理功能

```javascript
// 创建订阅获取器（启用中国代理）
const fetcher = new SubscriptionFetcher({
  rootDir: process.cwd(),
  dataDir: 'data',
  converter: converter,
  chinaProxyEnabled: true  // 启用中国代理功能
});

// 创建节点测试器（启用中国代理测速）
const tester = new NodeTester({
  rootDir: process.cwd(),
  dataDir: 'data',
  useChineseProxy: true  // 启用中国代理测速
});
```

### 2. 为特定订阅启用中国代理

在订阅配置中添加 `use_china_proxy: true` 选项：

```javascript
const subscriptions = [
  {
    name: "example-sub",
    url: "https://example.com/sub",
    type: "url",
    enabled: true,
    use_china_proxy: true  // 使用中国代理获取此订阅
  }
];
```

### 3. 查看测试结果

测试结果会包含常规测试和中国代理测试的对比数据：

```json
{
  "name": "节点名称",
  "server": "server.com",
  "port": 443,
  "valid": true,
  "latency": 200,
  "china_test": {
    "valid": true,
    "latency": 350,
    "error": null
  }
}
```

## 在GitHub Actions中使用

在GitHub Actions工作流中使用此功能时，建议：

1. 设置环境变量控制功能启用：

```yaml
env:
  USE_CHINA_PROXY: 'true'
  AUTO_FIND_CHINA_NODES: 'true'
  FALLBACK_TO_DIRECT: 'true'
```

2. 配置secrets存储稳定的中国代理：

```yaml
jobs:
  build:
    steps:
      - name: Setup China Proxy Config
        run: |
          echo '{
            "enabled": true,
            "auto_find_china_nodes_from_cache": true,
            "fallback_to_direct": true,
            "proxies": [
              {
                "name": "CN-1",
                "server": "${{ secrets.CN_PROXY_SERVER }}",
                "port": ${{ secrets.CN_PROXY_PORT }},
                "type": "socks5",
                "username": "${{ secrets.CN_PROXY_USERNAME }}",
                "password": "${{ secrets.CN_PROXY_PASSWORD }}"
              }
            ]
          }' > config/china_proxies.json
```

3. 备用代理环境变量配置：

```yaml
env:
  BACKUP_PROXY_SERVER: '${{ secrets.BACKUP_PROXY_SERVER }}'
  BACKUP_PROXY_PORT: '${{ secrets.BACKUP_PROXY_PORT }}'
  BACKUP_PROXY_TYPE: 'socks5'
  BACKUP_PROXY_USERNAME: '${{ secrets.BACKUP_PROXY_USERNAME }}'
  BACKUP_PROXY_PASSWORD: '${{ secrets.BACKUP_PROXY_PASSWORD }}'
```

## 示例代码

参考 `examples/use-china-proxy.js` 文件，了解完整的使用流程。

## 注意事项

1. 本地开发时默认使用配置的本地代理（通常是本地运行的Clash等代理工具）
2. 在中国大陆环境运行时，可自动跳过代理直接连接
3. 在非中国环境（如GitHub Actions）可自动从缓存中寻找中国节点作为代理
4. 测速结果包含常规测试和中国测试的对比数据，可用于选择最适合的节点
5. 即使找不到中国节点，系统也会通过各种容错机制确保功能正常运行 