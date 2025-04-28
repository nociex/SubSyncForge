import { logger } from '../index.js';
import net from 'net';
import tls from 'tls';
import http from 'http';
import https from 'https';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { URL } from 'url';

const defaultLogger = logger?.defaultLogger || console;

export class ProxyChecker {
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger.child({ component: 'ProxyChecker' });
  }

  /**
   * Checks connectivity through a given proxy node.
   * @param {Object} node - The proxy node configuration.
   * @param {number} timeout - Timeout in milliseconds.
   * @param {string} testUrl - URL to test connectivity against.
   * @returns {Promise<{status: boolean, error: string|null}>}
   */
  async checkConnectivity(node, timeout, testUrl) {
    this.logger.debug(`Checking connectivity for node: ${node.name} (${node.type}) via ${testUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        this.logger.warn(`Connection timed out for node ${node.name} after ${timeout}ms`);
        controller.abort();
    }, timeout);

    let agent = null;
    const targetUrl = new URL(testUrl);
    const requestOptions = {
        method: 'GET',
        signal: controller.signal,
        headers: {
            'User-Agent': 'SubSyncForge/1.0',
        }
    };

    try {
        switch (node.type?.toLowerCase()) {
            case 'http':
            case 'https':
                agent = new HttpsProxyAgent(`http://${node.settings?.username ? `${node.settings.username}:${node.settings.password}@` : ''}${node.server}:${node.port}`);
                break;
            case 'socks':
            case 'socks5':
                agent = new SocksProxyAgent(`socks5://${node.settings?.username ? `${node.settings.username}:${node.settings.password}@` : ''}${node.server}:${node.port}`);
                break;
            case 'trojan':
                this.logger.warn(`Connectivity check for trojan is not fully supported yet. Performing basic TCP check.`);
                // 对于Trojan协议，尝试进行TLS连接检查，因为Trojan是基于TLS的
                return this.checkTlsConnection(node.server, node.port, timeout);
            case 'ss':
            case 'ssr':
            case 'vmess':
                this.logger.warn(`Connectivity check for ${node.type} is not fully supported yet. Performing basic TCP check.`);
                // 对于其他特殊协议，仍然使用基本TCP检查
                return this.checkTcpConnection(node.server, node.port, timeout);
            default:
                this.logger.warn(`Unsupported proxy type for HTTP check: ${node.type}. Performing basic TCP check.`);
                return this.checkTcpConnection(node.server, node.port, timeout);
        }

        requestOptions.agent = agent;
        const httpModule = targetUrl.protocol === 'https:' ? https : http;
        
        return new Promise((resolve) => {
            const req = httpModule.request(targetUrl, requestOptions, (res) => {
                clearTimeout(timeoutId);
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    this.logger.debug(`Node ${node.name} connection successful (Status: ${res.statusCode}).`);
                    resolve({ status: true, error: null });
                } else {
                    this.logger.warn(`Node ${node.name} connection failed (Status: ${res.statusCode}).`);
                    resolve({ status: false, error: `HTTP Status ${res.statusCode}` });
                }
                res.resume(); // Consume response data to free up memory
            });

            req.on('error', (err) => {
                clearTimeout(timeoutId);
                if (err.name === 'AbortError') {
                    // Already handled by timeout
                    resolve({ status: false, error: 'Timeout' });
                } else {
                    this.logger.warn(`Node ${node.name} connection error: ${err.message}`);
                    resolve({ status: false, error: err.message });
                }
            });
            
            req.end(); // Important to end the request
        });

    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            return { status: false, error: 'Timeout' };
        } else {
             this.logger.error(`Error checking connectivity for ${node.name}: ${error.message}`);
             return { status: false, error: error.message };
        }
    }
  }

  /**
   * Performs a basic TCP connection check to the server and port.
   * @param {string} server - Server address.
   * @param {number} port - Server port.
   * @param {number} timeout - Timeout in milliseconds.
   * @returns {Promise<{status: boolean, error: string|null}>}
   */
  async checkTcpConnection(server, port, timeout) {
      return new Promise((resolve) => {
          const socket = new net.Socket();
          let connected = false;

          const timeoutId = setTimeout(() => {
              if (!connected) {
                  this.logger.warn(`TCP connection to ${server}:${port} timed out after ${timeout}ms`);
                  socket.destroy();
                  resolve({ status: false, error: 'Timeout' });
              }
          }, timeout);

          socket.connect(port, server, () => {
              connected = true;
              clearTimeout(timeoutId);
              this.logger.debug(`TCP connection to ${server}:${port} successful.`);
              socket.end();
              resolve({ status: true, error: null });
          });

          socket.on('error', (err) => {
              if (!connected) { // Avoid resolving twice if error happens after connect/timeout
                clearTimeout(timeoutId);
                this.logger.warn(`TCP connection to ${server}:${port} failed: ${err.message}`);
                resolve({ status: false, error: err.message });
              }
          });
          
          // Handle close event to ensure promise resolves if connection closes unexpectedly
          socket.on('close', (hadError) => {
            if (!connected && !hadError) { // If closed before connection without explicit error
                clearTimeout(timeoutId);
                resolve({ status: false, error: 'Connection closed unexpectedly' });
            }
        });
      });
  }

  /**
   * 检查TLS连接（适用于Trojan协议）
   * @param {string} server - 服务器地址
   * @param {number} port - 服务器端口
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<{status: boolean, error: string|null}>}
   */
  async checkTlsConnection(server, port, timeout) {
      return new Promise((resolve) => {
          let connected = false;
          
          const timeoutId = setTimeout(() => {
              if (!connected) {
                  this.logger.warn(`TLS connection to ${server}:${port} timed out after ${timeout}ms`);
                  socket.destroy();
                  resolve({ status: false, error: 'Timeout' });
              }
          }, timeout);

          // 创建TLS连接
          const socket = tls.connect({
              host: server,
              port: port,
              rejectUnauthorized: false, // 不验证服务器证书
              servername: server, // 设置SNI
              timeout: timeout,
              ALPNProtocols: ['http/1.1'] // 尝试通过ALPN协商HTTP/1.1
          }, () => {
              connected = true;
              clearTimeout(timeoutId);
              
              // 检查TLS连接是否成功建立
              if (socket.authorized || !socket.authorizationError) {
                  this.logger.debug(`TLS connection to ${server}:${port} successful`);
                  socket.end();
                  resolve({ status: true, error: null });
              } else {
                  this.logger.warn(`TLS connection to ${server}:${port} has authorization issues: ${socket.authorizationError}`);
                  // 即使有授权问题，连接仍然成功建立
                  socket.end();
                  resolve({ status: true, error: null });
              }
          });

          socket.on('error', (err) => {
              if (!connected) {
                  clearTimeout(timeoutId);
                  this.logger.warn(`TLS connection to ${server}:${port} failed: ${err.message}`);
                  resolve({ status: false, error: err.message });
              }
          });
          
          socket.on('close', (hadError) => {
              if (!connected && !hadError) {
                  clearTimeout(timeoutId);
                  resolve({ status: false, error: 'Connection closed unexpectedly' });
              }
          });
      });
  }
}

export default ProxyChecker; 