# 测试策略与基线

本文档建立 SubSyncForge 的测试基线，明确当前状态、短期落地的测试类型以及后续扩展方向，便于团队逐步完善质量保障体系。

## 1. 当前状态评估

| 维度 | 现状 | 问题 |
|------|------|------|
| 单元测试 | 无专门测试框架 | 核心逻辑（去重、节点分析、配置生成等）缺乏自动化验证 |
| 集成/流程测试 | `pnpm run test` 仅调用 `src/scripts/sync-subscriptions.js` | 依赖真实订阅、执行耗时长，且失败原因不易追踪 |
| Worker 接口测试 | 无 | 文档与实现脱节，缺乏契约校验 |
| CI 集成 | GitHub Actions 工作流存在，但未纳入自动测试 | 变更缺乏自动验证，易产生回归 |

## 2. 基础测试基线（短期目标）

| 类型 | 覆盖范围 | 工具建议 | 责任脚本 |
|------|----------|----------|-----------|
| **单元测试** | `NodeProcessor`, `SubscriptionFetcher`, `ConfigLoader` 等纯逻辑模块 | [Vitest](https://vitest.dev/) 或 Jest | `pnpm run test:unit` *(待新增)* |
| **集成烟测** | 使用虚拟订阅数据执行一次同步流程，验证产物与日志 | 直接运行现有脚本，结合固定 fixture | `pnpm run test:smoke` *(建议新增)* |
| **Worker 契约测试** | 对 `/api/subscriptions`、`/api/convert` 等进行快照对比 | Wrangler + Supertest/Fetch | `pnpm run test:worker` *(建议新增)* |

> 建议优先落地单元测试与烟测，确保核心逻辑在 CI 中有最小保障，再逐步扩展 Worker 与端到端测试。

## 3. 测试目录与基线设定

```
src/
├── __tests__/                 # 单元测试目录（建议新增）
│   ├── node/NodeProcessor.test.js
│   ├── config/ConfigLoader.test.js
│   └── subscription/SubscriptionFetcher.test.js
└── fixtures/
    └── subscriptions/sample.json  # 集成测试用虚拟数据
```

### 3.1 单元测试基线

- **NodeProcessor**：验证去重、过滤、地区/协议限额逻辑；使用构造的节点数组作为输入。
- **ConfigLoader**：针对空文件、缺失字段、旧版 `outputConfigs` 兼容等场景执行断言。
- **SubscriptionFetcher**：对静态 HTTP 响应进行 Mock，验证缓存与代理参数是否生效。

### 3.2 集成烟测

- 在 `fixtures/` 目录构造一份小型订阅（含不同协议、地区标签）。
- 编写新脚本（例如 `src/scripts/test-smoke.js`）加载 fixture，调用 `SyncManager`，断言：
  - 输出目录生成至少一个配置文件；
  - 日志/处理结果中的节点数量与预期一致；
  - 测试完成后清理输出。
- 可选：对输出文件做基本结构验证（YAML/JSON 可解析，存在 `proxies` 字段）。

### 3.3 Worker 契约（后续）

- 通过 `wrangler dev --local` 启动本地服务，使用 `node:test` 或 Vitest 发起请求。
- 对响应结构进行快照或 JSON Schema 校验。
- 当 Worker 真正接入核心流程时，再扩展对异常情况、鉴权的验证。

## 4. CI 集成建议

在 `.github/workflows/` 的现有工作流中，追加步骤：

```yaml
- name: Install dependencies
  run: pnpm install

- name: Validate configuration
  run: pnpm run validate:config

- name: Run unit tests
  run: pnpm run test:unit

- name: Run smoke test
  run: pnpm run test:smoke
```

> 在落地 `test:unit` / `test:smoke` 之前，可暂时保留为 `true` 条件或 `continue-on-error: true`，待测试脚本准备完毕后再转为强制执行。

## 5. 路线图

1. **阶段一（当前迭代）**
   - 搭建 Vitest 配置，迁移关键模块的单元测试。
   - 编写 smoke 脚本，使用固定 fixture 执行同步。
2. **阶段二**
   - 扩展单测覆盖更多核心模块（`ConfigGenerator`, `NodeAnalyzer` 等）。
   - 将 smoke 测试纳入 GitHub Actions。
   - 引入 Worker 契约测试，确保 API 文档与实现同步。
3. **阶段三**
   - 对接真实订阅时的 sandbox 测试（可通过模拟网络或 Docker 环境）。
   - 针对核心下载与缓存机制编写回归测试。
   - 收集覆盖率并设定最低阈值，持续跟踪。

## 6. 维护约定

- 新增或修改模块时，应同步补充或更新测试。
- 如需引入新的测试框架或大规模重构，先在本文档更新策略，再按计划执行。
- 测试失败时应先排查配置与 fixture，再判断是否为代码回归。

通过上述基线，SubSyncForge 可以逐步从“纯脚本”过渡到具备可重复验证能力的工程化项目，为后续 Worker 集成、自动化部署奠定基础。
