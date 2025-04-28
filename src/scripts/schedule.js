/**
 * 计划任务调度器
 * 用于执行定时任务
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import yaml from 'js-yaml';
import { CronJob } from 'cron';

// 设置 ES 模块中的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取项目根目录
const rootDir = path.resolve(__dirname, '../..');
console.log(`项目根目录: ${rootDir}`);

// 配置文件路径
const configFile = path.resolve(rootDir, 'config/custom.yaml');

// 基本配置
const CONFIG = {
  rootDir: rootDir,
  logsDir: 'data/logs',
  tasks: [],
  enabled: true
};

/**
 * 确保目录存在
 */
function ensureDirectoryExists(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
    console.log(`创建目录: ${directory}`);
  }
}

/**
 * 加载配置
 */
function loadConfig() {
  try {
    if (!fs.existsSync(configFile)) {
      console.warn(`配置文件不存在: ${configFile}`);
      return false;
    }

    const content = fs.readFileSync(configFile, 'utf-8');
    const config = yaml.load(content);

    if (!config) {
      console.warn('配置文件内容为空');
      return false;
    }

    // 加载计划任务配置
    if (config.schedule) {
      if (config.schedule.enabled !== undefined) {
        CONFIG.enabled = config.schedule.enabled;
      }
      
      // 同步订阅任务
      if (config.schedule.sync_subscription && config.schedule.sync_subscription.enabled !== false) {
        CONFIG.tasks.push({
          name: 'sync_subscription',
          cron: config.schedule.sync_subscription.cron || '0 */6 * * *', // 默认每6小时一次
          command: config.schedule.sync_subscription.command || 'npm run sync',
          enabled: true
        });
      }
      
      // 清理缓存任务
      if (config.schedule.clean_cache && config.schedule.clean_cache.enabled !== false) {
        CONFIG.tasks.push({
          name: 'clean_cache',
          cron: config.schedule.clean_cache.cron || '0 0 * * 0', // 默认每周日凌晨
          command: config.schedule.clean_cache.command || 'node src/scripts/clean-cache.js',
          enabled: true
        });
      }
    }

    return CONFIG.enabled && CONFIG.tasks.length > 0;
  } catch (error) {
    console.error('解析配置文件失败:', error.message);
    return false;
  }
}

/**
 * 执行命令并记录输出
 */
function executeCommand(command, taskName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = path.join(rootDir, CONFIG.logsDir);
  ensureDirectoryExists(logDir);
  
  const logFile = path.join(logDir, `${taskName}_${timestamp}.log`);
  console.log(`执行任务: ${taskName}, 命令: ${command}`);
  console.log(`日志保存到: ${logFile}`);
  
  // 创建日志写入流
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  logStream.write(`==== 任务开始: ${taskName} - ${new Date().toISOString()} ====\n`);
  logStream.write(`命令: ${command}\n`);
  
  return new Promise((resolve, reject) => {
    // 执行命令
    const process = exec(command, { cwd: rootDir });
    
    // 记录标准输出
    process.stdout.on('data', (data) => {
      console.log(`[${taskName}] ${data.trim()}`);
      logStream.write(`[stdout] ${data}`);
    });
    
    // 记录标准错误
    process.stderr.on('data', (data) => {
      console.error(`[${taskName}] ERROR: ${data.trim()}`);
      logStream.write(`[stderr] ${data}`);
    });
    
    // 命令执行完成
    process.on('close', (code) => {
      const endTime = new Date().toISOString();
      logStream.write(`==== 任务结束: ${taskName} - ${endTime} (退出码: ${code}) ====\n`);
      logStream.end();
      
      if (code === 0) {
        console.log(`任务 ${taskName} 执行成功 (代码: ${code})`);
        resolve();
      } else {
        console.error(`任务 ${taskName} 执行失败 (代码: ${code})`);
        reject(new Error(`命令执行失败，退出码: ${code}`));
      }
    });
    
    // 命令执行错误
    process.on('error', (err) => {
      logStream.write(`==== 任务错误: ${taskName} - ${new Date().toISOString()} ====\n`);
      logStream.write(`错误: ${err.message}\n`);
      logStream.end();
      
      console.error(`任务 ${taskName} 执行错误:`, err.message);
      reject(err);
    });
  });
}

/**
 * 设置计划任务
 */
function setupCronJobs() {
  const jobs = [];
  
  for (const task of CONFIG.tasks) {
    try {
      console.log(`设置计划任务: ${task.name}, 计划: ${task.cron}`);
      
      const job = new CronJob(
        task.cron,
        function() {
          console.log(`任务触发: ${task.name}, 时间: ${new Date().toISOString()}`);
          executeCommand(task.command, task.name)
            .then(() => {
              console.log(`任务 ${task.name} 完成`);
            })
            .catch(error => {
              console.error(`任务 ${task.name} 失败:`, error.message);
            });
        },
        null, // onComplete
        true, // start
        'Asia/Shanghai' // timeZone
      );
      
      jobs.push({
        name: task.name,
        job: job
      });
      
      // 显示下一次执行时间
      const nextDate = job.nextDates();
      console.log(`任务 ${task.name} 下次执行时间: ${nextDate.toISOString()}`);
    } catch (error) {
      console.error(`设置任务 ${task.name} 失败:`, error.message);
    }
  }
  
  return jobs;
}

/**
 * 主函数
 */
async function main() {
  console.log('==================================================================');
  console.log(`启动计划任务调度器...时间: ${new Date().toISOString()}`);
  console.log('==================================================================');
  
  // 加载配置
  if (!loadConfig()) {
    console.warn('计划任务未启用或未配置任务，退出');
    return;
  }
  
  console.log(`已加载 ${CONFIG.tasks.length} 个计划任务`);
  
  // 设置计划任务
  const jobs = setupCronJobs();
  
  console.log('==================================================================');
  console.log(`计划任务调度器已启动, ${jobs.length} 个任务正在运行`);
  console.log('==================================================================');
  
  // 防止程序退出
  process.stdin.resume();
  
  // 处理进程终止信号
  process.on('SIGINT', () => {
    console.log('接收到SIGINT信号，停止所有任务...');
    jobs.forEach(job => job.job.stop());
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('接收到SIGTERM信号，停止所有任务...');
    jobs.forEach(job => job.job.stop());
    process.exit(0);
  });
}

// 执行主函数
main().catch(error => {
  console.error('启动计划任务调度器失败:', error);
  process.exit(1);
}); 