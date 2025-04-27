/**
 * 事件发射器类
 * 实现发布/订阅模式，用于组件间通信
 */
export class EventEmitter {
  constructor() {
    this.events = new Map();
    this.onceEvents = new Map();
  }
  
  /**
   * 注册事件监听器
   * @param {string} event 事件名称
   * @param {Function} listener 监听器函数
   * @param {Object} options 选项
   * @returns {EventEmitter} 返回this以支持链式调用
   */
  on(event, listener, options = {}) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    
    const listeners = this.events.get(event);
    
    // 添加监听器及其选项
    listeners.push({
      fn: listener,
      context: options.context || this,
      priority: options.priority || 0
    });
    
    // 按优先级排序
    listeners.sort((a, b) => b.priority - a.priority);
    
    return this;
  }
  
  /**
   * 注册一次性事件监听器
   * @param {string} event 事件名称
   * @param {Function} listener 监听器函数
   * @param {Object} options 选项
   * @returns {EventEmitter} 返回this以支持链式调用
   */
  once(event, listener, options = {}) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    
    if (!this.onceEvents.has(event)) {
      this.onceEvents.set(event, []);
    }
    
    const listeners = this.onceEvents.get(event);
    
    // 添加一次性监听器及其选项
    listeners.push({
      fn: listener,
      context: options.context || this,
      priority: options.priority || 0
    });
    
    // 按优先级排序
    listeners.sort((a, b) => b.priority - a.priority);
    
    return this;
  }
  
  /**
   * 移除事件监听器
   * @param {string} event 事件名称
   * @param {Function} listener 监听器函数
   * @returns {EventEmitter} 返回this以支持链式调用
   */
  off(event, listener) {
    // 如果没有指定事件名，则移除所有事件监听器
    if (!event) {
      this.events.clear();
      this.onceEvents.clear();
      return this;
    }
    
    // 如果没有指定监听器，则移除该事件的所有监听器
    if (!listener) {
      this.events.delete(event);
      this.onceEvents.delete(event);
      return this;
    }
    
    // 移除指定的监听器
    if (this.events.has(event)) {
      const listeners = this.events.get(event);
      const filteredListeners = listeners.filter(item => item.fn !== listener);
      
      if (filteredListeners.length) {
        this.events.set(event, filteredListeners);
      } else {
        this.events.delete(event);
      }
    }
    
    // 移除指定的一次性监听器
    if (this.onceEvents.has(event)) {
      const listeners = this.onceEvents.get(event);
      const filteredListeners = listeners.filter(item => item.fn !== listener);
      
      if (filteredListeners.length) {
        this.onceEvents.set(event, filteredListeners);
      } else {
        this.onceEvents.delete(event);
      }
    }
    
    return this;
  }
  
  /**
   * 触发事件
   * @param {string} event 事件名称
   * @param {...any} args 传递给监听器的参数
   * @returns {boolean} 如果有监听器处理了事件则返回true，否则返回false
   */
  emit(event, ...args) {
    let handled = false;
    
    // 调用常规事件监听器
    if (this.events.has(event)) {
      const listeners = this.events.get(event);
      for (const { fn, context } of listeners) {
        try {
          fn.apply(context, args);
          handled = true;
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error);
        }
      }
    }
    
    // 调用一次性事件监听器
    if (this.onceEvents.has(event)) {
      const listeners = this.onceEvents.get(event);
      for (const { fn, context } of listeners) {
        try {
          fn.apply(context, args);
          handled = true;
        } catch (error) {
          console.error(`Error in once event listener for "${event}":`, error);
        }
      }
      // 清除所有一次性监听器
      this.onceEvents.delete(event);
    }
    
    return handled;
  }
  
  /**
   * 异步触发事件
   * @param {string} event 事件名称
   * @param {...any} args 传递给监听器的参数
   * @returns {Promise<boolean>} 如果有监听器处理了事件则返回true，否则返回false
   */
  async emitAsync(event, ...args) {
    let handled = false;
    const promises = [];
    
    // 收集常规事件监听器的Promise
    if (this.events.has(event)) {
      const listeners = this.events.get(event);
      for (const { fn, context } of listeners) {
        promises.push(
          Promise.resolve().then(() => {
            return fn.apply(context, args);
          }).catch(error => {
            console.error(`Error in async event listener for "${event}":`, error);
          })
        );
        handled = true;
      }
    }
    
    // 收集一次性事件监听器的Promise
    if (this.onceEvents.has(event)) {
      const listeners = this.onceEvents.get(event);
      for (const { fn, context } of listeners) {
        promises.push(
          Promise.resolve().then(() => {
            return fn.apply(context, args);
          }).catch(error => {
            console.error(`Error in async once event listener for "${event}":`, error);
          })
        );
        handled = true;
      }
      // 清除所有一次性监听器
      this.onceEvents.delete(event);
    }
    
    // 等待所有Promise完成
    if (promises.length > 0) {
      await Promise.all(promises);
    }
    
    return handled;
  }
  
  /**
   * 获取事件监听器数量
   * @param {string} event 事件名称
   * @returns {number} 监听器数量
   */
  listenerCount(event) {
    let count = 0;
    
    if (this.events.has(event)) {
      count += this.events.get(event).length;
    }
    
    if (this.onceEvents.has(event)) {
      count += this.onceEvents.get(event).length;
    }
    
    return count;
  }
  
  /**
   * 获取所有事件名称
   * @returns {string[]} 事件名称数组
   */
  eventNames() {
    const names = new Set([
      ...this.events.keys(),
      ...this.onceEvents.keys()
    ]);
    
    return Array.from(names);
  }
}

export default EventEmitter;
