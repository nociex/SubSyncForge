/**
 * 缓存清理脚本
 * 用于清理过期的缓存数据
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { IPLocator } from '../utils/proxy/IPLocator.js';

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
  dataDir: 'data',
  ip_cache_dir: 'data/ip_cache',
  ip_cache_time: 7 * 24 * 60 * 60 * 1000, // 默认7天
  log_level: 'info'
};

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

    // 加载输出配置
    if (config.output && config.output.data_dir) {
      CONFIG.dataDir = config.output.data_dir;
    }
    
    // 加载IP缓存配置
    if (config.testing && config.testing.ip_location) {
      if (config.testing.ip_location.cache_time) {
        CONFIG.ip_cache_time = config.testing.ip_location.cache_time;
      }
    }

    // 加载高级设置
    if (config.advanced && config.advanced.log_level) {
      CONFIG.log_level = config.advanced.log_level;
    }

    return true;
  } catch (error) {
    console.error('解析配置文件失败:', error.message);
    return false;
  }
}

/**
 * 清理IP缓存
 */
function cleanIPCache() {
  const ipCacheDir = path.join(rootDir, CONFIG.ip_cache_dir);
  
  // 如果目录不存在，则创建
  if (!fs.existsSync(ipCacheDir)) {
    console.log(`IP缓存目录不存在，无需清理: ${ipCacheDir}`);
    return;
  }
  
  console.log(`开始清理IP缓存: ${ipCacheDir}`);
  
  // 使用IPLocator的清理功能
  try {
    const ipLocator = new IPLocator({
      cacheDir: ipCacheDir,
      cacheTime: CONFIG.ip_cache_time
    });
    
    ipLocator.cleanExpiredCache();
  } catch (error) {
    console.error(`清理IP缓存失败:`, error.message);
  }
}

/**
 * 清理过期的测试报告
 */
function cleanTestReports() {
  const dataDir = path.join(rootDir, CONFIG.dataDir);
  const reportPattern = /^test_report_(\d{4}-\d{2}-\d{2})\.json$/;
  
  if (!fs.existsSync(dataDir)) {
    console.log(`数据目录不存在，无需清理: ${dataDir}`);
    return;
  }
  
  console.log(`开始清理过期测试报告: ${dataDir}`);
  
  try {
    const files = fs.readdirSync(dataDir);
    const now = new Date();
    let cleaned = 0;
    
    // 保留7天内的报告
    for (const file of files) {
      if (reportPattern.test(file)) {
        const reportFile = path.join(dataDir, file);
        const match = file.match(reportPattern);
        if (match && match[1]) {
          const reportDate = new Date(match[1]);
          const ageDays = (now - reportDate) / (1000 * 60 * 60 * 24);
          
          if (ageDays > 7) {
            fs.unlinkSync(reportFile);
            cleaned++;
            console.log(`已删除过期测试报告: ${file}`);
          }
        }
      }
    }
    
    console.log(`已清理 ${cleaned} 个过期测试报告`);
  } catch (error) {
    console.error(`清理测试报告失败:`, error.message);
  }
}

/**
 * 清理临时文件
 */
function cleanTempFiles() {
  const dataDir = path.join(rootDir, CONFIG.dataDir);
  const tempPattern = /^temp_.+\.(json|txt)$/;
  
  if (!fs.existsSync(dataDir)) {
    console.log(`数据目录不存在，无需清理: ${dataDir}`);
    return;
  }
  
  console.log(`开始清理临时文件: ${dataDir}`);
  
  try {
    const files = fs.readdirSync(dataDir);
    let cleaned = 0;
    
    for (const file of files) {
      if (tempPattern.test(file)) {
        const tempFile = path.join(dataDir, file);
        // 获取文件状态
        const stats = fs.statSync(tempFile);
        const now = new Date();
        const fileAge = (now - stats.mtime) / (1000 * 60 * 60 * 24); // 文件年龄（天）
        
        // 删除1天以上的临时文件
        if (fileAge > 1) {
          fs.unlinkSync(tempFile);
          cleaned++;
          console.log(`已删除临时文件: ${file}`);
        }
      }
    }
    
    console.log(`已清理 ${cleaned} 个临时文件`);
  } catch (error) {
    console.error(`清理临时文件失败:`, error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('==================================================================');
  console.log(`开始清理缓存...时间: ${new Date().toISOString()}`);
  console.log('==================================================================');
  
  // 加载配置
  loadConfig();
  
  // 清理IP缓存
  cleanIPCache();
  
  // 清理过期测试报告
  cleanTestReports();
  
  // 清理临时文件
  cleanTempFiles();
  
  console.log('==================================================================');
  console.log(`缓存清理完成!`);
  console.log('==================================================================');
}

// 执行主函数
main().catch(error => {
  console.error('清理过程中发生错误:', error);
  process.exit(1);
}); 