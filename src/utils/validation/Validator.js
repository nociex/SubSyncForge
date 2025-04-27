import { ValidationError } from '../logger';

/**
 * 验证规则类型
 */
export const RuleType = {
  REQUIRED: 'required',
  TYPE: 'type',
  MIN: 'min',
  MAX: 'max',
  PATTERN: 'pattern',
  ENUM: 'enum',
  CUSTOM: 'custom'
};

/**
 * 数据验证器
 */
export class Validator {
  constructor(schema = {}) {
    this.schema = schema;
  }
  
  /**
   * 验证数据
   * @param {Object} data 要验证的数据
   * @param {Object} options 验证选项
   * @returns {Object} 验证结果
   */
  validate(data, options = {}) {
    const errors = [];
    const validated = {};
    
    // 遍历 schema 中的每个字段
    for (const [field, rules] of Object.entries(this.schema)) {
      try {
        // 获取字段值
        const value = data[field];
        
        // 验证字段
        const validatedValue = this.validateField(field, value, rules, options);
        
        // 如果字段有值，则添加到验证结果中
        if (validatedValue !== undefined) {
          validated[field] = validatedValue;
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push({
            field,
            message: error.message,
            code: error.code
          });
          
          // 如果设置了 failFast 选项，则在第一个错误时停止验证
          if (options.failFast) {
            break;
          }
        } else {
          throw error;
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      data: validated
    };
  }
  
  /**
   * 验证单个字段
   * @param {string} field 字段名
   * @param {any} value 字段值
   * @param {Array|Object} rules 验证规则
   * @param {Object} options 验证选项
   * @returns {any} 验证后的值
   */
  validateField(field, value, rules, options = {}) {
    // 如果 rules 是数组，则转换为对象
    if (Array.isArray(rules)) {
      const rulesObj = {};
      for (const rule of rules) {
        if (typeof rule === 'string') {
          rulesObj[rule] = true;
        } else if (typeof rule === 'object') {
          Object.assign(rulesObj, rule);
        }
      }
      rules = rulesObj;
    }
    
    // 检查是否必填
    if (rules.required && (value === undefined || value === null || value === '')) {
      throw new ValidationError(`Field '${field}' is required`, {
        code: 'VALIDATION_REQUIRED',
        context: { field }
      });
    }
    
    // 如果值为 undefined 或 null，且不是必填，则跳过其他验证
    if (value === undefined || value === null) {
      return value;
    }
    
    // 验证类型
    if (rules.type) {
      this.validateType(field, value, rules.type);
    }
    
    // 验证最小值/长度
    if (rules.min !== undefined) {
      this.validateMin(field, value, rules.min);
    }
    
    // 验证最大值/长度
    if (rules.max !== undefined) {
      this.validateMax(field, value, rules.max);
    }
    
    // 验证正则表达式
    if (rules.pattern) {
      this.validatePattern(field, value, rules.pattern);
    }
    
    // 验证枚举值
    if (rules.enum) {
      this.validateEnum(field, value, rules.enum);
    }
    
    // 自定义验证
    if (rules.custom) {
      return this.validateCustom(field, value, rules.custom, options);
    }
    
    return value;
  }
  
  /**
   * 验证类型
   */
  validateType(field, value, type) {
    let valid = false;
    
    switch (type) {
      case 'string':
        valid = typeof value === 'string';
        break;
      case 'number':
        valid = typeof value === 'number' && !isNaN(value);
        break;
      case 'boolean':
        valid = typeof value === 'boolean';
        break;
      case 'array':
        valid = Array.isArray(value);
        break;
      case 'object':
        valid = typeof value === 'object' && value !== null && !Array.isArray(value);
        break;
      case 'function':
        valid = typeof value === 'function';
        break;
      case 'date':
        valid = value instanceof Date && !isNaN(value.getTime());
        break;
      default:
        valid = true;
    }
    
    if (!valid) {
      throw new ValidationError(`Field '${field}' must be of type ${type}`, {
        code: 'VALIDATION_TYPE',
        context: { field, type, actualType: typeof value }
      });
    }
  }
  
  /**
   * 验证最小值/长度
   */
  validateMin(field, value, min) {
    if (typeof value === 'number') {
      if (value < min) {
        throw new ValidationError(`Field '${field}' must be at least ${min}`, {
          code: 'VALIDATION_MIN',
          context: { field, min, value }
        });
      }
    } else if (typeof value === 'string' || Array.isArray(value)) {
      if (value.length < min) {
        throw new ValidationError(`Field '${field}' must have at least ${min} characters`, {
          code: 'VALIDATION_MIN_LENGTH',
          context: { field, min, length: value.length }
        });
      }
    }
  }
  
  /**
   * 验证最大值/长度
   */
  validateMax(field, value, max) {
    if (typeof value === 'number') {
      if (value > max) {
        throw new ValidationError(`Field '${field}' must be at most ${max}`, {
          code: 'VALIDATION_MAX',
          context: { field, max, value }
        });
      }
    } else if (typeof value === 'string' || Array.isArray(value)) {
      if (value.length > max) {
        throw new ValidationError(`Field '${field}' must have at most ${max} characters`, {
          code: 'VALIDATION_MAX_LENGTH',
          context: { field, max, length: value.length }
        });
      }
    }
  }
  
  /**
   * 验证正则表达式
   */
  validatePattern(field, value, pattern) {
    if (typeof value !== 'string') {
      throw new ValidationError(`Field '${field}' must be a string to validate against pattern`, {
        code: 'VALIDATION_PATTERN_TYPE',
        context: { field, type: typeof value }
      });
    }
    
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
    
    if (!regex.test(value)) {
      throw new ValidationError(`Field '${field}' does not match the required pattern`, {
        code: 'VALIDATION_PATTERN',
        context: { field, pattern: regex.toString() }
      });
    }
  }
  
  /**
   * 验证枚举值
   */
  validateEnum(field, value, enumValues) {
    if (!Array.isArray(enumValues)) {
      throw new Error(`Enum values for field '${field}' must be an array`);
    }
    
    if (!enumValues.includes(value)) {
      throw new ValidationError(`Field '${field}' must be one of: ${enumValues.join(', ')}`, {
        code: 'VALIDATION_ENUM',
        context: { field, enum: enumValues, value }
      });
    }
  }
  
  /**
   * 自定义验证
   */
  validateCustom(field, value, customValidator, options) {
    if (typeof customValidator !== 'function') {
      throw new Error(`Custom validator for field '${field}' must be a function`);
    }
    
    try {
      return customValidator(value, { field, options });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      } else {
        throw new ValidationError(error.message || `Invalid value for field '${field}'`, {
          code: 'VALIDATION_CUSTOM',
          context: { field },
          cause: error
        });
      }
    }
  }
}

export default Validator;
