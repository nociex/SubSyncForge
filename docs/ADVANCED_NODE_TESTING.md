# 🚀 高级节点测试功能

这个功能引入了 mihomo 和 v2ray 二进制核心，提供更可靠和准确的节点连接测试。

## 📋 功能特点

### 🔧 核心特性
- **自动核心下载**: 根据操作系统和架构自动下载适配的二进制核心
- **多核心支持**: 支持 mihomo 和 v2ray 两种代理核心
- **智能回退**: 核心测试失败时自动回退到基本连接测试
- **跨平台**: 支持 Linux、macOS、Windows (x64/arm64)
- **并发测试**: 支持多节点并发测试，提高效率

### 🌐 协议支持

#### Mihomo 核心
- ✅ Shadowsocks (SS)
- ✅ VMess
- ✅ Trojan
- ✅ VLESS
- ✅ Hysteria2 (HY2)
- ✅ TUIC

#### V2ray 核心
- ✅ VMess
- ✅ VLESS
- ✅ Trojan
- ✅ Shadowsocks

### 📊 测试能力
- **连接性测试**: 验证节点是否可达
- **延迟测量**: 精确测量连接延迟
- **地理位置验证**: 验证节点实际地理位置
- **自动名称修正**: 根据实际位置修正节点名称
- **统计分析**: 提供详细的测试统计信息

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 运行测试

#### 使用 Mihomo 核心测试
```bash
npm run test:nodes:mihomo
```

#### 使用 V2ray 核心测试
```bash
npm run test:nodes:v2ray
```

#### 仅使用基本连接测试
```bash
npm run test:nodes:basic
```

#### 帮助信息
```bash
node src/scripts/test-advanced-nodes.js --help
```

### 3. 命令行选项

```bash
# 选择核心类型
node src/scripts/test-advanced-nodes.js --mihomo    # 使用 mihomo 核心
node src/scripts/test-advanced-nodes.js --v2ray     # 使用 v2ray 核心

# 测试模式
node src/scripts/test-advanced-nodes.js --no-core   # 禁用核心测试
node src/scripts/test-advanced-nodes.js --verbose   # 详细日志模式

# 组合使用
node src/scripts/test-advanced-nodes.js --mihomo --verbose
```

## 💻 编程接口

### 基本用法

```javascript
import { AdvancedNodeTester } from './src/tester/AdvancedNodeTester.js';

// 创建测试器实例
const tester = new AdvancedNodeTester({
  coreType: 'mihomo',          // 'mihomo' | 'v2ray'
  timeout: 8000,               // 测试超时时间 (ms)
  concurrency: 5,              // 并发测试数量
  useCoreTest: true,           // 是否使用核心测试
  fallbackToBasic: true,       // 失败时是否回退到基本测试
  verifyLocation: true         // 是否验证地理位置
});

// 测试节点
const nodes = [
  {
    name: "🇭🇰 香港节点",
    type: "vmess",
    server: "hk.example.com",
    port: 443,
    uuid: "12345678-1234-1234-1234-123456789abc",
    // ... 其他配置
  }
];

const results = await tester.testNodes(nodes);

// 查看结果
results.forEach(result => {
  console.log(`${result.node.name}: ${result.status} (${result.latency}ms)`);
  console.log(`测试方法: ${result.testMethod}`);
});

// 获取统计信息
const stats = tester.getTestStatistics(results);
console.log(`成功率: ${stats.successRate}`);
console.log(`平均延迟: ${stats.averageLatency}ms`);
```

### 高级用法

```javascript
// 按类型测试节点
const vmessNodes = await tester.testNodesByType(nodes, 'vmess');

// 切换核心类型
await tester.setCoreType('v2ray');

// 修正节点位置信息
const correctedNodes = tester.correctNodeLocations(nodes, results);
```

## 🔧 配置选项

### AdvancedNodeTester 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `coreType` | string | `'mihomo'` | 代理核心类型 (`'mihomo'` \| `'v2ray'`) |
| `timeout` | number | `5000` | 测试超时时间 (毫秒) |
| `concurrency` | number | `10` | 并发测试数量 |
| `useCoreTest` | boolean | `true` | 是否使用代理核心测试 |
| `fallbackToBasic` | boolean | `true` | 核心测试失败时是否回退到基本测试 |
| `verifyLocation` | boolean | `true` | 是否验证节点地理位置 |
| `testUrl` | string | `'http://www.google.com/generate_204'` | 测试连接的目标URL |

### ProxyCoreManager 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|---------|------|
| `coreDir` | string | `'.cores'` | 核心文件存储目录 |
| `configDir` | string | `'.cores/configs'` | 配置文件存储目录 |

## 🌍 GitHub Actions 集成

项目提供了完整的 GitHub Actions 工作流，支持在 CI 环境中运行高级节点测试。

### 手动触发
1. 进入 GitHub 仓库的 Actions 页面
2. 选择 "Advanced Node Testing" 工作流
3. 点击 "Run workflow"
4. 选择测试参数：
   - **核心类型**: mihomo 或 v2ray
   - **测试模式**: core、basic 或 both
   - **订阅链接**: 可选的订阅URL
   - **节点数量**: 测试节点数量限制

### 自动触发
- **定时执行**: 每天凌晨 2 点 (UTC) 自动运行
- **代码推送**: 当相关代码文件发生变化时自动运行

### 查看结果
- 在 Actions 页面查看运行日志
- 下载测试报告文件 (Artifacts)
- 查看作业摘要中的统计信息

## 📁 文件结构

```
src/
├── core/
│   └── ProxyCoreManager.js     # 代理核心管理器
├── tester/
│   ├── NodeTester.js           # 基础节点测试器
│   └── AdvancedNodeTester.js   # 高级节点测试器
└── scripts/
    └── test-advanced-nodes.js  # 测试脚本

.github/workflows/
└── test-nodes-advanced.yml     # GitHub Actions 工作流

.cores/                          # 核心文件目录 (自动创建)
├── mihomo*                      # mihomo 可执行文件
├── v2ray*                       # v2ray 可执行文件
└── configs/                     # 配置文件目录
    └── test-*.json              # 临时测试配置
```

## 🚨 注意事项

### 安全考虑
- 核心文件从官方 GitHub 释放页面下载
- 临时配置文件会在测试完成后自动清理
- 敏感信息不会记录在日志中

### 性能建议
- 合理设置并发数量，避免过载
- 大批量测试时建议分批进行
- 在 CI 环境中使用缓存以减少下载时间

### 兼容性
- 需要 Node.js 18+ 版本
- 部分协议可能需要特定的核心版本
- Windows 环境下可能需要额外的运行库

## 🐛 故障排除

### 常见问题

#### 1. 核心下载失败
```bash
Error: 不支持的平台: linux-unknown
```
**解决方案**: 检查操作系统和架构是否受支持，或使用 `--no-core` 选项回退到基本测试。

#### 2. 权限问题
```bash
Error: EACCES: permission denied
```
**解决方案**: 确保有写入权限，或更改核心文件存储目录。

#### 3. 网络连接问题
```bash
Error: Test timeout
```
**解决方案**: 检查网络连接，增加超时时间，或检查节点配置是否正确。

### 调试模式
```bash
# 启用详细日志
node src/scripts/test-advanced-nodes.js --verbose

# 禁用核心测试进行基本连接验证
node src/scripts/test-advanced-nodes.js --no-core
```

## 🔄 更新日志

### v1.0.0
- ✅ 初始实现 mihomo 和 v2ray 核心支持
- ✅ 自动核心下载和管理
- ✅ 多协议节点测试
- ✅ GitHub Actions 集成
- ✅ 地理位置验证和名称修正

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个功能：

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 创建 Pull Request

## 📄 许可证

本项目使用 MIT 许可证。 