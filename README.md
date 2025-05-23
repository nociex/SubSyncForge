# SubSyncForge - 高级订阅转换和管理工具

SubSyncForge 是一个功能强大的代理订阅转换和管理工具。它能自动获取、解析、优化和转换各种格式的代理订阅，并提供高级分组、过滤和规则管理功能。

## 🚀 主要特性

- **多格式订阅支持**：支持各种常见订阅格式（V2Ray、Clash、SS、SingBox等）
- **增强的订阅获取**：智能请求头管理，支持处理各种编码（Base64、明文、JSON等）
- **高级分组功能**：按地区、服务和协议自动分组节点
- **强大的规则系统**：内置专业规则集，支持多种规则格式
- **智能节点分析**：自动识别节点地区、协议和特殊用途
- **多格式输出**：支持转换为Clash/Mihomo、Surge、V2Ray、SingBox等格式
- **多种部署方式**：支持GitHub仓库、本地部署以及WebDAV、Cloudflare R2等多种存储服务
- **高性能设计**：异步处理、智能缓存和优化的内存使用
- **完善的错误处理**：详细的日志和错误报告
- **易于部署**：支持Cloudflare Workers一键部署 (TODO: 尚未实现)

## 🔥 最新重大更新 (v1.6.0)

### ✨ 核心功能全面升级

- **🚀 Mihomo核心集成**：完整集成Mihomo代理核心，支持更精确的节点测试
  - 自动下载和管理Mihomo/V2Ray核心
  - 支持多平台（Linux、macOS、Windows、ARM）
  - 智能核心版本管理和缓存
  - 核心级别节点连接测试，测试精度大幅提升

- **🌍 智能IP定位系统**：全面重构IP地理位置检测服务
  - 集成5个可靠的IP定位API提供商（ip-api.com、ipapi.co、ip.cn等）
  - 智能API轮换和故障转移机制
  - 支持速率限制和错误恢复
  - 177个地区的本地缓存系统，大幅提升查询速度

- **✏️ 自动节点重命名**：基于真实IP位置的智能重命名
  - 自动检测节点真实地理位置
  - 智能修正错误的地区标识
  - 支持40+国家的emoji国旗标识
  - 格式：`🇺🇸 美国 | 原始节点名称`

- **🔧 高级节点测试器**：全新的AdvancedNodeTester
  - Mihomo核心优先测试，失败时自动回退到基础测试
  - 并发测试优化，支持自定义并发数
  - 位置验证和自动修正
  - 详细的测试统计和报告

### 📊 性能和稳定性提升

- **缓存优化**：IP位置信息7天缓存，减少API调用
- **错误恢复**：多层故障恢复机制，单个服务故障不影响整体运行
- **内存优化**：批量处理机制，减少大量节点处理时的内存占用
- **速率控制**：智能API调用频率控制，避免触发限制

## 📋 快速开始

### 方法一：GitHub Actions 自动部署 (推荐)

1. **Fork 仓库**：
   Fork 本仓库到您的 GitHub 账户。

2. **配置订阅源**：
   在您 fork 的仓库中编辑 `config/subscriptions.json` 文件，添加您的订阅源。

3. **启用 GitHub Actions**：
   前往仓库的 Actions 选项卡，启用工作流。

4. **获取订阅链接**：
   部署完成后，您可以通过以下格式的链接获取转换后的订阅：
   `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/<格式>`

5. **设置自动更新**：
   默认情况下，GitHub Actions 会按计划自动运行。您可以在 `.github/workflows/sync-subscriptions.yml` 中调整更新频率。

### 方法二：本地运行

1. **克隆仓库**：
   ```bash
   git clone https://github.com/nociex/SubSyncForge.git
   cd SubSyncForge
   ```

2. **安装依赖**：
   ```bash
   # 推荐使用pnpm
   pnpm install
   
   # 或使用npm
   npm install
   ```

3. **配置订阅**：
   编辑 `config/subscriptions.json` 添加您的订阅源。

4. **配置高级测试** (可选)：
   编辑 `config/custom.yaml` 启用Mihomo核心测试：
   ```yaml
   testing:
     enabled: true
     coreType: mihomo         # 或 v2ray
     useCoreTest: true        # 启用核心测试
     autoRename: true         # 启用自动重命名
     verifyLocation: true     # 启用位置验证
     timeout: 10000           # 测试超时时间
     concurrency: 10          # 并发测试数
   ```

5. **运行同步程序**：
   ```bash
   # 完整同步（包含Mihomo核心测试）
   pnpm run sync
   
   # 或使用npm
   npm run sync
   ```

6. **测试特定功能**：
   ```bash
   # 测试Mihomo核心和自动重命名
   node test-mihomo-renaming.js
   
   # 测试节点（使用Mihomo核心）
   pnpm run test:nodes:mihomo
   
   # 测试节点（使用V2Ray核心）
   pnpm run test:nodes:v2ray
   
   # 基础连接测试
   pnpm run test:nodes:basic
   ```

7. **查看生成的订阅**：
   转换后的订阅文件将保存在 `output/` 目录中。

## 💻 高级配置

### 测试配置

在 `config/custom.yaml` 中配置高级测试选项：

```yaml
testing:
  enabled: true                    # 启用节点测试
  coreType: mihomo                # 核心类型：mihomo | v2ray
  useCoreTest: true               # 启用核心级测试
  fallbackToBasic: true           # 核心测试失败时回退到基础测试
  autoRename: true                # 自动重命名功能
  verifyLocation: true            # 验证节点位置
  timeout: 10000                  # 单个节点测试超时（毫秒）
  concurrency: 10                 # 并发测试数量
  maxLatency: 5000               # 最大可接受延迟（毫秒）
  max_nodes: 500                 # 最大节点数限制
  max_nodes_per_type: 50         # 每种协议最大节点数
  max_nodes_per_region: 30       # 每个地区最大节点数
  filter_invalid: true           # 过滤无效节点
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

### 上传器配置

编辑`config/uploader.json`以配置不同的存储方式：

```json
{
  "uploaders": [
    {
      "id": "local",
      "name": "本地存储",
      "type": "local",
      "enabled": true,
      "config": {
        "outputDir": "./output"
      }
    },
    {
      "id": "webdav",
      "name": "WebDAV存储",
      "type": "webdav",
      "enabled": false,
      "config": {
        "url": "https://your-webdav-server.com/remote.php/dav/files/username/",
        "username": "your-username",
        "password": "your-password",
        "remotePath": "sub-sync"
      }
    },
    {
      "id": "r2",
      "name": "Cloudflare R2存储",
      "type": "r2",
      "enabled": false,
      "config": {
        "accountId": "your-cloudflare-account-id",
        "accessKeyId": "your-r2-access-key-id",
        "secretAccessKey": "your-r2-secret-access-key",
        "bucketName": "your-bucket-name",
        "remotePath": "sub-sync"
      }
    }
  ],
  "defaultUploader": "local"
}
```

## 🌐 使用转换后的订阅

部署并配置完成后，您可以通过以下URL获取转换后的订阅：

### 完整订阅

- **GitHub方式**: 
  - Clash/Mihomo: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/clash.yaml`
  - Surge: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/surge.conf`
  - V2Ray: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/v2ray.json`
  - SingBox: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/singbox.json`

- **自有服务器方式**:
  - Clash/Mihomo: `https://<您的服务器地址>/clash.yaml`
  - Surge: `https://<您的服务器地址>/surge.conf`
  - V2Ray: `https://<您的服务器地址>/v2ray.json`
  - SingBox: `https://<您的服务器地址>/singbox.json`

### 分组订阅

SubSyncForge会自动按地区和服务分组节点，您可以直接获取这些分组：

#### 按地区

- 香港: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/HK.txt`
- 台湾: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/TW.txt`
- 新加坡: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/SG.txt`
- 美国: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/US.txt`
- 日本: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/JP.txt`
- 其他: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/Others.txt`

#### 按服务

- OpenAI: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/OpenAI.txt`
- Netflix: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/Netflix.txt`
- Disney+: `https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/Disney+.txt`
- (更多服务分组请查看项目配置或实际输出)

## 🔔 通知配置 (可选)

### Bark 通知

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

### 分组订阅

使用分组订阅模式，可以将节点按照不同的分组规则归类到不同的文件中，然后在客户端模板中引用这些分组，从而实现更灵活的节点管理：

1. 系统自动将节点按地区分组到不同的文件：HK.txt, JP.txt, US.txt等
2. 客户端模板（如clash.yaml）可以使用proxy-providers引用这些分组
3. 这种方式可以大幅减少客户端的配置文件大小，提高加载速度

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
│   ├── uploader/       # 上传工具
│   └── validation/     # 数据验证
└── scripts/            # 脚本工具
```

## 📝 常见问题

**Q: 运行时出现"未配置转换器，无法解析订阅内容"错误怎么办？**  
A: 这是因为需要先配置转换器。请编辑`config/converters.json`文件，添加适当的转换器配置。基本配置示例：
```json
{
  "converters": [
    {
      "name": "clash",
      "type": "clash",
      "enabled": true
    },
    {
      "name": "base64",
      "type": "base64",
      "enabled": true
    }
  ]
}
```

**Q: 为什么我的订阅无法获取或解析？**  
A: 最新版本增强了订阅获取和解析能力，建议将订阅类型设置为`auto`，让系统自动检测格式。如果仍有问题，可以使用`node test-subscription.js`进行测试诊断。

**Q: 如何自定义分组？**  
A: 编辑`config/groups.json`文件可以自定义节点分组规则。

**Q: 如何修改更新频率？**  
A: 您可以在`.github/workflows/sync-subscriptions.yml`中修改`schedule`配置。

**Q: 如何在GitHub Actions中使用WebDAV或Cloudflare R2上传?**  
A: 在GitHub仓库设置中添加相应的Secrets（如WEBDAV_URL, R2_ACCOUNT_ID等），系统会自动配置并启用相应的上传器。

**Q: 本地模式和GitHub模式的区别是什么?**  
A: 在本地模式下，系统会生成本地文件路径作为分组订阅地址；在GitHub模式下，系统会生成GitHub Raw地址；当提供了上传配置时，系统会使用WebDAV或R2等存储服务的地址。

## 📄 许可证

本项目使用MIT许可证。详情请查看[LICENSE](LICENSE)文件。

---

*更多技术细节和API文档，请参考项目文档目录。*

## 配置说明

### 基本配置

在 `config/custom.yaml` 文件中配置您的订阅源和输出选项。

```yaml
# 订阅源
subscriptions:
  - name: "example"
    url: "https://example.com/sub"
    type: "url"
    enabled: true

# 输出配置
output:
  # 是否将节点去重
  deduplication: true
  
  # 输出目录
  dir: "output"
  
  # 数据存储目录
  data_dir: "data"
  
  # GitHub 用户名 - 用于生成默认的 URL 前缀
  # 例如：your-username
  github_user: ""
  
  # GitHub 仓库名 - 用于生成默认的 URL 前缀
  # 例如：SubSyncForge
  repo_name: "SubSyncForge"
  
  # 生成的配置文件
  configs:
    # 各种配置文件...
```

### GitHub 自动 URL 生成

如果您设置了 `github_user` 字段，系统会自动生成基于 GitHub Raw 格式的 URL 前缀：

```
https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/
```

这样在模板文件中的 `https://your-server/output/HK.txt` 会被自动替换为：

```
https://raw.githubusercontent.com/<您的用户名>/SubSyncForge/output/HK.txt
```

您可以通过以下方式自定义这个行为：

1. 设置 `github_user` 和 `repo_name` 配置项
2. 保持为空以使用默认的 `https://your-server/` 前缀，然后在实际使用时手动替换

## 自定义部署服务器

如果你希望将订阅内容部署到自己的服务器，可以通过以下两种方式：

1. 设置 `github_user` 和 `repo_name` 配置项
2. 保持为空以使用默认的 `https://your-server/` 前缀，然后在实际使用时手动替换
