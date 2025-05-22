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

## 🔥 最新改进 (v1.5.0)

- **增强订阅获取能力**：完全重写的`SubscriptionFetcher`类，提供更强的兼容性和稳定性
- **智能内容检测**：自动识别和处理各种订阅格式，不再受限于订阅源类型
- **增强解析能力**：优化的解析器能处理不规范的Base64编码和各种特殊情况
- **多协议支持**：新增对Hysteria2、VLESS等协议的全面支持
- **多种存储服务**：新增支持WebDAV和Cloudflare R2等存储服务，方便部署到自己的服务器
- **高级订阅管理**：通过分组订阅模式实现更灵活的节点管理

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

6. **配置远程存储** (可选)：
   如果您想将订阅文件部署到自己的服务器或存储服务，可以在GitHub仓库设置中添加以下Secrets：
   
   - WebDAV存储:
     - `WEBDAV_URL`: WebDAV服务器地址
     - `WEBDAV_USERNAME`: WebDAV用户名
     - `WEBDAV_PASSWORD`: WebDAV密码
     - `WEBDAV_PATH`: 远程目录路径 (可选，默认: sub-sync)
   
   - Cloudflare R2存储:
     - `R2_ACCOUNT_ID`: Cloudflare账户ID
     - `R2_ACCESS_KEY_ID`: R2访问密钥ID
     - `R2_SECRET_ACCESS_KEY`: R2访问密钥
     - `R2_BUCKET_NAME`: R2存储桶名称
     - `R2_PATH`: 远程目录路径 (可选，默认: sub-sync)

### 方法二：本地运行

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
   编辑 `config/subscriptions.json` 添加您的订阅源。

4. **配置上传器** (可选)：
   编辑 `config/uploader.json` 配置您的存储方式。

5. **构建并运行同步程序**：
   ```bash
   # 构建项目并运行同步程序
   pnpm run sync
   ```

6. **测试订阅**：
   ```bash
   # 测试订阅获取和解析
   node test-subscription.js
   ```

7. **查看生成的订阅**：
   转换后的订阅文件将保存在 `output/` 目录中，您可以直接查看或使用这些文件。

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
