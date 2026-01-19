
import fetch from 'node-fetch';
import http from 'http';
import { PortFinder } from './PortFinder.js';

export class SubconverterClient {
    constructor(baseUrl = 'http://subconverter:25500', selfHostname = 'subsyncforge') {
        this.baseUrl = baseUrl;
        this.selfHostname = selfHostname; // Container name of this app reachable by subconverter
    }

    /**
     * Convert raw node content (URI list) to target config
     * @param {string} content - The text content (e.g., list of vmess:// links) to convert
     * @param {string} target - Target format (clash, singbox, etc.)
     * @param {Object} options - Additional options for subconverter
     * @returns {Promise<string>} - The converted configuration content
     */
    async convertContent(content, target = 'clash', options = {}) {
        // 1. Find a free port to serve this content
        const port = await PortFinder.findFreePort(20000);

        // 2. Start a temporary HTTP server
        // Serve as Base64 encoded subscription to ensure compatibility
        const base64Content = Buffer.from(content).toString('base64');

        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(base64Content);
        });

        return new Promise((resolve, reject) => {
            server.listen(port, '0.0.0.0', async () => {
                try {
                    // 3. Construct the URL that subconverter will call back to us
                    // Add timestamp to prevent caching
                    const timestamp = Date.now();
                    const fileUrl = `http://${this.selfHostname}:${port}/nodes_${timestamp}.txt`;
                    const encodedUrl = encodeURIComponent(fileUrl);

                    // 4. Construct Subconverter API URL
                    // scv=true ensures we get pure config
                    let apiUrl = `${this.baseUrl}/sub?target=${target}&url=${encodedUrl}&scv=true`;

                    // Append output options
                    if (target === 'clash') {
                        apiUrl += '&ver=4'; // Clash Meta
                    }

                    // 5. Fetch from Subconverter
                    const res = await fetch(apiUrl);
                    if (!res.ok) {
                        const errText = await res.text();
                        // Try to get error details
                        throw new Error(`Subconverter failed: ${res.status} ${res.statusText} - ${errText.substring(0, 100)}`);
                    }

                    const result = await res.text();
                    resolve(result);
                } catch (err) {
                    // Check if it's a networking error
                    if (err.code === 'ECONNREFUSED') {
                        reject(new Error(`Could not connect to Subconverter at ${this.baseUrl}. Is the service running?`));
                    } else {
                        reject(err);
                    }
                } finally {
                    // 6. Cleanup
                    server.close();
                }
            });

            server.on('error', (err) => {
                server.close();
                reject(new Error(`Failed to start temp server: ${err.message}`));
            });
        });
    }
}
