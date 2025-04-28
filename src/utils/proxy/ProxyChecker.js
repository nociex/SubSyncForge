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
            // Add cases for vmess, ss, trojan if specific libraries are available
            // For now, these types will fall through to direct connection test or fail if unsupported
            case 'ss':
            case 'ssr':
            case 'vmess':
            case 'trojan':
                 this.logger.warn(`Connectivity check for ${node.type} is not fully supported yet. Performing basic TCP check.`);
                 // Fallback to basic TCP check for now
                 return this.checkTcpConnection(node.server, node.port, timeout);
            default:
                this.logger.warn(`Unsupported proxy type for HTTP check: ${node.type}. Performing basic TCP check.`);
                return this.checkTcpConnection(node.server, node.port, timeout);
        }

        requestOptions.agent = agent;
        const httpModule = targetUrl.protocol === 'https:' ? https : http;
        const response = await httpModule.request(targetUrl, requestOptions);

        return new Promise((resolve) => {
            response.on('response', (res) => {
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

            response.on('error', (err) => {
                clearTimeout(timeoutId);
                 if (err.name === 'AbortError') {
                     // Already handled by timeout
                    resolve({ status: false, error: 'Timeout' });
                 } else {
                    this.logger.warn(`Node ${node.name} connection error: ${err.message}`);
                    resolve({ status: false, error: err.message });
                 }
            });
            
            response.end(); // Important to end the request
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
}

export default ProxyChecker; 