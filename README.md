# SubSyncForge

SubSyncForge 是一个强大的订阅转换工具，支持自动化订阅源管理、多格式转换和实时访问。通过 GitHub Actions 实现定期更新，使用 Cloudflare Worker 提供稳定的访问服务。

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/nociex/SubSyncForge)

## 项目状态

![版本](https://img.shields.io/badge/版本-1.3.0-blue)
![状态](https://img.shields.io/badge/状态-开发中-yellow)

查看[更新日志](CHANGELOG.md)了解详细变更记录。

## 快速开始

### 方式一：一键部署（推荐）

1. 点击上方 "Deploy to Cloudflare Workers" 按钮
2. 登录您的 Cloudflare 账号
3. 等待自动部署完成
4. 配置环境变量（可选）：
   - `PRIVATE_SUBSCRIPTIONS`: 私人订阅源配置

### 方式二：手动部署

1. Fork 本仓库
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
3. 进入 Workers & Pages
4. 创建新的 Worker
5. 设置环境变量（可选）
6. 部署完成后访问 `your-worker.workers.dev`

## 配置说明

### 订阅源配置

在 `config/subscriptions.json` 中管理订阅源：

```json
{
  "sources": [
    {
      "id": "source-1",
      "name": "示例订阅",
      "url": "https://example.com/sub",
      "type": "v2ray",
      "updateInterval": 21600
    }
  ]
}
```

### 自定义订阅

在 `config/custom.yaml` 中添加自定义节点和订阅源：

```yaml
# 订阅源列表
subscriptions:
  # 从 URL 获取订阅
  - type: url
    value: "https://example.com/subscription"
    name: "示例订阅1"

  # 直接使用 Base64 编码的节点列表
  - type: base64
    value: "dm1lc3M6Ly9leUoySWpvaU1pSXNJbkJ6SWpvaVhIVTVPVGs1WEhVMlpUSm1MakY4WjJOd2ZGeDFOV1UzWmx4MU5tVXlabHgxT1dGa09GeDFPVEF4WmlJc0ltRmtaQ0k2SW5Ob2F5NWpaREV5TXpRdWVIbDZJaXdpY0c5eWRDSTZJakkyT0RFNUlpd2lhV1FpT2lKbVpqTmxOak01TkMwMll6TmxMVFJpWVdFdFlUUTROaTFrWWpnMU5XWmtORFV4TURRaUxDSmhhV1FpT2lJd0lpd2libVYwSWpvaWQzTWlMQ0owZVhCbElqb2libTl1WlNJc0ltaHZjM1FpT2lKc2FXNTFhR0Z2TG1OdmJTSXNJbkJoZEdnaU9pSmNMM05vYXk1alpERXlNelF1ZUhsNklpd2lkR3h6SWpvaUluMD0="
    name: "Base64示例"

  # 直接添加 VMess 节点
  - type: vmess
    value: "vmess://eyJ2IjoiMiIsInBzIjoiXHU5OTk5XHU2ZTJmLjFefmdjcH5cdTVlN2ZcdTZlMmZcdTlhZDhcdTkwMWYiLCJhZGQiOiJzaGsuY2QxMjM0LnNpdGUiLCJwb3J0IjoiMjY4MTkiLCJpZCI6ImZmM2U2Mzk0LTZjM2UtNGJhYS1hNDg2LWRiODU1ZmQ0NTEwNCIsImFpZCI6IjAiLCJuZXQiOiJ3cyIsInR5cGUiOiJub25lIiwiaG9zdCI6ImxpbnVoYW8uY29tIiwicGF0aCI6IlwvIiwidGxzIjoiIn0="
    name: "VMess示例"

# 自定义节点
nodes:
  # VMess 节点示例
  - type: vmess
    name: "自定义VMess节点"
    server: example.com
    port: 443
    uuid: "1386f85e-657d-4d6e-9d56-78badb75e1fd"
    alterId: 0
    cipher: "auto"
    tls: true
    network: ws
    ws-opts:
      path: /vmess
      headers:
        Host: example.com

  # Shadowsocks 节点示例
  - type: ss
    name: "自定义SS节点"
    server: example.com
    port: 8388
    cipher: aes-256-gcm
    password: "password123"
```

完整的配置示例请参考 [config/custom.yaml](config/custom.yaml)

## 转换流程

1. **抓取阶段**
   - 从配置的 URL 获取原始数据
   - 支持 HTTP/HTTPS 协议
   - 智能重试机制，自动处理超时和错误
   - 详细的错误上下文追踪

2. **整理阶段**
   - 解析不同格式的输入
   - 统一转换为内部节点格式
   - 提取节点关键信息
   - 数据验证层确保输入数据有效

3. **去重处理**
   - 基于节点特征进行去重
   - 保留最优节点配置
   - 支持自定义去重规则
   - 性能优化处理

4. **格式转换**
   - 生成标准 V2Ray 分享链接
   - 基于模板生成 Clash/Surge/SingBox 配置
   - 支持自定义转换规则
   - 事件通知系统，支持 Webhook

### 支持的转换格式

SubSyncForge 支持多种格式的转换，包括：

- **V2Ray**：标准的 V2Ray 分享链接和配置文件
- **Clash/Mihomo**：兼容 Clash 和 Clash Meta (Mihomo) 的 YAML 配置
- **Surge**：适用于 Surge for iOS/macOS 的配置
- **SingBox**：适用于 sing-box 的 JSON 配置

所有格式均支持自定义模板，模板文件位于 `templates` 目录：

- [templates/v2ray.json](templates/v2ray.json) - V2Ray 模板
- [templates/mihomo.yaml](templates/mihomo.yaml) - Clash Meta 模板
- [templates/surge.conf](templates/surge.conf) - Surge 模板
- [templates/singbox.json](templates/singbox.json) - SingBox 模板

## 核心特性

### 完整的错误处理和日志系统
- 分级日志记录（DEBUG, INFO, WARN, ERROR, FATAL）
- 可配置日志处理器
- 详细的错误上下文追踪
- 结构化日志输出

### 事件通知系统
- 转换过程事件通知
- 自定义事件处理器
- Webhook 支持
- 异步事件处理

### 健壮性改进
- 智能重试机制
- 数据验证层
- 健康检查接口
- 错误恢复能力

### 性能监控
- 详细的性能指标收集
- 监控数据导出
- 性能分析工具
- 资源使用优化

### 高级节点管理
- 智能节点分析和分类
  - 自动识别国家/地区（如 🇺🇸美国、🇭🇰香港）
  - 自动识别协议类型（如 VMess、Trojan、Hysteria2）
  - 自动识别节点编号（如 01、02）
  - 自动识别特殊标签（如 OpenAI、Netflix、流媒体）
- 多维度节点分组
  - 按地区分组
  - 按协议分组
  - 按特殊标签分组
  - 按应用/服务分组（如 OpenAI、Netflix、YouTube）
- 多种分组模式
  - 基础模式：简单的地区和协议分组
  - 分类模式：按照节点特征自动分类
  - 高级模式：类似 Surge/Clash 的专业分组（默认）
    - 主要选择组（节点切换、手动选择）
    - 应用/服务专用组（电报、OpenAI、流媒体等）
    - 区域节点组（香港、美国、新加坡等）
    - 特殊用途组（自建节点、全球直连等）
- 自定义筛选规则
  - 支持复杂条件组合
  - 支持自定义分组规则
- 图标支持
  - 国家/地区图标
  - 服务图标（如 Netflix、Disney+）
  - 协议图标

### 强大的规则系统
- 内置专业规则集
  - 应用/服务规则（如 Apple、Google、Microsoft）
  - 流媒体规则（如 Netflix、Disney+、YouTube）
  - AI 服务规则（如 OpenAI、Claude）
  - 广告拦截规则
  - 直连规则
- 规则格式支持
  - DOMAIN / DOMAIN-SUFFIX / DOMAIN-KEYWORD
  - RULE-SET（支持远程规则集）
  - GEOIP
  - 复合规则（AND / OR / NOT）
- 规则管理
  - 自动缓存远程规则集
  - 支持自定义规则
  - 规则优先级控制

## API 文档

### 订阅转换 API

```http
POST /api/convert
Content-Type: application/json

{
  "url": "订阅链接",
  "format": "clash|surge|v2ray",
  "template": "默认/自定义"
}
```

### 订阅列表 API

```http
GET /api/subscriptions
```

### 健康检查 API

```http
GET /api/health
```

### 状态 API

```http
GET /api/status
```

详细的 API 文档请参阅 [API.md](docs/API.md)

## 开发指南

### 环境要求

- Node.js 18+
- pnpm 8.x
- Wrangler CLI (Cloudflare Worker)

### 本地开发

```bash
# 安装 pnpm (如果未安装)
npm install -g pnpm

# 安装依赖
pnpm install

# 运行开发服务器
pnpm dev

# 运行测试
pnpm test

# 部署 Worker
pnpm deploy
```

### 目录结构

```
SubSyncForge/
├── src/
│   ├── worker/          # Cloudflare Worker 代码
│   ├── converter/       # 转换核心逻辑
│   └── utils/          # 工具函数
├── config/             # 配置文件
├── templates/          # 转换模板
└── web/               # 前端界面
```

## 贡献指南

欢迎提交 Pull Request 或创建 Issue。

## 许可证

MIT License
