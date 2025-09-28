# SubSyncForge 开发指南

本指南面向希望扩展或维护 SubSyncForge 的开发者，介绍项目结构、运行环境、常用脚本以及当前的质量保障策略。所有内容基于现有源码的真实状态，力求避免“文不对题”。

## 1. 运行环境与依赖

- **Node.js**：18.0.0 及以上（`package.json` 中的 `engines` 要求）
- **包管理器**：推荐 `pnpm`，亦可使用 `npm`
- **可选工具**：
  - `wrangler`（由 `pnpm install` 自动安装）用于本地运行 Cloudflare Worker
  - `git`、`curl` 等常见命令行工具
- **系统要求**：
  - 节点测试依赖外部网络访问与核心二进制（Mihomo/V2Ray）。首次运行会自动下载适配平台的核心，因此必须具备写入 `.cores/` 目录的权限。

安装依赖：

```bash
pnpm install
# 或者
npm install
```

## 2. 项目目录结构

```
SubSyncForge/
├── config/                 # 自定义配置、订阅、黑名单等
├── data/                   # 运行期缓存与测试结果（会自动创建子目录）
├── docs/                   # 项目文档
├── output/                 # 同步任务生成的配置文件
├── src/
│   ├── core/               # 同步流程的核心模块
│   ├── converter/          # 订阅转换相关逻辑
│   ├── scripts/            # 可直接执行的 Node.js 脚本
│   ├── tester/             # 节点测试实现
│   ├── utils/              # 公共工具库
│   └── worker/             # Cloudflare Worker 入口及处理器
├── templates/              # 输出配置所用的模板文件
├── package.json
└── wrangler.toml
```

> **提示**：仓库中不存在 `web/` 前端目录，也没有 `src/converter/index.js` 入口；请以实际文件为准。

## 3. 核心模块概览

### 3.1 同步流程（`src/core`）
- `SyncManager.js`：整个同步任务的协调者，负责加载配置、获取订阅、处理节点、执行测试并生成输出。
- `config/`：包含默认配置(`ConfigDefaults.js`)与加载器(`ConfigLoader.js`)，将 `config/custom.yaml` 与代码内默认值合并。
- `subscription/SubscriptionFetcher.js`：按配置抓取远端订阅，支持缓存与代理。
- `node/NodeProcessor.js`：执行去重、过滤、排序、分组等操作。
- `output/ConfigGenerator.js`：基于模板输出 Clash/Mihomo、Surge、SingBox、V2Ray 等格式的配置文件。
- `proxy/ProxyManager.js` 与 `ProxyCoreManager.js`：管理外部代理与 Mihomo/V2Ray 核心。
- `testing/AdvancedNodeTester.js`：结合核心进行批量拨测，统计性能数据并可自动重命名。

### 3.2 转换器（`src/converter`）
- `SubscriptionConverter.js` 将抓取、解析、去重、规则处理、格式转换串联起来。
- `analyzer/`、`rules/`、`formats/` 等子目录提供节点分析、规则加载、格式化输出的实现。

### 3.3 Cloudflare Worker（`src/worker`）
- 为 `/api/subscriptions`、`/api/convert`、`/api/status` 等提供处理器，但目前主要是示例级响应，尚未完整接入转换流水线。

### 3.4 工具模块（`src/utils`）
- 提供日志、事件、指标、健康检查、IP 定位、文件系统等基础能力。

## 4. 常用脚本与工作流

| 命令 | 说明 |
|------|------|
| `pnpm run build` | 使用 Rollup 构建 `dist/` 产物（供 Worker 或脚本部署使用） |
| `pnpm run sync` | 构建后执行 `dist/sync-subscriptions.js`，完成一次完整同步流程 |
| `pnpm run test` | 运行 `src/scripts/sync-subscriptions.js`（目前等价于一次本地同步，尚非自动化测试） |
| `pnpm run test:nodes` | 调用 `src/scripts/test-advanced-nodes.js`，使用默认核心拨测节点 |
| `pnpm run test:nodes:mihomo` / `:v2ray` / `:basic` | 强制指定拨测模式 |
| `pnpm run local:run` | 读取本地配置并执行一轮同步，便于调试 |
| `wrangler dev` | 启动 Cloudflare Worker 本地调试（需先构建或指向源码） |

> **注意**：大部分脚本依赖 `config/custom.yaml` 与 `config/subscriptions.json`。缺失或格式错误会导致任务失败。

## 5. 配置说明

### 5.1 `config/custom.yaml`
- `options.*`：控制输出目录、数据目录、去重策略等。
- `subscriptions`：可定义额外的自定义节点。
- `testing.*`：节点测试参数（核心类型、并发、超时、重命名等）。
- `outputs` 或旧版 `outputConfigs.outputs`：定义需要生成的输出文件、模板及过滤规则。

### 5.2 `config/subscriptions.json`
- `defaults`：订阅源的默认参数（例如 `type`, `updateInterval`）。
- `sources`：实际订阅源列表。
- `conversionRules`：指定默认启用的输出模板。

### 5.3 数据路径
- `data/`：运行时缓存、IP 定位结果、测试报告等。
- `.cores/`：在拨测时下载的 Mihomo/V2Ray 核心与临时配置。
- `output/`：最终同步后的配置文件。

> 可以通过 `pnpm run validate:config` 调用 `config/schema/` 下的 JSON Schema 对 `config/subscriptions.json` 与 `config/custom.yaml` 进行静态校验，详见 `docs/CONFIG_VALIDATION.md`。

## 6. 推荐开发流程

1. **准备配置**：
   - 复制并编辑 `config/custom.yaml`、`config/subscriptions.json`（注意备份个人敏感信息）。
2. **快速验收**：
   - 执行 `pnpm run test:nodes:mihomo` 观察拨测结果，确认核心下载与网络访问正常。
   - 执行 `pnpm run sync` 生成 `output/` 文件，检查日志与结果是否符合预期。
3. **调试节点处理**：
   - 使用 `src/scripts/local-run.js` 或 `LocalRunManager` 中的自定义模式。
4. **调试 Worker**：
   - 构建后运行 `wrangler dev`，验证路由与响应。

## 7. 质量与测试策略

- **当前现状**：尚无系统化的单元测试/集成测试，`pnpm run test` 仅复用同步脚本。
- **建议实践**：
  1. 为核心模块（如 `NodeProcessor`, `SubscriptionFetcher`, `ConfigLoader`）编写单元测试，覆盖主要分支逻辑。
  2. 使用虚拟订阅源或本地样例构建集成测试，验证端到端同步流程。
  3. 为 Worker 引入契约测试，确保文档与实际响应保持一致。
- **CI 集成**：`.github/workflows/` 中包含 `sync-subscriptions.yml` 与 `test-nodes-advanced.yml`，可按需扩展为真正的回归测试流程。
- **更多细节**：参见 `docs/TESTING.md`，涵盖测试基线、目录规划与 CI 建议。

## 8. 代码风格与工具

- 项目尚未配置 ESLint/Prettier，但建议在提交前通过统一的格式化工具。
- 代码注释原则：对复杂逻辑提供简短注释，避免冗余描述。
- 目录结构遵循职责单一原则：如需新增模块，请置于合适子目录并补充文档。

## 9. 文档维护约定

- `README.md`：针对用户的快速入门与特性介绍。
- `docs/ARCHITECTURE.md`：整体架构与模块关系。
- `docs/ADVANCED_NODE_TESTING.md`：拨测功能的详细说明。
- **本文件**：面向开发者的操作与约定。
- 新增功能应同时更新相关文档，并在变更记录中标注。

## 10. 贡献流程

1. Fork 仓库并创建分支：`git checkout -b feature/<your-topic>`
2. 根据贡献内容更新文档与配置示例。
3. 运行 `pnpm run sync` 等关键脚本验证变更。
4. 提交代码并在 PR 中说明测试方式及影响范围。
5. 如修改公共接口或配置格式，请同步更新对应文档。

## 11. 后续改进方向（建议）

- 将 Worker 端点真正接入 `SubscriptionConverter`，或在文档中明确其示例性质。
- 引入 JSON Schema/YAML Schema 校验，提升配置错误的可诊断性。
- 建立基础测试套件并驱动 CI，保证同步与拨测流程的稳定性。
- 对核心下载、缓存目录等潜在“坑点”写入更加详细的运维指南。

保持此文档与代码同步，是确保团队成员快速上手与稳定演进的关键。欢迎在提出改动时附带文档更新，共同完善 SubSyncForge。
