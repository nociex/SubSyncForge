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

const runCommand = (binPath, args, label, cwd = process.cwd()) => new Promise((resolve, reject) => {
  const proc = spawn(binPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: cwd
  });
  let output = '';

  proc.stdout.on('data', (data) => {
    output += data.toString();
  });

  proc.stderr.on('data', (data) => {
    output += data.toString();
  });

  proc.on('error', reject);
  proc.on('exit', (code) => {
    if (code === 0) {
      resolve();
    } else {
      reject(new Error(`${label} 校验失败 (code=${code}): ${output.trim() || 'no output'}`));
    }
  });
});

export async function validateConfigs({ rootDir = process.cwd(), only = null } = {}) {
  const outputDir = path.join(rootDir, 'output');
  const mihomoPath = path.join(outputDir, 'mihomo.yaml');
  const singboxPath = path.join(outputDir, 'singbox.json');

  console.log('🔍 开始配置校验...');

  const tasks = [];

  if (!only || only === 'mihomo') {
    tasks.push(validateCore(mihomoPath, 'mihomo', ['-t', '-f', mihomoPath, '-d', '.'], 'Mihomo'));
  }

  if (!only || only === 'singbox') {
    tasks.push(validateCore(singboxPath, 'singbox', ['check', '-c', singboxPath, '-D', '.'], 'sing-box'));
  }

  await Promise.all(tasks);
}

/**
 * 通用核心校验函数
 * @param {string} configPath 配置文件路径
 * @param {string} coreType 核心类型
 * @param {Array} args 校验参数
 * @param {string} label 显示标签
 */
async function validateCore(configPath, coreType, args, label) {
  if (await fileExists(configPath)) {
    const coreManager = new ProxyCoreManager({ coreType });
    const corePath = await coreManager.installCore();
    // 传递 coreDir 作为 cwd，以便 core 能找到同一目录下的资源文件
    await runCommand(corePath, args, label, coreManager.coreDir);
    console.log(`✅ ${label} 配置校验通过`);
  } else {
    console.log(`⏭️  未找到 ${configPath}，跳过 ${label} 校验`);
  }
}

const invokedAsScript = path.basename(process.argv[1] || '') === 'validate-configs.js';

if (invokedAsScript) {
  const args = process.argv.slice(2);
  let only = null;

  // 简单的参数解析
  args.forEach(arg => {
    if (arg.startsWith('--core=')) {
      only = arg.split('=')[1];
    }
  });

  validateConfigs({ only })
    .then(() => {
      console.log('🎉 配置校验完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
