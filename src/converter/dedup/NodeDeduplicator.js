export class NodeDeduplicator {
  deduplicate(nodes, options = {}) {
    const { 
      compareFields = ['server', 'port', 'protocol'],
      preferLower = true // 是否优先保留延迟低的节点
    } = options;

    const uniqueNodes = new Map();
    
    for (const node of nodes) {
      const key = this.generateKey(node, compareFields);
      const existingNode = uniqueNodes.get(key);
      
      if (!existingNode) {
        uniqueNodes.set(key, node);
        continue;
      }
      
      // 如果设置了优先保留延迟低的节点
      if (preferLower && 
          node.extra.latency && 
          existingNode.extra.latency && 
          node.extra.latency < existingNode.extra.latency) {
        uniqueNodes.set(key, node);
      }
    }
    
    return Array.from(uniqueNodes.values());
  }

  generateKey(node, fields) {
    return fields.map(field => {
      const value = field.split('.').reduce((obj, key) => obj?.[key], node);
      return `${field}:${value}`;
    }).join('|');
  }
}