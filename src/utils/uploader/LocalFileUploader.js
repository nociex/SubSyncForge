import fs from 'fs';
import path from 'path';
import BaseUploader from './BaseUploader.js';

/**
 * 本地文件上传器
 * 负责将生成的订阅文件保存到本地文件系统
 */
export default class LocalFileUploader extends BaseUploader {
  /**
   * 创建本地文件上传器
   * @param {Object} config 配置对象
   * @param {string} config.outputDir 输出目录
   * @param {Object} logger 日志记录器
   */
  constructor(config, logger = console) {
    super(config, logger);
    this.outputDir = config.outputDir || './output';
  }

  /**
   * 上传（保存）文件到本地
   * @param {string} localPath 源文件路径
   * @param {string} remoteName 目标文件名（可选，默认使用本地文件名）
   * @returns {Promise<boolean>} 上传是否成功
   */
  async uploadFile(localPath, remoteName) {
    try {
      const fileName = remoteName || path.basename(localPath);
      const destPath = path.join(this.outputDir, fileName);
      
      this.logger.debug(`正在保存文件 ${localPath} 到 ${destPath}`);
      
      // 确保目录存在
      await this.ensureDirectory();
      
      // 如果源和目标相同，不做任何操作
      if (path.resolve(localPath) === path.resolve(destPath)) {
        this.logger.debug(`源文件和目标文件相同: ${localPath}`);
        return true;
      }
      
      // 复制文件
      fs.copyFileSync(localPath, destPath);
      
      this.logger.info(`文件保存成功: ${destPath}`);
      return true;
    } catch (error) {
      this.logger.error(`本地文件保存失败: ${error.message}`, { error });
      return false;
    }
  }

  /**
   * 上传（保存）字符串内容到本地文件
   * @param {string} content 要保存的内容
   * @param {string} remoteName 文件名
   * @returns {Promise<boolean>} 保存是否成功
   */
  async uploadContent(content, remoteName) {
    try {
      const destPath = path.join(this.outputDir, remoteName);
      
      this.logger.debug(`正在保存内容到 ${destPath}`);
      
      // 确保目录存在
      await this.ensureDirectory();
      
      // 写入文件
      fs.writeFileSync(destPath, content);
      
      this.logger.info(`内容保存成功: ${destPath}`);
      return true;
    } catch (error) {
      this.logger.error(`本地文件保存失败: ${error.message}`, { error });
      return false;
    }
  }

  /**
   * 确保输出目录存在
   * @returns {Promise<void>}
   */
  async ensureDirectory() {
    try {
      if (!fs.existsSync(this.outputDir)) {
        this.logger.debug(`创建输出目录: ${this.outputDir}`);
        fs.mkdirSync(this.outputDir, { recursive: true });
      }
    } catch (error) {
      this.logger.error(`创建输出目录失败: ${error.message}`, { error });
      throw error;
    }
  }
} 