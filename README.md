# SubSyncForge - 高级订阅转换和管理工具

SubSyncForge 是一个功能强大的代理订阅转换和管理工具。它能自动获取、解析、优化和转换各种格式的代理订阅，并提供高级分组、过滤和规则管理功能。

## 🚀 主要特性

- **多格式订阅支持**：支持各种常见订阅格式（V2Ray、Clash、SS、SingBox等）
- **增强的订阅获取**：智能请求头管理，支持处理各种编码（Base64、明文、JSON等）
- **高级分组功能**：按地区、服务和协议自动分组节点
- **强大的规则系统**：内置专业规则集，支持多种规则格式
- **智能节点分析**：自动识别节点地区、协议和特殊用途
- **多格式输出**：支持转换为Clash/Mihomo、Surge、V2Ray、SingBox等格式
- **高性能设计**：异步处理、智能缓存和优化的内存使用
- **完善的错误处理**：详细的日志和错误报告
- **易于部署**：支持Cloudflare Workers一键部署

## 🔥 最新改进 (v1.4.1)

- **增强订阅获取能力**：完全重写的`SubscriptionFetcher`类，提供更强的兼容性和稳定性
- **智能内容检测**：自动识别和处理各种订阅格式，不再受限于订阅源类型
- **增强解析能力**：优化的解析器能处理不规范的Base64编码和各种特殊情况
- **多协议支持**：新增对Hysteria2、VLESS等协议的全面支持

## 📋 快速开始

### 方法一：部署到 Cloudflare Workers (推荐)

1. **一键部署**：点击下方按钮，按照提示登录Cloudflare并完成部署。
   [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nociex/SubSyncForge)

2. **配置订阅源**：在`config/subscriptions.json`中添加您的订阅源。

3. **访问服务**：部署完成后，您可以通过分配的`.workers.dev`地址访问服务。

### 方法二：本地部署

1. **克隆仓库**：
   ```bash
   git clone https://github.com/nociex/SubSyncForge.git
   cd SubSyncForge
   ```

2. **安装依赖**：
   ```bash
   pnpm install
   ```

3. **配置订阅**：
   编辑`config/subscriptions.json`添加您的订阅源。

4. **运行同步**：
   ```bash
   pnpm run sync
   ```

5. **测试订阅**：
   ```bash
   pnpm exec node test-subscription.js
   ```

## 💻 订阅配置

### 订阅源配置

编辑`config/subscriptions.json`：

```json
{
  "sources": [
    {
      "id": "source-1",        // 唯一标识符
      "name": "我的订阅",      // 自定义名称
      "url": "https://example.com/your-sub-url", // 原始订阅链接
      "type": "auto",          // 订阅类型 (auto, v2ray, clash, ss等，推荐使用auto)
      "updateInterval": 21600  // 更新间隔 (秒)，0表示不自动更新
    },
    // 更多订阅源...
  ]
}
```

> **注意**：最新版本推荐将`type`设置为`auto`，让系统自动检测订阅格式。

### 自定义节点配置

如需添加自定义节点，编辑`config/custom.yaml`：

```yaml
# 自定义节点
nodes:
  # VMess 节点示例
  - type: vmess
    name: "我的VMess节点"
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

  # 更多节点配置...
```

## 🌐 使用转换后的订阅

部署并配置完成后，您可以通过以下URL获取转换后的订阅：

### 完整订阅

- **Clash/Mihomo**: `https://<您的地址>/` 或 `https://<您的地址>/mihomo`
- **Surge**: `https://<您的地址>/surge`
- **V2Ray**: `https://<您的地址>/v2ray`
- **SingBox**: `https://<您的地址>/singbox`

### 分组订阅

SubSyncForge会自动按地区和服务分组节点，您可以直接获取这些分组：

#### 按地区

- 香港: `https://<您的地址>/groups/HK`
- 台湾: `https://<您的地址>/groups/TW`
- 新加坡: `https://<您的地址>/groups/SG`
- 美国: `https://<您的地址>/groups/US`
- 日本: `https://<您的地址>/groups/JP`
- 其他: `https://<您的地址>/groups/Others`

#### 按服务

- OpenAI: `https://<您的地址>/groups/OpenAI`
- Netflix: `https://<您的地址>/groups/Netflix`
- Disney+: `https://<您的地址>/groups/Disney+`
- (更多服务分组请查看项目配置或实际输出)

## 🔔 Bark 通知 (可选)

配置Bark通知，在订阅更新时收到推送：

1. 获取您的Bark推送URL (类似`https://api.day.app/yourkey/`)
2. 在GitHub仓库设置中添加Secret:
   - `BARK_URL`: 您的Bark URL
   - `BARK_TITLE`: 自定义通知标题 (可选)

## 🧪 测试订阅

SubSyncForge提供了一个便捷的测试脚本，用于测试订阅获取和解析功能：

```bash
pnpm exec node test-subscription.js
```

您可以编辑`test-subscription.js`文件中的订阅URL进行测试。

## 🛠️ 高级功能

### 规则管理

编辑`config/rules.conf`可自定义规则分流配置，支持以下规则类型：

- DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD
- RULE-SET (远程规则集)
- GEOIP
- 复合规则 (AND / OR / NOT)

### 模板定制

`templates/`目录包含各种格式的配置模板，您可以根据需要自定义这些模板。

### 节点管理

SubSyncForge提供高级节点管理功能：

- **智能分析**：自动识别节点的地区、协议和特殊用途
- **标签系统**：添加自定义标签，便于筛选和分组
- **重命名**：支持自定义节点命名格式
- **去重处理**：自动去除重复节点

## 📚 项目架构

SubSyncForge采用模块化设计，主要包含以下组件：

```
src/
├── converter/          # 核心转换模块
│   ├── fetcher/        # 订阅获取
│   ├── parser/         # 订阅解析
│   ├── formats/        # 格式转换
│   ├── dedup/          # 节点去重
│   ├── analyzer/       # 节点分析
│   └── rules/          # 规则处理
├── utils/              # 通用工具
│   ├── logger/         # 日志工具
│   ├── events/         # 事件系统
│   └── validation/     # 数据验证
└── scripts/            # 脚本工具
```

## 📝 常见问题

**Q: 为什么我的订阅无法获取或解析？**  
A: 最新版本 (v1.4.1) 增强了订阅获取和解析能力，建议将订阅类型设置为`auto`，让系统自动检测格式。如果仍有问题，可以使用`test-subscription.js`进行测试诊断。

**Q: 如何自定义分组？**  
A: 编辑`config/groups.json`文件可以自定义节点分组规则。

**Q: 如何修改更新频率？**  
A: 您可以在`.github/workflows/sync-subscriptions.yml`中修改`schedule`配置。

## 📄 许可证

本项目使用MIT许可证。详情请查看[LICENSE](LICENSE)文件。

---

*更多技术细节和API文档，请参考项目文档目录。*
