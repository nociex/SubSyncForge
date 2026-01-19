
import { PlainTextParser } from './src/converter/parser/formats/PlainTextParser.js';

async function testVmessParsing() {
    const parser = new PlainTextParser();

    console.log('Testing Vmess Parsing...');

    const testCases = [
        {
            name: 'Valid Vmess',
            input: 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3Qtbm9kZSIsDQogICJhZGQiOiAibG9jYWxob3N0IiwNCiAgInBvcnQiOiAiNDQzIiwNCiAgImlkIjogIjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsDQogICJhaWQiOiAiMCIsDQogICJzY3kiOiAiYXV0byIsDQogICJuZXQiOiAid3MiLA0KICAidHlwZSI6ICJub25lIiwNCiAgImhvc3QiOiAiIiwNCiAgInBhdGgiOiAiLyIsDQogICJ0bHMiOiAidGxzIiwNCiAgInNuaSI6ICIiDQp9',
            expectSuccess: true
        },
        {
            name: 'Malformed JSON (Unexpected token)',
            // Based on the user error: "Unexpected token in JSON at position 231"
            // This often happens if the base64 decoding results in truncated JSON or garbage at the end.
            // Let's try a base64 string that decodes to invalid JSON.
            // "{"v":"2", ... }" + junk
            input: 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3Qtbm9kZSIsDQogICJhZGQiOiAibG9jYWxob3N0IiwNCiAgInBvcnQiOiAiNDQzIiwNCiAgImlkIjogIjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsDQogICJhaWQiOiAiMCIsDQogICJzY3kiOiAiYXV0byIsDQogICJuZXQiOiAid3MiLA0KICAidHlwZSI6ICJub25lIiwNCiAgImhvc3QiOiAiIiwNCiAgInBhdGgiOiAiLyIsDQogICJ0bHMiOiAidGxzIiwNCiAgInNuaSI6ICIiDQp9junk',
            expectSuccess: false // Should handle gracefully, maybe return null or sanitized result
        },
        {
            name: 'Garbage Base64',
            input: 'vmess://not-valid-base64!',
            expectSuccess: false
        },
        {
            name: 'URL Safe Base64 with whitespace',
            // Standard: + /
            // URL Safe: - _
            // And some tabs/newlines
            input: 'vmess://' + 'ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3Qtbm9kZSIsDQogICJhZGQiOiAibG9jYWxob3N0IiwNCiAgInBvcnQiOiAiNDQzIiwNCiAgImlkIjogIjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsDQogICJhaWQiOiAiMCIsDQogICJzY3kiOiAiYXV0byIsDQogICJuZXQiOiAid3MiLA0KICAidHlwZSI6ICJub25lIiwNCiAgImhvc3QiOiAiIiwNCiAgInBhdGgiOiAiLyIsDQogICJ0bHMiOiAidGxzIiwNCiAgInNuaSI6ICIiDQp9'.replace(/\+/g, '-').replace(/\//g, '_') + '\n  ',
            expectSuccess: true
        }
    ];

    for (const testCase of testCases) {
        console.log(`\nRunning test case: ${testCase.name}`);
        try {
            const result = parser.parseVmess(testCase.input);
            if (result) {
                console.log('✅ Parsed successfully:', result.name);
            } else {
                console.log('⚠️ Parse returned null');
            }

            if (testCase.expectSuccess && !result) {
                console.error('❌ Expected success but got null');
            } else if (!testCase.expectSuccess && result) {
                console.log('ℹ️ Cleaned up malformed input successfully (acceptable)');
            }

        } catch (e) {
            console.error('❌ Exception thrown:', e.message);
            // We want to avoid exceptions crashing the main loop
        }
    }
}

testVmessParsing();
