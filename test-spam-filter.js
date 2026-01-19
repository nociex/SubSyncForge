
import { NodeFilter } from './src/converter/analyzer/NodeFilter.js';

const filter = new NodeFilter();
const isSpam = filter.getFilter('isSpam');

const testCases = [
    { name: '🔥Join+Telegram:@Farah_VPN🟣', expected: true },
    { name: '👉🆔@MoftConfig📡🇨🇷®️Costa Rica', expected: true },
    { name: '荷兰_062805853', expected: false }, // Should be safe? Maybe borderline if random number
    { name: '[🇨🇦]t.me/MoftConfig', expected: true },
    { name: '美国(yudou123.top 玉豆免费节点)', expected: true },
    { name: '🇺🇸 US 01 | Hy2', expected: false },
    { name: '🇭🇰 HK 05 | VMess', expected: false },
    { name: 'This is a normal node', expected: false },
    { name: 'Node with @ symbol but short @user', expected: false }, // Short user mention might be okay?
    { name: 'Node with @VeryLongUsernameThatIsLikelySpam', expected: true }, // Long mention + context
    { name: '公益节点', expected: true },
    { name: '免费VPN', expected: true }
];

console.log('=== Testing Spam Filter ===');
let passed = 0;
let failed = 0;

testCases.forEach(test => {
    const result = isSpam({ name: test.name });
    const status = result === test.expected ? 'PASS' : 'FAIL';
    if (status === 'PASS') passed++;
    else failed++;

    console.log(`[${status}] Name: "${test.name}" => Is Spam? ${result} (Expected: ${test.expected})`);
});

console.log(`\nResults: ${passed}/${testCases.length} Passed`);
if (failed > 0) process.exit(1);
