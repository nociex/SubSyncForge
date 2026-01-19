# SubSyncForge

SubSyncForge 是一个面向自托管场景的代理订阅处理工具，可以批量拉取订阅源、筛选并测试节点，最终生成面向 Clash/Mihomo、Surge、SingBox、V2Ray 等格式的配置文件。项目同时提供了 Cloudflare Worker 入口，但当前仅返回示例数据，尚未与完整转换流水线对接。

## 核心能力

- **订阅获取与缓存**：支持多源抓取、HTTP 代理、基础缓存及优先级控制。
- **节点整理**：自动去重、过滤无效标签、依据地区/协议/服务进行标注与分组。
- **高级拨测**：集成 Mihomo / V2Ray 核心，结合 IP 定位做连通性与延迟测试，可自动重命名节点。
- **多格式输出**：基于模板渲染生成 YAML/JSON/TXT/URL 等输出，便于直接导入常见客户端。
- **自动化支撑**：通过脚本与 GitHub Actions 支持定时同步与测试，输出结果存放在 `output/` 目录。

> 📌 功能与实现状态会在 `docs/DEVELOPMENT.md`、`docs/ARCHITECTURE.md` 中持续更新，建议在使用前阅读。

## 订阅链接

根据你使用的客户端选择对应格式：

| 客户端 | 订阅链接 |
|--------|----------|
| **Mihomo / Clash Meta** | `https://raw.githubusercontent.com/nociex/SubSyncForge/main/output/mihomo.yaml` |
| **Clash** | `https://raw.githubusercontent.com/nociex/SubSyncForge/main/output/clash.yaml` |
| **Sing-box** | `https://raw.githubusercontent.com/nociex/SubSyncForge/main/output/singbox.json` |
| **V2Ray** | `https://raw.githubusercontent.com/nociex/SubSyncForge/main/output/v2ray.json` |
| **Surge** | `https://raw.githubusercontent.com/nociex/SubSyncForge/main/output/surge.conf` |
| **通用 URI 列表** | `https://raw.githubusercontent.com/nociex/SubSyncForge/main/output/all.txt` |

**按地区订阅**：

- 香港: `.../output/hk.txt` | 美国: `.../output/us.txt` | 新加坡: `.../output/sg.txt`

**分流规则**：

- 美团直连: `https://raw.githubusercontent.com/nociex/SubSyncForge/main/output/meituan-direct.list`

## 文档索引

| 文档 | 内容概要 |
|------|----------|
| `docs/DEVELOPMENT.md` | 开发者指南：目录结构、脚本、质量策略 |
| `docs/ARCHITECTURE.md` | 模块划分与处理流程概览 |
| `docs/ADVANCED_NODE_TESTING.md` | 高级节点测试功能与核心管理说明 |
| `docs/API.md` | Cloudflare Worker 当前接口（示例实现）与改进计划 |
| `docs/OPERATIONS.md` | 运维/部署指引、常见故障排查 |
| `docs/CONFIG_VALIDATION.md` | 配置 Schema 说明与验证流程 |
| `docs/TESTING.md` | 测试基线、脚本规划与 CI 建议 |
| `docs/WORKER_INTEGRATION.md` | Worker 与核心打通的技术评估与迭代阶段 |

## 快速开始（本地运行）

1. **获取代码并安装依赖**

   ```bash
   git clone https://github.com/nociex/SubSyncForge.git
   cd SubSyncForge
   pnpm install   # 或 npm install
   ```

2. **配置订阅与输出**
   - 编辑 `config/subscriptions.json`，填写真实订阅地址并确认 `defaults` 字段符合需求。
   - 更新 `config/custom.yaml`，设置输出目录、测试参数、模板绑定等（详见下文配置概览）。

3. **验证拨测环境（可选但推荐）**

   ```bash
   pnpm run test:nodes:mihomo   # 或者 pnpm run test:nodes:v2ray / :basic
   ```

   首次运行会自动下载核心到 `.cores/`，请确保具备网络与写入权限。

4. **执行一次完整同步**

   ```bash
   pnpm run sync
   ```

   生成的配置位于 `output/`，日志及拨测数据写入 `data/`。

## 配置概览

- `config/subscriptions.json`
  - `defaults`：所有订阅源的默认参数（类型、更新时间间隔、启用状态等）。
  - `sources`：订阅列表，列表内字段会与默认值合并。
  - `conversionRules`：为不同目标格式指定默认模板及启用状态。
- `config/custom.yaml`
  - `options.*`：输出目录、数据目录、去重策略、GitHub 仓库信息等。
  - `testing.*`：拨测相关参数（核心类型、是否自动重命名、并发、超时、最大节点数等）。
  - `outputs` / `outputConfigs.outputs`：目标产物配置，包含格式、模板路径、过滤规则。
  - `nodes`：可定义额外自建节点，最终与订阅节点合并处理。

更多细节请参考 `docs/DEVELOPMENT.md` 与后续将补充的运维指南。

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm run build` | 使用 Rollup 构建 `dist/` 产物 |
| `pnpm run sync` | 构建后执行 `dist/sync-subscriptions.js`，完成同步 |
| `pnpm run test` | 执行 `src/scripts/sync-subscriptions.js`，目前等价于一次同步 |
| `pnpm run test:nodes[:mihomo|:v2ray|:basic]` | 使用指定模式拨测节点 |
| `pnpm run local:run` | 按本地配置运行一次同步调试 |
| `wrangler dev` | 启动 Cloudflare Worker 本地调试（当前响应为示例数据） |

## Cloudflare Worker 现状

Worker 路由位于 `src/worker/`，默认返回静态示例数据，便于前期调试。尚未与 `SubscriptionConverter`/`SyncManager` 整合，若需在线转换，请根据代码自行封装或参与开发。

## 贡献

- 阅读 `docs/DEVELOPMENT.md` 了解目录、脚本以及变更约定。
- 修改公共接口或配置时，请同步更新对应文档并附带示例。
- PR 中需说明测试方式与影响范围，建议至少执行一次 `pnpm run sync`。

## 许可证

本项目基于 MIT License 发布。详情参见仓库中的 `LICENSE` 文件。
