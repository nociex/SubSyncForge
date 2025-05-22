/**
 * 订阅同步脚本
 * 使用模块化结构，整合各功能模块
 */

import fs from 'fs';
import path from 'path';
import { SyncManager } from '../core/SyncManager.js';

/**
 * 主函数
 */
async function main() {
  console.log('开始同步订阅...');
  
  try {
    // 确定工作目录
    let rootDir = process.cwd();
    
    // 如果在GitHub Actions环境中运行，可能会有特定的工作目录设置
    if (process.env.GITHUB_WORKSPACE) {
      rootDir = process.env.GITHUB_WORKSPACE;
      console.log(`检测到GitHub Actions环境，工作目录设置为: ${rootDir}`);
    }
    
    // 配置路径
    const configPath = path.join(rootDir, 'config/custom.yaml');
    
    // 检查配置文件是否存在
    if (!fs.existsSync(configPath)) {
      console.error(`配置文件不存在: ${configPath}`);
      process.exit(1);
    }
    
    // 创建同步管理器
    const syncManager = new SyncManager({
      rootDir: rootDir,
      configPath: configPath,
      logLevel: 'info',
      maxExecutionTime: 5 * 60 * 60 * 1000 // 5小时
    });
    
    // 初始化
    await syncManager.initialize();
    
    // 启动同步
    const result = await syncManager.start();
    
    if (result.success) {
      console.log(`同步成功，共处理了 ${result.allNodesCount} 个节点，最终有效节点 ${result.validNodesCount} 个`);
      console.log(`生成了 ${result.generatedFiles.length} 个配置文件`);
    } else {
      console.error(`同步失败: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`发生错误: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// 执行主函数
main().catch(error => {
  console.error(`未捕获的错误: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
