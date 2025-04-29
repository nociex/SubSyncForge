# SubSyncForge - 订阅转换工具

SubSyncForge 是一个用于转换和管理代理订阅源的工具。它可以自动同步、过滤、分组和转换订阅，并通过 Cloudflare Worker 提供访问。

## 快速开始：部署到 Cloudflare Workers (推荐)

1.  **一键部署**: 点击下方按钮，按照提示登录 Cloudflare 并完成部署。
    [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nociex/SubSyncForge)
2.  **访问**: 部署成功后，您的 Worker 会有一个 `.workers.dev` 地址（或您绑定的自定义域名）。

## 如何使用

### 1. 配置订阅源

编辑 `config/subscriptions.json` 文件，添加您需要转换的订阅源：

```json
{
  "sources": [
    {
      "id": "source-1",        // 唯一标识符
      "name": "我的订阅",      // 自定义名称
      "url": "https://example.com/your-sub-url", // 您的原始订阅链接
      "type": "v2ray",         // 原始订阅格式 (如 v2ray, clash, ss)
      "updateInterval": 21600  // 更新间隔 (秒)，0表示不自动更新
    },
    {
      "id": "source-2",
      "name": "另一个订阅",
      "url": "...",
      "type": "clash"
    }
    // ...更多订阅源
  ]
}
```

*   将修改后的 `config/subscriptions.json` 推送到您的 GitHub 仓库，GitHub Actions 会自动同步并更新 Worker。

### 2. 添加自定义节点 (可选)

如果您有单独的节点需要添加到订阅中，可以编辑 `config/custom.yaml`：

```yaml
# 自定义节点
nodes:
  # VMess 节点示例
  - type: vmess
    name: "我的自定义VMess节点"
    server: my.server.com
    port: 443
    uuid: "your-uuid"
    alterId: 0
    cipher: "auto"
    tls: true
    network: ws
    ws-opts:
      path: /vmess
      headers:
        Host: my.server.com

  # Shadowsocks 节点示例
  - type: ss
    name: "我的自定义SS节点"
    server: my.ss.server
    port: 8388
    cipher: aes-256-gcm
    password: "your-password"

# 您也可以在此处添加额外的订阅源 (URL 或 Base64 格式)
# subscriptions:
#   - type: url
#     value: "https://another.example.com/sub"
#     name: "额外URL订阅"
```

*   同样，将修改后的 `config/custom.yaml` 推送到 GitHub 仓库以生效。

### 3. 获取转换后的订阅

部署并配置完成后，您可以通过访问 Worker 地址获取转换后的订阅。

*   **获取完整订阅 (Clash/Mihomo 格式)**:
    `https://<您的Worker地址>/`
    或
    `https://<您的Worker地址>/mihomo`

*   **获取完整订阅 (其他格式)**:
    *   Surge: `https://<您的Worker地址>/surge`
    *   V2Ray (Base64): `https://<您的Worker地址>/v2ray`
    *   SingBox: `https://<您的Worker地址>/singbox`

### 4. 使用分组节点 (核心功能)

SubSyncForge 会自动将节点按地区和常见服务（如 Netflix, OpenAI）分组。您可以通过特定链接直接获取这些分组后的节点订阅 (Base64 格式)：

*   **按地区**:
    *   香港: `https://<您的Worker地址>/groups/HK`
    *   台湾: `https://<您的Worker地址>/groups/TW`
    *   新加坡: `https://<您的Worker地址>/groups/SG`
    *   美国: `https://<您的Worker地址>/groups/US`
    *   日本: `https://<您的Worker地址>/groups/JP`
    *   其他: `https://<您的Worker地址>/groups/Others`

*   **按服务**:
    *   OpenAI: `https://<您的Worker地址>/groups/OpenAI`
    *   Netflix: `https://<您的Worker地址>/groups/Netflix`
    *   Disney+: `https://<您的Worker地址>/groups/Disney+`
    *   (更多服务分组请查看项目配置或实际输出)

将这些链接添加到您的代理客户端即可使用特定分组的节点。

### 5. Bark 通知 (可选)

如果您使用 Bark (iOS/macOS 通知应用)，可以配置推送通知，以便在订阅更新时收到提醒。

1.  获取您的 Bark 推送 URL (类似 `https://api.day.app/yourkey/`)。
2.  在您的 GitHub Fork 仓库中，进入 `Settings` -> `Secrets and variables` -> `Actions`。
3.  添加一个新的 `Repository secret`：
    *   Name: `BARK_URL`
    *   Value: 您的完整 Bark URL (必须包含最后的 `/`)
4.  (可选) 添加另一个 Secret `BARK_TITLE` 来自定义通知标题。

配置完成后，每次 GitHub Actions 成功同步订阅，您都会收到 Bark 推送。

## 注意

*   默认情况下，GitHub Actions 会定期运行 (通常是每6小时) 来同步和更新您的订阅。您可以在 `.github/workflows/sync-subscriptions.yml` 文件中修改 `schedule` 来调整频率。
*   转换模板位于 `templates/` 目录，高级用户可以自行修改。
*   规则配置位于 `config/rules.conf`，用于 Clash/Surge 等格式的规则分流。

---

*如需了解开发细节、API 或贡献，请参考原版 README 或相关文档。*
