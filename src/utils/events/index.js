import EventEmitter from './EventEmitter';
import { BarkNotifier, EventType } from './BarkNotifier.js';

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

// 再次导出所有内容，让其他模块可以从index.js导入
export { EventEmitter, EventType, BarkNotifier };

export default {
  EventEmitter,
  EventType,
  eventEmitter,
  WebhookNotifier,
  BarkNotifier
};
