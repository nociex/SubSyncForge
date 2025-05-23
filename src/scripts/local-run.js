#!/usr/bin/env node

import { LocalRunManager } from '../core/LocalRunManager.js';
import { logger } from '../utils/index.js';
import readline from 'readline';

// 创建命令行接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 全局管理器实例
let manager = null;

/**
 * 显示主菜单
 */
function showMainMenu() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 SubSyncForge 本地运行管理器');
  console.log('='.repeat(80));
  console.log('选择运行模式:');
  console.log('');
  console.log('📖 手动模式:');
  console.log('  1. 更新订阅测试并重命名 - 完整的订阅更新、测试、重命名流程');
  console.log('  2. 从现有配置构建mihomo测试 - 基于现有配置文件进行mihomo测试');
  console.log('');
  console.log('🤖 自动模式:');
  console.log('  3. 启动自动模式 - 根据配置定时执行上述两种模式');
  console.log('  4. 停止自动模式 - 停止所有定时任务');
  console.log('');
  console.log('🚫 黑名单管理:');
  console.log('  5. 查看黑名单状态');
  console.log('  6. 导出黑名单报告');
  console.log('  7. 手动管理黑名单');
  console.log('');
  console.log('📊 状态查询:');
  console.log('  8. 查看运行状态');
  console.log('  9. 查看最后运行结果');
  console.log('');
  console.log('  0. 退出');
  console.log('='.repeat(80));
}

/**
 * 显示黑名单管理菜单
 */
function showBlacklistMenu() {
  console.log('\n🚫 黑名单管理菜单:');
  console.log('  1. 添加节点到黑名单');
  console.log('  2. 从黑名单移除节点');
  console.log('  3. 重置整个黑名单');
  console.log('  0. 返回主菜单');
}

/**
 * 询问用户输入
 */
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

/**
 * 等待用户按键继续
 */
async function waitForContinue() {
  await askQuestion('\n按回车键继续...');
}

/**
 * 执行模式1
 */
async function runMode1() {
  console.log('\n🚀 开始执行模式1: 更新订阅测试并重命名');
  console.log('这将执行以下步骤:');
  console.log('  1. 更新所有订阅数据');
  console.log('  2. 过滤黑名单节点');
  console.log('  3. 使用高级测试器测试节点');
  console.log('  4. 更新黑名单记录');
  console.log('  5. 修正节点位置和名称');
  console.log('  6. 生成配置文件');
  
  const confirm = await askQuestion('\n确认执行? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ 操作已取消');
    return;
  }
  
  try {
    const startTime = Date.now();
    console.log('\n⏳ 正在执行，请耐心等待...');
    
    const result = await manager.runMode1UpdateAndTest();
    const duration = Date.now() - startTime;
    
    console.log('\n✅ 模式1执行完成!');
    console.log(`⏱️  总耗时: ${Math.round(duration / 1000)}秒`);
    console.log('\n📊 执行结果:');
    console.log(`  📥 订阅更新: ${result.steps.updateSubscription?.totalNodes || 0} 个节点`);
    console.log(`  🚫 黑名单过滤: 移除 ${result.steps.filterBlacklist?.removedCount || 0} 个节点`);
    console.log(`  🔍 节点测试: ${result.steps.nodeTest?.successful || 0}/${result.steps.nodeTest?.total || 0} 可用`);
    console.log(`  ✏️  名称修正: ${result.steps.nameCorrection?.correctedNodes || 0} 个节点`);
    console.log(`  📄 配置生成: ${result.steps.generateConfigs?.configCount || 0} 个文件`);
    
  } catch (error) {
    console.error('\n❌ 模式1执行失败:', error.message);
  }
}

/**
 * 执行模式2
 */
async function runMode2() {
  console.log('\n🚀 开始执行模式2: 从现有配置构建mihomo测试');
  console.log('这将执行以下步骤:');
  console.log('  1. 读取现有配置文件中的节点');
  console.log('  2. 过滤黑名单节点');
  console.log('  3. 使用mihomo核心测试节点');
  console.log('  4. 更新黑名单记录');
  console.log('  5. 生成mihomo配置文件');
  
  const confirm = await askQuestion('\n确认执行? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ 操作已取消');
    return;
  }
  
  try {
    const startTime = Date.now();
    console.log('\n⏳ 正在执行，请耐心等待...');
    
    const result = await manager.runMode2ConfigTest();
    const duration = Date.now() - startTime;
    
    console.log('\n✅ 模式2执行完成!');
    console.log(`⏱️  总耗时: ${Math.round(duration / 1000)}秒`);
    console.log('\n📊 执行结果:');
    console.log(`  📖 节点读取: ${result.steps.loadNodes?.totalNodes || 0} 个节点`);
    console.log(`  🚫 黑名单过滤: 移除 ${result.steps.filterBlacklist?.removedCount || 0} 个节点`);
    console.log(`  🔍 节点测试: ${result.steps.nodeTest?.successful || 0}/${result.steps.nodeTest?.total || 0} 可用`);
    console.log(`  📄 mihomo配置: ${result.steps.generateMihomoConfig?.nodeCount || 0} 个节点`);
    console.log(`  💾 配置路径: ${result.steps.generateMihomoConfig?.configPath || 'N/A'}`);
    
  } catch (error) {
    console.error('\n❌ 模式2执行失败:', error.message);
  }
}

/**
 * 启动自动模式
 */
async function startAutoMode() {
  console.log('\n🤖 启动自动模式');
  console.log('自动模式将根据配置文件中的计划任务定时执行:');
  console.log('  - 模式1: 默认每6小时执行一次');
  console.log('  - 模式2: 默认每2小时执行一次');
  console.log('  - 黑名单清理: 默认每天凌晨2点执行');
  
  const confirm = await askQuestion('\n确认启动自动模式? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ 操作已取消');
    return;
  }
  
  try {
    await manager.startAutoMode();
    console.log('\n✅ 自动模式已启动!');
    console.log('💡 程序将继续运行，您可以选择其他操作或退出程序');
    console.log('⚠️  注意: 退出程序将停止自动模式');
    
  } catch (error) {
    console.error('\n❌ 启动自动模式失败:', error.message);
  }
}

/**
 * 停止自动模式
 */
async function stopAutoMode() {
  console.log('\n⏹️ 停止自动模式');
  
  const status = manager.getStatus();
  if (!status.autoMode) {
    console.log('❌ 自动模式未在运行');
    return;
  }
  
  const confirm = await askQuestion('\n确认停止自动模式? (y/N): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ 操作已取消');
    return;
  }
  
  try {
    manager.stopAutoMode();
    console.log('\n✅ 自动模式已停止');
    
  } catch (error) {
    console.error('\n❌ 停止自动模式失败:', error.message);
  }
}

/**
 * 查看黑名单状态
 */
async function showBlacklistStatus() {
  console.log('\n🚫 黑名单状态:');
  
  try {
    const stats = manager.blacklistManager.getStatistics();
    
    console.log(`  📊 总节点数: ${stats.total}`);
    console.log(`  🚫 黑名单节点: ${stats.blacklisted}`);
    console.log(`  ⚠️  近期失败节点: ${stats.recentFailures}`);
    console.log(`  🕒 最后更新: ${new Date(stats.lastUpdated).toLocaleString('zh-CN')}`);
    
    if (stats.topFailures.length > 0) {
      console.log('\n🔝 失败次数最多的节点:');
      stats.topFailures.slice(0, 5).forEach((node, index) => {
        const status = node.blacklisted ? '🚫' : '⚠️';
        console.log(`  ${index + 1}. ${status} ${node.name} (${node.server}) - ${node.failures}次失败`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ 获取黑名单状态失败:', error.message);
  }
}

/**
 * 导出黑名单报告
 */
async function exportBlacklistReport() {
  console.log('\n📄 导出黑名单报告');
  
  try {
    const report = await manager.getBlacklistReport();
    
    console.log('\n📊 黑名单报告:');
    console.log(JSON.stringify(report, null, 2));
    
    // 可选择保存到文件
    const saveToFile = await askQuestion('\n是否保存报告到文件? (y/N): ');
    if (saveToFile.toLowerCase() === 'y') {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const reportPath = path.join(process.cwd(), 'config', 'blacklist_report.json');
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`✅ 报告已保存到: ${reportPath}`);
    }
    
  } catch (error) {
    console.error('\n❌ 导出黑名单报告失败:', error.message);
  }
}

/**
 * 手动管理黑名单
 */
async function manageBlacklist() {
  while (true) {
    showBlacklistMenu();
    const choice = await askQuestion('\n请选择操作 (0-3): ');
    
    switch (choice) {
      case '1':
        await addToBlacklist();
        break;
      case '2':
        await removeFromBlacklist();
        break;
      case '3':
        await resetBlacklist();
        break;
      case '0':
        return;
      default:
        console.log('❌ 无效选择，请重新输入');
    }
  }
}

/**
 * 添加节点到黑名单
 */
async function addToBlacklist() {
  console.log('\n➕ 添加节点到黑名单');
  
  const server = await askQuestion('请输入服务器地址: ');
  const port = await askQuestion('请输入端口: ');
  const type = await askQuestion('请输入节点类型 (ss/vmess/trojan等): ');
  const name = await askQuestion('请输入节点名称 (可选): ');
  const reason = await askQuestion('请输入添加原因 (可选): ');
  
  if (!server || !port || !type) {
    console.log('❌ 服务器地址、端口和类型是必填项');
    return;
  }
  
  try {
    const node = {
      server: server.trim(),
      port: parseInt(port),
      type: type.trim(),
      name: name.trim() || `${type}-${server}:${port}`
    };
    
    await manager.manageBlacklist('add', node, reason.trim() || '手动添加');
    console.log('✅ 节点已添加到黑名单');
    
  } catch (error) {
    console.error('\n❌ 添加失败:', error.message);
  }
}

/**
 * 从黑名单移除节点
 */
async function removeFromBlacklist() {
  console.log('\n➖ 从黑名单移除节点');
  
  const server = await askQuestion('请输入服务器地址: ');
  const port = await askQuestion('请输入端口: ');
  const type = await askQuestion('请输入节点类型: ');
  
  if (!server || !port || !type) {
    console.log('❌ 服务器地址、端口和类型是必填项');
    return;
  }
  
  try {
    const node = {
      server: server.trim(),
      port: parseInt(port),
      type: type.trim()
    };
    
    await manager.manageBlacklist('remove', node);
    console.log('✅ 节点已从黑名单移除');
    
  } catch (error) {
    console.error('\n❌ 移除失败:', error.message);
  }
}

/**
 * 重置黑名单
 */
async function resetBlacklist() {
  console.log('\n🔄 重置整个黑名单');
  console.log('⚠️  警告: 这将删除所有黑名单记录，无法恢复!');
  
  const confirm1 = await askQuestion('\n确认要重置黑名单吗? (y/N): ');
  if (confirm1.toLowerCase() !== 'y') {
    console.log('❌ 操作已取消');
    return;
  }
  
  const confirm2 = await askQuestion('再次确认，这将删除所有黑名单数据! (输入 "RESET" 确认): ');
  if (confirm2 !== 'RESET') {
    console.log('❌ 操作已取消');
    return;
  }
  
  try {
    await manager.manageBlacklist('reset');
    console.log('✅ 黑名单已重置');
    
  } catch (error) {
    console.error('\n❌ 重置失败:', error.message);
  }
}

/**
 * 查看运行状态
 */
async function showRunStatus() {
  console.log('\n📊 运行状态:');
  
  try {
    const status = manager.getStatus();
    
    console.log(`  🏃 运行状态: ${status.isRunning ? '运行中' : '空闲'}`);
    console.log(`  🤖 自动模式: ${status.autoMode ? '已启用' : '已禁用'}`);
    console.log(`  🕒 最后运行: ${status.lastRunTime ? status.lastRunTime.toLocaleString('zh-CN') : '从未运行'}`);
    console.log(`  📈 运行统计: ${status.stats.successfulRuns}/${status.stats.totalRuns} 次成功`);
    
    if (status.autoMode && status.activeCronJobs.length > 0) {
      console.log('\n⏰ 定时任务:');
      status.activeCronJobs.forEach(job => {
        console.log(`  - ${job.name}: 下次运行 ${new Date(job.nextRun).toLocaleString('zh-CN')}`);
      });
    }
    
    if (status.blacklistStats) {
      console.log('\n🚫 黑名单统计:');
      console.log(`  - 总节点: ${status.blacklistStats.total}`);
      console.log(`  - 黑名单节点: ${status.blacklistStats.blacklisted}`);
      console.log(`  - 近期失败: ${status.blacklistStats.recentFailures}`);
    }
    
  } catch (error) {
    console.error('\n❌ 获取运行状态失败:', error.message);
  }
}

/**
 * 查看最后运行结果
 */
async function showLastRunResult() {
  console.log('\n📋 最后运行结果:');
  
  try {
    const status = manager.getStatus();
    const lastResult = status.stats.lastRunResult;
    
    if (!lastResult) {
      console.log('❌ 没有运行记录');
      return;
    }
    
    console.log(`  📅 运行时间: ${lastResult.startTime}`);
    console.log(`  🎯 运行模式: ${lastResult.mode}`);
    console.log(`  ✅ 运行状态: ${lastResult.success ? '成功' : '失败'}`);
    console.log(`  ⏱️  执行时长: ${Math.round(lastResult.duration / 1000)}秒`);
    
    if (lastResult.error) {
      console.log(`  ❌ 错误信息: ${lastResult.error}`);
    }
    
    if (lastResult.steps) {
      console.log('\n📊 执行步骤详情:');
      console.log(JSON.stringify(lastResult.steps, null, 2));
    }
    
  } catch (error) {
    console.error('\n❌ 获取运行结果失败:', error.message);
  }
}

/**
 * 主程序
 */
async function main() {
  console.log('🚀 SubSyncForge 本地运行管理器');
  console.log('正在初始化...');
  
  try {
    // 初始化管理器
    manager = new LocalRunManager({
      logger: logger.defaultLogger.child({ component: 'LocalRunCLI' })
    });
    
    await manager.initialize();
    console.log('✅ 初始化完成');
    
    // 主循环
    while (true) {
      showMainMenu();
      const choice = await askQuestion('\n请选择操作 (0-9): ');
      
      switch (choice) {
        case '1':
          await runMode1();
          await waitForContinue();
          break;
        case '2':
          await runMode2();
          await waitForContinue();
          break;
        case '3':
          await startAutoMode();
          await waitForContinue();
          break;
        case '4':
          await stopAutoMode();
          await waitForContinue();
          break;
        case '5':
          await showBlacklistStatus();
          await waitForContinue();
          break;
        case '6':
          await exportBlacklistReport();
          await waitForContinue();
          break;
        case '7':
          await manageBlacklist();
          break;
        case '8':
          await showRunStatus();
          await waitForContinue();
          break;
        case '9':
          await showLastRunResult();
          await waitForContinue();
          break;
        case '0':
          console.log('\n👋 感谢使用，再见!');
          process.exit(0);
          break;
        default:
          console.log('❌ 无效选择，请重新输入');
          await waitForContinue();
      }
    }
    
  } catch (error) {
    console.error('\n💥 程序异常:', error.message);
    console.error('详细错误:', error.stack);
    process.exit(1);
  }
}

// 处理程序退出
process.on('SIGINT', () => {
  console.log('\n\n👋 接收到退出信号...');
  if (manager && manager.autoMode) {
    console.log('⏹️ 正在停止自动模式...');
    manager.stopAutoMode();
  }
  rl.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 接收到终止信号...');
  if (manager && manager.autoMode) {
    console.log('⏹️ 正在停止自动模式...');
    manager.stopAutoMode();
  }
  rl.close();
  process.exit(0);
});

// 启动程序
main().catch(error => {
  console.error('💥 启动失败:', error);
  process.exit(1);
}); 