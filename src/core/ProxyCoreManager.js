import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';
import https from 'https';
import { pipeline } from 'stream/promises';
import { createWriteStream, createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { Extract } from 'unzipper';
import { logger } from '../utils/index.js';
import net from 'net';
import { ProxyChecker } from '../utils/proxy/ProxyChecker.js';

const defaultLogger = logger?.defaultLogger || console;

export class ProxyCoreManager {
  constructor(options = {}) {
    this.logger = options.logger || defaultLogger.child({ component: 'ProxyCoreManager' });
    this.coreType = options.coreType || 'mihomo'; // 'mihomo' | 'v2ray' | 'singbox'
    this.coreDir = options.coreDir || path.join(process.cwd(), '.cores');
    this.configDir = options.configDir || path.join(this.coreDir, 'configs');
    this.timeout = options.timeout || 10000;
    this.testUrl = options.testUrl || 'http://www.google.com/generate_204';

    // 缓存已解析 / 安装完成的核心路径，防止在批量节点测试时重复执行 installCore。
    /** @type {string|null} */
    this.cachedCorePath = null;

    // 初始化基础连接检查器，供 runCoreTest 使用
    this.checker = new ProxyChecker({ logger: this.logger });

    // 核心版本信息
    this.coreVersions = {
      mihomo: {
        version: 'v1.19.9',
        releases: {
          'linux-amd64': 'mihomo-linux-amd64-v1.19.9.gz',
          'linux-arm64': 'mihomo-linux-arm64-v1.19.9.gz',
          'linux-armv7': 'mihomo-linux-armv7-v1.19.9.gz',
          'linux-armv6': 'mihomo-linux-armv6-v1.19.9.gz',
          'darwin-amd64': 'mihomo-darwin-amd64-v1.19.9.gz',
          'darwin-arm64': 'mihomo-darwin-arm64-v1.19.9.gz',
          'windows-amd64': 'mihomo-windows-amd64-v1.19.9.zip',
          'windows-arm64': 'mihomo-windows-arm64-v1.19.9.zip'
        }
      },
      v2ray: {
        version: 'v5.32.0',
        releases: {
          'linux-amd64': 'v2ray-linux-64.zip',
          'linux-arm64': 'v2ray-linux-arm64-v8a.zip',
          'linux-arm32-v7a': 'v2ray-linux-arm32-v7a.zip',
          'linux-arm32-v6': 'v2ray-linux-arm32-v6.zip',
          'linux-arm32-v5': 'v2ray-linux-arm32-v5.zip',
          'linux-32': 'v2ray-linux-32.zip',
          'darwin-amd64': 'v2ray-macos-64.zip',
          'darwin-arm64': 'v2ray-macos-arm64-v8a.zip',
          'windows-amd64': 'v2ray-windows-64.zip',
          'windows-arm64': 'v2ray-windows-arm64-v8a.zip',
          'windows-32': 'v2ray-windows-32.zip',
          'windows-arm32-v7a': 'v2ray-windows-arm32-v7a.zip'
        }
      },
      singbox: {
        version: 'v1.8.8',
        releases: {
          'linux-amd64': 'sing-box-1.8.8-linux-amd64.tar.gz',
          'linux-arm64': 'sing-box-1.8.8-linux-arm64.tar.gz',
          'linux-armv7': 'sing-box-1.8.8-linux-armv7.tar.gz',
          'darwin-amd64': 'sing-box-1.8.8-darwin-amd64.tar.gz',
          'darwin-arm64': 'sing-box-1.8.8-darwin-arm64.tar.gz',
          'windows-amd64': 'sing-box-1.8.8-windows-amd64.zip',
          'windows-arm64': 'sing-box-1.8.8-windows-arm64.zip'
        }
      }
    };

    // 资源文件信息
    this.assets = {
      geoip: {
        name: 'geoip.dat',
        url: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat'
      },
      geosite: {
        name: 'geosite.dat',
        url: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat'
      },
      mmdb: {
        name: 'Country.mmdb',
        url: 'https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/Country.mmdb'
      }
    };
  }

  /**
   * 获取当前平台标识
   */
  getPlatform() {
    // ... (unchanged)
    // 新增更完整的架构、平台检测逻辑，兼容 32 位 ARM 等情况
    const platform = os.platform(); // 'linux' | 'darwin' | 'win32'
    const arch = os.arch();         // 'x64' | 'arm64' | 'arm' | ...

    // 标准化操作系统名称
    const osType = platform === 'win32' ? 'windows' : platform;

    // 处理架构
    let archType;
    if (arch === 'x64') {
      archType = 'amd64';
    } else if (arch === 'arm64') {
      archType = 'arm64';
    } else if (arch === 'arm') {
      // Node.js 对 32 位 ARM 仅返回 arm，需要判断具体版本
      const armVersion = (process?.config?.variables?.arm_version || '').toString();
      let armSuffix = 'armv7'; // 默认 v7
      if (armVersion === '6') armSuffix = 'armv6';
      if (armVersion === '5') armSuffix = 'armv5';

      // 不同核心对 ARM 包的命名规则不同，这里做一次映射
      const coreSuffixMap = {
        mihomo: { armv7: 'armv7', armv6: 'armv6', armv5: 'armv5' },
        v2ray: { armv7: 'arm32-v7a', armv6: 'arm32-v6', armv5: 'arm32-v5' },
        singbox: { armv7: 'armv7', armv6: 'armv6', armv5: 'armv5' }
      };
      archType = coreSuffixMap[this.coreType]?.[armSuffix] || armSuffix;
    } else {
      // 其它架构保持原样
      archType = arch;
    }

    return `${osType}-${archType}`;
  }

  /**
   * 下载并安装资源文件 (GeoIP/GeoSite)
   */
  async installAssets() {
    // 确保核心目录存在
    await fs.mkdir(this.coreDir, { recursive: true });

    const assetsToInstall = [];

    // 根据核心类型决定需要哪些资源
    // mihomo 通常使用 .dat 或 .mmdb，这里为了兼容性下载 .dat 和 .mmdb
    // singbox 使用 .db (这里暂时没加 srs/db 的下载，先用 dat 兼容或让 singbox 自身处理，但 singbox 需要 geoip.db/geosite.db)
    // 注意：Singbox 1.8+ 默认使用 .db，但也支持 .dat。此时为了解决 timeouts，我们主要解决 mihomo 的 dat 下载问题。
    // Singbox 可能也需要 .db，但目前报错主要针对 mihomo。我们先下载通用的 dat 和 mmdb。

    // 总是检查/下载 geoip.dat 和 geosite.dat
    assetsToInstall.push(this.assets.geoip);
    assetsToInstall.push(this.assets.geosite);

    // 如果是 mihomo，有时也用 mmdb
    if (this.coreType === 'mihomo') {
      assetsToInstall.push(this.assets.mmdb);
    }

    for (const asset of assetsToInstall) {
      const assetPath = path.join(this.coreDir, asset.name);
      try {
        await fs.access(assetPath, fsConstants.F_OK);
        // this.logger.info(`资源文件已存在: ${asset.name}`); // 减少日志噪音
      } catch {
        this.logger.info(`资源文件不存在，开始下载: ${asset.name}...`);
        try {
          await this.downloadFile(asset.url, assetPath);
          this.logger.info(`资源文件下载完成: ${asset.name}`);
        } catch (error) {
          this.logger.warn(`资源文件 ${asset.name} 下载失败: ${error.message}，核心运行可能会受影响`);
          // 不抛出错误，继续尝试下一个
        }
      }
    }
  }

  /**
   * 下载并安装代理核心
   */
  async installCore() {
    // 创建核心目录
    await fs.mkdir(this.coreDir, { recursive: true });
    await fs.mkdir(this.configDir, { recursive: true });

    // 在核心安装前/后，尝试下载资源文件
    // 这样做可以确保无论是否重新下载核心，资源文件都会被检查
    await this.installAssets();

    // 如果已经缓存并且可执行，则直接返回，避免重复日志与检查
    if (this.cachedCorePath) {
      try {
        await fs.access(this.cachedCorePath, fsConstants.F_OK | fsConstants.X_OK);
        return this.cachedCorePath;
      } catch {
        // 缓存路径不可用，继续执行安装流程
      }
    }
    const platform = this.getPlatform();
    const coreInfo = this.coreVersions[this.coreType];

    if (!coreInfo || !coreInfo.releases[platform]) {
      throw new Error(`不支持的平台: ${platform} (${this.coreType})`);
    }

    const fileName = coreInfo.releases[platform];
    const corePath = path.join(this.coreDir, this.getCoreExecutableName());

    // 检查核心是否已存在且可执行
    try {
      await fs.access(corePath, fsConstants.F_OK | fsConstants.X_OK);
      this.logger.info(`${this.coreType} 核心已存在: ${corePath}`);
      this.cachedCorePath = corePath;
      return corePath;
    } catch {
      // 核心不存在，需要下载
    }

    this.logger.info(`开始下载 ${this.coreType} 核心 (${platform})...`);

    const downloadUrl = this.getDownloadUrl(fileName);
    const tempFile = path.join(this.coreDir, fileName);

    try {
      // 下载文件
      await this.downloadFile(downloadUrl, tempFile);

      // 解压文件
      await this.extractCore(tempFile, corePath);

      // 设置执行权限 (Unix系统)
      if (os.platform() !== 'win32') {
        await fs.chmod(corePath, 0o755);
      }

      // 清理临时文件
      await fs.unlink(tempFile);

      this.logger.info(`${this.coreType} 核心安装完成: ${corePath}`);
      this.cachedCorePath = corePath;
      return corePath;

    } catch (error) {
      this.logger.error(`安装 ${this.coreType} 核心失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取核心可执行文件名
   */
  getCoreExecutableName() {
    const ext = os.platform() === 'win32' ? '.exe' : '';
    if (this.coreType === 'mihomo') return `mihomo${ext}`;
    if (this.coreType === 'v2ray') return `v2ray${ext}`;
    if (this.coreType === 'singbox') return `sing-box${ext}`;
    return `${this.coreType}${ext}`;
  }

  /**
   * 获取下载URL
   */
  getDownloadUrl(fileName) {
    const version = this.coreVersions[this.coreType].version;
    if (this.coreType === 'mihomo') {
      return `https://github.com/MetaCubeX/mihomo/releases/download/${version}/${fileName}`;
    } else if (this.coreType === 'v2ray') {
      return `https://github.com/v2fly/v2ray-core/releases/download/${version}/${fileName}`;
    } else if (this.coreType === 'singbox') {
      return `https://github.com/SagerNet/sing-box/releases/download/${version}/${fileName}`;
    }
    throw new Error(`未知的核心类型: ${this.coreType}`);
  }

  /**
   * 下载文件
   */
  async downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // 处理重定向
          return this.downloadFile(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }

        const fileStream = createWriteStream(outputPath);
        pipeline(response, fileStream)
          .then(resolve)
          .catch(reject);
      }).on('error', reject);
    });
  }

  /**
   * 解压核心文件
   */
  async extractCore(archivePath, outputPath) {
    const findExecutable = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const nested = await findExecutable(fullPath);
          if (nested) return nested;
        } else if (entry.name === this.getCoreExecutableName() || entry.name.startsWith('sing-box')) {
          return fullPath;
        }
      }
      return null;
    };

    if (archivePath.endsWith('.tar.gz')) {
      await new Promise((resolve, reject) => {
        const tarProcess = spawn('tar', ['-xzf', archivePath, '-C', this.coreDir], { stdio: 'ignore' });
        tarProcess.on('error', reject);
        tarProcess.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`tar 解压失败，退出码: ${code}`));
        });
      });

      const executablePath = await findExecutable(this.coreDir);
      if (executablePath) {
        await fs.rename(executablePath, outputPath);
      }
    } else if (archivePath.endsWith('.gz')) {
      // 处理gzip文件 (mihomo)
      const readStream = createReadStream(archivePath);
      const writeStream = createWriteStream(outputPath);
      const gunzip = createGunzip();

      await pipeline(readStream, gunzip, writeStream);
    } else if (archivePath.endsWith('.zip')) {
      // 处理zip文件 (v2ray)
      const extractStream = Extract({ path: this.coreDir });
      const readStream = createReadStream(archivePath);

      await pipeline(readStream, extractStream);

      // 查找可执行文件并移动到正确位置
      const files = await fs.readdir(this.coreDir);
      const executable = files.find(f =>
        f.includes(this.getCoreExecutableName().replace('.exe', '')) ||
        (f.includes('v2ray') && !f.includes('.'))
      );

      if (executable) {
        const srcPath = path.join(this.coreDir, executable);
        await fs.rename(srcPath, outputPath);
      }
    }
  }

  /**
   * 生成节点的最小配置
   */
  async generateConfig(node, configName = 'test-config', mixedPort = 0) {
    const configPath = path.join(this.configDir, `${configName}.json`);

    let config;
    if (this.coreType === 'mihomo') {
      config = this.generateMihomoConfig(node, mixedPort);
    } else if (this.coreType === 'v2ray') {
      config = this.generateV2rayConfig(node);
    } else if (this.coreType === 'singbox') {
      config = this.generateSingboxConfig(node, mixedPort);
    } else {
      throw new Error(`未支持的核心类型: ${this.coreType}`);
    }

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    this.logger.debug(`生成配置文件: ${configPath}`);

    return configPath;
  }

  /**
   * 生成Mihomo配置
   */
  generateMihomoConfig(node, mixedPort) {
    let mixedPortValue = mixedPort || 0;
    const proxy = this.convertNodeToMihomoProxy(node);

    return {
      "mixed-port": mixedPortValue,
      "allow-lan": false,
      "mode": "rule",
      "log-level": "silent",
      "external-controller": "",
      "proxies": [proxy],
      "proxy-groups": [
        {
          "name": "test",
          "type": "select",
          "proxies": [proxy.name]
        }
      ],
      "rules": [
        "MATCH,test"
      ]
    };
  }

  /**
   * 生成V2ray配置
   */
  generateV2rayConfig(node) {
    const outbound = this.convertNodeToV2rayOutbound(node);

    return {
      "log": { "loglevel": "none" },
      "inbounds": [],
      "outbounds": [outbound],
      "routing": {
        "rules": [
          {
            "type": "field",
            "outboundTag": "proxy",
            "domain": ["geosite:geolocation-!cn"]
          }
        ]
      }
    };
  }

  /**
   * 生成SingBox配置
   */
  generateSingboxConfig(node, mixedPort) {
    const outbound = this.convertNodeToSingboxOutbound(node);

    return {
      log: { level: 'error' },
      inbounds: [
        {
          type: 'mixed',
          tag: 'mixed-in',
          listen: '127.0.0.1',
          listen_port: mixedPort || 0
        }
      ],
      outbounds: [
        outbound,
        { type: 'direct', tag: 'direct' }
      ],
      route: {
        rules: [
          {
            inbound: ['mixed-in'],
            outbound: outbound.tag
          }
        ]
      }
    };
  }

  /**
   * 转换节点为Mihomo代理配置
   */
  convertNodeToMihomoProxy(node) {
    const base = {
      name: node.name || 'test-node',
      server: node.server,
      port: parseInt(node.port)
    };

    const nodeType = node.type?.toLowerCase();

    switch (nodeType) {
      case 'ss':
        return {
          ...base,
          type: 'ss',
          cipher: node.settings?.method || node.cipher || node.method || 'aes-256-gcm',
          password: node.settings?.password || node.password
        };

      case 'vmess':
        const vmessConfig = {
          ...base,
          type: 'vmess',
          uuid: node.settings?.id || node.uuid || node.id,
          alterId: parseInt(node.settings?.alterId || node.alterId || node.aid || 0),
          cipher: node.settings?.security || node.cipher || 'auto',
          tls: (node.settings?.tls || node.tls) === true || (node.settings?.tls || node.tls) === 'tls',
          network: node.settings?.network || node.network || 'tcp'
        };

        // 处理WebSocket设置
        if (vmessConfig.network === 'ws') {
          vmessConfig['ws-opts'] = {
            path: node.settings?.wsPath || node.settings?.path || node.wsPath || '/',
            headers: {}
          };

          if (node.settings?.wsHeaders?.Host || node.settings?.host || node.host) {
            vmessConfig['ws-opts'].headers.Host = node.settings?.wsHeaders?.Host || node.settings?.host || node.host;
          }
        }

        // 处理TLS设置
        if (vmessConfig.tls) {
          vmessConfig.servername = node.settings?.serverName || node.settings?.sni || node.serverName || node.sni || node.server;
          vmessConfig['skip-cert-verify'] = node.settings?.allowInsecure || node.allowInsecure || false;
        }

        return vmessConfig;

      case 'vless':
        const vlessConfig = {
          ...base,
          type: 'vless',
          uuid: node.settings?.id || node.uuid || node.id,
          flow: node.settings?.flow || node.flow || '',
          tls: (node.settings?.security || node.security) === 'tls' || (node.settings?.tls || node.tls) === true,
          network: node.settings?.network || node.network || 'tcp'
        };

        // 处理WebSocket设置
        if (vlessConfig.network === 'ws') {
          vlessConfig['ws-opts'] = {
            path: node.settings?.path || node.path || '/',
            headers: {}
          };

          if (node.settings?.host || node.host) {
            vlessConfig['ws-opts'].headers.Host = node.settings?.host || node.host;
          }
        }

        // 处理TLS设置
        if (vlessConfig.tls) {
          vlessConfig.servername = node.settings?.sni || node.sni || node.server;
          vlessConfig['skip-cert-verify'] = node.settings?.allowInsecure || node.allowInsecure || false;

          if (node.settings?.fp || node.fp) {
            vlessConfig['client-fingerprint'] = node.settings?.fp || node.fp;
          }

          if (node.settings?.alpn || node.alpn) {
            const alpn = node.settings?.alpn || node.alpn;
            vlessConfig.alpn = Array.isArray(alpn) ? alpn : alpn.split(',');
          }
        }

        return vlessConfig;

      case 'trojan':
        return {
          ...base,
          type: 'trojan',
          password: node.settings?.password || node.password,
          sni: node.settings?.sni || node.sni || node.server,
          'skip-cert-verify': node.settings?.allowInsecure || node.allowInsecure || false
        };

      case 'hysteria2':
        const hysteria2Config = {
          ...base,
          type: 'hysteria2',
          password: node.settings?.auth || node.auth || node.password,
          'skip-cert-verify': node.settings?.insecure || node.insecure || false
        };

        if (node.settings?.sni || node.sni) {
          hysteria2Config.sni = node.settings?.sni || node.sni;
        }

        if (node.settings?.obfs || node.obfs) {
          hysteria2Config.obfs = node.settings?.obfs || node.obfs;
          if (node.settings?.obfsPassword || node.obfsPassword) {
            hysteria2Config['obfs-password'] = node.settings?.obfsPassword || node.obfsPassword;
          }
        }

        if (node.settings?.uploadBandwidth || node.uploadBandwidth) {
          hysteria2Config.up = node.settings?.uploadBandwidth || node.uploadBandwidth;
        }

        if (node.settings?.downloadBandwidth || node.downloadBandwidth) {
          hysteria2Config.down = node.settings?.downloadBandwidth || node.downloadBandwidth;
        }

        return hysteria2Config;

      case 'tuic':
        const tuicConfig = {
          ...base,
          type: 'tuic',
          uuid: node.settings?.uuid || node.uuid || node.id,
          password: node.settings?.password || node.password,
          'congestion-controller': node.settings?.congestionControl || node.congestionControl || 'cubic',
          'udp-relay-mode': node.settings?.udpRelayMode || node.udpRelayMode || 'native',
          'reduce-rtt': true
        };

        if (node.settings?.sni || node.sni) {
          tuicConfig.sni = node.settings?.sni || node.sni;
        }

        if (node.settings?.alpn || node.alpn) {
          const alpn = node.settings?.alpn || node.alpn;
          tuicConfig.alpn = Array.isArray(alpn) ? alpn : alpn.split(',');
        }

        tuicConfig['skip-cert-verify'] = node.settings?.allowInsecure || node.allowInsecure || false;

        return tuicConfig;

      case 'ssr':
        return {
          ...base,
          type: 'ssr',
          cipher: node.settings?.method || node.cipher || node.method,
          password: node.settings?.password || node.password,
          obfs: node.settings?.obfs || node.obfs || 'plain',
          protocol: node.settings?.protocol || node.protocol || 'origin',
          'obfs-param': node.settings?.obfsParam || node.obfsParam || '',
          'protocol-param': node.settings?.protocolParam || node.protocolParam || ''
        };

      case 'http':
      case 'https':
        const httpConfig = {
          ...base,
          type: 'http'
        };

        if (node.settings?.username || node.username) {
          httpConfig.username = node.settings?.username || node.username;
        }

        if (node.settings?.password || node.password) {
          httpConfig.password = node.settings?.password || node.password;
        }

        if (nodeType === 'https' || node.settings?.tls || node.tls) {
          httpConfig.tls = true;
          httpConfig['skip-cert-verify'] = node.settings?.allowInsecure || node.allowInsecure || false;
        }

        return httpConfig;

      case 'socks5':
      case 'socks':
        const socksConfig = {
          ...base,
          type: 'socks5'
        };

        if (node.settings?.username || node.username) {
          socksConfig.username = node.settings?.username || node.username;
        }

        if (node.settings?.password || node.password) {
          socksConfig.password = node.settings?.password || node.password;
        }

        if (node.settings?.tls || node.tls) {
          socksConfig.tls = true;
          socksConfig['skip-cert-verify'] = node.settings?.allowInsecure || node.allowInsecure || false;
        }

        return socksConfig;

      default:
        // 对于不支持的类型，尝试兼容转换或者记录警告但不抛出错误
        this.logger.warn(`尝试转换不完全支持的节点类型: ${node.type}，将使用基本配置`);

        // 返回一个基本的配置，让用户知道这个节点存在但可能无法正常工作
        return {
          ...base,
          type: nodeType || 'unknown',
          // 添加一些通用字段
          password: node.settings?.password || node.password || '',
          // 标记为可能不兼容
          _unsupported: true
        };
    }
  }

  /**
   * 转换节点为V2ray出站配置
   */
  convertNodeToV2rayOutbound(node) {
    const base = {
      tag: "proxy",
      protocol: node.type?.toLowerCase(),
      settings: {},
      streamSettings: {}
    };

    switch (node.type?.toLowerCase()) {
      case 'vmess':
        base.settings = {
          vnext: [{
            address: node.server,
            port: node.port,
            users: [{
              id: node.uuid || node.id,
              alterId: node.alterId || node.aid || 0
            }]
          }]
        };
        break;

      case 'trojan':
        base.settings = {
          servers: [{
            address: node.server,
            port: node.port,
            password: node.password
          }]
        };
        break;

      default:
        throw new Error(`V2ray 不支持的节点类型: ${node.type}`);
    }

    return base;
  }

  /**
   * 转换节点为SingBox出站配置
   */
  convertNodeToSingboxOutbound(node) {
    const base = {
      tag: 'proxy',
      type: node.type?.toLowerCase(),
      server: node.server,
      server_port: parseInt(node.port)
    };

    switch (node.type?.toLowerCase()) {
      case 'vmess': {
        const outbound = {
          ...base,
          type: 'vmess',
          uuid: node.settings?.id || node.uuid || node.id,
          security: node.settings?.security || node.cipher || 'auto',
          alter_id: parseInt(node.settings?.alterId || node.alterId || node.aid || 0)
        };

        if ((node.settings?.network || node.network) === 'ws') {
          outbound.transport = {
            type: 'ws',
            path: node.settings?.wsPath || node.settings?.path || node.wsPath || '/',
            headers: {}
          };
          const host = node.settings?.wsHeaders?.Host || node.settings?.host || node.host;
          if (host) outbound.transport.headers.Host = host;
        }

        if (node.settings?.tls || node.tls) {
          outbound.tls = {
            enabled: true,
            server_name: node.settings?.serverName || node.settings?.sni || node.server,
            insecure: node.settings?.allowInsecure || false
          };
        }
        return outbound;
      }
      case 'vless': {
        const outbound = {
          ...base,
          type: 'vless',
          uuid: node.settings?.id || node.uuid || node.id
        };

        if ((node.settings?.network || node.network) === 'ws') {
          outbound.transport = {
            type: 'ws',
            path: node.settings?.path || node.settings?.wsPath || '/',
            headers: {}
          };
          const host = node.settings?.host || node.settings?.wsHeaders?.Host || node.host;
          if (host) outbound.transport.headers.Host = host;
        }

        if (node.settings?.tls || node.settings?.security === 'tls') {
          outbound.tls = {
            enabled: true,
            server_name: node.settings?.sni || node.server,
            insecure: node.settings?.allowInsecure || false
          };
        }

        if (node.settings?.flow) {
          outbound.flow = node.settings.flow;
        }
        return outbound;
      }
      case 'ss':
      case 'shadowsocks':
        return {
          ...base,
          type: 'shadowsocks',
          method: node.settings?.method || node.method,
          password: node.settings?.password || node.password
        };
      case 'trojan':
        return {
          ...base,
          type: 'trojan',
          password: node.settings?.password || node.password,
          tls: {
            enabled: true,
            server_name: node.settings?.sni || node.server,
            insecure: node.settings?.allowInsecure || false
          }
        };
      case 'hysteria2':
        return {
          ...base,
          type: 'hysteria2',
          password: node.settings?.auth || node.settings?.password
        };
      case 'tuic':
        return {
          ...base,
          type: 'tuic',
          uuid: node.settings?.uuid || node.uuid,
          password: node.settings?.password || node.password
        };
      default:
        throw new Error(`SingBox 不支持的节点类型: ${node.type}`);
    }
  }

  /**
   * 测试单个节点连接
   */
  async testNode(node, configName = null) {
    try {
      // 获取（或安装）核心，可避免重复 install 调用
      const corePath = this.cachedCorePath || await this.installCore();

      // 为每个节点分配一个可用端口，用于本地 mixed 代理端口
      const localPort = await this.getFreePort();

      // 生成配置
      const testConfigName = configName || `test-${Date.now()}`;
      const configPath = await this.generateConfig(node, testConfigName, localPort);

      // 执行连接测试
      const result = await this.runCoreTest(corePath, configPath, localPort);

      // 清理临时配置
      if (!configName) {
        await fs.unlink(configPath).catch(() => { });
      }

      return result;

    } catch (error) {
      this.logger.error(`测试节点 ${node.name} 失败: ${error.message}`);
      return {
        status: false,
        latency: null,
        error: error.message
      };
    }
  }

  /**
   * 运行核心测试
   */
  /**
   * 运行核心测试
   */
  async runCoreTest(corePath, configPath, localPort) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let isReady = false;
      let coreProcess = null;

      // 启动核心进程，捕获 stderr 以便调试
      try {
        let args = [];
        if (this.coreType === 'v2ray' || this.coreType === 'singbox') {
          args = ['run', '-c', configPath];
        } else {
          args = ['-f', configPath];
        }
        // 允许捕获 stderr
        coreProcess = spawn(corePath, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: false });

        // 收集错误日志
        let errorLogs = '';
        if (coreProcess.stderr) {
          coreProcess.stderr.on('data', (data) => {
            errorLogs += data.toString();
          });
        }

        coreProcess.on('error', (err) => {
          this.logger.error(`启动核心失败: ${err.message}`);
          finalize({ status: false, latency: null, error: `启动失败: ${err.message}` });
        });

        coreProcess.on('exit', (code, signal) => {
          if (!isReady) { // 如果还没测试就退出了
            const msg = `核心异常退出 (code=${code}, signal=${signal})。日志: ${errorLogs.slice(0, 200)}...`;
            this.logger.error(msg);
            finalize({ status: false, latency: null, error: msg });
          }
        });

      } catch (err) {
        finalize({ status: false, latency: null, error: `启动异常: ${err.message}` });
        return;
      }

      // 资源清理和结果返回函数
      const finalize = (result) => {
        isReady = true; // 标记已完成，避免 exit 事件重复处理
        clearTimeout(timeoutId);

        // 停止端口检查轮询
        if (checkInterval) clearInterval(checkInterval);

        if (coreProcess && !coreProcess.killed) {
          try { coreProcess.kill('SIGTERM'); } catch { }
        }
        resolve(result);
      };

      // 全局超时
      const timeoutId = setTimeout(() => {
        finalize({ status: false, latency: null, error: 'Test timeout (global limit)' });
      }, this.timeout);

      // 轮询检查端口是否就绪
      // 相比固定的 setTimeout，轮询更可靠且更快
      let checkCount = 0;
      const maxChecks = 20; // 最多检查20次
      const checkDelay = 100; // 每次间隔100ms

      const checkPortAndTest = async () => {
        checkCount++;

        // 检查端口是否被监听
        const isPortListening = await this.checkPortListening(localPort);

        if (isPortListening) {
          clearInterval(checkInterval);
          this.logger.debug(`核心端口 ${localPort} 已就绪 (尝试 ${checkCount} 次)`);

          try {
            // 端口就绪后，等待一小会儿确保服务完全可用
            await new Promise(r => setTimeout(r, 200));

            // 创建指向本地代理端口的虚拟节点进行测试
            const fakeNode = {
              name: 'local-proxy',
              type: 'http',
              server: '127.0.0.1',
              port: localPort
            };

            this.logger.debug(`通过本地代理端口 127.0.0.1:${localPort} 测试节点连通性`);
            const checkResult = await this.checker.checkConnectivity(fakeNode, this.timeout / 2, this.testUrl);
            const latency = Date.now() - startTime;

            if (checkResult.status) {
              finalize({ status: true, latency, error: null });
            } else {
              finalize({ status: false, latency: null, error: checkResult.error || 'Connectivity check failed' });
            }
          } catch (err) {
            finalize({ status: false, latency: null, error: err.message });
          }
        } else if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          finalize({ status: false, latency: null, error: `核心启动超时，端口 ${localPort} 未就绪` });
        }
      };

      const checkInterval = setInterval(checkPortAndTest, checkDelay);
    });
  }

  /**
   * 检查端口是否被监听
   */
  async checkPortListening(port) {
    return new Promise((resolve) => {
      const client = new net.Socket();
      client.setTimeout(200); // 快速超时

      client.connect({ port, host: '127.0.0.1' }, () => {
        client.destroy();
        resolve(true); // 连接成功，说明端口被监听
      });

      client.on('error', () => {
        client.destroy();
        resolve(false); // 连接失败
      });

      client.on('timeout', () => {
        client.destroy();
        resolve(false);
      });
    });
  }

  /**
   * 获取系统可用端口
   * @returns {Promise<number>}
   */
  async getFreePort() {
    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, () => {
        const port = srv.address().port;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
  }

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      // 清理配置文件
      const files = await fs.readdir(this.configDir);
      for (const file of files) {
        if (file.startsWith('test-') && file.endsWith('.json')) {
          await fs.unlink(path.join(this.configDir, file));
        }
      }
      this.logger.debug('清理临时配置文件完成');
    } catch (error) {
      this.logger.warn(`清理失败: ${error.message}`);
    }
  }

  /**
   * 检查代理核心是否准备就绪
   * @returns {Promise<boolean>} 是否准备就绪
   */
  async isReady() {
    try {
      // 如果已经缓存了核心路径，直接检查
      if (this.cachedCorePath) {
        await fs.access(this.cachedCorePath, fsConstants.F_OK | fsConstants.X_OK);
        return true;
      }

      // 否则检查核心是否已安装
      const corePath = path.join(this.coreDir, this.getCoreExecutableName());

      try {
        await fs.access(corePath, fsConstants.F_OK | fsConstants.X_OK);
        this.cachedCorePath = corePath;
        return true;
      } catch {
        // 核心不存在
        return false;
      }
    } catch (error) {
      this.logger.debug(`检查核心状态失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 下载核心（如果需要的话）
   * @returns {Promise<string>} 核心路径
   */
  async downloadCore() {
    return await this.installCore();
  }
}

export default ProxyCoreManager; 
