#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { ProxyCoreManager } from '../core/ProxyCoreManager.js';

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const runCommand = (binPath, args, label) => new Promise((resolve, reject) => {
  const proc = spawn(binPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (data) => {
    stderr += data.toString();
  });
  proc.on('error', reject);
  proc.on('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`${label} 校验失败 (code=${code}): ${stderr.trim() || 'no stderr'}`));
    }
  });
});

export async function validateConfigs({ rootDir = process.cwd() } = {}) {
  const outputDir = path.join(rootDir, 'output');
  const mihomoPath = path.join(outputDir, 'mihomo.yaml');
  const singboxPath = path.join(outputDir, 'singbox.json');

  console.log('🔍 开始配置校验...');

  // mihomo 校验
  if (await fileExists(mihomoPath)) {
    const coreManager = new ProxyCoreManager({ coreType: 'mihomo' });
    const corePath = await coreManager.installCore();
    await runCommand(corePath, ['-t', '-f', mihomoPath], 'Mihomo');
    console.log('✅ Mihomo 配置校验通过');
  } else {
    console.log(`⏭️  未找到 ${mihomoPath}，跳过 Mihomo 校验`);
  }

  // sing-box 校验
  if (await fileExists(singboxPath)) {
    const coreManager = new ProxyCoreManager({ coreType: 'singbox' });
    const corePath = await coreManager.installCore();
    await runCommand(corePath, ['check', '-c', singboxPath], 'sing-box');
    console.log('✅ sing-box 配置校验通过');
  } else {
    console.log(`⏭️  未找到 ${singboxPath}，跳过 sing-box 校验`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateConfigs()
    .then(() => {
      console.log('🎉 配置校验完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
