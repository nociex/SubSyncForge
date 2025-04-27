# SubSyncForge 开发指南

本文档提供了 SubSyncForge 项目的开发指南，包括项目结构、核心组件、开发流程和最佳实践。

## 项目架构

SubSyncForge 采用模块化架构，主要由以下几个部分组成：

1. **Worker 模块**：基于 Cloudflare Worker 的服务端代码
2. **转换器模块**：负责订阅源的获取、解析、转换等核心功能
3. **工具模块**：提供日志、事件、验证、监控等通用功能
4. **配置模块**：管理订阅源和转换规则的配置

### 目录结构

```
SubSyncForge/
├── src/
│   ├── worker/          # Cloudflare Worker 代码
│   │   ├── index.js     # Worker 入口文件
│   │   ├── router.js    # 请求路由处理
│   │   └── handlers/    # 各类请求处理器
│   ├── converter/       # 订阅转换核心逻辑
│   │   ├── index.js     # 转换器入口
│   │   ├── fetcher/     # 订阅源获取
│   │   ├── parser/      # 订阅解析
│   │   ├── dedup/       # 节点去重
│   │   └── formats/     # 格式转换
│   └── utils/           # 通用工具函数
│       ├── logger/      # 日志系统
│       ├── events/      # 事件系统
│       ├── validation/  # 数据验证
│       ├── metrics/     # 性能监控
│       └── health/      # 健康检查
├── config/              # 配置文件目录
├── templates/           # 转换模板
├── web/                 # 前端界面
└── docs/                # 文档
```

## 核心组件

### 1. SubscriptionConverter

`SubscriptionConverter` 是整个转换流程的核心类，负责协调各个组件完成订阅转换。

```javascript
const converter = new SubscriptionConverter({
  // 配置选项
  dedup: true,              // 是否启用去重
  validateInput: true,      // 是否验证输入
  recordMetrics: true,      // 是否记录性能指标
  emitEvents: true,         // 是否发出事件
  logger: customLogger,     // 自定义日志器
  template: 'custom'        // 自定义模板
});

// 转换订阅
const result = await converter.convert(
  'https://example.com/subscription',  // 订阅源 URL
  'clash'                             // 目标格式
);
```

### 2. 日志系统

日志系统提供了分级日志记录和可配置的日志处理器。

```javascript
import { logger } from '../utils';

// 创建子日志器
const log = logger.defaultLogger.child({ component: 'MyComponent' });

// 记录不同级别的日志
log.debug('调试信息', { extra: 'data' });
log.info('普通信息');
log.warn('警告信息');
log.error('错误信息', { error: err });
log.fatal('致命错误', { critical: true });
```

### 3. 事件系统

事件系统提供了发布/订阅模式的事件通知。

```javascript
import { events } from '../utils';

// 监听事件
events.eventEmitter.on(events.EventType.CONVERSION_COMPLETE, (data) => {
  console.log('转换完成:', data);
});

// 发出事件
events.eventEmitter.emit(events.EventType.CONVERSION_START, {
  source: 'https://example.com/sub',
  format: 'clash'
});
```

### 4. 数据验证

数据验证模块提供了灵活的数据验证功能。

```javascript
import { validation } from '../utils';

// 定义验证模式
const schema = {
  url: ['required', 'string', { pattern: /^https?:\/\/.+/ }],
  format: ['required', 'string', { enum: ['clash', 'surge', 'v2ray'] }]
};

// 验证数据
const result = validation.validate({
  url: 'https://example.com/sub',
  format: 'clash'
}, schema);

if (result.valid) {
  // 数据有效
  console.log(result.data);
} else {
  // 数据无效
  console.error(result.errors);
}
```

### 5. 性能监控

性能监控模块提供了详细的性能指标收集和分析功能。

```javascript
import { metrics } from '../utils';

// 记录计数器
metrics.metrics.increment('api.calls', 1, { endpoint: '/api/convert' });

// 记录仪表值
metrics.metrics.gauge('memory.usage', process.memoryUsage().heapUsed);

// 记录直方图值
metrics.metrics.histogram('response.time', 150, { status: 200 });

// 计时器
const timer = metrics.metrics.startTimer('function.time');
// ... 执行代码 ...
const duration = timer.stop();
```

### 6. 健康检查

健康检查模块提供了系统健康状态监控功能。

```javascript
import { health } from '../utils';

// 添加自定义健康检查
health.healthCheck.addCheck(async () => {
  return {
    name: 'database',
    status: isDbConnected ? health.HealthStatus.UP : health.HealthStatus.DOWN,
    message: isDbConnected ? 'Database is connected' : 'Database connection failed',
    details: { connectionTime: dbConnectionTime }
  };
});

// 执行健康检查
const healthResult = await health.healthCheck.check();
```

## 开发流程

### 1. 环境设置

```bash
# 安装依赖
pnpm install

# 运行开发服务器
pnpm dev
```

### 2. 测试

```bash
# 运行单元测试
pnpm test

# 运行特定测试
pnpm test -- --filter=SubscriptionConverter
```

### 3. 部署

```bash
# 部署到 Cloudflare Worker
pnpm deploy
```

## 示例代码

### 1. 自定义订阅源

以下是在 `config/custom.yaml` 中添加自定义订阅源的示例：

```yaml
# 订阅源列表
subscriptions:
  # 从 URL 获取订阅
  - type: url
    value: "https://example.com/subscription"
    name: "示例订阅1"

  # 直接使用 Base64 编码的节点列表
  - type: base64
    value: "dm1lc3M6Ly9leUoySWpvaU1pSXNJbkJ6SWpvaVhIVTVPVGs1WEhVMlpUSm1MakY4WjJOd2ZGeDFOV1UzWmx4MU5tVXlabHgxT1dGa09GeDFPVEF4WmlJc0ltRmtaQ0k2SW5Ob2F5NWpaREV5TXpRdWVIbDZJaXdpY0c5eWRDSTZJakkyT0RFNUlpd2lhV1FpT2lKbVpqTmxOak01TkMwMll6TmxMVFJpWVdFdFlUUTROaTFrWWpnMU5XWmtORFV4TURRaUxDSmhhV1FpT2lJd0lpd2libVYwSWpvaWQzTWlMQ0owZVhCbElqb2libTl1WlNJc0ltaHZjM1FpT2lKc2FXNTFhR0Z2TG1OdmJTSXNJbkJoZEdnaU9pSmNMM05vYXk1alpERXlNelF1ZUhsNklpd2lkR3h6SWpvaUluMD0="
    name: "Base64示例"
```

### 2. 使用转换器 API

以下是使用 `SubscriptionConverter` 类进行订阅转换的示例：

```javascript
import { SubscriptionConverter } from './src/converter';

// 创建转换器实例
const converter = new SubscriptionConverter({
  dedup: true,              // 启用去重
  validateInput: true,      // 启用输入验证
  recordMetrics: true,      // 记录性能指标
  emitEvents: true          // 发出事件通知
});

// 转换订阅
async function convertSubscription() {
  try {
    const result = await converter.convert(
      'https://example.com/subscription',  // 订阅源 URL
      'clash',                            // 目标格式
      {
        template: 'templates/mihomo.yaml'  // 自定义模板
      }
    );

    if (result.success) {
      console.log(`转换成功，共 ${result.nodeCount} 个节点`);
      console.log(result.data);
    } else {
      console.error(`转换失败: ${result.error}`);
    }
  } catch (error) {
    console.error('转换过程出错:', error);
  }
}

convertSubscription();
```

### 3. 自定义模板

以下是创建自定义 Clash 模板的示例：

```yaml
# 自定义 Clash 模板
port: 7890
socks-port: 7891
allow-lan: true
mode: rule
log-level: info

# 节点信息将被替换到这里
proxies:
  {{proxies}}

# 代理组
proxy-groups:
  - name: "PROXY"
    type: select
    proxies:
      - AUTO
      {{proxyNames}}

  - name: "AUTO"
    type: url-test
    url: http://www.gstatic.com/generate_204
    interval: 300
    proxies:
      {{proxyNames}}

# 规则
rules:
  - DOMAIN-SUFFIX,google.com,PROXY
  - DOMAIN-SUFFIX,github.com,PROXY
  - GEOIP,CN,DIRECT
  - MATCH,PROXY
```

### 4. 使用事件系统

以下是使用事件系统监听转换过程的示例：

```javascript
import { events } from './src/utils';

// 监听转换开始事件
events.eventEmitter.on(events.EventType.CONVERSION_START, (data) => {
  console.log('转换开始:', data);
});

// 监听转换完成事件
events.eventEmitter.on(events.EventType.CONVERSION_COMPLETE, (data) => {
  console.log('转换完成:', data);
  console.log(`处理了 ${data.nodeCount} 个节点，耗时 ${data.time}ms`);
});

// 监听错误事件
events.eventEmitter.on(events.EventType.CONVERSION_ERROR, (data) => {
  console.error('转换错误:', data.error);
});
```

### 5. 使用 Webhook 通知

以下是配置 Webhook 通知的示例：

```javascript
import { events } from './src/utils';

// 创建 Webhook 通知器
const webhookNotifier = new events.WebhookNotifier({
  webhookUrl: 'https://your-webhook-url.com/hook',
  events: [
    events.EventType.CONVERSION_COMPLETE,
    events.EventType.CONVERSION_ERROR
  ],
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  }
});

// Webhook 将自动发送指定事件的通知
```

## 最佳实践

### 错误处理

- 使用自定义错误类型（`FetchError`, `ParseError` 等）
- 提供详细的错误上下文
- 使用 try-catch 块捕获和处理错误
- 记录错误日志，包括堆栈跟踪

```javascript
try {
  // 可能出错的代码
} catch (error) {
  const fetchError = new FetchError(`Failed to fetch: ${error.message}`, {
    cause: error,
    context: { url }
  });

  logger.error('Fetch failed', fetchError.getDetails());
  throw fetchError;
}
```

### 异步编程

- 使用 async/await 处理异步操作
- 使用 Promise.all 并行处理多个异步操作
- 设置合理的超时时间

```javascript
async function fetchMultiple(urls) {
  const promises = urls.map(async (url) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response.text();
    } catch (error) {
      logger.error(`Failed to fetch ${url}`, { error });
      return null;
    }
  });

  return Promise.all(promises);
}
```

### 性能优化

- 使用缓存减少重复计算
- 避免不必要的深拷贝
- 使用 Map 和 Set 提高查找效率
- 记录和分析性能指标

```javascript
// 使用 Map 提高查找效率
const nodeMap = new Map();
for (const node of nodes) {
  const key = `${node.server}:${node.port}`;
  nodeMap.set(key, node);
}
```

### 代码风格

- 使用 ESLint 和 Prettier 保持代码风格一致
- 编写清晰的注释和文档
- 遵循模块化和单一职责原则
- 使用有意义的变量和函数名

## 贡献指南

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 常见问题

### Q: 如何添加新的转换格式？

A: 在 `src/converter/formats` 目录下创建新的格式转换器，并在 `FormatConverter` 类中注册。

### Q: 如何自定义日志输出？

A: 创建自定义的 `LogHandler` 实现，并将其添加到 `Logger` 实例中。

### Q: 如何处理大量节点的性能问题？

A: 使用分批处理、并行处理和缓存机制来优化性能。

## 参考资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [JavaScript 异步编程](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous)
- [性能优化最佳实践](https://web.dev/fast/)
