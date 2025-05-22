# SubSyncForge 项目架构

## 项目简介

SubSyncForge 是一个用于获取、处理、测试和生成各种代理订阅配置的工具。它支持多种订阅格式和协议类型，能够自动测试节点并生成各种目标格式的配置文件。

## 目录结构

```
src/
├── core/                  # 核心功能模块
│   ├── config/            # 配置相关
│   │   ├── ConfigLoader.js   # 配置加载器
│   │   └── ConfigDefaults.js # 默认配置
│   ├── subscription/      # 订阅获取
│   │   └── SubscriptionFetcher.js # 订阅获取器
│   ├── node/              # 节点处理
│   │   └── NodeProcessor.js # 节点处理器
│   ├── testing/           # 节点测试
│   │   └── NodeTester.js  # 节点测试器
│   ├── output/            # 配置生成
│   │   └── ConfigGenerator.js # 配置生成器
│   ├── proxy/             # 代理管理
│   │   └── ProxyManager.js # 代理管理器
│   ├── utils/             # 通用工具
│   │   ├── FileSystem.js  # 文件系统工具
│   │   ├── Logger.js      # 日志工具
│   │   └── TimeLimit.js   # 时间限制工具
│   └── SyncManager.js     # 同步管理器
├── converter/             # 格式转换器
│   ├── SubscriptionConverter.js # 订阅转换器
│   └── parser/            # 解析器
│       ├── SubscriptionParser.js # 订阅解析器
│       └── formats/       # 各种格式解析器
│           ├── Base64Parser.js # Base64解析器
│           ├── PlainTextParser.js # 纯文本解析器
│           ├── ClashParser.js # Clash格式解析器
│           └── JsonParser.js # JSON格式解析器
└── scripts/               # 脚本
    └── sync-subscriptions.js # 主入口脚本
```

## 模块说明

### 1. 配置模块 (config/)

- **ConfigLoader.js**: 负责从文件加载配置并合并默认配置
- **ConfigDefaults.js**: 提供默认配置值和常量定义

### 2. 订阅获取模块 (subscription/)

- **SubscriptionFetcher.js**: 负责从远程获取订阅内容，处理缓存，检测格式

### 3. 节点处理模块 (node/)

- **NodeProcessor.js**: 负责节点的去重、过滤和规范化

### 4. 节点测试模块 (testing/)

- **NodeTester.js**: 负责测试节点的连通性和性能

### 5. 配置生成模块 (output/)

- **ConfigGenerator.js**: 负责生成各种格式的配置文件

### 6. 代理管理模块 (proxy/)

- **ProxyManager.js**: 负责管理和提供代理

### 7. 工具模块 (utils/)

- **FileSystem.js**: 提供文件系统操作相关功能
- **Logger.js**: 提供统一的日志记录功能
- **TimeLimit.js**: 控制脚本执行时间

### 8. 同步管理器 (SyncManager.js)

- 整合各个模块，协调工作流程

## 数据流

1. SyncManager 初始化和配置加载
2. SubscriptionFetcher 获取订阅内容
3. NodeProcessor 处理节点（去重、过滤）
4. NodeTester 测试节点性能和可用性
5. ConfigGenerator 生成最终配置文件

## 主要接口

### SyncManager

```javascript
// 初始化
await syncManager.initialize();

// 启动同步
const result = await syncManager.start();
```

### SubscriptionFetcher

```javascript
// 获取所有订阅
const nodes = await subscriptionFetcher.fetchAllSubscriptions(subscriptions);
```

### NodeProcessor

```javascript
// 处理节点
const processedNodes = nodeProcessor.processNodes(nodes, options);
```

### NodeTester

```javascript
// 测试节点
const validNodes = await nodeTester.testNodes(nodes);
```

### ConfigGenerator

```javascript
// 生成配置
const files = await configGenerator.generateConfigs(nodes, outputConfigs);
```

## 扩展点

1. **新的订阅格式**: 在 `converter/parser/formats/` 中添加新的解析器
2. **新的输出格式**: 在 `ConfigGenerator.js` 中添加新的生成方法
3. **新的测试方法**: 在 `NodeTester.js` 中扩展测试功能 