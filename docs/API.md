# SubSyncForge API 文档

## 概述

SubSyncForge 提供了一组 RESTful API，用于订阅转换、订阅管理和系统监控。本文档详细介绍了这些 API 的使用方法和参数说明。

## 基础信息

- **基础 URL**: `https://your-worker.workers.dev`
- **响应格式**: JSON
- **认证方式**: 无需认证（公共 API）

## API 端点

### 1. 订阅转换 API

将订阅源转换为指定格式。

```http
POST /api/convert
Content-Type: application/json
```

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| url | string | 是 | 订阅源 URL |
| format | string | 是 | 目标格式，支持 `v2ray`、`clash`、`surge` |
| template | string | 否 | 自定义模板名称 |

#### 请求示例

```json
{
  "url": "https://example.com/subscription",
  "format": "clash",
  "template": "custom"
}
```

#### 响应示例

成功响应：

```json
{
  "success": true,
  "data": "...(转换后的内容)...",
  "nodeCount": 42,
  "time": 235
}
```

错误响应：

```json
{
  "success": false,
  "error": "Failed to fetch subscription: HTTP error! status: 404",
  "code": "ERR_FETCH_FAILED",
  "context": {
    "source": "https://example.com/subscription"
  }
}
```

### 2. 订阅列表 API

获取系统中配置的订阅源列表。

```http
GET /api/subscriptions
```

#### 响应示例

```json
{
  "subscriptions": [
    {
      "id": "public-source-1",
      "name": "Public Source 1",
      "type": "v2ray",
      "updateInterval": 21600,
      "enabled": true
    }
  ]
}
```

### 3. 系统状态 API

获取系统运行状态信息。

```http
GET /api/status
```

#### 响应示例

```json
{
  "status": "running",
  "version": "1.1.0",
  "uptime": 3600,
  "lastUpdate": "2023-01-01T00:00:00Z",
  "stats": {
    "conversions": 100,
    "errors": 5,
    "avgResponseTime": 150
  }
}
```

### 4. 健康检查 API

获取系统健康状态信息。

```http
GET /api/health
```

#### 响应示例

```json
{
  "name": "subsyncforge",
  "description": "SubSyncForge Health Check",
  "status": "up",
  "checks": [
    {
      "name": "system",
      "status": "up",
      "message": "System is running",
      "details": {
        "version": "1.1.0",
        "environment": "production"
      },
      "timestamp": "2023-01-01T00:00:00Z"
    },
    {
      "name": "memory",
      "status": "up",
      "message": "Memory usage is normal",
      "details": {
        "heapUsed": 10000000,
        "heapTotal": 20000000
      },
      "timestamp": "2023-01-01T00:00:00Z"
    }
  ],
  "timestamp": "2023-01-01T00:00:00Z"
}
```

## 错误处理

API 可能返回以下错误状态码：

| 状态码 | 描述 |
|--------|------|
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

错误响应格式：

```json
{
  "success": false,
  "error": "错误信息",
  "code": "错误代码",
  "context": {
    "相关上下文信息"
  }
}
```

## 使用示例

### 使用 cURL 转换订阅

```bash
curl -X POST https://your-worker.workers.dev/api/convert \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/subscription","format":"clash"}'
```

### 使用 JavaScript 转换订阅

```javascript
async function convertSubscription() {
  const response = await fetch('https://your-worker.workers.dev/api/convert', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url: 'https://example.com/subscription',
      format: 'clash'
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log(`转换成功，共 ${result.nodeCount} 个节点`);
    console.log(result.data);
  } else {
    console.error(`转换失败: ${result.error}`);
  }
}
```

## 限制说明

- API 请求频率限制：每 IP 每分钟最多 60 次请求
- 单次转换节点数量限制：最多 1000 个节点
- 响应大小限制：最大 10MB

## 更新日志

### v1.1.0

- 添加健康检查 API
- 增强错误处理和日志系统
- 添加性能监控指标
- 支持 Webhook 事件通知

### v1.0.0

- 初始版本发布
- 支持基本的订阅转换功能
- 支持多种格式转换
