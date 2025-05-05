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

// handleConversion function removed as it's no longer used.

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
  // handleConversion, // Removed export
  handleStatus
};
