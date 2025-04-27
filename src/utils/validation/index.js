import { Validator, RuleType } from './Validator';

// 预定义的验证模式
export const ValidationSchemas = {
  // 订阅源验证模式
  SubscriptionSource: {
    id: ['required', 'string'],
    name: ['required', 'string'],
    url: ['required', 'string', { pattern: /^https?:\/\/.+/ }],
    type: ['required', 'string', { enum: ['v2ray', 'clash', 'surge', 'ss', 'ssr', 'trojan'] }],
    updateInterval: ['number', { min: 300 }],
    enabled: ['boolean']
  },
  
  // 转换请求验证模式
  ConversionRequest: {
    url: ['required', 'string', { pattern: /^https?:\/\/.+/ }],
    format: ['required', 'string', { enum: ['v2ray', 'clash', 'surge'] }],
    template: ['string']
  },
  
  // 节点验证模式
  Node: {
    id: ['string'],
    type: ['required', 'string'],
    name: ['string'],
    server: ['required', 'string'],
    port: ['required', 'number', { min: 1, max: 65535 }],
    protocol: ['required', 'string'],
    settings: ['object'],
    extra: ['object']
  }
};

// 创建验证器实例
export const createValidator = (schema) => {
  return new Validator(schema);
};

// 验证数据
export const validate = (data, schema, options = {}) => {
  const validator = createValidator(schema);
  return validator.validate(data, options);
};

export { Validator, RuleType };
export default {
  Validator,
  RuleType,
  ValidationSchemas,
  createValidator,
  validate
};
