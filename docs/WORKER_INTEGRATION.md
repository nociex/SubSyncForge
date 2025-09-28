# Cloudflare Worker 与核心流水线集成提案

本文档评估如何将现有 Cloudflare Worker 接口与 SubSyncForge 的核心转换流水线打通，涵盖技术可行性、资源限制、鉴权/限流策略、部署流程以及建议的迭代步骤。

## 1. 目标概述

- 将 `/api/convert` 请求接入 `SubscriptionConverter`，支持真实订阅抓取、解析、节点处理与格式输出；
- 为 `/api/subscriptions` 提供来自 `config/subscriptions.json` 的动态数据视图；
- 保证 Worker 运行时的性能、存储与安全可控，避免影响既有同步脚本；
- 为未来扩展（队列、缓存、鉴权）留下扩展点。

## 2. 技术约束与运行时评估

| 维度 | Cloudflare Worker 限制 | 对项目的影响 |
|------|------------------------|--------------|
| 运行时 API | 基于 V8、无 Node.js 原生模块（`fs`, `net`, `child_process` 等） | 无法直接使用 Node 端的 Mihomo/V2Ray 核心、文件系统调用 |
| 外部依赖 | 需使用纯 ESM、兼容 Worker 环境的依赖，建议通过 Rollup 打包 | 现有代码依赖 `fs`, `path`, `node-fetch` 等，需要按环境替换或打包处理 |
| 内存/CPU | 免费计划单请求 10ms CPU / 128MB 内存（较短） | 完整抓取+转换可能超时，需控制节点数量或引入缓存 |
| KV/存储 | 可使用 KV、Durable Objects、R2 等持久化方案 | 适合缓存订阅内容、转换结果、速率信息 |
| 网络访问 | 支持 `fetch`，但需考虑超时与并发限制 | 订阅抓取可直接使用 `fetch`，需处理超时重试 |

结论：在 Worker 环境直接执行完整同步流水线不可行（缺少文件系统、核心测试），但可实现“轻量转换服务”：仅执行订阅下载、解析、去重、部分节点处理，并将结果返回或缓存。高级拨测仍需在 Node 环境执行。

## 3. 架构方案

### 3.1 轻量转换服务（推荐作为第一阶段）

```
Request ──> Worker ──┐
                     │ fetch + parse + convert (轻量版)
                     └─> KV/R2 缓存结果 (可选)
                         │
Response <──────────────┘
```

- 在 Worker 中引入 `SubscriptionConverter` 的简化版本：
  - 排除依赖 `fs`、`child_process` 的功能（例如模板读写可在部署时内嵌）。
  - 使用 Rollup 构建，将必要模块打包到 Worker 产物中。
  - 去除 `AdvancedNodeTester`、`ProxyCoreManager` 等不可用组件。
- 只执行以下步骤：
  1. 根据请求参数抓取订阅（通过 Worker `fetch`）。
  2. 使用转换器解析、去重、按地区/服务分组。
  3. 基于指定模板生成字符串，直接返回或缓存。

### 3.2 混合模型（后续）

```
Worker ──> Queue / Durable Object ──> Node backend (SyncManager)
                                         │
                                         └─> R2 / GitHub 输出
```

- Worker 接口仅负责鉴权、排队（Queue / Durable Object）。
- 实际长时任务由现有 Node 运行环境处理（GitHub Actions、自托管服务）。
- Worker 可提供最新产物的下载入口，或查询任务状态。

## 4. 模块改造计划

1. **打包与环境适配**
   - 配置 Rollup 额外产物：`dist/worker.bundle.js`，目标为 ES module，移除 Node-only polyfill。
   - 为模板文件提供内嵌版本：可在打包时将 `templates/` 内容转换为常量。
   - 将 `node-fetch` 替换为原生 `fetch`，并对代理支持做降级处理。

2. **转换器瘦身**
   - 新增 `SubscriptionConverterLite`（或为现有转换器添加 `env: 'worker'` 配置），禁用以下能力：
     - 文件系统写入（输出直接作为字符串返回）；
     - 复杂规则加载（可选）；
     - 节点测试、IP 定位。
   - 复用 `SubscriptionParser`、`NodeManager`、`FormatConverter` 中与环境无关的逻辑。

3. **配置加载**
   - Worker 环境无法访问本地文件，可通过以下方式之一：
     - 在构建时将 `config/subscriptions.json`、`config/custom.yaml` 的必要字段转换为常量对象（仅适用于公开订阅的场景）。
     - 或将配置托管在 KV / R2 / GitHub Raw，然后由 Worker 在运行时获取。
   - 为 `/api/subscriptions` 实现查询时，建议只暴露非敏感字段，并支持按 `enabled`, `type` 过滤。

4. **鉴权与限流**
   - 支持 `Authorization` 头或查询参数中的 Token，配置写入 `wrangler.toml` 的环境变量。
   - 采用 Cloudflare 自带 `Rate Limiting Rules` 或在 Worker 中利用 KV 记录调用次数。
   - 为 `/api/convert` 增加白名单或参数校验防止滥用（例如限制目标模板、节点数量）。

5. **缓存策略（可选）**
   - 使用 KV 以 `hash(url + format + template)` 为键缓存转换结果，设置短期 TTL。
   - 对于订阅响应较大的场景，可将整份输出存储在 R2，并返回下载链接。

6. **错误处理与监控**
   - Worker 环境可集成 Sentry/Logflare 等观测服务。
   - 统一返回结构：
     ```json
     { "success": false, "error": "FETCH_FAILED", "message": "..." }
     ```
   - 为常见错误（抓取失败、格式不支持、内部异常）提供用户可读提示。

## 5. 部署与发布流程

1. 更新 Rollup 配置，新增 Worker 构建步骤。
2. 在 `wrangler.toml` 中配置入口 `dist/worker.bundle.js`、环境变量（如 `API_TOKEN`、`KV_NAMESPACE`）。
3. 本地调试：
   ```bash
   pnpm run build
   pnpm wrangler dev --local
   ```
4. 单元/契约测试通过后，执行 `pnpm wrangler deploy`。
5. 在部署后更新 `docs/API.md`，标注接口从“示例”升级为“真实转换”。

## 6. 风险与缓解

| 风险 | 描述 | 缓解措施 |
|------|------|----------|
| 性能瓶颈 | Worker CPU 时间有限，复杂模板或大订阅可能超时 | 限制节点数量、引入缓存、必要时采用混合同步方案 |
| 安全暴露 | 公开 Worker 可能泄露订阅信息或被滥用 | 启用鉴权、速率限制，并在响应中脱敏敏感字段 |
| 维护成本 | Worker 与 Node 版本逻辑分叉 | 抽象共享模块，避免代码重复；在测试中覆盖两种环境 |

## 7. 建议的迭代步骤

1. **阶段一**：完成轻量转换服务原型
   - 引入 `SubscriptionConverter` 的 Worker 版本
   - `/api/convert` 支持 `url` + `format` 转换返回字符串
   - `/api/subscriptions` 返回配置文件中的启用订阅列表（脱敏）
   - 文档更新、契约测试编写

2. **阶段二**：增强可靠性
   - 加入 KV 缓存、速率限制、鉴权
   - 支持自定义模板/过滤参数
   - 可选：接入 R2 存储输出文件

3. **阶段三**：与 Node 同步流程联动
   - Worker 只处理轻量请求，复杂任务转发到队列或后台服务
   - Worker 提供任务状态查询、产物下载链接

## 8. 结论

- 直接在 Worker 内复用完整 `SyncManager` 不现实，需要针对环境做模块瘦身与打包处理；
- 通过轻量转换服务 + 缓存，可以满足多数在线转换需求，同时保留 Node 侧的高级拨测功能；
- 建议以阶段性的方式推进，优先交付最小可用版本，并在测试与运维侧设立基线（参见 `docs/TESTING.md`, `docs/CONFIG_VALIDATION.md`）。

如需进一步讨论细节或开始实现，请在提交 PR 时引用本提案，确保实现与规划一致。
