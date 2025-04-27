// 测试节点重命名功能
import { NodeAnalyzer } from './converter/analyzer/NodeAnalyzer.js';

// 创建一个节点分析器实例
const analyzer = new NodeAnalyzer();

// 测试节点
const testNodes = [
  { name: "🇺🇸 US 525", server: "us.example.com", port: 443, type: "vmess" },
  { name: "🇷🇺 RU 526", server: "ru.example.com", port: 443, type: "vmess" },
  { name: "🇨🇳 CN 527", server: "cn.example.com", port: 443, type: "ss" },
  { name: "🇳🇱 NL 530", server: "nl.example.com", port: 443, type: "trojan" },
  { name: "🇺🇸US-HysteriaNode-worker-general", server: "us2.example.com", port: 443, type: "hysteria" },
  { name: "-HysteriaNode-worker-general", server: "unknown.example.com", port: 443, type: "hysteria" },
  { name: "🇦🇪AE-HysteriaNode-worker-general", server: "ae.example.com", port: 443, type: "hysteria" },
  { name: "🇺🇸 US Netflix 622", server: "us-netflix.example.com", port: 443, type: "vmess" },
  { name: "🇭🇰 HK Game 789", server: "hk-game.example.com", port: 443, type: "trojan" },
  { name: "🇯🇵 JP 流媒体 180", server: "jp-stream.example.com", port: 443, type: "ss" }
];

// 分析并重命名节点
console.log('开始测试自动编号的节点重命名功能：');
console.log('-----------------------------------');

testNodes.forEach((node, index) => {
  // 分析节点
  const analysis = analyzer.analyze(node);
  
  // 输出分析结果
  console.log(`原始节点名: ${node.name}`);
  console.log(`国家/地区: ${analysis.country || '未知'} (${analysis.countryCode || '未知'})`);
  console.log(`协议: ${analysis.protocol || node.type}`);
  console.log(`标签: ${analysis.tags.join(', ') || '无'}`);
  
  // 测试重命名（使用索引作为编号源）
  const newName = analyzer.generateName(analysis, {
    format: '{country}{protocol}{tags}{number}',
    includeCountry: true,
    includeProtocol: true,
    includeNumber: true,
    includeTags: true,
    tagLimit: 2
  }, index);
  
  console.log(`重命名结果: ${newName}`);
  console.log('-----------------------------------');
});

console.log('测试完成！'); 