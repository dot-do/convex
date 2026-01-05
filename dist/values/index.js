// src/values/index.ts
var ValidationContext = class {
  path = [];
  push(segment) {
    this.path.push(segment);
  }
  pop() {
    this.path.pop();
  }
  getPath() {
    return [...this.path];
  }
  formatPath() {
    return this.path.join(".");
  }
};
var currentContext = null;
function withContext(fn) {
  const hadContext = currentContext !== null;
  if (!hadContext) {
    currentContext = new ValidationContext();
  }
  try {
    return fn();
  } finally {
    if (!hadContext) {
      currentContext = null;
    }
  }
}
function pushPath(segment) {
  currentContext?.push(segment);
}
function popPath() {
  currentContext?.pop();
}
function getPathString() {
  return currentContext?.formatPath() ?? "";
}
var BaseValidator = class {
  isOptional = false;
  isValid(value) {
    try {
      this.parse(value);
      return true;
    } catch {
      return false;
    }
  }
  optional() {
    return new OptionalValidator(this);
  }
};
function getTypeName(value) {
  if (value === null) return "null";
  if (value === void 0) return "undefined";
  if (Array.isArray(value)) return "array";
  if (value instanceof ArrayBuffer) return "ArrayBuffer";
  if (ArrayBuffer.isView(value)) return value.constructor.name;
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (typeof value === "object" && value !== null) {
    if (value instanceof String) return "String object";
    if (value instanceof Number) return "Number object";
    if (value instanceof Boolean) return "Boolean object";
    return "object";
  }
  return typeof value;
}
var StringValidator = class extends BaseValidator {
  _type;
  parse(value) {
    if (value instanceof String) {
      throw new Error(`Expected string, got String object`);
    }
    if (typeof value !== "string") {
      throw new Error(`Expected string, got ${getTypeName(value)}`);
    }
    return value;
  }
  describe() {
    return "string";
  }
};
var NumberValidator = class extends BaseValidator {
  _type;
  parse(value) {
    if (value instanceof Number) {
      throw new Error(`Expected number, got Number object`);
    }
    if (typeof value !== "number") {
      throw new Error(`Expected number, got ${getTypeName(value)}`);
    }
    if (Number.isNaN(value)) {
      throw new Error(`Expected number, got NaN`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`Expected number, got ${value > 0 ? "Infinity" : "-Infinity"}`);
    }
    return value;
  }
  describe() {
    return "number";
  }
};
var BooleanValidator = class extends BaseValidator {
  _type;
  parse(value) {
    if (value instanceof Boolean) {
      throw new Error(`Expected boolean, got Boolean object`);
    }
    if (typeof value !== "boolean") {
      throw new Error(`Expected boolean, got ${getTypeName(value)}`);
    }
    return value;
  }
  describe() {
    return "boolean";
  }
};
var NullValidator = class extends BaseValidator {
  _type;
  parse(value) {
    if (value !== null) {
      if (value === void 0) {
        throw new Error(`undefined is not null`);
      }
      throw new Error(`Expected null, got ${getTypeName(value)}`);
    }
    return value;
  }
  describe() {
    return "null";
  }
};
var INT64_MAX = BigInt("9223372036854775807");
var INT64_MIN = BigInt("-9223372036854775808");
var Int64Validator = class extends BaseValidator {
  _type;
  parse(value) {
    let result;
    if (typeof value === "bigint") {
      result = value;
    } else if (typeof value === "number") {
      if (Number.isNaN(value)) {
        throw new Error(`Expected int64/bigint, got NaN`);
      }
      if (!Number.isFinite(value)) {
        throw new Error(`Expected int64/bigint, got ${value > 0 ? "Infinity" : "-Infinity"}`);
      }
      if (!Number.isInteger(value)) {
        throw new Error(`Expected int64/bigint, got float (${value})`);
      }
      result = BigInt(value);
    } else if (typeof value === "string") {
      if (value === "") {
        throw new Error(`Cannot convert empty string to int64`);
      }
      if (value.includes(".")) {
        throw new Error(`Expected int64/bigint, got float string ("${value}")`);
      }
      try {
        result = BigInt(value);
      } catch {
        throw new Error(`Cannot convert "${value}" to int64`);
      }
    } else {
      throw new Error(`Expected int64/bigint, got ${getTypeName(value)}`);
    }
    if (result > INT64_MAX) {
      throw new Error(`Value ${result} exceeds maximum int64 value (${INT64_MAX})`);
    }
    if (result < INT64_MIN) {
      throw new Error(`Value ${result} is less than minimum int64 value (${INT64_MIN})`);
    }
    return result;
  }
  describe() {
    return "int64";
  }
};
var Float64Validator = class extends BaseValidator {
  _type;
  parse(value) {
    if (value instanceof Number) {
      throw new Error(`Expected float64/number, got Number object`);
    }
    if (typeof value !== "number") {
      throw new Error(`Expected float64/number, got ${getTypeName(value)}`);
    }
    if (Number.isNaN(value)) {
      throw new Error(`NaN is not a valid float64`);
    }
    return value;
  }
  describe() {
    return "float64";
  }
};
var BytesValidator = class extends BaseValidator {
  _type;
  parse(value) {
    if (value instanceof ArrayBuffer) {
      return value;
    }
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    throw new Error(`Expected bytes/ArrayBuffer, got ${typeof value}`);
  }
  describe() {
    return "bytes";
  }
};
var MIN_ID_LENGTH = 32;
var MAX_ID_LENGTH = 128;
var VALID_ID_PATTERN = /^[A-Za-z0-9]+$/;
var IdValidator = class extends BaseValidator {
  _type;
  tableName;
  constructor(tableName) {
    super();
    if (!tableName || tableName.trim() === "") {
      throw new Error("Table name cannot be empty");
    }
    this.tableName = tableName;
  }
  parse(value) {
    if (typeof value !== "string") {
      throw new Error(`Expected ID for table "${this.tableName}", got ${getTypeName(value)}`);
    }
    if (value.length === 0) {
      throw new Error(`ID for table "${this.tableName}" cannot be empty`);
    }
    if (value.length < MIN_ID_LENGTH) {
      throw new Error(`Invalid ID for table "${this.tableName}": ID is too short (minimum ${MIN_ID_LENGTH} characters)`);
    }
    if (value.length > MAX_ID_LENGTH) {
      throw new Error(`Invalid ID for table "${this.tableName}": ID is too long (maximum ${MAX_ID_LENGTH} characters)`);
    }
    if (!VALID_ID_PATTERN.test(value)) {
      throw new Error(`Invalid ID for table "${this.tableName}": ID contains invalid characters`);
    }
    return value;
  }
  describe() {
    return `v.id("${this.tableName}")`;
  }
};
var ObjectValidator = class _ObjectValidator extends BaseValidator {
  _type;
  shape;
  mode;
  constructor(shape, mode = "strip") {
    super();
    this.shape = shape;
    this.mode = mode;
  }
  parse(value) {
    return withContext(() => this.parseInternal(value));
  }
  parseInternal(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Expected object, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
    }
    const result = {};
    const obj = value;
    const schemaKeys = new Set(Object.keys(this.shape));
    if (this.mode === "strict") {
      for (const key of Object.keys(obj)) {
        if (!schemaKeys.has(key)) {
          throw new Error(`Unexpected field "${key}" in object`);
        }
      }
    }
    for (const [key, validator] of Object.entries(this.shape)) {
      const fieldValue = obj[key];
      if (fieldValue === void 0 && !validator.isOptional) {
        throw new Error(`Missing required field "${key}"`);
      }
      if (fieldValue !== void 0) {
        pushPath(key);
        try {
          result[key] = validator.parse(fieldValue);
        } catch (e) {
          const path = getPathString();
          const innerMsg = e.message;
          throw new Error(path ? `Validation error at ${path}: ${innerMsg}` : innerMsg);
        } finally {
          popPath();
        }
      }
    }
    if (this.mode === "passthrough") {
      for (const key of Object.keys(obj)) {
        if (!schemaKeys.has(key)) {
          result[key] = obj[key];
        }
      }
    }
    return result;
  }
  describe() {
    const fields = Object.entries(this.shape).map(([key, v2]) => `${key}: ${v2.describe()}`).join(", ");
    return `{ ${fields} }`;
  }
  /**
   * Returns a new validator that throws on extra fields.
   */
  strict() {
    return new _ObjectValidator(this.shape, "strict");
  }
  /**
   * Returns a new validator that passes through extra fields.
   */
  passthrough() {
    return new _ObjectValidator(this.shape, "passthrough");
  }
  /**
   * Returns a new validator with additional fields.
   */
  extend(additionalShape) {
    return new _ObjectValidator({ ...this.shape, ...additionalShape }, this.mode);
  }
  /**
   * Returns a new validator with only the specified fields.
   */
  pick(keys) {
    const newShape = {};
    for (const key of keys) {
      if (key in this.shape) {
        newShape[key] = this.shape[key];
      }
    }
    return new _ObjectValidator(newShape, this.mode);
  }
  /**
   * Returns a new validator without the specified fields.
   */
  omit(keys) {
    const keysToOmit = new Set(keys);
    const newShape = {};
    for (const [key, validator] of Object.entries(this.shape)) {
      if (!keysToOmit.has(key)) {
        newShape[key] = validator;
      }
    }
    return new _ObjectValidator(newShape, this.mode);
  }
};
var ArrayValidator = class _ArrayValidator extends BaseValidator {
  _type;
  element;
  constraints;
  constructor(element, constraints = {}) {
    super();
    this.element = element;
    this.constraints = constraints;
  }
  parse(value) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array, got ${value === null ? "null" : typeof value}`);
    }
    if (this.constraints.minLength !== void 0 && value.length < this.constraints.minLength) {
      throw new Error(`Array must have at least ${this.constraints.minLength} element(s), got ${value.length}`);
    }
    if (this.constraints.maxLength !== void 0 && value.length > this.constraints.maxLength) {
      throw new Error(`Array must have at most ${this.constraints.maxLength} element(s), got ${value.length}`);
    }
    if (this.constraints.exactLength !== void 0 && value.length !== this.constraints.exactLength) {
      throw new Error(`Array must have exactly ${this.constraints.exactLength} element(s), got ${value.length}`);
    }
    return value.map((item, index) => {
      pushPath(index);
      try {
        return this.element.parse(item);
      } catch (e) {
        const path = getPathString();
        const innerMsg = e.message;
        throw new Error(path ? `Invalid element at index ${index}: ${innerMsg}` : `Invalid array element at index ${index}: ${innerMsg}`);
      } finally {
        popPath();
      }
    });
  }
  describe() {
    return `${this.element.describe()}[]`;
  }
  /**
   * Returns a new validator that requires at least one element.
   */
  nonempty() {
    return new _ArrayValidator(this.element, { ...this.constraints, minLength: 1 });
  }
  /**
   * Returns a new validator with a minimum length constraint.
   */
  min(minLength) {
    return new _ArrayValidator(this.element, { ...this.constraints, minLength });
  }
  /**
   * Returns a new validator with a maximum length constraint.
   */
  max(maxLength) {
    return new _ArrayValidator(this.element, { ...this.constraints, maxLength });
  }
  /**
   * Returns a new validator with an exact length constraint.
   */
  length(exactLength) {
    return new _ArrayValidator(this.element, { ...this.constraints, exactLength });
  }
};
var UnionValidator = class extends BaseValidator {
  _type;
  validators;
  constructor(validators) {
    super();
    this.validators = validators;
  }
  parse(value) {
    const errors = [];
    for (const validator of this.validators) {
      try {
        return validator.parse(value);
      } catch (e) {
        errors.push(e.message);
      }
    }
    throw new Error(`Value doesn't match any variant: ${errors.join("; ")}`);
  }
  describe() {
    return this.validators.map((v2) => v2.describe()).join(" | ");
  }
};
var OptionalValidator = class extends BaseValidator {
  _type;
  isOptional = true;
  inner;
  constructor(inner) {
    super();
    this.inner = inner;
  }
  parse(value) {
    if (value === void 0) {
      return void 0;
    }
    return this.inner.parse(value);
  }
  describe() {
    return `${this.inner.describe()} | undefined`;
  }
  optional() {
    return this;
  }
  /**
   * Returns a new validator that provides a default value when undefined.
   */
  default(defaultValue) {
    return new DefaultValidator(this.inner, defaultValue);
  }
};
var DefaultValidator = class extends BaseValidator {
  _type;
  isOptional = true;
  inner;
  defaultValue;
  constructor(inner, defaultValue) {
    super();
    this.inner = inner;
    this.defaultValue = defaultValue;
  }
  parse(value) {
    if (value === void 0) {
      return this.defaultValue;
    }
    return this.inner.parse(value);
  }
  describe() {
    return `${this.inner.describe()} (default: ${JSON.stringify(this.defaultValue)})`;
  }
};
var LiteralValidator = class extends BaseValidator {
  _type;
  literal;
  constructor(literal) {
    super();
    this.literal = literal;
  }
  parse(value) {
    if (value !== this.literal) {
      throw new Error(`Expected literal ${JSON.stringify(this.literal)}, got ${JSON.stringify(value)}`);
    }
    return value;
  }
  describe() {
    return JSON.stringify(this.literal);
  }
};
var RecordValidator = class extends BaseValidator {
  _type;
  keys;
  values;
  constructor(keys, values) {
    super();
    this.keys = keys;
    this.values = values;
  }
  parse(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Expected record/object, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
    }
    const result = {};
    const obj = value;
    for (const [key, val] of Object.entries(obj)) {
      try {
        this.keys.parse(key);
      } catch (e) {
        throw new Error(`Invalid key "${key}": ${e.message}`);
      }
      try {
        result[key] = this.values.parse(val);
      } catch (e) {
        throw new Error(`Invalid value for key "${key}": ${e.message}`);
      }
    }
    return result;
  }
  describe() {
    return `Record<${this.keys.describe()}, ${this.values.describe()}>`;
  }
};
var AnyValidator = class extends BaseValidator {
  _type;
  parse(value) {
    return value;
  }
  describe() {
    return "any";
  }
};
var UnknownValidator = class extends BaseValidator {
  _type;
  parse(value) {
    return value;
  }
  describe() {
    return "unknown";
  }
};
var NullableValidator = class extends BaseValidator {
  _type;
  inner;
  constructor(inner) {
    super();
    this.inner = inner;
  }
  parse(value) {
    if (value === null) {
      return null;
    }
    return this.inner.parse(value);
  }
  describe() {
    return `${this.inner.describe()} | null`;
  }
};
var NullishValidator = class extends BaseValidator {
  _type;
  isOptional = true;
  inner;
  constructor(inner) {
    super();
    this.inner = inner;
  }
  parse(value) {
    if (value === null) {
      return null;
    }
    if (value === void 0) {
      return void 0;
    }
    return this.inner.parse(value);
  }
  describe() {
    return `${this.inner.describe()} | null | undefined`;
  }
};
var DiscriminatedUnionValidator = class extends BaseValidator {
  _type;
  discriminator;
  validators;
  constructor(discriminator, validators) {
    super();
    this.discriminator = discriminator;
    this.validators = validators;
  }
  parse(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`Expected object with discriminator "${this.discriminator}", got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
    }
    const errors = [];
    for (const validator of this.validators) {
      try {
        return validator.parse(value);
      } catch (e) {
        errors.push(e.message);
      }
    }
    throw new Error(`Value doesn't match any variant for discriminator "${this.discriminator}": ${errors.join("; ")}`);
  }
  describe() {
    return this.validators.map((v2) => v2.describe()).join(" | ");
  }
};
var v = {
  // Primitives
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  boolean: () => new BooleanValidator(),
  null: () => new NullValidator(),
  int64: () => new Int64Validator(),
  float64: () => new Float64Validator(),
  bytes: () => new BytesValidator(),
  // ID type
  id: (tableName) => new IdValidator(tableName),
  // Complex types
  object: (shape) => new ObjectValidator(shape),
  array: (element) => new ArrayValidator(element),
  union: (...validators) => new UnionValidator(validators),
  optional: (validator) => new OptionalValidator(validator),
  literal: (value) => new LiteralValidator(value),
  record: (keys, values) => {
    if (values === void 0) {
      return new RecordValidator(new StringValidator(), keys);
    }
    return new RecordValidator(keys, values);
  },
  any: () => new AnyValidator(),
  unknown: () => new UnknownValidator(),
  nullable: (validator) => new NullableValidator(validator),
  nullish: (validator) => new NullishValidator(validator),
  discriminatedUnion: (discriminator, validators) => new DiscriminatedUnionValidator(discriminator, validators)
};

export { v };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map