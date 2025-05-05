import { Router } from './router';
import { handleStatus, handleGithubProxy, handleShortcut } from './handlers'; // 移除了 handleSubscription
import { handleHealth } from './handlers/healthHandler';
import { handleGroupSubscription } from './handlers/groupHandler';
import { logger, metrics } from '../utils';

const { defaultLogger } = logger;
const log = defaultLogger.child({ component: 'worker' });

const router = new Router();

// API 路由
// router.get('/api/subscriptions', handleSubscription); // 移除了订阅路由
// router.post('/api/convert', handleConversion); // Removed route
router.get('/api/status', handleStatus);
router.get('/api/health', handleHealth);

// 分组订阅路由
router.get('/groups/:groupName', handleGroupSubscription);

// 记录请求指标的中间件
const withMetrics = (handler) => {
  return async (request) => {
    const startTime = Date.now();
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 记录请求开始
      log.info(`Request started: ${request.method} ${path}`, {
        method: request.method,
        path,
        query: Object.fromEntries(url.searchParams)
      });

      // 执行处理器
      const response = await handler(request);

      // 记录请求完成
      const duration = Date.now() - startTime;
      log.info(`Request completed: ${request.method} ${path}`, {
        method: request.method,
        path,
        status: response.status,
        duration
      });

      // 记录性能指标
      metrics.metrics.histogram('request.time', duration, {
        method: request.method,
        path,
        status: response.status
      });

      return response;
    } catch (error) {
      // 记录请求错误
      const duration = Date.now() - startTime;
      log.error(`Request failed: ${request.method} ${path}`, {
        method: request.method,
        path,
        error: error.message,
        stack: error.stack,
        duration
      });

      // 记录错误指标
      metrics.metrics.increment('request.error', 1, {
        method: request.method,
        path,
        error: error.name
      });

      // 返回错误响应
      return ResponseBuilder.error(error.message, 500);
    }
  };
};

// 应用中间件
router.use(withMetrics);

// 注册 fetch 事件监听器
addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const path = url.pathname;
  const shortcutKey = path.substring(1); // 获取路径（移除开头的 '/'）

  // 检查是否是预定义的快捷方式 (从 handlers/index.js 导入 shortcutMap 的键)
  // 注意：这里直接硬编码了快捷键，更健壮的方式是从 handlers 模块导出 shortcutMap 并检查 key
  const definedShortcuts = ['HK', 'US', 'SG', 'TW', 'JP', 'Others']; // 添加了 TW, JP
  if (definedShortcuts.includes(shortcutKey)) {
    const shortcutHandlerWithMetrics = withMetrics(handleShortcut);
    event.respondWith(shortcutHandlerWithMetrics(request));
  
  // 检查是否是 GitHub 代理请求
  } else if (path.startsWith('/gh-proxy/')) {
    const proxyHandlerWithMetrics = withMetrics(handleGithubProxy);
    event.respondWith(proxyHandlerWithMetrics(request));
  
  // 否则，交给路由器处理 (处理 /api/*, /groups/* 等)
  } else {
    event.respondWith(router.handle(request));
  }
});

class ResponseBuilder {
  static json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  static error(message, status = 400) {
    return this.json({ error: message }, status);
  }
}

export { ResponseBuilder };