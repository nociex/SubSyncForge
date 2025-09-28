# SubSyncForge 运维指南

本指南面向负责部署与日常维护 SubSyncForge 的同学，整理运行所需的配置、任务编排、常见故障排查以及安全注意事项。以下内容均基于当前仓库实现撰写。

## 1. 部署模式概览

| 模式 | 适用场景 | 说明 |
|------|----------|------|
| **本地/自托管脚本** | 私人或小型团队定时生成配置 | 通过 `pnpm run sync` 触发同步，产物保存在本地 `output/`，可配合定时任务或 Git 操作分发 |
| **GitHub Actions** | 托管在 GitHub、定时推送到仓库 | `.github/workflows/sync-subscriptions.yml` 提供示例工作流，需自备订阅 URL 与仓库写权限 |
| **Cloudflare Worker** | 计划中的在线转换 API | 目前 Worker 处理器返回示例数据，尚未接入完整转换流程，不适合生产环境 |

在正式部署前请确认：

- 运行环境具备外部网络访问能力（用于下载订阅、核心程序、IP 定位）。
- 有权限写入 `data/`、`.cores/`、`output/` 目录。
- 已对订阅源与生成内容做好访问控制，避免泄露敏感节点。

## 2. 配置管理

### 2.1 `config/subscriptions.json`

- `defaults`：统一设置订阅源的默认属性（`type`, `updateInterval`, `enabled` 等）。
- `sources`：实际订阅列表，常用字段：
  - `id`（必填）：唯一标识，决定日志/输出命名。
  - `url`（必填）：订阅地址，支持 `http(s)`、Base64 等。
  - `type`：订阅类型，缺省时继承 `defaults.type`，推荐使用 `auto`。
  - `updateInterval`：刷新间隔（秒），供调度或外部工具参考。
- `conversionRules`：为 Mihomo、Surge、V2Ray 等格式指定默认模板；若不需要某格式，可设置 `enabledByDefault: false`。

### 2.2 `config/custom.yaml`

关键字段说明：

- `options`：
  - `outputDir`、`dataDir`：输出与缓存目录；默认为 `output/`、`data/`。
  - `deduplication`、`filterIrrelevant`：节点去重及提示字符串过滤开关。
  - `githubUser`、`repoName`：生成默认下载链接时使用，可留空。
- `testing`：拨测相关配置（详见 `docs/ADVANCED_NODE_TESTING.md`）。
  - `coreType`、`useCoreTest`、`concurrency`、`timeout`、`autoRename` 等直接影响测试耗时与产出。
- `outputs` 或旧版 `outputConfigs.outputs`：定义产物列表。常见字段：
  - `name` / `format`：目标格式（`clash`、`mihomo`、`surge`、`singbox`、`v2ray` 等）。
  - `template`：模板相对路径，缺省时使用内置默认渲染逻辑。
  - `path`：输出文件相对路径（相对于 `options.outputDir`）。
  - `options`：可追加地区过滤、服务过滤等规则。
- `nodes`：额外自建节点配置，会与订阅节点合并处理。

> 修改配置后，推荐执行 `pnpm run validate:config` 检查是否符合 Schema 要求，详情参见 `docs/CONFIG_VALIDATION.md`。

> 建议将敏感订阅 URL 使用密文或环境变量管理，避免直接提交到公共仓库。

## 3. 运行与调度

### 3.1 手动执行

- `pnpm run test:nodes:mihomo`：拨测并输出统计数据，确认核心下载与网络可用。
- `pnpm run sync`：完整执行同步流程（抓取 → 分析 → 拨测 → 生成输出）。

执行成功后，留意：

- `output/` 下生成的配置文件；
- `data/test_status.json`、`data/ip_cache/*` 等缓存；
- 控制台日志，包含节点数量、可用率、生成文件列表等信息。

### 3.2 定时任务示例

- **cron**：`0 */6 * * * /usr/bin/env bash -lc 'cd /path/to/SubSyncForge && pnpm run sync >> logs/sync.log 2>&1'`
- **systemd timer**：编写 `.service`/`.timer` 文件，执行同上命令。
- **GitHub Actions**：使用 `sync-subscriptions.yml`，将订阅内容同步到仓库并通过 GitHub Pages 或 raw 链接分发。

### 3.3 清理与辅助脚本

- `pnpm run clean` (`src/scripts/clean-cache.js`)：清空缓存目录。
- `pnpm run generate-icons` / `pnpm run generate-groups`：按模板生成分组/图标配置。
- 自定义本地运行模式可通过 `src/core/LocalRunManager.js` 触发。

## 4. 目录与文件说明

| 路径 | 作用 | 备注 |
|------|------|------|
| `output/` | 产物目录，可托管到对象存储、WebDAV 等 | 确保访问权限控制 |
| `data/` | 缓存与测试结果（IP 信息、拨测日志等） | 可能包含敏感信息，不宜对外暴露 |
| `.cores/` | 存放 Mihomo/V2Ray 核心与临时配置 | 权限不足会导致拨测失败 |
| `logs/` *(自建)* | 建议用于保存定时任务输出 | 便于追踪历史记录 |

## 5. 常见问题与排查

### 5.1 核心下载失败或无法执行

- 日志通常为 `不支持的平台` 或 `EACCES`。
- 排查步骤：
  1. 执行 `node -p "process.platform + ' ' + process.arch"` 确认平台。
  2. 检查 `.cores/` 是否可写、磁盘空间是否充足。
  3. 如网络受限，可手动下载对应核心并放置于 `.cores/`，赋予可执行权限。
  4. 设置 `testing.useCoreTest = false` 可临时回退到基础测试。

### 5.2 订阅抓取异常

- 常见错误：`FetchError: ... ECONN`、`HTTP error`。
- 解决建议：
  - 确认订阅 URL 可在同一网络环境访问。
  - 启用 `advanced.proxyForSubscription`，并在 `data/ip_cache/china_proxies.json` 中写入可用代理。
  - 调整 `advanced.cacheTtl`，避免频繁请求被源站封禁。

### 5.3 输出为空或节点数量过少

- 检查日志中是否存在大量过滤/去重提示。
- 核对 `testing.max_nodes`、`max_nodes_per_type`、`max_nodes_per_region` 等限制是否过于严格。
- 查看自动重命名是否覆盖原有标签，必要时关闭 `autoRename` 验证。

### 5.4 GitHub Actions 失败

- 确保仓库 Secrets 中不存在敏感订阅，或改为在工作流运行时注入。
- 检查 `actions/cache` 使用情况，避免核心或 `node_modules` 缓存导致平台不兼容。
- 如拨测用时过长，可降低并发、缩短节点列表，或关闭核心测试。

## 6. 日志与监控

- 默认日志输出到控制台，可在部署脚本中重定向到文件。
- `AdvancedNodeTester` 会输出成功率、平均延迟、测试方法分布等统计信息，可用于观察节点健康状况。
- 建议结合外部监控（Prometheus、CloudWatch 等）收集运行结果，或将关键指标写入自建监控系统。

## 7. 安全建议

- 订阅链接通常包含个人凭据，避免直接提交到公共仓库。
- 产出的配置文件同样属于敏感信息，建议通过受控渠道（私有对象存储、受限仓库、直连设备）分发。
- 定期清理 `data/ip_cache`、`data/test_status.json` 等缓存文件，减少泄漏风险。
- 若与第三方系统集成，建议为每次导出生成独立链接或添加访问控制。

## 8. 升级与变更管理

- 在 pull 最新代码前备份当前配置与产物。
- 阅读 `CHANGELOG.md`（若有更新）了解破坏性改动。
- 升级后先在测试环境执行拨测与同步，确认无异常再替换生产输出。
- 若自定义模板或二次封装，请保持与上游仓库同步的接口兼容性。

持续改进与文档更新有助于降低运维成本。如需扩展或提交反馈，欢迎通过 Issue/PR 参与社区讨论。
