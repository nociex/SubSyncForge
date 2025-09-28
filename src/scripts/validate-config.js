import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const rootDir = process.cwd();
const schemaDir = path.join(rootDir, 'config', 'schema');
const configDir = path.join(rootDir, 'config');

async function loadJson(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

async function loadYaml(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return yaml.load(content);
}

async function main() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);

  const schemas = {
    subscriptions: await loadJson(path.join(schemaDir, 'subscriptions.schema.json')),
    custom: await loadJson(path.join(schemaDir, 'custom.schema.json'))
  };

  Object.values(schemas).forEach((schema) => ajv.addSchema(schema));

  const subscriptionsPath = path.join(configDir, 'subscriptions.json');
  const customPath = path.join(configDir, 'custom.yaml');

  const subscriptionsData = await loadJson(subscriptionsPath);
  const customData = await loadYaml(customPath);

  const validateSubscriptions = ajv.getSchema('https://subsyncforge.dev/schemas/subscriptions.json');
  const validateCustom = ajv.getSchema('https://subsyncforge.dev/schemas/custom-config.json');

  const errors = [];

  if (!validateSubscriptions(subscriptionsData)) {
    errors.push({
      name: 'config/subscriptions.json',
      details: validateSubscriptions.errors || []
    });
  }

  if (!validateCustom(customData)) {
    errors.push({
      name: 'config/custom.yaml',
      details: validateCustom.errors || []
    });
  }

  if (errors.length === 0) {
    console.log('✅ 配置文件验证通过');
    return;
  }

  console.error('❌ 配置验证失败:');
  for (const error of errors) {
    console.error(`\n- ${error.name}`);
    for (const detail of error.details) {
      const instancePath = detail.instancePath || '(root)';
      const message = detail.message || '验证失败';
      console.error(`  • ${instancePath}: ${message}`);
    }
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error('运行配置验证脚本失败:', error.message);
  console.error(error.stack);
  process.exit(1);
});
