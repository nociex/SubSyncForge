# 订阅转换模块技术文档

## 模块概述

订阅转换模块是 SubSyncForge 的核心组件，负责处理订阅源的获取、解析、转换等操作。该模块采用管道式处理流程，确保数据处理的清晰性和可扩展性。

## 核心功能

### 1. 抓取阶段 (Fetcher)
```javascript
class SubscriptionFetcher {
  async fetch(url, options = {}) {
    // 处理 HTTP 请求
    // 支持重试机制
    // 处理超时
    // 返回原始数据
  }
}
```

- 支持 HTTP/HTTPS 协议
- 自动处理 301/302 重定向
- 超时控制：默认 30 秒
- 智能重试机制：
  - 指数退避策略
  - 可配置重试次数
  - 详细错误日志

### 2. 整理阶段 (Parser)
```javascript
class SubscriptionParser {
  parse(raw) {
    // 检测输入格式
    // 解析数据
    // 数据验证
    // 转换为统一格式
    return nodes;
  }
}
```

- 支持多种输入格式
- 数据验证机制
- 格式自动检测
- 错误恢复能力

### 3. 去重处理 (Deduplicator)
```javascript
class NodeDeduplicator {
  deduplicate(nodes, options = {}) {
    // 节点特征提取
    // 相似度比较
    // 优先级排序
    return uniqueNodes;
  }
}
```

- 智能去重策略
- 可自定义比较规则
- 性能优化处理
- 保留节点质量

### 4. 事件系统
```javascript
class EventEmitter {
  emit(event, data) {
    // 事件触发
    // 异步通知
    // 错误处理
  }
}
```

- 转换过程事件通知
- 异步事件处理
- 错误事件捕获
- Webhook 支持

### 5. 日志系统
```javascript
class Logger {
  log(level, message, context) {
    // 分级日志
    // 上下文记录
    // 格式化输出
  }
}
```

- 多级日志支持
- 结构化日志记录
- 可配置处理器
- 上下文追踪

### 6. 性能监控
```javascript
class Metrics {
  record(metric, value) {
    // 指标记录
    // 性能统计
    // 数据导出
  }
}
```

- 详细性能指标
- 实时监控能力
- 数据统计分析
- 性能报告生成

## 使用示例

```javascript
const converter = new SubscriptionConverter({
  logger: {
    level: 'info',
    handlers: [consoleHandler, fileHandler]
  },
  metrics: {
    enabled: true,
    exportInterval: 60000
  },
  retry: {
    attempts: 3,
    delay: 1000
  }
});

converter.on('conversionComplete', (result) => {
  console.log('转换完成:', result);
});

const result = await converter.convert(sourceUrl, 'clash');
```

## 错误处理

- `FetchError`: 订阅源获取失败
- `ParseError`: 解析错误
- `ValidationError`: 验证失败
- `ConversionError`: 转换失败

每个错误都包含：
- 详细错误信息
- 错误上下文
- 堆栈跟踪
- 重试信息

## 性能优化

- 智能缓存机制
- 并行处理能力
- 资源使用优化
- 增量更新支持

## 监控指标

- 转换成功率
- 平均响应时间
- 错误率统计
- 资源使用情况

## 配置选项

```javascript
{
  // 日志配置
  logger: {
    level: 'info',
    handlers: [],
    format: 'json'
  },

  // 重试配置
  retry: {
    attempts: 3,
    delay: 1000,
    maxDelay: 5000
  },

  // 性能监控
  metrics: {
    enabled: true,
    exportInterval: 60000
  },

  // 缓存配置
  cache: {
    enabled: true,
    ttl: 3600
  }
}
```

## 注意事项

1. 合理配置重试参数
2. 监控系统资源使用
3. 定期检查日志
4. 及时处理错误通知
