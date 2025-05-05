import { ResponseBuilder } from '../index';
import { logger } from '../../utils';

const { defaultLogger } = logger;
const log = defaultLogger.child({ component: 'handlers' });

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

/**
 * 处理 GitHub Raw 内容代理请求
 * @param {Request} request 请求对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleGithubProxy(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace('/gh-proxy/', ''); // 移除代理前缀，获取实际路径

  if (!path) {
    return ResponseBuilder.error('Missing GitHub path', 400);
  }

  const targetUrl = `https://raw.githubusercontent.com/${path}`;
  log.info(`Proxying request to: ${targetUrl}`);

  try {
    // 使用 Cloudflare 的 fetch 发起请求，并利用其缓存机制
    // cacheTtl: 缓存时间 (秒)，这里设置为 1 小时
    const response = await fetch(targetUrl, {
      cf: {
        cacheTtl: 3600, // 缓存 1 小时
        cacheEverything: true, // 缓存所有状态码的响应
      },
      headers: {
        'User-Agent': 'SubSyncForge-Worker-Proxy/1.0' // 添加 User-Agent
      }
    });

    // 创建一个新的响应，复制原始响应的 headers, status, statusText
    // 确保 CORS 头被正确设置
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');

    // 如果是 OPTIONS 请求 (CORS 预检)，直接返回成功
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: newHeaders
      });
    }

    const responseBody = await response.arrayBuffer(); // 读取响应体为 ArrayBuffer

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch (error) {
    log.error(`Failed to proxy GitHub request to ${targetUrl}`, { error: error.message, stack: error.stack });
    return ResponseBuilder.error(`Failed to fetch from GitHub: ${error.message}`, 502); // 502 Bad Gateway
  }
}
// --- Shortcut Handler ---

// 映射表：将短路径映射到完整的 GitHub Raw URL
const shortcutMap = {
  'HK': 'https://raw.githubusercontent.com/nociex/SubSyncForge/294dafd328fff0252c5f9b9f07cda942cad19198/output/hk.txt',
  'US': 'https://raw.githubusercontent.com/nociex/SubSyncForge/294dafd328fff0252c5f9b9f07cda942cad19198/output/us.txt',
  'SG': 'https://raw.githubusercontent.com/nociex/SubSyncForge/294dafd328fff0252c5f9b9f07cda942cad19198/output/sg.txt',
  'TW': 'https://raw.githubusercontent.com/nociex/SubSyncForge/294dafd328fff0252c5f9b9f07cda942cad19198/output/tw.txt', // 添加 TW
  'JP': 'https://raw.githubusercontent.com/nociex/SubSyncForge/294dafd328fff0252c5f9b9f07cda942cad19198/output/jp.txt', // 添加 JP
  'Others': 'https://raw.githubusercontent.com/nociex/SubSyncForge/294dafd328fff0252c5f9b9f07cda942cad19198/output/others.txt',
};

/**
 * 处理预定义的快捷方式请求
 * @param {Request} request 请求对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleShortcut(request) {
  const url = new URL(request.url);
  // 移除开头的 '/' 并获取快捷键
  const shortcutKey = url.pathname.substring(1); 

  const targetUrl = shortcutMap[shortcutKey];

  if (!targetUrl) {
    // 如果映射不存在，理论上不应该进入此函数，但作为保险
    return ResponseBuilder.error(`Shortcut ${shortcutKey} not defined`, 404);
  }

  log.info(`Handling shortcut '${shortcutKey}' by fetching: ${targetUrl}`);

  try {
    // 重用 handleGithubProxy 的核心 fetch 逻辑，但使用映射的 URL
    const response = await fetch(targetUrl, {
      cf: {
        cacheTtl: 3600, // 缓存 1 小时
        cacheEverything: true,
      },
      headers: {
        'User-Agent': 'SubSyncForge-Worker-Shortcut/1.0'
      }
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    // 设置 Content-Disposition 以便浏览器下载时使用快捷键作为文件名
    newHeaders.set('Content-Disposition', `attachment; filename="${shortcutKey}.txt"`);
    // 确保 Content-Type 是纯文本
    newHeaders.set('Content-Type', 'text/plain; charset=utf-8');


    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: newHeaders });
    }

    const responseBody = await response.arrayBuffer();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });

  } catch (error) {
    log.error(`Failed to handle shortcut ${shortcutKey} fetching ${targetUrl}`, { error: error.message, stack: error.stack });
    return ResponseBuilder.error(`Failed to fetch shortcut content: ${error.message}`, 502);
  }
}
export default {
  // handleSubscription, // Removed export
  // handleConversion, // Removed export
  handleStatus,
  handleGithubProxy,
  handleShortcut
};
