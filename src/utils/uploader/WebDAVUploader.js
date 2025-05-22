import { createClient } from 'webdav';
import fs from 'fs';
import path from 'path';
import BaseUploader from './BaseUploader.js';

/**
 * WebDAV文件上传器
 * 负责将生成的订阅文件上传到WebDAV服务器
 */
export default class WebDAVUploader extends BaseUploader {
  /**
   * 创建WebDAV上传器
   * @param {Object} config 配置对象
   * @param {string} config.url WebDAV服务器URL
   * @param {string} config.username WebDAV用户名
   * @param {string} config.password WebDAV密码
   * @param {string} config.remotePath 远程存储路径
   * @param {Object} logger 日志记录器
   */
  constructor(config, logger = console) {
    super(config, logger);
    this.validateConfig(['url', 'username', 'password']);
    
    this.client = createClient(
      config.url,
      {
        username: config.username,
        password: config.password
      }
    );
    
    this.remotePath = config.remotePath || '';
    // 确保远程路径以/结尾
    if (this.remotePath && !this.remotePath.endsWith('/')) {
      this.remotePath += '/';
    }
  }

  /**
   * 上传文件到WebDAV服务器
   * @param {string} localPath 本地文件路径
   * @param {string} remoteName 远程文件名（可选，默认使用本地文件名）
   * @returns {Promise<boolean>} 上传是否成功
   */
  async uploadFile(localPath, remoteName) {
    try {
      const fileName = remoteName || path.basename(localPath);
      const remoteFilePath = this.remotePath + fileName;
      
      this.logger.debug(`正在上传文件 ${localPath} 到 ${remoteFilePath}`);
      
      // 检查远程目录是否存在，不存在则创建
      await this.ensureDirectory();
      
      // 读取本地文件并上传
      const fileData = fs.readFileSync(localPath);
      await this.client.putFileContents(remoteFilePath, fileData);
      
      this.logger.info(`文件上传成功: ${remoteFilePath}`);
      return true;
    } catch (error) {
      this.logger.error(`WebDAV上传失败: ${error.message}`, { error });
      return false;
    }
  }

  /**
   * 上传字符串内容到WebDAV服务器
   * @param {string} content 要上传的内容
   * @param {string} remoteName 远程文件名
   * @returns {Promise<boolean>} 上传是否成功
   */
  async uploadContent(content, remoteName) {
    try {
      const remoteFilePath = this.remotePath + remoteName;
      
      this.logger.debug(`正在上传内容到 ${remoteFilePath}`);
      
      // 检查远程目录是否存在，不存在则创建
      await this.ensureDirectory();
      
      // 上传内容
      await this.client.putFileContents(remoteFilePath, content);
      
      this.logger.info(`内容上传成功: ${remoteFilePath}`);
      return true;
    } catch (error) {
      this.logger.error(`WebDAV上传失败: ${error.message}`, { error });
      return false;
    }
  }

  /**
   * 确保远程目录存在
   * @returns {Promise<void>}
   */
  async ensureDirectory() {
    if (!this.remotePath) return;
    
    try {
      // 分割路径并逐级创建
      const parts = this.remotePath.split('/').filter(Boolean);
      let currentPath = '';
      
      for (const part of parts) {
        currentPath += '/' + part;
        const exists = await this.client.exists(currentPath);
        
        if (!exists) {
          this.logger.debug(`创建远程目录: ${currentPath}`);
          await this.client.createDirectory(currentPath);
        }
      }
    } catch (error) {
      this.logger.warn(`创建远程目录失败: ${error.message}`, { error });
      // 继续执行，可能目录已存在
    }
  }
} 