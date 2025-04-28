/**
 * 处理分组订阅请求
 * 用于从storage中获取对应分组的节点数据并返回
 */

import { ResponseBuilder } from '../index';

/**
 * 处理分组订阅请求
 * @param {Request} request 请求对象
 * @returns {Promise<Response>} 响应对象
 */
export async function handleGroupSubscription(request) {
  try {
    // 从params获取分组名称
    const { groupName } = request.params;
    
    if (!groupName) {
      return ResponseBuilder.error('Missing group name', 400);
    }
    
    // 获取KV存储中的分组数据
    const groupData = await GROUPS_KV.get(`group_${groupName}`);
    
    if (!groupData) {
      return ResponseBuilder.error(`Group ${groupName} not found`, 404);
    }
    
    // 返回base64编码的节点数据
    return new Response(groupData, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="${groupName}.txt"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Group subscription handler error:', error);
    return ResponseBuilder.error('Internal Server Error', 500);
  }
}

export default handleGroupSubscription; 