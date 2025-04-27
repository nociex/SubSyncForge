/**
 * 简单的路由器实现
 */
export class Router {
  constructor() {
    this.routes = {
      GET: new Map(),
      POST: new Map(),
      PUT: new Map(),
      DELETE: new Map()
    };
    this.middlewares = [];
  }

  /**
   * 添加GET路由
   * @param {string} path 路径
   * @param {Function} handler 处理函数
   */
  get(path, handler) {
    this.routes.GET.set(path, handler);
    return this;
  }

  /**
   * 添加POST路由
   * @param {string} path 路径
   * @param {Function} handler 处理函数
   */
  post(path, handler) {
    this.routes.POST.set(path, handler);
    return this;
  }

  /**
   * 添加PUT路由
   * @param {string} path 路径
   * @param {Function} handler 处理函数
   */
  put(path, handler) {
    this.routes.PUT.set(path, handler);
    return this;
  }

  /**
   * 添加DELETE路由
   * @param {string} path 路径
   * @param {Function} handler 处理函数
   */
  delete(path, handler) {
    this.routes.DELETE.set(path, handler);
    return this;
  }

  /**
   * 添加中间件
   * @param {Function} middleware 中间件函数
   */
  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * 处理请求
   * @param {Request} request 请求对象
   * @returns {Promise<Response>} 响应对象
   */
  async handle(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 查找匹配的路由处理器
    const handler = this.routes[method]?.get(path);

    if (!handler) {
      return new Response('Not Found', { status: 404 });
    }

    // 应用中间件
    let currentHandler = handler;
    for (const middleware of this.middlewares.reverse()) {
      currentHandler = ((next) => {
        return (request) => middleware(request, next);
      })(currentHandler);
    }

    try {
      return await currentHandler(request);
    } catch (error) {
      console.error('Router error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
}

export default Router;
