import { ResponseBuilder } from '../index';
import { health } from '../../utils';

const { healthCheck } = health;

/**
 * 处理健康检查请求
 * @param {Request} request 请求对象
 * @returns {Response} 响应对象
 */
export async function handleHealth(request) {
  try {
    // 执行健康检查
    const healthResult = await healthCheck.check();
    
    // 根据健康状态设置响应状态码
    let status = 200;
    if (healthResult.status === health.HealthStatus.DOWN) {
      status = 503; // Service Unavailable
    } else if (healthResult.status === health.HealthStatus.DEGRADED) {
      status = 200; // OK，但在响应中标记为降级
    }
    
    return ResponseBuilder.json(healthResult, status);
  } catch (error) {
    console.error('Health check failed:', error);
    return ResponseBuilder.error('Health check failed', 500);
  }
}

export default handleHealth;
