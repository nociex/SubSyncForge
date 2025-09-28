# Cloudflare Worker API 指南

SubSyncForge 提供了一个基于 Cloudflare Worker 的 HTTP 入口，主要用于实验性地演示订阅转换服务的接口形态。当前仓库版本中，Worker 仅返回演示数据，并未真正调用核心的 `SubscriptionConverter` / `SyncManager`。本文档旨在说明现状、演示接口格式，并为未来扩展提供指引。

> ⚠️ **注意**：若需要生产可用的在线转换服务，需要额外实现数据校验、鉴权、速率控制以及与核心模块的集成。本指南仅适用于本地调试或二次开发的参考。

## 1. 环境准备

- 安装依赖：`pnpm install`
- 构建代码：`pnpm run build`（或直接使用 `src/worker` 源码）
- 启动本地 Worker：
  ```bash
  pnpm wrangler dev
  ```
  默认会在 `http://127.0.0.1:8787` 提供服务。

## 2. 路由与当前行为

| 路由 | 方法 | 当前实现 | 备注 |
|------|------|----------|------|
| `/api/subscriptions` | GET | 返回硬编码的单条订阅示例 | 未来应读取 `config/subscriptions.json` 或外部存储 |
| `/api/convert` | POST | 回传请求体中的 `url`、`format` 并生成示例文本 | 未执行真实抓取/解析/转换 |
| `/api/status` | GET | 返回版本号、运行时长等静态信息 | 无真实监控数据 |
| `/api/health` | GET | 透出简单健康检查（位于 `handlers/healthHandler.js`） | 可扩展为真实依赖检测 |
| `/output/:groupName` | GET | 调用 `groupHandler`，读取本地 `output/` 下的指定文件 | 需确保产物存在且可公开 |

示例响应可参考 `src/worker/handlers` 中的实现。以下为 `/api/convert` 当前返回的数据结构：

```json
{
  "success": true,
  "format": "clash",
  "nodeCount": 10,
  "data": "# 这是一个示例转换结果\n# 格式: clash\n# 来源: https://example.com"
}
```

## 3. 与核心流程集成的建议步骤

要让 Worker 真正完成订阅转换，可参考以下思路：

1. **引入构建产物**：
   - 将 `dist/` 中的同步/转换模块通过 Rollup 打包为 Worker 可用版本。
   - 或者直接在 Worker 中使用 `src/converter/SubscriptionConverter.js`，注意 Cloudflare Worker 的运行时限制。
2. **实现输入校验**：解析请求体时使用 `validation` 模块或新增 JSON Schema，确保 URL、格式、选项有效。
3. **调用转换器**：
   ```javascript
   import { SubscriptionConverter } from '../../converter/SubscriptionConverter.js';

   const converter = new SubscriptionConverter({
     logger: defaultLogger.child({ component: 'worker' }),
     outputDir: 'output',
     // 根据需要传入 nodeManager、ruleManager 参数
   });

   const { data, nodeCount } = await converter.convert(url, format, options);
   ```
4. **增加缓存与速率限制**：可使用 Cloudflare KV、Durable Objects 或绑定存储，以减轻源站压力。
5. **安全控制**：
   - 引入令牌或 IP 白名单，防止公共滥用。
   - 避免原始订阅 URL、核心日志直接暴露给终端用户。
6. **错误处理**：统一捕获 `FetchError`、`ParseError`、`ConversionError` 等，返回结构化的错误响应。

## 4. 部署参考（实验性）

1. 登录 Cloudflare 并创建一个新的 Worker。
2. 在仓库根目录创建或更新 `wrangler.toml`，设定 `name`、`main`、`compatibility_date` 等字段。
3. 执行：
   ```bash
   pnpm wrangler deploy
   ```
4. 验证：使用 `curl` 或 Postman 调用对应路由，确认返回期望结果。

> 部署前务必对订阅 URL、输出内容进行脱敏处理，避免泄露私有节点。实际线上服务应配合日志监控、限流与告警体系。

## 5. 后续改进计划（建议）

- [ ] 将 `/api/convert` 与 `SubscriptionConverter` 打通，支持多格式输出和模板选择。
- [ ] `/api/subscriptions` 动态读取 `config/subscriptions.json` 并支持分组、过滤参数。
- [ ] 增加鉴权、速率限制与审计日志，提升安全性。
- [ ] 输出结果支持压缩/短期缓存，减轻源站压力。
- [ ] 引入自动化测试（单元、契约测试）确保接口变更可控。

## 6. 参考资料

- `src/worker/index.js`、`src/worker/router.js`、`src/worker/handlers/*`
- `docs/DEVELOPMENT.md`：包含脚本说明与目录结构。
- Cloudflare Workers 官方文档：[https://developers.cloudflare.com/workers/](https://developers.cloudflare.com/workers/)

如需贡献 Worker 相关能力，欢迎在 Issue 中讨论设计方案，并在 PR 中同步更新本指南。
