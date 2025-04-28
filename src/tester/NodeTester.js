import { ProxyChecker } from '../utils/proxy/ProxyChecker.js';
import { logger } from '../utils/index.js';

const defaultLogger = logger?.defaultLogger || console;

export class NodeTester {
  constructor(options = {}) {
    this.checker = new ProxyChecker(options.checkerOptions);
    this.timeout = options.timeout || 5000; // Default timeout 5 seconds
    this.concurrency = options.concurrency || 10; // Test 10 nodes concurrently
    this.logger = options.logger || defaultLogger.child({ component: 'NodeTester' });
    this.testUrl = options.testUrl || 'http://www.google.com/generate_204'; // Default test URL
  }

  /**
   * Tests a list of nodes for connectivity and latency.
   * @param {Array<Object>} nodes - Array of node objects.
   * @returns {Promise<Array<Object>>} - Array of test result objects { node, status, latency }.
   */
  async testNodes(nodes) {
    this.logger.info(`Starting test for ${nodes.length} nodes with concurrency ${this.concurrency}...`);
    const results = [];
    const queue = [...nodes]; // Create a copy to avoid modifying the original array

    const runTest = async (node) => {
      const startTime = Date.now();
      try {
        // Use a timeout for the check
        const result = await this.checker.checkConnectivity(node, this.timeout, this.testUrl);
        const latency = Date.now() - startTime;

        this.logger.debug(`Test result for ${node.name}: Status=${result.status}, Latency=${latency}ms`);
        return {
          node,
          status: result.status ? 'up' : 'down',
          latency: result.status ? latency : null,
          error: result.error || null,
        };
      } catch (error) {
        const latency = Date.now() - startTime;
        this.logger.warn(`Test failed for ${node.name} after ${latency}ms: ${error.message}`);
        return {
          node,
          status: 'down',
          latency: null,
          error: error.message,
        };
      }
    };

    const workers = Array(this.concurrency).fill(null).map(async () => {
      while (queue.length > 0) {
        const node = queue.shift();
        if (node) {
          const result = await runTest(node);
          results.push(result);
        }
      }
    });

    await Promise.all(workers);

    this.logger.info(`Finished testing ${nodes.length} nodes. ${results.filter(r => r.status === 'up').length} nodes are up.`);
    return results;
  }
}

export default NodeTester; 