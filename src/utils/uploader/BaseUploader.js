import path from 'path';

/**
 * 上传器基类
 * 为所有上传器提供基础功能
 */
export default class BaseUploader {
  /**
   * 创建上传器
   * @param {Object} config 配置对象
   * @param {Object} logger 日志记录器
   */
  constructor(config = {}, logger = console) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * 验证配置参数是否存在
   * @param {Array<string>} requiredFields 必须的字段列表
   * @throws {Error} 如果缺少必须的字段
   */
  validateConfig(requiredFields = []) {
    const missingFields = requiredFields.filter(field => !this.config[field]);
    
    if (missingFields.length > 0) {
      const errorMsg = `上传器配置缺少必要字段: ${missingFields.join(', ')}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * 上传文件（抽象方法，子类必须实现）
   * @param {string} localPath 本地文件路径
   * @param {string} remoteName 远程文件名
   * @returns {Promise<boolean>} 上传是否成功
   */
  async uploadFile(localPath, remoteName) {
    throw new Error('子类必须实现uploadFile方法');
  }

  /**
   * 上传内容（抽象方法，子类必须实现）
   * @param {string} content 要上传的内容
   * @param {string} remoteName 远程文件名
   * @returns {Promise<boolean>} 上传是否成功
   */
  async uploadContent(content, remoteName) {
    throw new Error('子类必须实现uploadContent方法');
  }

  /**
   * 批量上传文件
   * @param {Array<{local: string, remote: string}>} files 文件列表
   * @returns {Promise<Array<{success: boolean, local: string, remote: string}>>} 上传结果
   */
  async uploadFiles(files) {
    const results = [];
    
    for (const file of files) {
      const success = await this.uploadFile(file.local, file.remote);
      results.push({
        success,
        local: file.local,
        remote: file.remote || path.basename(file.local)
      });
    }
    
    return results;
  }
} 