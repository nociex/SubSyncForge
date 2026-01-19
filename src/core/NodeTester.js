
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import fetch from 'node-fetch';
import { PortFinder } from './utils/PortFinder.js';
import { SubconverterClient } from './utils/SubconverterClient.js';
import { ProxyCoreManager } from './ProxyCoreManager.js';
import { ConfigGenerator } from './output/ConfigGenerator.js';

export class NodeTester {
    constructor(options = {}) {
        this.logger = options.logger || console;
        this.coreType = 'mihomo'; // Force Mihomo for testing as it has the best API
        this.coreManager = new ProxyCoreManager({ coreType: this.coreType });
        this.configGenerator = new ConfigGenerator({ logger: this.logger });
        this.subconverter = new SubconverterClient();
        this.testTimeout = options.timeout || 5000; // 5s timeout for testing each node
        this.batchSize = options.batchSize || 50;   // Test 50 nodes concurrently
        this.useSubconverter = options.useSubconverter !== false; // Default true

        // Testing specific configuration
        this.controllerPort = 0;
        this.mixedPort = 0;
        this.secret = 'subsync-test';
        this.tempDir = path.join(process.cwd(), 'temp', 'testing');
        this.process = null;
    }

    /**
     * Main entry point: Test nodes and return valid ones
     * @param {Array} nodes Raw node objects
     * @returns {Promise<Array>} Valid nodes
     */
    async testNodes(nodes) {
        if (!nodes || nodes.length === 0) return [];

        this.logger.info(`Starting active node testing for ${nodes.length} nodes...`);

        try {
            // 1. Prepare Environment
            await this.prepareEnvironment();

            // 2. Generate Test Config
            const configPath = await this.generateTestConfig(nodes);

            // 3. Start Core
            await this.startCore(configPath);

            // 4. Run Tests against API
            const validNodes = await this.performTests(nodes);

            this.logger.info(`Node testing complete. Valid: ${validNodes.length}/${nodes.length}`);
            return validNodes;

        } catch (err) {
            this.logger.error(`Node testing failed: ${err.message}`);
            // Fallback: return original nodes if testing fails completely? 
            // Or return empty? Better to warn and return original to avoid total data loss in case of bug
            this.logger.warn('Returning original nodes due to testing error.');
            return nodes;
        } finally {
            // 5. Cleanup
            await this.cleanup();
        }
    }

    async prepareEnvironment() {
        await fs.mkdir(this.tempDir, { recursive: true });

        // Find free ports
        this.controllerPort = await PortFinder.findFreePort(15000);
        this.mixedPort = await PortFinder.findFreePort(this.controllerPort + 1);

        // Ensure core is installed
        this.coreBin = await this.coreManager.installCore();
    }

    async generateTestConfig(nodes) {
        let finalConfig = '';

        if (this.useSubconverter) {
            this.logger.info('Generating test config using Subconverter backend...');
            // 1. Generate URI List
            const uriList = this.configGenerator.generateTextContent('', nodes);

            // 2. Convert via Subconverter
            try {
                const convertedConfig = await this.subconverter.convertContent(uriList, 'clash');
                // Prepend our controller settings. YAML allows overrides or we just hope clash takes ours if placed correctly.
                // Safest: Prepend ours.
                finalConfig = `
port: ${this.mixedPort}
socks-port: ${this.mixedPort + 1}
allow-lan: false
mode: rule
log-level: info
external-controller: 127.0.0.1:${this.controllerPort}
secret: "${this.secret}"

${convertedConfig}
`;
            } catch (e) {
                this.logger.error(`Subconverter failed: ${e.message}. Falling back to basic generation.`);
                finalConfig = this.generateBasicConfig(nodes);
            }
        } else {
            finalConfig = this.generateBasicConfig(nodes);
        }

        const configPath = path.join(this.tempDir, `test-config-${Date.now()}.yaml`);
        await fs.writeFile(configPath, finalConfig);
        return configPath;
    }

    generateBasicConfig(nodes) {
        const template = `
port: ${this.mixedPort}
socks-port: ${this.mixedPort + 1}
allow-lan: false
mode: rule
log-level: info
external-controller: 127.0.0.1:${this.controllerPort}
secret: "${this.secret}"

proxies: []
`;
        return this.configGenerator.generateClashContent(template, nodes);
    }

    async startCore(configPath) {
        this.logger.info(`Starting temporary Mihomo core on port ${this.controllerPort}...`);

        // Ensure assets exist (geoip etc), reusing core logic if possible or assuming they exist in coreDir
        // ProxyCoreManager handles cwd in runCommand, but here we spawn manually to control lifecycle
        const cwd = this.coreManager.coreDir;

        this.process = spawn(this.coreBin, ['-d', cwd, '-f', configPath], {
            cwd: cwd,
            stdio: 'ignore' // We don't need stdout/stderr clogging our logs
        });

        // Wait for API to be ready
        let attempts = 0;
        while (attempts < 20) {
            try {
                const res = await fetch(`http://127.0.0.1:${this.controllerPort}/version`, {
                    headers: { 'Authorization': `Bearer ${this.secret}` }
                });
                if (res.ok) {
                    this.logger.info('Mihomo API is ready.');
                    return;
                }
            } catch (e) {
                // ignore
            }
            await new Promise(r => setTimeout(r, 500));
            attempts++;
        }
        throw new Error('Timed out waiting for Mihomo API');
    }

    async performTests(nodes) {
        // Mihomo exposes proxies. We can trigger url-test.
        // However, since we didn't put them in a group (just 'proxies'), we need to access them individually.
        // Actually, Mihomo provides a 'GET /proxies' endpoint which lists all proxies.
        // We can then loop through them.

        const apiBase = `http://127.0.0.1:${this.controllerPort}`;
        const headers = { 'Authorization': `Bearer ${this.secret}` };

        // 1. Get List of Proxies (to get their standardized names if changed, but usually they match)
        const res = await fetch(`${apiBase}/proxies`, { headers });
        const data = await res.json();
        const proxies = data.proxies;

        // Filter out built-ins like DIRECT, REJECT, GLOBAL
        const nodeNames = Object.keys(proxies).filter(name =>
            !['DIRECT', 'REJECT', 'GLOBAL', 'Pass', 'Fail'].includes(name)
        );

        this.logger.info(`Discovered ${nodeNames.length} proxies in core. Starting latency checks...`);

        const validNodeNames = new Set();
        const total = nodeNames.length;
        let completed = 0;

        // Batch processing
        for (let i = 0; i < total; i += this.batchSize) {
            const batch = nodeNames.slice(i, i + this.batchSize);
            const batchPromises = batch.map(async (name) => {
                try {
                    // Trigger delay test: GET /proxies/:name/delay?timeout=5000&url=...
                    const testUrl = 'http://www.gstatic.com/generate_204';
                    const delayRes = await fetch(`${apiBase}/proxies/${encodeURIComponent(name)}/delay?timeout=${this.testTimeout}&url=${testUrl}`, {
                        headers
                    });

                    if (delayRes.ok) {
                        const delayData = await delayRes.json();
                        if (delayData.delay > 0) {
                            // Success
                            validNodeNames.add(name);
                        }
                    }
                } catch (e) {
                    // Timeout or error, considered invalid
                }
            });

            await Promise.all(batchPromises);
            completed += batch.length;
            if (completed % 100 === 0 || completed === total) {
                this.logger.info(`Tested ${completed}/${total} nodes...`);
            }
        }

        // Filter original nodes array based on successful names
        // Note: ConfigGenerator might have escaped names. This matches loosely or we rely on exact string match if ConfigGenerator didn't mutate much.
        // Usually ConfigGenerator replaces quotes. Let's filter carefully.

        // We can map the valid names back to initial nodes.
        const finalNodes = nodes.filter(n => {
            // ConfigGenerator handling of quotes: name.replace(/"/g, '\\"')
            // We replicate that check or just check loosely
            const safeName = n.name.replace(/"/g, '\\"');
            // Mihomo might decode it back? Usually it keeps it as the key.
            return validNodeNames.has(safeName) || validNodeNames.has(n.name);
        });

        return finalNodes;
    }

    async cleanup() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        // Optional: Delete temp dir
        // await fs.rm(this.tempDir, { recursive: true, force: true });
    }
}
