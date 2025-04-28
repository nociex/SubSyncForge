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
   * 检查路径是否匹配路由模式
   * @param {string} routePattern 路由模式，如 '/groups/:groupName'
   * @param {string} path 请求路径，如 '/groups/HK'
   * @returns {Object|null} 匹配结果，包含参数，如 { groupName: 'HK' }
   */
  matchRoute(routePattern, path) {
    // 如果路由不包含参数，直接比较
    if (!routePattern.includes(':')) {
      return routePattern === path ? {} : null;
    }

    // 将路由模式分割为段
    const routeParts = routePattern.split('/');
    const pathParts = path.split('/');

    // 如果段数不同，则不匹配
    if (routeParts.length !== pathParts.length) {
      return null;
    }

    // 提取参数
    const params = {};
    for (let i = 0; i < routeParts.length; i++) {
      const routePart = routeParts[i];
      const pathPart = pathParts[i];

      // 如果是参数段
      if (routePart.startsWith(':')) {
        const paramName = routePart.substring(1);
        params[paramName] = pathPart;
      } 
      // 如果是固定段但不匹配
      else if (routePart !== pathPart) {
        return null;
      }
    }

    return params;
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
    
    // 尝试查找精确匹配的路由
    let handler = this.routes[method]?.get(path);
    let params = {};
    
    // 如果没有精确匹配，尝试查找带参数的路由
    if (!handler) {
      for (const [routePattern, routeHandler] of this.routes[method] || []) {
        const matchParams = this.matchRoute(routePattern, path);
        if (matchParams) {
          handler = routeHandler;
          params = matchParams;
          break;
        }
      }
    }

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
      // 将路径参数添加到请求对象中
      request.params = params;
      return await currentHandler(request);
    } catch (error) {
      console.error('Router error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
}

export default Router;
