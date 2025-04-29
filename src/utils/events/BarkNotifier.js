/**
 * Bark通知工具类
 * 用于在事件发生时发送Bark推送通知
 */

// 直接定义EventType而不是从index导入，避免循环依赖
const EventType = {
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

// 导出EventType
export { EventType };

export class BarkNotifier {
  constructor(options = {}) {
    this.barkUrl = options.barkUrl;
    // 默认只监听关键事件，减少推送频率
    this.events = options.events || [
      EventType.CONVERSION_COMPLETE,
      EventType.SYSTEM_ERROR
    ];
    this.timeout = options.timeout || 5000;
    this.title = options.title || 'SubSyncForge';
    this.enabled = options.enabled !== false && !!this.barkUrl;
    // 添加最小推送间隔控制，默认5分钟内不重复推送相同类型通知
    this.minInterval = options.minInterval || 300000; // 5分钟
    this.lastPushTime = {};
    
    // 验证Bark URL格式
    if (this.barkUrl && !this.barkUrl.endsWith('/')) {
      this.barkUrl = `${this.barkUrl}/`;
      console.log(`Bark URL已自动添加结尾斜杠: ${this.barkUrl}`);
    }
    
    if (this.enabled) {
      console.log(`Bark通知已启用: ${this.barkUrl}`);
      console.log(`监听事件: ${this.events.join(', ')}`);
    } else {
      if (!this.barkUrl) {
        console.warn(`Bark通知未启用: 未设置barkUrl`);
      } else {
        console.warn(`Bark通知未启用: enabled=false`);
      }
    }
  }
  
  /**
   * 注册事件监听器
   * @param {EventEmitter} eventEmitter 事件发射器实例
   */
  registerEventListeners(eventEmitter) {
    if (!this.enabled || !eventEmitter) {
      console.warn('Bark通知未注册监听器: ', this.enabled ? '未提供eventEmitter' : 'enabled=false');
      return;
    }
    
    console.log(`开始注册Bark事件监听器...`);
    
    // 添加SYSTEM_INFO事件
    const allEvents = [...this.events, EventType.SYSTEM_INFO];
    
    for (const event of allEvents) {
      console.log(`注册事件监听: ${event}`);
      
      eventEmitter.on(event, async (data) => {
        console.log(`接收到事件: ${event}`, data);
        
        // 检查是否在最小间隔内已经发送过相同类型的通知
        const now = Date.now();
        if (this.lastPushTime[event] && (now - this.lastPushTime[event] < this.minInterval)) {
          console.log(`跳过Bark通知: ${event} (最小间隔内已发送过)`);
          return;
        }
        
        await this.sendNotification(event, data);
        this.lastPushTime[event] = now;
      });
    }
    
    console.log(`Bark事件监听器注册完成: 共注册 ${allEvents.length} 个事件`);
  }
  
  /**
   * 发送Bark通知
   * @param {string} event 事件类型
   * @param {object} data 事件数据
   */
  async sendNotification(event, data) {
    if (!this.enabled || !this.barkUrl) {
      console.warn(`无法发送Bark通知: ${!this.enabled ? 'enabled=false' : 'barkUrl未设置'}`);
      return;
    }
    
    try {
      console.log(`准备发送Bark通知: ${event}`);
      
      // 构建消息内容
      const title = `${this.title} - ${this.formatEventType(event)}`;
      const content = this.formatContent(event, data);
      
      console.log(`通知标题: ${title}`);
      console.log(`通知内容: ${content}`);
      
      // 构建Bark URL
      const url = new URL(`${this.barkUrl}${encodeURIComponent(title)}/${encodeURIComponent(content)}`);
      
      // 添加可选参数
      url.searchParams.append('isArchive', '1');  // 保存到历史记录
      
      // 根据事件类型设置不同的图标和声音
      switch (event) {
        case EventType.SYSTEM_ERROR:
          url.searchParams.append('sound', 'failure');
          break;
        case EventType.SYSTEM_WARNING:
          url.searchParams.append('sound', 'warning');
          break;
        case EventType.CONVERSION_COMPLETE:
          url.searchParams.append('sound', 'complete');
          break;
        default:
          url.searchParams.append('sound', 'default');
      }
      
      console.log(`最终Bark通知URL: ${url.toString()}`);
      
      // 发送请求
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error(`发送Bark通知失败 (${event}): ${response.status} ${response.statusText}`);
        console.error(`响应内容: ${await response.text()}`);
      } else {
        const responseData = await response.text();
        console.log(`Bark通知已发送成功，响应: ${responseData}`);
      }
    } catch (error) {
      console.error(`发送Bark通知出错 (${event}): ${error.message}`);
      if (error.name === 'AbortError') {
        console.error('Bark通知发送超时，请检查网络连接和URL是否正确');
      }
      console.error(`错误堆栈: ${error.stack}`);
    }
  }
  
  /**
   * 格式化事件类型为可读文本
   * @param {string} event 事件类型
   * @returns {string} 格式化后的事件类型
   */
  formatEventType(event) {
    switch (event) {
      case EventType.CONVERSION_START:
        return '开始转换';
      case EventType.CONVERSION_PROGRESS:
        return '转换进度';
      case EventType.CONVERSION_COMPLETE:
        return '转换完成';
      case EventType.CONVERSION_ERROR:
        return '转换错误';
      case EventType.FETCH_START:
        return '开始获取';
      case EventType.FETCH_COMPLETE:
        return '获取完成';
      case EventType.FETCH_ERROR:
        return '获取错误';
      case EventType.PARSE_START:
        return '开始解析';
      case EventType.PARSE_COMPLETE:
        return '解析完成';
      case EventType.PARSE_ERROR:
        return '解析错误';
      case EventType.DEDUP_START:
        return '开始去重';
      case EventType.DEDUP_COMPLETE:
        return '去重完成';
      case EventType.SYSTEM_ERROR:
        return '系统错误';
      case EventType.SYSTEM_WARNING:
        return '系统警告';
      case EventType.SYSTEM_INFO:
        return '系统信息';
      default:
        return event;
    }
  }
  
  /**
   * 格式化事件内容
   * @param {string} event 事件类型
   * @param {object} data 事件数据
   * @returns {string} 格式化后的内容
   */
  formatContent(event, data) {
    switch (event) {
      case EventType.CONVERSION_COMPLETE:
        let nodeCountStr = '';
        const currentNodeCount = data.nodeCount || 0;
        const previousNodeCount = data.previousNodeCount;

        // 检查节点数是否有变化
        if (typeof previousNodeCount === 'number' && previousNodeCount !== currentNodeCount) {
          const diff = currentNodeCount - previousNodeCount;
          const diffSign = diff > 0 ? '+' : '';
          nodeCountStr = `节点: ${currentNodeCount} (${diffSign}${diff})`; // 显示当前数量和变化
        } else if (typeof previousNodeCount !== 'number') {
          // 如果没有上次记录，只显示当前数量
          nodeCountStr = `节点: ${currentNodeCount}`;
        }
        // 如果数量无变化，nodeCountStr 保持为空字符串，不显示节点信息

        let timeStr = '';
        if (data.time) {
          // Handle both milliseconds and seconds input
          let totalSeconds = data.time;
          if (totalSeconds > 10000) {  // Likely in milliseconds
            totalSeconds = Math.round(totalSeconds / 1000);
          }
          
          if (totalSeconds > 0) {
            const hours = Math.floor(totalSeconds / 3600);
            const remainingSeconds = totalSeconds % 3600;
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            
            if (hours > 0) {
              timeStr = `耗时 ${hours}小时${minutes}分${seconds}秒`;
            } else if (minutes > 0) {
              timeStr = `耗时 ${minutes}分${seconds}秒`;
            } else {
              timeStr = `耗时 ${seconds}秒`;
            }
          } else {
            timeStr = '耗时 0秒';
          }
        }

        let result = `✅ 同步完成`;
        if (nodeCountStr) { // 仅当节点数有变化或首次运行时添加
          result += `，${nodeCountStr}`;
        }
        if (timeStr) {
          result += `，${timeStr}`;
        }

        if (data.providers && data.providers.length > 0) {
          result += `\n来源: ${data.providers.join(', ')}`;
        }
        if (data.protocols && Object.keys(data.protocols).length > 0) {
          // 只列出存在的协议类型
          const protocolsList = Object.keys(data.protocols).join(', ');
          result += `\n协议: ${protocolsList}`;
        }
        if (data.regionsCount && Object.keys(data.regionsCount).length > 0) {
          // 显示Top 5地区及其数量
          const sortedRegions = Object.entries(data.regionsCount)
            .filter(([, count]) => count > 0)
            .sort(([, countA], [, countB]) => countB - countA); // 按数量降序排序
          
          const topRegions = sortedRegions
            .slice(0, 5) // 取前5个
            .map(([region, count]) => `${region}(${count})`)
            .join(', ');
            
          const totalRegions = sortedRegions.length; // 总地区数
          
          result += `\n地区: ${topRegions}${totalRegions > 5 ? ` 等 ${totalRegions} 个地区` : ''}`; // 如果超过5个，添加 "等 X 个地区"
        }
        result += `\n${new Date().toLocaleString('zh-CN')}`; // 保留日期时间
        return result;
      case EventType.SYSTEM_ERROR:
        return `错误: ${data.message || data.error || '未知错误'}\n${new Date().toLocaleString('zh-CN')}`;
      case EventType.SYSTEM_WARNING:
        return `警告: ${data.message || '未知警告'}\n${new Date().toLocaleString('zh-CN')}`;
      default:
        if (typeof data === 'string') {
          return `${data}\n${new Date().toLocaleString('zh-CN')}`;
        } else if (data.message) {
          return `${data.message}\n${new Date().toLocaleString('zh-CN')}`;
        } else {
          return `事件触发: ${event}\n${new Date().toLocaleString('zh-CN')}`;
        }
    }
  }
}
