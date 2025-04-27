import { ResponseBuilder } from '../index';
import { logger } from '../../utils';

const { defaultLogger } = logger;
const log = defaultLogger.child({ component: 'handlers' });

/**
 * 处理订阅请求
 * @param {Request} request 请求对象
 * @returns {Response} 响应对象
 */
export async function handleSubscription(request) {
  try {
    // 从配置中获取订阅列表
    const subscriptions = [
      {
        id: 'public-source-1',
        name: 'Public Source 1',
        url: 'https://example.com/subscription1',
        type: 'v2ray',
        updateInterval: 21600,
        enabled: true
      }
    ];
    
    return ResponseBuilder.json({ subscriptions });
  } catch (error) {
    log.error('Failed to handle subscription request', { error: error.message });
    return ResponseBuilder.error('Failed to get subscriptions', 500);
  }
}

/**
 * 处理转换请求
 * @param {Request} request 请求对象
 * @returns {Response} 响应对象
 */
export async function handleConversion(request) {
  try {
    // 解析请求体
    const body = await request.json();
    const { url, format, options } = body;
    
    if (!url) {
      return ResponseBuilder.error('URL is required', 400);
    }
    
    if (!format) {
      return ResponseBuilder.error('Format is required', 400);
    }
    
    // 模拟转换结果
    const result = {
      success: true,
      format,
      nodeCount: 10,
      data: `# 这是一个示例转换结果\n# 格式: ${format}\n# 来源: ${url}`
    };
    
    return ResponseBuilder.json(result);
  } catch (error) {
    log.error('Failed to handle conversion request', { error: error.message });
    return ResponseBuilder.error('Failed to convert subscription', 500);
  }
}

/**
 * 处理状态请求
 * @param {Request} request 请求对象
 * @returns {Response} 响应对象
 */
export async function handleStatus(request) {
  try {
    const status = {
      version: '1.3.0',
      uptime: process.uptime ? process.uptime() : 0,
      environment: typeof process !== 'undefined' && process.env && process.env.NODE_ENV 
        ? process.env.NODE_ENV 
        : 'production',
      timestamp: Date.now()
    };
    
    return ResponseBuilder.json(status);
  } catch (error) {
    log.error('Failed to handle status request', { error: error.message });
    return ResponseBuilder.error('Failed to get status', 500);
  }
}

export default {
  handleSubscription,
  handleConversion,
  handleStatus
};
