import EventEmitter from './EventEmitter';
import { BarkNotifier } from './BarkNotifier.js';

// 事件类型定义
export const EventType = {
  // 转换相关事件
  CONVERSION_START: 'conversion:start',
  CONVERSION_PROGRESS: 'conversion:progress',
  CONVERSION_COMPLETE: 'conversion:complete',
  CONVERSION_ERROR: 'conversion:error',
  
  // 获取相关事件
  FETCH_START: 'fetch:start',
  FETCH_COMPLETE: 'fetch:complete',
  FETCH_ERROR: 'fetch:error',
  
  // 解析相关事件
  PARSE_START: 'parse:start',
  PARSE_COMPLETE: 'parse:complete',
  PARSE_ERROR: 'parse:error',
  
  // 去重相关事件
  DEDUP_START: 'dedup:start',
  DEDUP_COMPLETE: 'dedup:complete',
  
  // 系统相关事件
  SYSTEM_ERROR: 'system:error',
  SYSTEM_WARNING: 'system:warning',
  SYSTEM_INFO: 'system:info'
};

// 创建全局事件发射器实例
export const eventEmitter = new EventEmitter();

// Webhook 处理器
export class WebhookNotifier {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl;
    this.events = options.events || Object.values(EventType);
    this.headers = options.headers || {
      'Content-Type': 'application/json'
    };
    this.timeout = options.timeout || 5000;
    
    // 注册事件监听器
    this.registerEventListeners();
  }
  
  /**
   * 注册事件监听器
   */
  registerEventListeners() {
    for (const event of this.events) {
      eventEmitter.on(event, async (data) => {
        await this.sendWebhook(event, data);
      });
    }
  }
  
  /**
   * 发送 Webhook 通知
   */
  async sendWebhook(event, data) {
    if (!this.webhookUrl) return;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          event,
          data,
          timestamp: new Date().toISOString()
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`Failed to send webhook for event ${event}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error sending webhook for event ${event}:`, error.message);
    }
  }
}

export { EventEmitter, BarkNotifier };
export default {
  EventEmitter,
  EventType,
  eventEmitter,
  WebhookNotifier,
  BarkNotifier
};
