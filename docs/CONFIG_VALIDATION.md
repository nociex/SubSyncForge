# 配置校验指南

为降低配置出错的风险，项目提供了可机读的 JSON Schema 以及配套验证脚本，覆盖 `config/subscriptions.json` 与 `config/custom.yaml` 两份关键配置文件。本文说明 Schema 的结构、使用方式以及未来的扩展方向。

## 1. Schema 位置

| Schema | 文件路径 | 描述 |
|--------|----------|------|
| Subscriptions | `config/schema/subscriptions.schema.json` | 约束订阅列表文件的字段、类型及默认值范围 |
| Custom Config | `config/schema/custom.schema.json` | 约束自定义 YAML 配置中的选项、测试参数与输出规则 |

Schema 基于 JSON Schema Draft 2020-12，可被外部工具（如 VS Code、`ajv` CLI）直接引用。

## 2. 本地验证命令

项目新增 `validate:config` 脚本，会读取 Schema 并验证两份配置：

```bash
pnpm install           # 首次运行需要安装依赖
pnpm run validate:config
```

输出示例：

```
✅ 配置文件验证通过
```

如发现错误，脚本会列出具体字段及问题描述：

```
❌ 配置验证失败:

- config/custom.yaml
  • /testing/concurrency: must be >= 1
```

> **提示**：脚本使用 `ajv` 与 `ajv-formats`，若在 CI 中运行，请确保已执行 `pnpm install`。

## 3. 在编辑器中启用 Schema（可选）

### 3.1 VS Code (JSON)

在 `.vscode/settings.json` 中加入：

```json
{
  "json.schemas": [
    {
      "fileMatch": ["/config/subscriptions.json"],
      "url": "./config/schema/subscriptions.schema.json"
    }
  ]
}
```

### 3.2 VS Code (YAML)

需要安装 `redhat.vscode-yaml` 插件，然后在设置中追加：

```json
{
  "yaml.schemas": {
    "./config/schema/custom.schema.json": "/config/custom.yaml"
  }
}
```

这样在编辑时即可获得自动补全与即时校验。

## 4. CI 集成建议

- 在现有 GitHub Actions 工作流中新增步骤：
  ```yaml
  - name: Validate configuration
    run: pnpm run validate:config
  ```
- 在提交或合并前执行此脚本，避免错误配置进入仓库。

## 5. Schema 扩展约定

- 如需新增配置字段，应同时更新对应 Schema、示例配置以及本指南。
- 若某些字段允许额外属性，请显式调整 `additionalProperties` 规则，避免无意间拒绝合法配置。
- 对于需要复杂校验（如互斥选项、引用外部文件），可在未来引入自定义关键字或扩展脚本逻辑。

通过 Schema 校验，我们能够更早发现配置问题，也为未来的可视化管理、在线编辑器等下游工具打下基础。
