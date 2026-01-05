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

// src/server/query.ts
function query(config) {
  return {
    _type: "query",
    _args: void 0,
    _returns: void 0,
    _visibility: "public",
    _config: config
  };
}
function internalQuery(config) {
  return {
    _type: "query",
    _args: void 0,
    _returns: void 0,
    _visibility: "internal",
    _config: config
  };
}

// src/server/mutation.ts
function mutation(config) {
  return {
    _type: "mutation",
    _args: void 0,
    _returns: void 0,
    _visibility: "public",
    _config: config
  };
}
function internalMutation(config) {
  return {
    _type: "mutation",
    _args: void 0,
    _returns: void 0,
    _visibility: "internal",
    _config: config
  };
}

// src/server/action.ts
function action(config) {
  return {
    _type: "action",
    _args: void 0,
    _returns: void 0,
    _visibility: "public",
    _config: config
  };
}
function internalAction(config) {
  return {
    _type: "action",
    _args: void 0,
    _returns: void 0,
    _visibility: "internal",
    _config: config
  };
}

// src/server/httpRouter.ts
var HttpRouter = class {
  routes = [];
  /**
   * Add a route for any HTTP method.
   */
  route(config) {
    this.routes.push({
      path: config.path,
      method: config.method,
      handler: config.handler._config.handler
    });
    return this;
  }
  /**
   * Add a GET route.
   */
  get(path, handler) {
    return this.route({ path, method: "GET", handler });
  }
  /**
   * Add a POST route.
   */
  post(path, handler) {
    return this.route({ path, method: "POST", handler });
  }
  /**
   * Add a PUT route.
   */
  put(path, handler) {
    return this.route({ path, method: "PUT", handler });
  }
  /**
   * Add a PATCH route.
   */
  patch(path, handler) {
    return this.route({ path, method: "PATCH", handler });
  }
  /**
   * Add a DELETE route.
   */
  delete(path, handler) {
    return this.route({ path, method: "DELETE", handler });
  }
  /**
   * Add an OPTIONS route.
   */
  options(path, handler) {
    return this.route({ path, method: "OPTIONS", handler });
  }
  /**
   * Add a HEAD route.
   */
  head(path, handler) {
    return this.route({ path, method: "HEAD", handler });
  }
  /**
   * Get all registered routes.
   */
  getRoutes() {
    return this.routes;
  }
  /**
   * Match a request to a route.
   */
  match(request) {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    for (const route of this.routes) {
      if (route.method === method && this.pathMatches(route.path, path)) {
        return route;
      }
    }
    return null;
  }
  /**
   * Handle an incoming HTTP request.
   * Matches the request to a route and executes the handler.
   *
   * @param ctx - The HTTP action context
   * @param request - The incoming request
   * @returns The response from the handler, or null if no route matches
   */
  async handle(ctx, request) {
    const route = this.match(request);
    if (!route) {
      return null;
    }
    const enhancedRequest = this.createRequest(request, route.path);
    return route.handler(ctx, enhancedRequest);
  }
  /**
   * Create an enhanced request with path parameters extracted.
   *
   * @param request - The original request
   * @param pattern - The route pattern to extract params from
   * @returns An enhanced request with params property
   */
  createRequest(request, pattern) {
    const url = new URL(request.url);
    const params = this.extractParams(pattern, url.pathname);
    const enhancedRequest = Object.assign(request, { params });
    return enhancedRequest;
  }
  /**
   * Check if a path matches a route pattern.
   * Supports simple patterns like "/api/users/:id" and wildcards like "/api/*"
   */
  pathMatches(pattern, path) {
    if (pattern === path) return true;
    const patternParts = pattern.split("/");
    const pathParts = path.split("/");
    const lastPatternPart = patternParts[patternParts.length - 1];
    if (lastPatternPart?.startsWith("*")) {
      for (let i = 0; i < patternParts.length - 1; i++) {
        const patternPart = patternParts[i];
        const pathPart = pathParts[i];
        if (patternPart?.startsWith(":")) continue;
        if (patternPart !== pathPart) return false;
      }
      return pathParts.length >= patternParts.length;
    }
    if (patternParts.length !== pathParts.length) return false;
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      if (patternPart?.startsWith(":")) continue;
      if (patternPart !== pathPart) return false;
    }
    return true;
  }
  /**
   * Extract path parameters from a request.
   * Supports named parameters (e.g., ":id") and wildcards (e.g., "*path").
   */
  extractParams(pattern, path) {
    const params = {};
    const patternParts = pattern.split("/");
    const pathParts = path.split("/");
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      if (patternPart?.startsWith(":") && pathPart) {
        const paramName = patternPart.slice(1);
        params[paramName] = pathPart;
      } else if (patternPart?.startsWith("*")) {
        const paramName = patternPart.slice(1) || "wildcard";
        params[paramName] = pathParts.slice(i).join("/");
        break;
      }
    }
    return params;
  }
};
function httpRouter() {
  return new HttpRouter();
}
function httpAction(handler) {
  return {
    _type: "httpAction",
    _config: {
      path: "",
      method: "GET",
      handler
    }
  };
}

// src/server/schema.ts
var RESERVED_INDEX_NAMES = /* @__PURE__ */ new Set(["by_creation_time", "by_id"]);
var VALID_INDEX_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
var ARRAY_ELEMENT_ACCESS_PATTERN = /\[\d+\]/;
function validateIndexName(name) {
  if (name === "") {
    throw new Error("Invalid index name: name cannot be empty");
  }
  if (name.trim() === "") {
    throw new Error("Invalid index name: name cannot be whitespace-only");
  }
  if (name.startsWith("_")) {
    throw new Error(`Index name "${name}" cannot start with an underscore`);
  }
  if (/^\d/.test(name)) {
    throw new Error(`Index name "${name}" cannot start with a number`);
  }
  if (!VALID_INDEX_NAME_PATTERN.test(name)) {
    throw new Error(`Index name "${name}" contains invalid characters. Only letters, numbers, and underscores are allowed`);
  }
  if (RESERVED_INDEX_NAMES.has(name)) {
    throw new Error(`Index name "${name}" is reserved and cannot be used`);
  }
}
function validateFieldPath(fieldPath, documentSchema) {
  if (fieldPath === "") {
    throw new Error("Index field name cannot be empty");
  }
  if (fieldPath.trim() === "") {
    throw new Error("Index field name cannot be whitespace-only");
  }
  if (ARRAY_ELEMENT_ACCESS_PATTERN.test(fieldPath)) {
    throw new Error(`Array element access is not supported in index fields: "${fieldPath}"`);
  }
  const pathParts = fieldPath.split(".");
  let currentSchema = documentSchema;
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    if (!currentSchema || !(part in currentSchema)) {
      const fullPath = pathParts.slice(0, i + 1).join(".");
      throw new Error(`Field "${fullPath}" does not exist in document schema`);
    }
    const validator = currentSchema[part];
    if (i < pathParts.length - 1) {
      const validatorAny = validator;
      let innerShape = validatorAny.shape;
      if (!innerShape && "isOptional" in validator && validator.isOptional) {
        const optionalInner = validator.inner;
        if (optionalInner) {
          innerShape = optionalInner.shape;
        }
      }
      if (!innerShape) {
        throw new Error(`Cannot access nested field "${pathParts[i + 1]}" on non-object field "${pathParts.slice(0, i + 1).join(".")}"`);
      }
      currentSchema = innerShape;
    }
  }
}
function validateIndexFields(fields, documentSchema) {
  if (fields.length === 0) {
    throw new Error("Index must have at least one field");
  }
  const seenFields = /* @__PURE__ */ new Set();
  for (const field of fields) {
    const fieldName = typeof field === "string" ? field : field.field;
    if (seenFields.has(fieldName)) {
      throw new Error(`Duplicate field "${fieldName}" in index`);
    }
    seenFields.add(fieldName);
    validateFieldPath(fieldName, documentSchema);
  }
}
var TableBuilder = class _TableBuilder {
  document;
  indexes = {};
  searchIndexes = {};
  vectorIndexes = {};
  constructor(document) {
    this.document = document;
    this.initConfig();
  }
  /**
   * Define an index on the table.
   *
   * @example
   * ```typescript
   * defineTable({
   *   channel: v.id("channels"),
   *   body: v.string(),
   *   author: v.id("users"),
   * })
   *   .index("by_channel", ["channel"])
   *   .index("by_author", ["author", "channel"])
   * ```
   */
  index(name, fields, options) {
    validateIndexName(name);
    if (name in this.indexes) {
      throw new Error(`Duplicate index: "${name}" already exists on this table`);
    }
    validateIndexFields(fields, this.document);
    const indexConfig = {
      fields
    };
    if (options?.unique !== void 0) {
      indexConfig.unique = options.unique;
    }
    if (options?.sparse !== void 0) {
      indexConfig.sparse = options.sparse;
    }
    this.indexes[name] = indexConfig;
    return this;
  }
  /**
   * Define a search index for full-text search.
   *
   * @example
   * ```typescript
   * defineTable({
   *   title: v.string(),
   *   body: v.string(),
   *   category: v.string(),
   * })
   *   .searchIndex("search_body", {
   *     searchField: "body",
   *     filterFields: ["category"],
   *   })
   * ```
   */
  searchIndex(name, config) {
    if (!name || name.trim() === "") {
      throw new Error("Search index name is required and cannot be empty");
    }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error(`Invalid search index name "${name}": name must contain only alphanumeric characters and underscores`);
    }
    if (this.searchIndexes[name]) {
      throw new Error(`Duplicate search index name "${name}": a search index with this name already exists`);
    }
    if (!config || config.searchField === void 0 || config.searchField === null) {
      throw new Error("searchField is required for search index configuration");
    }
    if (typeof config.searchField !== "string" || config.searchField.trim() === "") {
      throw new Error("searchField must be a non-empty string");
    }
    const searchField = config.searchField;
    const fieldValidator = this.resolveFieldPathForSearch(searchField);
    if (!this.isStringType(fieldValidator)) {
      throw new Error(`searchField "${searchField}" must reference a string type field, got ${fieldValidator.describe()}`);
    }
    if (config.filterFields) {
      for (const filterField of config.filterFields) {
        if (filterField === searchField) {
          throw new Error(`searchField "${searchField}" cannot also be in filterFields`);
        }
        this.resolveFieldPathForSearch(filterField);
      }
    }
    this.searchIndexes[name] = config;
    return this;
  }
  /**
   * Resolve a field path (including dot notation for nested fields) to a validator.
   * @throws Error if the path doesn't exist or goes through non-object types
   */
  resolveFieldPathForSearch(fieldPath) {
    const pathParts = fieldPath.split(".");
    let currentSchema = this.document;
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (!currentSchema || !(part in currentSchema)) {
        const fullPath = pathParts.slice(0, i + 1).join(".");
        throw new Error(`Field "${fullPath}" does not exist in the document schema`);
      }
      const validator = currentSchema[part];
      if (i === pathParts.length - 1) {
        return validator;
      }
      const validatorAny = validator;
      let innerShape = validatorAny.shape;
      if (!innerShape && "isOptional" in validator && validator.isOptional) {
        const optionalInner = validator.inner;
        if (optionalInner) {
          innerShape = optionalInner.shape;
        }
      }
      if (!innerShape) {
        throw new Error(`Cannot access nested property "${pathParts.slice(i + 1).join(".")}" on non-object field "${pathParts.slice(0, i + 1).join(".")}"`);
      }
      currentSchema = innerShape;
    }
    throw new Error(`Field "${fieldPath}" does not exist in the document schema`);
  }
  /**
   * Check if a validator represents a string type (including optional<string>).
   */
  isStringType(validator) {
    const desc = validator.describe();
    if (desc === "string") {
      return true;
    }
    if (desc === "string | undefined") {
      return true;
    }
    return false;
  }
  /**
   * Check if a validator represents an array type (including optional<array>).
   */
  isArrayType(validator) {
    const desc = validator.describe();
    if (desc.includes("[]")) {
      return true;
    }
    return false;
  }
  /**
   * Define a vector index for similarity search.
   *
   * @example
   * ```typescript
   * defineTable({
   *   text: v.string(),
   *   embedding: v.array(v.float64()),
   *   category: v.string(),
   * })
   *   .vectorIndex("by_embedding", {
   *     vectorField: "embedding",
   *     dimensions: 1536,
   *     filterFields: ["category"],
   *   })
   * ```
   */
  vectorIndex(name, config) {
    if (!name || name.trim() === "") {
      throw new Error("Vector index name is required and cannot be empty");
    }
    if (this.vectorIndexes[name]) {
      throw new Error(`Duplicate vector index: "${name}" already exists on this table`);
    }
    if (!(config.vectorField in this.document)) {
      throw new Error(`Field "${config.vectorField}" does not exist in the document schema`);
    }
    const vectorFieldValidator = this.document[config.vectorField];
    if (!this.isArrayType(vectorFieldValidator)) {
      throw new Error(`Vector field "${config.vectorField}" must be an array type, got ${vectorFieldValidator.describe()}`);
    }
    if (config.dimensions <= 0) {
      throw new Error(`Invalid dimensions: must be a positive number, got ${config.dimensions}`);
    }
    if (config.filterFields) {
      for (const filterField of config.filterFields) {
        if (!(filterField in this.document)) {
          throw new Error(`Filter field "${filterField}" does not exist in the document schema`);
        }
      }
    }
    this.vectorIndexes[name] = config;
    return this;
  }
  /**
   * Validate a document against the table schema.
   */
  validate(doc) {
    const errors = [];
    if (typeof doc !== "object" || doc === null) {
      return {
        valid: false,
        errors: ["Document must be an object"]
      };
    }
    const docObj = doc;
    const validateNested = (obj, schema, path = "") => {
      for (const [key, validator] of Object.entries(schema)) {
        const currentPath = path ? `${path}.${key}` : key;
        const value = obj[key];
        if (value === void 0) {
          if (!validator.isOptional) {
            errors.push(`Missing required field: ${currentPath}`);
          }
          continue;
        }
        try {
          validator.parse(value);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          errors.push({ path: currentPath, message });
        }
      }
    };
    validateNested(docObj, this.document);
    return {
      valid: errors.length === 0,
      errors
    };
  }
  /**
   * Return table definition with system fields included.
   */
  withSystemFields() {
    const systemFields = {
      _id: v.string(),
      _creationTime: v.number()
    };
    const newDocument = {
      ...this.document,
      ...systemFields
    };
    const builder = new _TableBuilder(newDocument);
    Object.assign(builder.indexes, this.indexes);
    Object.assign(builder.searchIndexes, this.searchIndexes);
    Object.assign(builder.vectorIndexes, this.vectorIndexes);
    return builder;
  }
  /**
   * Convert table definition to JSON representation.
   */
  toJSON() {
    const documentJson = {};
    for (const [key, validator] of Object.entries(this.document)) {
      const desc = validator.describe().toLowerCase();
      let type = "unknown";
      if (desc === "string") type = "string";
      else if (desc === "number") type = "number";
      else if (desc === "boolean") type = "boolean";
      else if (desc === "null") type = "null";
      else if (desc === "int64") type = "int64";
      else if (desc === "float64") type = "float64";
      else if (desc === "bytes") type = "bytes";
      else if (desc.includes("[]")) type = "array";
      else if (desc.startsWith("{")) type = "object";
      else if (desc.startsWith("v.id")) type = "id";
      else type = desc;
      documentJson[key] = { type };
    }
    return {
      document: documentJson,
      indexes: { ...this.indexes },
      searchIndexes: { ...this.searchIndexes },
      vectorIndexes: { ...this.vectorIndexes }
    };
  }
  /**
   * Export schema definition compatible with Convex.
   */
  export() {
    return {
      document: this.document,
      indexes: { ...this.indexes },
      searchIndexes: { ...this.searchIndexes },
      vectorIndexes: { ...this.vectorIndexes }
    };
  }
  /**
   * Generate code string representation.
   */
  toCode() {
    const lines = ["defineTable({"];
    for (const [key, validator] of Object.entries(this.document)) {
      const desc = validator.describe();
      let typeStr = "v.unknown()";
      if (desc === "string") typeStr = "v.string()";
      else if (desc === "number") typeStr = "v.number()";
      else if (desc === "boolean") typeStr = "v.boolean()";
      else if (desc === "null") typeStr = "v.null()";
      else if (desc === "int64") typeStr = "v.int64()";
      else if (desc === "float64") typeStr = "v.float64()";
      else if (desc === "bytes") typeStr = "v.bytes()";
      else if (desc.includes("[]")) {
        const innerType = desc.replace("[]", "");
        typeStr = `v.array(v.${innerType}())`;
      } else if (desc.startsWith("v.id")) typeStr = desc;
      else typeStr = `v.${desc}()`;
      lines.push(`  ${key}: ${typeStr},`);
    }
    lines.push("})");
    for (const [name, config] of Object.entries(this.indexes)) {
      const fieldsStr = JSON.stringify(config.fields);
      lines[lines.length - 1] = lines[lines.length - 1] + `
  .index('${name}', ${fieldsStr})`;
    }
    for (const [name, config] of Object.entries(this.searchIndexes)) {
      lines[lines.length - 1] = lines[lines.length - 1] + `
  .searchIndex('${name}', ${JSON.stringify(config)})`;
    }
    for (const [name, config] of Object.entries(this.vectorIndexes)) {
      lines[lines.length - 1] = lines[lines.length - 1] + `
  .vectorIndex('${name}', ${JSON.stringify(config)})`;
    }
    return lines.join("\n");
  }
  /**
   * Clone this table definition.
   */
  clone() {
    const clonedDoc = { ...this.document };
    const cloned = new _TableBuilder(clonedDoc);
    for (const [name, config] of Object.entries(this.indexes)) {
      cloned.indexes[name] = { fields: [...config.fields] };
    }
    for (const [name, config] of Object.entries(this.searchIndexes)) {
      cloned.searchIndexes[name] = {
        searchField: config.searchField,
        filterFields: config.filterFields ? [...config.filterFields] : void 0
      };
    }
    for (const [name, config] of Object.entries(this.vectorIndexes)) {
      cloned.vectorIndexes[name] = {
        vectorField: config.vectorField,
        dimensions: config.dimensions,
        filterFields: config.filterFields ? [...config.filterFields] : void 0
      };
    }
    if (this.metadata) {
      cloned.metadata = { ...this.metadata };
    }
    if (this._tableConfig) {
      cloned.config(this._tableConfig);
    }
    return cloned;
  }
  // Internal storage for metadata
  metadata;
  // Internal storage for table config
  _tableConfig;
  // Callable config that also acts as a property getter
  // This is a bit of a hack to satisfy the test's expectation of both
  // `table.config({...})` and `table.config.ttl`
  config;
  /**
   * Set table description.
   */
  description(desc) {
    this.metadata = this.metadata || {};
    this.metadata.description = desc;
    return this;
  }
  /**
   * Initialize config on construction.
   */
  initConfig() {
    const self = this;
    const configFn = function(cfg) {
      self._tableConfig = cfg;
      Object.assign(configFn, cfg);
      return self;
    };
    this.config = configFn;
  }
};
function defineTable(document) {
  return new TableBuilder(document);
}
var SchemaBuilder = class {
  tables;
  strictMode = true;
  schemaValidation = true;
  strictTableNameTypes = true;
  constructor(tables, options) {
    if (options?.schemaValidation !== void 0) {
      this.schemaValidation = options.schemaValidation;
    }
    if (options?.strictTableNameTypes !== void 0) {
      this.strictTableNameTypes = options.strictTableNameTypes;
    }
    if (options?.strict !== void 0) {
      this.strictMode = options.strict;
    }
    this.tables = tables;
  }
  /**
   * Allow documents in tables not defined in the schema.
   * By default, strict mode is enabled and unknown tables are rejected.
   */
  strict(enabled) {
    this.strictMode = enabled;
    return this;
  }
  /**
   * Convert schema to JSON representation.
   */
  toJSON() {
    return {
      tables: this.tables,
      schemaValidation: this.schemaValidation,
      strictTableNameTypes: this.strictTableNameTypes,
      strictMode: this.strictMode
    };
  }
};
var VALID_TABLE_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
function validateTableName(name) {
  if (name === "") {
    throw new Error("Table name cannot be empty");
  }
  if (name.startsWith("_")) {
    throw new Error(`Table name "${name}" cannot start with underscore (reserved for system tables)`);
  }
  if (/^[0-9]/.test(name)) {
    throw new Error(`Table name "${name}" cannot start with a number`);
  }
  if (!VALID_TABLE_NAME_PATTERN.test(name)) {
    throw new Error(`Table name "${name}" contains invalid characters (only letters, numbers, and underscores allowed)`);
  }
}
function validateTableDefinition(name, definition) {
  if (definition === null) {
    throw new Error(`Table "${name}" has null definition. Use defineTable() to create a valid table definition.`);
  }
  if (definition === void 0) {
    throw new Error(`Table "${name}" has undefined definition. Use defineTable() to create a valid table definition.`);
  }
  if (typeof definition === "string") {
    throw new Error(`Table "${name}" has string definition. Use defineTable() to create a valid table definition.`);
  }
  if (typeof definition === "number" || typeof definition === "boolean") {
    throw new Error(`Table "${name}" has primitive definition. Use defineTable() to create a valid table definition.`);
  }
  if (Array.isArray(definition)) {
    throw new Error(`Table "${name}" has array definition. Use defineTable() to create a valid table definition.`);
  }
  if (!(definition instanceof TableBuilder)) {
    throw new Error(`Table "${name}" has invalid definition. Use defineTable() to create a valid table definition.`);
  }
}
function validateSchemaOptions(options) {
  if (options.schemaValidation !== void 0 && typeof options.schemaValidation !== "boolean") {
    throw new Error("schemaValidation option must be a boolean");
  }
  if (options.strictTableNameTypes !== void 0 && typeof options.strictTableNameTypes !== "boolean") {
    throw new Error("strictTableNameTypes option must be a boolean");
  }
  if (options.strict !== void 0 && typeof options.strict !== "boolean") {
    throw new Error("strict option must be a boolean");
  }
}
function defineSchema(tables, options) {
  if (options) {
    validateSchemaOptions(options);
  }
  for (const [tableName, tableDefinition] of Object.entries(tables)) {
    validateTableName(tableName);
    validateTableDefinition(tableName, tableDefinition);
  }
  const schema = new SchemaBuilder(tables, options);
  Object.freeze(tables);
  for (const tableDefinition of Object.values(tables)) {
    Object.freeze(tableDefinition);
    if ("document" in tableDefinition) {
      Object.freeze(tableDefinition.document);
    }
    if ("indexes" in tableDefinition) {
      Object.freeze(tableDefinition.indexes);
    }
    if ("searchIndexes" in tableDefinition) {
      Object.freeze(tableDefinition.searchIndexes);
    }
    if ("vectorIndexes" in tableDefinition) {
      Object.freeze(tableDefinition.vectorIndexes);
    }
  }
  Object.freeze(schema);
  return schema;
}

// src/server/database/QueryBuilder.ts
var QueryBuilderImpl = class {
  tableName;
  indexName;
  indexFilters = [];
  filterExpressions = [];
  orderDirection = "asc";
  limitCount;
  // Database reference for execution
  dbFetch;
  constructor(tableName, dbFetch) {
    this.tableName = tableName;
    this.dbFetch = dbFetch;
  }
  withIndex(indexName, indexRange) {
    this.indexName = indexName;
    if (indexRange) {
      const builder = new IndexRangeBuilderImpl();
      indexRange(builder);
      this.indexFilters = builder.getFilters();
    }
    return this;
  }
  withSearchIndex(_indexName, _searchFilter) {
    throw new Error("Search indexes not yet implemented");
  }
  filter(predicate) {
    const builder = new FilterBuilderImpl();
    const expression = predicate(builder);
    this.filterExpressions.push(expression);
    return this;
  }
  order(order) {
    this.orderDirection = order;
    return this;
  }
  async collect() {
    const results = await this.dbFetch(this);
    return results;
  }
  async first() {
    this.limitCount = 1;
    const results = await this.collect();
    return results[0] || null;
  }
  async unique() {
    this.limitCount = 2;
    const results = await this.collect();
    if (results.length > 1) {
      throw new Error(`Expected at most one result, got ${results.length}`);
    }
    return results[0] || null;
  }
  async take(n) {
    this.limitCount = n;
    return this.collect();
  }
  async paginate(paginationOpts) {
    this.limitCount = paginationOpts.numItems + 1;
    const results = await this.collect();
    const isDone = results.length <= paginationOpts.numItems;
    const page = results.slice(0, paginationOpts.numItems);
    const lastItem = page[page.length - 1];
    const continueCursor = lastItem ? btoa(JSON.stringify({ id: lastItem._id })) : "";
    return {
      page,
      isDone,
      continueCursor
    };
  }
  // Internal getters for execution
  getTableName() {
    return this.tableName;
  }
  getIndexName() {
    return this.indexName;
  }
  getIndexFilters() {
    return this.indexFilters;
  }
  getFilterExpressions() {
    return this.filterExpressions;
  }
  getOrder() {
    return this.orderDirection;
  }
  getLimit() {
    return this.limitCount;
  }
};
var IndexRangeBuilderImpl = class {
  filters = [];
  eq(field, value) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }
  lt(field, value) {
    this.filters.push({ field, op: "lt", value });
    return this;
  }
  lte(field, value) {
    this.filters.push({ field, op: "lte", value });
    return this;
  }
  gt(field, value) {
    this.filters.push({ field, op: "gt", value });
    return this;
  }
  gte(field, value) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }
  getFilters() {
    return this.filters;
  }
};
var FilterBuilderImpl = class {
  eq(field, value) {
    return { _brand: "FilterExpression", type: "eq", field, value };
  }
  neq(field, value) {
    return { _brand: "FilterExpression", type: "neq", field, value };
  }
  lt(field, value) {
    return { _brand: "FilterExpression", type: "lt", field, value };
  }
  lte(field, value) {
    return { _brand: "FilterExpression", type: "lte", field, value };
  }
  gt(field, value) {
    return { _brand: "FilterExpression", type: "gt", field, value };
  }
  gte(field, value) {
    return { _brand: "FilterExpression", type: "gte", field, value };
  }
  and(...filters) {
    return { _brand: "FilterExpression", type: "and", filters };
  }
  or(...filters) {
    return { _brand: "FilterExpression", type: "or", filters };
  }
  not(filter) {
    return { _brand: "FilterExpression", type: "not", filter };
  }
};

// src/server/queryBuilder.ts
var QueryBuilderImpl2 = class {
  tableName;
  indexName;
  indexFilters = [];
  filterExpressions = [];
  orderDirection = "asc";
  limitCount;
  // Database reference for execution
  dbFetch;
  constructor(tableName, dbFetch) {
    this.tableName = tableName;
    this.dbFetch = dbFetch;
  }
  withIndex(indexName, indexRange) {
    this.indexName = indexName;
    if (indexRange) {
      const builder = new IndexRangeBuilderImpl2();
      indexRange(builder);
      this.indexFilters = builder.getFilters();
    }
    return this;
  }
  withSearchIndex(_indexName, _searchFilter) {
    throw new Error("Search indexes not yet implemented");
  }
  filter(predicate) {
    const builder = new FilterBuilderImpl2();
    const expression = predicate(builder);
    this.filterExpressions.push(expression);
    return this;
  }
  order(order) {
    this.orderDirection = order;
    return this;
  }
  async collect() {
    const results = await this.dbFetch(this);
    return results;
  }
  async first() {
    this.limitCount = 1;
    const results = await this.collect();
    return results[0] || null;
  }
  async unique() {
    this.limitCount = 2;
    const results = await this.collect();
    if (results.length > 1) {
      throw new Error(`Expected at most one result, got ${results.length}`);
    }
    return results[0] || null;
  }
  async take(n) {
    this.limitCount = n;
    return this.collect();
  }
  async paginate(paginationOpts) {
    this.limitCount = paginationOpts.numItems + 1;
    const results = await this.collect();
    const isDone = results.length <= paginationOpts.numItems;
    const page = results.slice(0, paginationOpts.numItems);
    const lastItem = page[page.length - 1];
    const continueCursor = lastItem ? btoa(JSON.stringify({ id: lastItem._id })) : "";
    return {
      page,
      isDone,
      continueCursor
    };
  }
  // Internal getters for execution
  getTableName() {
    return this.tableName;
  }
  getIndexName() {
    return this.indexName;
  }
  getIndexFilters() {
    return this.indexFilters;
  }
  getOrder() {
    return this.orderDirection;
  }
  getLimit() {
    return this.limitCount;
  }
  getFilterExpressions() {
    return this.filterExpressions;
  }
};
var IndexRangeBuilderImpl2 = class {
  filters = [];
  eq(field, value) {
    this.filters.push({ field, op: "eq", value });
    return this;
  }
  lt(field, value) {
    this.filters.push({ field, op: "lt", value });
    return this;
  }
  lte(field, value) {
    this.filters.push({ field, op: "lte", value });
    return this;
  }
  gt(field, value) {
    this.filters.push({ field, op: "gt", value });
    return this;
  }
  gte(field, value) {
    this.filters.push({ field, op: "gte", value });
    return this;
  }
  getFilters() {
    return this.filters;
  }
};
var FilterBuilderImpl2 = class {
  eq(field, value) {
    return { _brand: "FilterExpression", type: "eq", field, value };
  }
  neq(field, value) {
    return { _brand: "FilterExpression", type: "neq", field, value };
  }
  lt(field, value) {
    return { _brand: "FilterExpression", type: "lt", field, value };
  }
  lte(field, value) {
    return { _brand: "FilterExpression", type: "lte", field, value };
  }
  gt(field, value) {
    return { _brand: "FilterExpression", type: "gt", field, value };
  }
  gte(field, value) {
    return { _brand: "FilterExpression", type: "gte", field, value };
  }
  and(...filters) {
    return { _brand: "FilterExpression", type: "and", filters };
  }
  or(...filters) {
    return { _brand: "FilterExpression", type: "or", filters };
  }
  not(filter) {
    return { _brand: "FilterExpression", type: "not", filter };
  }
};

// src/server/database/DatabaseReader.ts
var DatabaseReader = class {
  storage;
  constructor(storage) {
    this.storage = storage;
  }
  /**
   * Get a document by ID
   */
  async get(id) {
    return this.storage.getDocument(id);
  }
  /**
   * Start building a query for a table
   */
  query(tableName) {
    const dbFetch = async (query2) => {
      const options = {
        indexName: query2.getIndexName(),
        indexFilters: query2.getIndexFilters(),
        filters: query2.getFilterExpressions(),
        order: query2.getOrder(),
        limit: query2.getLimit()
      };
      return this.storage.queryDocuments(tableName, options);
    };
    return new QueryBuilderImpl2(tableName, dbFetch);
  }
  /**
   * Normalize a string to a valid ID for a table
   * Returns null if the string is not a valid ID format
   */
  normalizeId(tableName, id) {
    if (typeof id !== "string") {
      return null;
    }
    if (id === "" || id.trim() === "") {
      return null;
    }
    const VALID_ID_PATTERN2 = /^[a-zA-Z0-9_-]+$/;
    if (!VALID_ID_PATTERN2.test(id)) {
      return null;
    }
    const MAX_ID_LENGTH2 = 128;
    if (id.length > MAX_ID_LENGTH2) {
      return null;
    }
    return id;
  }
};
var InMemoryStorage = class {
  documents = /* @__PURE__ */ new Map();
  async getDocument(id) {
    return this.documents.get(id) || null;
  }
  async queryDocuments(tableName, options) {
    let results = [];
    for (const [id, doc] of this.documents) {
      if (id.startsWith(`${tableName}_`)) {
        results.push(doc);
      }
    }
    if (options?.indexFilters && options.indexFilters.length > 0) {
      results = results.filter((doc) => {
        return options.indexFilters.every((filter) => {
          const value = doc[filter.field];
          return this.evaluateFilter(value, filter.op, filter.value);
        });
      });
    }
    if (options?.filters && options.filters.length > 0) {
      for (const filter of options.filters) {
        results = results.filter((doc) => this.evaluateFilterExpression(doc, filter));
      }
    }
    const order = options?.order || "asc";
    results.sort((a, b) => {
      if (order === "asc") {
        return a._creationTime - b._creationTime;
      } else {
        return b._creationTime - a._creationTime;
      }
    });
    if (options?.limit !== void 0) {
      results = results.slice(0, options.limit);
    }
    return results;
  }
  /**
   * Evaluate a filter operation
   */
  evaluateFilter(value, op, target) {
    switch (op) {
      case "eq":
        return value === target;
      case "neq":
        return value !== target;
      case "lt":
        return value < target;
      case "lte":
        return value <= target;
      case "gt":
        return value > target;
      case "gte":
        return value >= target;
      default:
        return false;
    }
  }
  /**
   * Evaluate a filter expression
   */
  evaluateFilterExpression(doc, filter) {
    const filterObj = filter;
    switch (filterObj.type) {
      case "eq":
        return doc[filterObj.field] === filterObj.value;
      case "neq":
        return doc[filterObj.field] !== filterObj.value;
      case "lt":
        return doc[filterObj.field] < filterObj.value;
      case "lte":
        return doc[filterObj.field] <= filterObj.value;
      case "gt":
        return doc[filterObj.field] > filterObj.value;
      case "gte":
        return doc[filterObj.field] >= filterObj.value;
      case "and":
        return filterObj.filters.every((f) => this.evaluateFilterExpression(doc, f));
      case "or":
        return filterObj.filters.some((f) => this.evaluateFilterExpression(doc, f));
      case "not":
        return !this.evaluateFilterExpression(doc, filterObj.filter);
      default:
        return true;
    }
  }
  /**
   * Add a document to storage (for testing)
   */
  addDocument(id, doc) {
    this.documents.set(id, doc);
  }
  /**
   * Clear all documents (for testing)
   */
  clear() {
    this.documents.clear();
  }
};

// src/server/database/DatabaseWriter.ts
var SYSTEM_FIELDS = ["_id", "_creationTime"];
var DatabaseWriter = class extends DatabaseReader {
  storage;
  constructor(storage) {
    super(storage);
    this.storage = storage;
  }
  /**
   * Override get() to work with our storage implementation
   */
  async get(id) {
    const tableName = this.extractTableFromId(id);
    const doc = this.storage.getDocument(tableName, id);
    return doc;
  }
  /**
   * Insert a new document into a table.
   * Returns the generated document ID.
   *
   * @throws {Error} If document contains system fields or invalid values
   */
  async insert(tableName, document) {
    this.validateNoSystemFields(document, "insert");
    this.validateDocumentValues(document);
    const id = this.generateId(tableName);
    const fullDocument = {
      ...document,
      _id: id,
      _creationTime: Date.now()
    };
    this.storage.saveDocument(tableName, id, fullDocument);
    return id;
  }
  /**
   * Update specific fields of a document.
   * Merges the provided fields with the existing document.
   *
   * @throws {Error} If document not found, no fields provided, or attempting to modify system fields
   */
  async patch(id, fields) {
    if (Object.keys(fields).length === 0) {
      throw new Error("patch() requires at least one field to update");
    }
    this.validateNoSystemFields(fields, "patch");
    this.validateDocumentValues(fields);
    const tableName = this.extractTableFromId(id);
    const existingDoc = this.storage.getDocument(tableName, id);
    if (!existingDoc) {
      throw new Error(`Document with ID ${id} not found`);
    }
    const updatedDoc = {
      ...existingDoc,
      ...fields
    };
    this.storage.saveDocument(tableName, id, updatedDoc);
  }
  /**
   * Replace a document entirely.
   * All old fields except system fields are removed.
   *
   * @throws {Error} If document not found or attempting to modify system fields
   */
  async replace(id, document) {
    this.validateNoSystemFields(document, "replace");
    this.validateDocumentValues(document);
    const tableName = this.extractTableFromId(id);
    const existingDoc = this.storage.getDocument(tableName, id);
    if (!existingDoc) {
      throw new Error(`Document with ID ${id} not found`);
    }
    const newDoc = {
      ...document,
      _id: existingDoc._id,
      _creationTime: existingDoc._creationTime
    };
    this.storage.saveDocument(tableName, id, newDoc);
  }
  /**
   * Delete a document.
   * This operation is idempotent - deleting a non-existent document does not throw.
   */
  async delete(id) {
    const tableName = this.extractTableFromId(id);
    this.storage.deleteDocument(tableName, id);
  }
  /**
   * Validate that document doesn't contain system fields
   */
  validateNoSystemFields(document, operation) {
    for (const field of SYSTEM_FIELDS) {
      if (field in document) {
        throw new Error(
          `System field '${field}' cannot be modified. System fields are auto-generated and read-only.`
        );
      }
    }
  }
  /**
   * Validate document values according to Convex value system
   */
  validateDocumentValues(document) {
    for (const [key, value] of Object.entries(document)) {
      this.validateValue(value, key);
    }
  }
  /**
   * Recursively validate a value
   */
  validateValue(value, path) {
    if (value === void 0) {
      throw new Error(
        `Invalid value at '${path}': undefined is not allowed. Use null for optional fields.`
      );
    }
    if (typeof value === "number" && isNaN(value)) {
      throw new Error(
        `Invalid value at '${path}': NaN is not allowed.`
      );
    }
    if (value === Infinity || value === -Infinity) {
      throw new Error(
        `Invalid value at '${path}': Infinity is not allowed.`
      );
    }
    if (typeof value === "function") {
      throw new Error(
        `Invalid value at '${path}': function is not allowed.`
      );
    }
    if (typeof value === "symbol") {
      throw new Error(
        `Invalid value at '${path}': symbol is not allowed.`
      );
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        this.validateValue(item, `${path}[${index}]`);
      });
    }
    if (value !== null && typeof value === "object" && value.constructor === Object) {
      for (const [key, val] of Object.entries(value)) {
        this.validateValue(val, `${path}.${key}`);
      }
    }
  }
  /**
   * Generate a unique ID for a document
   */
  generateId(tableName) {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const base64 = this.arrayBufferToBase64Url(randomBytes.buffer);
    const id = `${tableName}_${base64}`;
    return id;
  }
  /**
   * Convert ArrayBuffer to base64url string
   */
  arrayBufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
  /**
   * Extract table name from document ID
   */
  extractTableFromId(id) {
    const parts = id.split("_");
    if (parts.length < 2) {
      throw new Error(`Invalid document ID format: ${id}`);
    }
    return parts[0];
  }
};

// src/server/context/QueryCtx.ts
var DatabaseReaderImpl = class {
  /**
   * Get a document by ID.
   */
  async get(id) {
    throw new Error("DatabaseReader.get() must be implemented by runtime");
  }
  /**
   * Start building a query for a table.
   */
  query(tableName) {
    return new QueryBuilderImpl2(tableName, async (query2) => {
      throw new Error("Query execution must be implemented by runtime");
    });
  }
  /**
   * Normalize a string to a valid ID for a table.
   * Returns null if the string is not a valid ID.
   */
  normalizeId(tableName, id) {
    throw new Error("DatabaseReader.normalizeId() must be implemented by runtime");
  }
  /**
   * System table access for scheduled functions.
   */
  system = {
    get: async (id) => {
      throw new Error("DatabaseReader.system.get() must be implemented by runtime");
    },
    query: (tableName) => {
      return new QueryBuilderImpl2(tableName, async (query2) => {
        throw new Error("Query execution must be implemented by runtime");
      });
    }
  };
};
var AuthImpl = class {
  /**
   * Get the identity of the authenticated user.
   * Returns null if not authenticated.
   */
  async getUserIdentity() {
    throw new Error("Auth.getUserIdentity() must be implemented by runtime");
  }
};
var StorageReaderImpl = class {
  /**
   * Get a URL for downloading a file.
   */
  async getUrl(storageId) {
    throw new Error("StorageReader.getUrl() must be implemented by runtime");
  }
  /**
   * Get metadata for a stored file.
   */
  async getMetadata(storageId) {
    throw new Error("StorageReader.getMetadata() must be implemented by runtime");
  }
};
var QueryCtxImpl = class {
  /** Read-only database access */
  db;
  /** Authentication context */
  auth;
  /** Read-only storage access */
  storage;
  constructor(db, auth, storage) {
    this.db = db || new DatabaseReaderImpl();
    this.auth = auth || new AuthImpl();
    this.storage = storage || new StorageReaderImpl();
  }
};
function createQueryCtx(db, auth, storage) {
  return new QueryCtxImpl(db, auth, storage);
}
function createDefaultQueryCtx() {
  return new QueryCtxImpl();
}

// src/server/context/MutationCtx.ts
function createMutationCtx(db, auth, storage, scheduler) {
  return {
    db,
    auth,
    storage,
    scheduler
  };
}
function validateMutationCtx(ctx) {
  if (!ctx || typeof ctx !== "object") {
    throw new Error("MutationCtx must be an object");
  }
  const mutationCtx = ctx;
  if (!mutationCtx.db || typeof mutationCtx.db !== "object") {
    throw new Error("MutationCtx.db is required and must be a DatabaseWriter");
  }
  if (!mutationCtx.auth || typeof mutationCtx.auth !== "object") {
    throw new Error("MutationCtx.auth is required and must be an Auth instance");
  }
  if (!mutationCtx.storage || typeof mutationCtx.storage !== "object") {
    throw new Error("MutationCtx.storage is required and must be a StorageWriter");
  }
  if (!mutationCtx.scheduler || typeof mutationCtx.scheduler !== "object") {
    throw new Error("MutationCtx.scheduler is required and must be a Scheduler");
  }
  return true;
}
function validateDatabaseWriter(db) {
  if (!db || typeof db !== "object") {
    throw new Error("DatabaseWriter must be an object");
  }
  const dbWriter = db;
  if (typeof dbWriter.get !== "function") {
    throw new Error("DatabaseWriter.get must be a function");
  }
  if (typeof dbWriter.query !== "function") {
    throw new Error("DatabaseWriter.query must be a function");
  }
  if (typeof dbWriter.normalizeId !== "function") {
    throw new Error("DatabaseWriter.normalizeId must be a function");
  }
  if (typeof dbWriter.insert !== "function") {
    throw new Error("DatabaseWriter.insert must be a function");
  }
  if (typeof dbWriter.patch !== "function") {
    throw new Error("DatabaseWriter.patch must be a function");
  }
  if (typeof dbWriter.replace !== "function") {
    throw new Error("DatabaseWriter.replace must be a function");
  }
  if (typeof dbWriter.delete !== "function") {
    throw new Error("DatabaseWriter.delete must be a function");
  }
  return true;
}
function validateStorageWriter(storage) {
  if (!storage || typeof storage !== "object") {
    throw new Error("StorageWriter must be an object");
  }
  const storageWriter = storage;
  if (typeof storageWriter.getUrl !== "function") {
    throw new Error("StorageWriter.getUrl must be a function");
  }
  if (typeof storageWriter.getMetadata !== "function") {
    throw new Error("StorageWriter.getMetadata must be a function");
  }
  if (typeof storageWriter.generateUploadUrl !== "function") {
    throw new Error("StorageWriter.generateUploadUrl must be a function");
  }
  if (typeof storageWriter.store !== "function") {
    throw new Error("StorageWriter.store must be a function");
  }
  if (typeof storageWriter.delete !== "function") {
    throw new Error("StorageWriter.delete must be a function");
  }
  return true;
}
function validateScheduler(scheduler) {
  if (!scheduler || typeof scheduler !== "object") {
    throw new Error("Scheduler must be an object");
  }
  const schedulerObj = scheduler;
  if (typeof schedulerObj.runAfter !== "function") {
    throw new Error("Scheduler.runAfter must be a function");
  }
  if (typeof schedulerObj.runAt !== "function") {
    throw new Error("Scheduler.runAt must be a function");
  }
  if (typeof schedulerObj.cancel !== "function") {
    throw new Error("Scheduler.cancel must be a function");
  }
  return true;
}
function validateAuth(auth) {
  if (!auth || typeof auth !== "object") {
    throw new Error("Auth must be an object");
  }
  const authObj = auth;
  if (typeof authObj.getUserIdentity !== "function") {
    throw new Error("Auth.getUserIdentity must be a function");
  }
  return true;
}
function createValidatedMutationCtx(db, auth, storage, scheduler) {
  validateDatabaseWriter(db);
  validateAuth(auth);
  validateStorageWriter(storage);
  validateScheduler(scheduler);
  return createMutationCtx(db, auth, storage, scheduler);
}

// src/server/context/ActionCtx.ts
function createActionCtx(auth, storage, scheduler, runQuery, runMutation, runAction, vectorSearch) {
  return {
    auth,
    storage,
    scheduler,
    runQuery,
    runMutation,
    runAction,
    vectorSearch
  };
}
function validateActionCtx(ctx) {
  if (!ctx || typeof ctx !== "object") {
    throw new Error("ActionCtx must be an object");
  }
  const actionCtx = ctx;
  if (!actionCtx.auth || typeof actionCtx.auth !== "object") {
    throw new Error("ActionCtx.auth is required and must be an Auth instance");
  }
  if (!actionCtx.storage || typeof actionCtx.storage !== "object") {
    throw new Error("ActionCtx.storage is required and must be a StorageReader");
  }
  if (!actionCtx.scheduler || typeof actionCtx.scheduler !== "object") {
    throw new Error("ActionCtx.scheduler is required and must be a Scheduler");
  }
  if (typeof actionCtx.runQuery !== "function") {
    throw new Error("ActionCtx.runQuery is required and must be a function");
  }
  if (typeof actionCtx.runMutation !== "function") {
    throw new Error("ActionCtx.runMutation is required and must be a function");
  }
  if (typeof actionCtx.runAction !== "function") {
    throw new Error("ActionCtx.runAction is required and must be a function");
  }
  if (typeof actionCtx.vectorSearch !== "function") {
    throw new Error("ActionCtx.vectorSearch is required and must be a function");
  }
  return true;
}
function validateAuth2(auth) {
  if (!auth || typeof auth !== "object") {
    throw new Error("Auth must be an object");
  }
  const authObj = auth;
  if (typeof authObj.getUserIdentity !== "function") {
    throw new Error("Auth.getUserIdentity must be a function");
  }
  return true;
}
function validateStorageReader(storage) {
  if (!storage || typeof storage !== "object") {
    throw new Error("StorageReader must be an object");
  }
  const storageReader = storage;
  if (typeof storageReader.getUrl !== "function") {
    throw new Error("StorageReader.getUrl must be a function");
  }
  if (typeof storageReader.getMetadata !== "function") {
    throw new Error("StorageReader.getMetadata must be a function");
  }
  return true;
}
function validateScheduler2(scheduler) {
  if (!scheduler || typeof scheduler !== "object") {
    throw new Error("Scheduler must be an object");
  }
  const schedulerObj = scheduler;
  if (typeof schedulerObj.runAfter !== "function") {
    throw new Error("Scheduler.runAfter must be a function");
  }
  if (typeof schedulerObj.runAt !== "function") {
    throw new Error("Scheduler.runAt must be a function");
  }
  if (typeof schedulerObj.cancel !== "function") {
    throw new Error("Scheduler.cancel must be a function");
  }
  return true;
}
function createValidatedActionCtx(auth, storage, scheduler, runQuery, runMutation, runAction, vectorSearch) {
  validateAuth2(auth);
  validateStorageReader(storage);
  validateScheduler2(scheduler);
  if (typeof runQuery !== "function") {
    throw new Error("runQuery must be a function");
  }
  if (typeof runMutation !== "function") {
    throw new Error("runMutation must be a function");
  }
  if (typeof runAction !== "function") {
    throw new Error("runAction must be a function");
  }
  if (typeof vectorSearch !== "function") {
    throw new Error("vectorSearch must be a function");
  }
  return createActionCtx(
    auth,
    storage,
    scheduler,
    runQuery,
    runMutation,
    runAction,
    vectorSearch
  );
}

// src/server/functions/registered.ts
function isQuery(fn) {
  return fn !== null && fn !== void 0 && typeof fn === "object" && "_type" in fn && fn._type === "query";
}
function isMutation(fn) {
  return fn !== null && fn !== void 0 && typeof fn === "object" && "_type" in fn && fn._type === "mutation";
}
function isAction(fn) {
  return fn !== null && fn !== void 0 && typeof fn === "object" && "_type" in fn && fn._type === "action";
}
function isRegisteredFunction(fn) {
  return isQuery(fn) || isMutation(fn) || isAction(fn);
}
function isPublicFunction(fn) {
  return isRegisteredFunction(fn) && fn._visibility === "public";
}
function isInternalFunction(fn) {
  return isRegisteredFunction(fn) && fn._visibility === "internal";
}
function getFunctionType(fn) {
  return fn._type;
}
function getFunctionVisibility(fn) {
  return fn._visibility;
}
function getArgsValidator(fn) {
  return fn._config.args;
}
function getReturnsValidator(fn) {
  return fn._config.returns;
}
function getFunctionHandler(fn) {
  return fn._config.handler;
}

// src/server/functions/registry.ts
var FunctionRegistryError = class _FunctionRegistryError extends Error {
  code;
  constructor(message, code) {
    super(message);
    this.name = "FunctionRegistryError";
    this.code = code;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, _FunctionRegistryError);
    }
  }
};
var FUNCTION_PATH_REGEX = /^[a-zA-Z0-9_]+([:/][a-zA-Z0-9_]+)*$/;
var HTTP_PATH_REGEX = /^\/[a-zA-Z0-9_/:.-]*$/;
function validateFunctionPath(path) {
  if (!path || path.trim() === "") {
    throw new FunctionRegistryError("Function path cannot be empty", "INVALID_PATH");
  }
  const trimmedPath = path.trim();
  if (!FUNCTION_PATH_REGEX.test(trimmedPath)) {
    throw new FunctionRegistryError(
      `Invalid function path: "${path}". Paths must be alphanumeric with underscores, separated by colons or slashes.`,
      "INVALID_PATH"
    );
  }
}
function validateHttpPath(path) {
  if (!path || path.trim() === "") {
    throw new FunctionRegistryError("HTTP path cannot be empty", "INVALID_PATH");
  }
  if (!path.startsWith("/")) {
    throw new FunctionRegistryError(
      `Invalid HTTP path: "${path}". HTTP paths must start with "/".`,
      "INVALID_PATH"
    );
  }
  if (!HTTP_PATH_REGEX.test(path)) {
    throw new FunctionRegistryError(
      `Invalid HTTP path: "${path}". HTTP paths must be valid URL paths.`,
      "INVALID_PATH"
    );
  }
}
var FunctionRegistry = class _FunctionRegistry {
  static instance = null;
  functionMap = /* @__PURE__ */ new Map();
  httpEndpoints = /* @__PURE__ */ new Map();
  /**
   * Private constructor to enforce singleton pattern.
   */
  constructor() {
  }
  /**
   * Get the singleton instance of the registry.
   */
  static getInstance() {
    if (!_FunctionRegistry.instance) {
      _FunctionRegistry.instance = new _FunctionRegistry();
    }
    return _FunctionRegistry.instance;
  }
  /**
   * Reset the singleton instance (for testing purposes).
   */
  static resetInstance() {
    _FunctionRegistry.instance = null;
  }
  // ==========================================================================
  // Function Registration
  // ==========================================================================
  /**
   * Register a function with the given path.
   *
   * @param path - The function path (e.g., "users:get" or "users/get")
   * @param fn - The registered function
   * @param options - Registration options
   * @returns The registry instance for chaining
   * @throws FunctionRegistryError if path is invalid or already registered
   */
  register(path, fn, options = {}) {
    validateFunctionPath(path);
    if (this.functionMap.has(path) && !options.force) {
      throw new FunctionRegistryError(
        `Function already registered at path: "${path}". Use { force: true } to overwrite.`,
        "DUPLICATE_PATH"
      );
    }
    const entry = {
      path,
      type: fn._type,
      visibility: fn._visibility,
      fn
    };
    this.functionMap.set(path, entry);
    return this;
  }
  /**
   * Get a registered function by path.
   *
   * @param path - The function path
   * @returns The function entry or undefined if not found
   */
  getFunction(path) {
    return this.functionMap.get(path);
  }
  /**
   * Check if a function is registered at the given path.
   *
   * @param path - The function path
   * @returns True if a function is registered at the path
   */
  has(path) {
    return this.functionMap.has(path);
  }
  /**
   * Unregister a function at the given path.
   *
   * @param path - The function path
   * @returns True if a function was removed, false if not found
   */
  unregister(path) {
    return this.functionMap.delete(path);
  }
  /**
   * List all registered functions, optionally filtered by type and/or visibility.
   *
   * @param type - Optional function type filter
   * @param visibility - Optional visibility filter
   * @returns Array of function entries
   */
  listFunctions(type, visibility) {
    const entries = Array.from(this.functionMap.values());
    return entries.filter((entry) => {
      if (type !== void 0 && entry.type !== type) {
        return false;
      }
      if (visibility !== void 0 && entry.visibility !== visibility) {
        return false;
      }
      return true;
    });
  }
  // ==========================================================================
  // HTTP Endpoint Registration
  // ==========================================================================
  /**
   * Generate a key for HTTP endpoint storage.
   */
  httpEndpointKey(path, method) {
    return `${method}:${path}`;
  }
  /**
   * Register an HTTP endpoint.
   *
   * @param path - The HTTP path pattern (e.g., "/api/users/:id")
   * @param method - The HTTP method
   * @param endpoint - The registered HTTP endpoint
   * @param options - Registration options
   * @returns The registry instance for chaining
   * @throws FunctionRegistryError if path is invalid or already registered
   */
  registerHttpEndpoint(path, method, endpoint, options = {}) {
    validateHttpPath(path);
    const key = this.httpEndpointKey(path, method);
    if (this.httpEndpoints.has(key) && !options.force) {
      throw new FunctionRegistryError(
        `HTTP endpoint already registered at ${method} ${path}. Use { force: true } to overwrite.`,
        "DUPLICATE_ENDPOINT"
      );
    }
    const entry = {
      path,
      method,
      endpoint
    };
    this.httpEndpoints.set(key, entry);
    return this;
  }
  /**
   * Get a registered HTTP endpoint by exact path and method.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns The endpoint entry or undefined if not found
   */
  getHttpEndpoint(path, method) {
    const key = this.httpEndpointKey(path, method);
    return this.httpEndpoints.get(key);
  }
  /**
   * Check if an HTTP endpoint is registered at the given path and method.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns True if an endpoint is registered
   */
  hasHttpEndpoint(path, method) {
    const key = this.httpEndpointKey(path, method);
    return this.httpEndpoints.has(key);
  }
  /**
   * Unregister an HTTP endpoint at the given path and method.
   *
   * @param path - The HTTP path
   * @param method - The HTTP method
   * @returns True if an endpoint was removed, false if not found
   */
  unregisterHttpEndpoint(path, method) {
    const key = this.httpEndpointKey(path, method);
    return this.httpEndpoints.delete(key);
  }
  /**
   * List all registered HTTP endpoints, optionally filtered by method.
   *
   * @param method - Optional HTTP method filter
   * @returns Array of HTTP endpoint entries
   */
  listHttpEndpoints(method) {
    const entries = Array.from(this.httpEndpoints.values());
    if (method === void 0) {
      return entries;
    }
    return entries.filter((entry) => entry.method === method);
  }
  /**
   * Match an HTTP request path and method to a registered endpoint.
   * Supports path parameters (e.g., "/api/users/:id" matches "/api/users/123").
   *
   * @param requestPath - The actual request path
   * @param method - The HTTP method
   * @returns The matched endpoint with extracted parameters, or undefined if no match
   */
  matchHttpEndpoint(requestPath, method) {
    const exactKey = this.httpEndpointKey(requestPath, method);
    const exactMatch = this.httpEndpoints.get(exactKey);
    if (exactMatch) {
      return {
        ...exactMatch,
        params: {}
      };
    }
    const methodEndpoints = this.listHttpEndpoints(method);
    for (const entry of methodEndpoints) {
      const params = this.matchPath(entry.path, requestPath);
      if (params !== null) {
        return {
          ...entry,
          params
        };
      }
    }
    return void 0;
  }
  /**
   * Match a request path against a pattern path, extracting parameters.
   *
   * @param pattern - The pattern path (e.g., "/api/users/:id")
   * @param requestPath - The actual request path (e.g., "/api/users/123")
   * @returns Extracted parameters or null if no match
   */
  matchPath(pattern, requestPath) {
    const patternParts = pattern.split("/").filter(Boolean);
    const requestParts = requestPath.split("/").filter(Boolean);
    if (patternParts.length !== requestParts.length) {
      return null;
    }
    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const requestPart = requestParts[i];
      if (patternPart.startsWith(":")) {
        const paramName = patternPart.slice(1);
        params[paramName] = requestPart;
      } else if (patternPart !== requestPart) {
        return null;
      }
    }
    return params;
  }
  // ==========================================================================
  // Module Registration
  // ==========================================================================
  /**
   * Register multiple functions from a module object.
   *
   * @param prefix - The path prefix for all functions in the module
   * @param module - An object containing registered functions
   * @returns The registry instance for chaining
   */
  registerModule(prefix, module) {
    for (const [name, value] of Object.entries(module)) {
      if (this.isRegisteredFunction(value)) {
        const path = `${prefix}:${name}`;
        this.register(path, value);
      }
    }
    return this;
  }
  /**
   * Check if a value is a registered function.
   */
  isRegisteredFunction(value) {
    if (!value || typeof value !== "object") {
      return false;
    }
    const obj = value;
    return (obj._type === "query" || obj._type === "mutation" || obj._type === "action") && (obj._visibility === "public" || obj._visibility === "internal") && (typeof obj._config === "object" && obj._config !== null && typeof obj._config.handler === "function");
  }
  // ==========================================================================
  // Utility Methods
  // ==========================================================================
  /**
   * Get the number of registered functions.
   */
  size() {
    return this.functionMap.size;
  }
  /**
   * Get the number of registered HTTP endpoints.
   */
  httpEndpointCount() {
    return this.httpEndpoints.size;
  }
  /**
   * Clear all registered functions and HTTP endpoints.
   */
  clear() {
    this.functionMap.clear();
    this.httpEndpoints.clear();
  }
  // ==========================================================================
  // Iteration Support
  // ==========================================================================
  /**
   * Iterate over all registered functions.
   */
  [Symbol.iterator]() {
    return this.functionMap.values();
  }
  /**
   * Get entries as [path, entry] pairs.
   */
  entries() {
    return this.functionMap.entries();
  }
  /**
   * Get all registered paths.
   */
  paths() {
    return this.functionMap.keys();
  }
  /**
   * Get all registered functions (without path information).
   */
  *functions() {
    for (const entry of this.functionMap.values()) {
      yield entry.fn;
    }
  }
};

// src/server/functions/api.ts
function parseFunctionPath(path) {
  const colonIndex = path.lastIndexOf(":");
  if (colonIndex === -1) {
    return {
      module: "",
      functionName: path,
      fullPath: path
    };
  }
  return {
    module: path.substring(0, colonIndex),
    functionName: path.substring(colonIndex + 1),
    fullPath: path
  };
}
function createFunctionRef(type, path, visibility) {
  return {
    _type: type,
    _args: void 0,
    _returns: void 0,
    _path: path,
    _visibility: visibility
  };
}
function makeFunctionReference(path, visibility = "public") {
  return createFunctionRef("query", path, visibility);
}
function makeQueryReference(path, visibility = "public") {
  return createFunctionRef("query", path, visibility);
}
function makeMutationReference(path, visibility = "public") {
  return createFunctionRef("mutation", path, visibility);
}
function makeActionReference(path, visibility = "public") {
  return createFunctionRef("action", path, visibility);
}
function getFunctionName(ref) {
  return ref._path;
}
var VALID_PATH_REGEX = /^[a-zA-Z0-9_/]+:[a-zA-Z0-9_]+$|^[a-zA-Z0-9_]+$/;
function functionName(strings, ...values) {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    result += String(values[i]) + strings[i + 1];
  }
  if (!VALID_PATH_REGEX.test(result)) {
    throw new Error(
      `Invalid function path format: "${result}". Expected format: "module:function" or "module/submodule:function"`
    );
  }
  return result;
}
function createFunctionHandle(ref) {
  return ref._path;
}
function setNestedValue(obj, path, value) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}
function buildPathArray(functionPath) {
  const parsed = parseFunctionPath(functionPath);
  const moduleParts = parsed.module ? parsed.module.split("/") : [];
  return [...moduleParts, parsed.functionName];
}
function createApi(registeredFunctions) {
  const api = {};
  for (const [path, func] of Object.entries(registeredFunctions)) {
    if (func._visibility !== "public") {
      continue;
    }
    const pathArray = buildPathArray(path);
    const ref = {
      _type: func._type,
      _args: func._args,
      _returns: func._returns,
      _path: path,
      _visibility: "public"
    };
    setNestedValue(api, pathArray, ref);
  }
  return api;
}
function createInternalApi(registeredFunctions) {
  const internal = {};
  for (const [path, func] of Object.entries(registeredFunctions)) {
    if (func._visibility !== "internal") {
      continue;
    }
    const pathArray = buildPathArray(path);
    const ref = {
      _type: func._type,
      _args: func._args,
      _returns: func._returns,
      _path: path,
      _visibility: "internal"
    };
    setNestedValue(internal, pathArray, ref);
  }
  return internal;
}

export { AuthImpl, DatabaseReader, DatabaseReaderImpl, DatabaseWriter, FunctionRegistry, FunctionRegistryError, HttpRouter, InMemoryStorage, QueryBuilderImpl, QueryCtxImpl, StorageReaderImpl, action, createActionCtx, createApi, createDefaultQueryCtx, createFunctionHandle, createInternalApi, createMutationCtx, createQueryCtx, createValidatedActionCtx, createValidatedMutationCtx, defineSchema, defineTable, functionName, getArgsValidator, getFunctionHandler, getFunctionName, getFunctionType, getFunctionVisibility, getReturnsValidator, httpAction, httpRouter, internalAction, internalMutation, internalQuery, isAction, isInternalFunction, isMutation, isPublicFunction, isQuery, isRegisteredFunction, makeActionReference, makeFunctionReference, makeMutationReference, makeQueryReference, mutation, parseFunctionPath, query, v, validateAuth2 as validateActionAuth, validateActionCtx, validateScheduler2 as validateActionScheduler, validateAuth, validateDatabaseWriter, validateMutationCtx, validateScheduler, validateStorageReader, validateStorageWriter };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map