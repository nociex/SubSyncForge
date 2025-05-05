import { Router } from './router';
import { handleSubscription, handleStatus } from './handlers';
import { handleHealth } from './handlers/healthHandler';
import { handleGroupSubscription } from './handlers/groupHandler';
import { logger, metrics } from '../utils';

const { defaultLogger } = logger;
const log = defaultLogger.child({ component: 'worker' });

const router = new Router();

// API 路由
router.get('/api/subscriptions', handleSubscription);
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
  event.respondWith(router.handle(event.request));
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