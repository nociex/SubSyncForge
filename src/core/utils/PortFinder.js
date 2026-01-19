
import net from 'net';

/**
 * PortFinder Utility
 * Helps find available ports for running temporary core instances
 */
export class PortFinder {
    /**
     * Find a free port starting from basePort
     * @param {number} basePort Starting port to check (default: 10000)
     * @returns {Promise<number>} An available port number
     */
    static async findFreePort(basePort = 10000) {
        let port = basePort;
        while (true) {
            if (await this.isPortAvailable(port)) {
                return port;
            }
            port++;
            if (port > 65535) {
                throw new Error('No available ports found');
            }
        }
    }

    /**
     * Check if a specific port is available
     * @param {number} port Port number to check
     * @returns {Promise<boolean>} True if port is free
     */
    static isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();

            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false);
                } else {
                    // Unexpected error, treat as unavailable to be safe
                    resolve(false);
                }
            });

            server.once('listening', () => {
                server.close(() => {
                    resolve(true);
                });
            });

            server.listen(port);
        });
    }
}
