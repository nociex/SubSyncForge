import WebDAVUploader from './WebDAVUploader.js';
import CloudflareR2Uploader from './CloudflareR2Uploader.js';
import LocalFileUploader from './LocalFileUploader.js';

/**
 * 工厂函数，根据配置创建适当的上传器
 * @param {Object} config 上传配置
 * @param {Object} logger 日志记录器
 * @returns {Object} 上传器实例
 */
export function createUploader(config, logger = console) {
  const type = config?.type?.toLowerCase() || 'local';
  
  switch (type) {
    case 'webdav':
      return new WebDAVUploader(config, logger);
    case 'r2':
    case 'cloudflare':
    case 'cloudflare_r2':
      return new CloudflareR2Uploader(config, logger);
    case 'local':
    default:
      return new LocalFileUploader(config, logger);
  }
}

export { WebDAVUploader, CloudflareR2Uploader, LocalFileUploader }; 