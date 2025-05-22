import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import BaseUploader from './BaseUploader.js';

/**
 * Cloudflare R2文件上传器
 * 负责将生成的订阅文件上传到Cloudflare R2存储
 */
export default class CloudflareR2Uploader extends BaseUploader {
  /**
   * 创建Cloudflare R2上传器
   * @param {Object} config 配置对象
   * @param {string} config.accountId Cloudflare账户ID
   * @param {string} config.accessKeyId R2访问密钥ID
   * @param {string} config.secretAccessKey R2访问密钥
   * @param {string} config.bucketName R2存储桶名称
   * @param {string} config.remotePath 远程存储路径（可选）
   * @param {Object} logger 日志记录器
   */
  constructor(config, logger = console) {
    super(config, logger);
    this.validateConfig(['accountId', 'accessKeyId', 'secretAccessKey', 'bucketName']);
    
    this.bucketName = config.bucketName;
    this.remotePath = config.remotePath || '';
    
    // 确保远程路径不以/开头，但以/结尾（如果有值）
    if (this.remotePath) {
      this.remotePath = this.remotePath.replace(/^\/+/, '');
      if (!this.remotePath.endsWith('/')) {
        this.remotePath += '/';
      }
    }
    
    // 创建S3客户端（兼容R2 API）
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      }
    });
  }

  /**
   * 上传文件到Cloudflare R2
   * @param {string} localPath 本地文件路径
   * @param {string} remoteName 远程文件名（可选，默认使用本地文件名）
   * @returns {Promise<boolean>} 上传是否成功
   */
  async uploadFile(localPath, remoteName) {
    try {
      const fileName = remoteName || path.basename(localPath);
      const key = this.remotePath + fileName;
      
      this.logger.debug(`正在上传文件 ${localPath} 到 R2: ${key}`);
      
      // 读取文件
      const fileData = fs.readFileSync(localPath);
      
      // 构建上传命令
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileData,
        ContentType: this.getContentType(fileName)
      });
      
      // 执行上传
      await this.client.send(command);
      
      this.logger.info(`文件上传成功: ${this.bucketName}/${key}`);
      return true;
    } catch (error) {
      this.logger.error(`R2上传失败: ${error.message}`, { error });
      return false;
    }
  }

  /**
   * 上传字符串内容到Cloudflare R2
   * @param {string} content 要上传的内容
   * @param {string} remoteName 远程文件名
   * @returns {Promise<boolean>} 上传是否成功
   */
  async uploadContent(content, remoteName) {
    try {
      const key = this.remotePath + remoteName;
      
      this.logger.debug(`正在上传内容到 R2: ${key}`);
      
      // 构建上传命令
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: content,
        ContentType: this.getContentType(remoteName)
      });
      
      // 执行上传
      await this.client.send(command);
      
      this.logger.info(`内容上传成功: ${this.bucketName}/${key}`);
      return true;
    } catch (error) {
      this.logger.error(`R2上传失败: ${error.message}`, { error });
      return false;
    }
  }

  /**
   * 根据文件名获取内容类型
   * @param {string} fileName 文件名
   * @returns {string} 内容类型
   */
  getContentType(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    
    const contentTypes = {
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.yaml': 'application/yaml',
      '.yml': 'application/yaml',
      '.conf': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }
} 