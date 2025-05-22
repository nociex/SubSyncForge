/**
 * 文件系统工具
 * 提供与文件系统交互的通用功能
 */

import fs from 'fs';
import path from 'path';

/**
 * 确保目录存在
 * @param {string} dirPath 目录路径
 * @returns {boolean} 是否成功创建或目录已存在
 */
export function ensureDirectoryExists(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`创建目录: ${dirPath}`);
    }
    return true;
  } catch (error) {
    console.error(`创建目录失败: ${dirPath}, 错误: ${error.message}`);
    return false;
  }
}

/**
 * 保存数据到JSON文件
 * @param {string} filePath 文件路径
 * @param {Object} data 要保存的数据
 * @param {boolean} pretty 是否美化JSON格式 (默认:true)
 * @returns {boolean} 是否保存成功
 */
export function saveJsonFile(filePath, data, pretty = true) {
  try {
    const dirPath = path.dirname(filePath);
    ensureDirectoryExists(dirPath);
    
    const content = pretty 
      ? JSON.stringify(data, null, 2) 
      : JSON.stringify(data);
    
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error(`保存JSON文件失败: ${filePath}, 错误: ${error.message}`);
    return false;
  }
}

/**
 * 保存缓存数据
 * @param {string} cachePath 缓存路径
 * @param {Array} nodes 节点数据
 * @param {string} hash 内容哈希值
 * @returns {boolean} 是否保存成功
 */
export function saveCacheData(cachePath, nodes, hash) {
  const cacheData = {
    nodes: nodes,
    timestamp: Date.now(),
    hash: hash
  };
  
  return saveJsonFile(cachePath, cacheData);
}

/**
 * 读取JSON文件
 * @param {string} filePath 文件路径
 * @param {Object} defaultValue 默认值，如果文件不存在或读取失败
 * @returns {Object} 读取的数据或默认值
 */
export function readJsonFile(filePath, defaultValue = null) {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`读取JSON文件失败: ${filePath}, 错误: ${error.message}`);
    return defaultValue;
  }
}

/**
 * 删除文件
 * @param {string} filePath 文件路径
 * @returns {boolean} 是否删除成功
 */
export function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`删除文件失败: ${filePath}, 错误: ${error.message}`);
    return false;
  }
}

/**
 * 清空目录
 * @param {string} dirPath 目录路径
 * @param {boolean} keepDir 是否保留目录本身
 * @returns {boolean} 是否清空成功
 */
export function clearDirectory(dirPath, keepDir = true) {
  try {
    if (!fs.existsSync(dirPath)) {
      return true;
    }
    
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const curPath = path.join(dirPath, file);
      
      if (fs.lstatSync(curPath).isDirectory()) {
        // 递归清空子目录
        clearDirectory(curPath, false);
      } else {
        // 删除文件
        fs.unlinkSync(curPath);
      }
    }
    
    if (!keepDir) {
      fs.rmdirSync(dirPath);
    }
    
    return true;
  } catch (error) {
    console.error(`清空目录失败: ${dirPath}, 错误: ${error.message}`);
    return false;
  }
}

/**
 * 保存文本到文件
 * @param {string} filePath 文件路径 
 * @param {string} content 要保存的内容
 * @returns {boolean} 是否保存成功
 */
export function saveTextFile(filePath, content) {
  try {
    const dirPath = path.dirname(filePath);
    ensureDirectoryExists(dirPath);
    
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error(`保存文本文件失败: ${filePath}, 错误: ${error.message}`);
    return false;
  }
}

/**
 * 加载文本文件
 * @param {string} filePath 文件路径
 * @param {string} defaultValue 如果文件不存在或读取失败时的默认值
 * @returns {string} 文件内容或默认值
 */
export function loadTextFile(filePath, defaultValue = '') {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`加载文本文件失败: ${filePath}, 错误: ${error.message}`);
    return defaultValue;
  }
} 