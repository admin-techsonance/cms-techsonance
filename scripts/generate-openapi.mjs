import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const apiRoot = path.join(projectRoot, 'src', 'app', 'api');
const docsDir = path.join(projectRoot, 'docs');

const methodSummary = {
  GET: 'Retrieve resource',
  POST: 'Create resource',
  PUT: 'Update resource',
  PATCH: 'Partially update resource',
  DELETE: 'Delete resource',
};

export function walkRoutes(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkRoutes(nextPath));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(nextPath);
    }
  }
  return files;
}

export function toOpenApiPath(filePath) {
  const relative = path.relative(apiRoot, path.dirname(filePath)).split(path.sep).filter(Boolean);
  const converted = relative.map((segment) => {
    if (segment.startsWith('[') && segment.endsWith(']')) {
      return `{${segment.slice(1, -1)}}`;
    }
    return segment;
  });
  return `/api/${converted.join('/')}`.replace(/\/+/g, '/');
}

export function inferTag(openApiPath) {
  const [, , first = 'misc'] = openApiPath.split('/');
  const tagMap = {
    auth: 'auth',
    employees: 'employees',
    payroll: 'payroll',
    attendance: 'attendance',
    projects: 'projects',
    'project-members': 'projects',
    milestones: 'projects',
    'project-documents': 'projects',
    tasks: 'tasks',
    sprints: 'sprints',
    expenses: 'expenses',
    'expense-categories': 'expenses',
    reimbursements: 'expenses',
    'reimbursement-categories': 'expenses',
  };
  return tagMap[first] || first;
}

export function buildOperation(pathName, method) {
  const pathParams = Array.from(pathName.matchAll(/\{([^}]+)\}/g)).map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description: `Path parameter ${match[1]}`,
  }));

  const queryParams = method === 'GET'
    ? [
      { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 }, example: 10 },
      { name: 'offset', in: 'query', required: false, schema: { type: 'integer', minimum: 0 }, example: 0 },
    ]
    : [];

  const responses = {
    200: { $ref: '#/components/responses/SuccessResponse' },
    201: { $ref: '#/components/responses/CreatedResponse' },
    400: { $ref: '#/components/responses/ValidationErrorResponse' },
    401: { $ref: '#/components/responses/UnauthorizedResponse' },
    403: { $ref: '#/components/responses/ForbiddenResponse' },
    404: { $ref: '#/components/responses/NotFoundResponse' },
    422: { $ref: '#/components/responses/UnprocessableResponse' },
    500: { $ref: '#/components/responses/InternalErrorResponse' },
  };

  if (method === 'DELETE') delete responses[201];
  if (method === 'POST') delete responses[200];

  const requestBody = ['POST', 'PUT', 'PATCH'].includes(method)
    ? {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/GenericPayload' },
          examples: {
            sample: {
              summary: `${method} request payload`,
              value: { name: 'Example', status: 'active' },
            },
          },
        },
      },
    }
    : undefined;

  return {
    tags: [inferTag(pathName)],
    summary: `${methodSummary[method]} for ${pathName}`,
    description: `Auto-generated documentation for ${method} ${pathName}.`,
    security: [{ bearerAuth: [] }],
    parameters: [...pathParams, ...queryParams],
    ...(requestBody ? { requestBody } : {}),
    responses,
  };
}

export function createSpec() {
  const paths = {};
  const routeFiles = walkRoutes(apiRoot);

  for (const filePath of routeFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const pathName = toOpenApiPath(filePath);
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((method) =>
      new RegExp(`export const ${method}|export async function ${method}`).test(source)
    );

    if (!methods.length) continue;
    paths[pathName] = paths[pathName] || {};
    for (const method of methods) {
      paths[pathName][method.toLowerCase()] = buildOperation(pathName, method);
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'TechSonance CMS API',
      version: '1.0.0',
      description: 'Generated OpenAPI specification for the TechSonance CMS routes.',
    },
    servers: [{ url: '/'}],
    tags: [
      { name: 'auth' },
      { name: 'employees' },
      { name: 'payroll' },
      { name: 'attendance' },
      { name: 'projects' },
      { name: 'tasks' },
      { name: 'sprints' },
      { name: 'expenses' },
    ],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        GenericPayload: {
          type: 'object',
          additionalProperties: true,
          example: { name: 'Example', status: 'active' },
        },
        ApiEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {},
            message: { type: 'string' },
            errors: { type: 'array', items: {} , nullable: true},
            meta: { $ref: '#/components/schemas/PaginationMeta' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
          },
        },
      },
      responses: {
        SuccessResponse: {
          description: 'Successful response',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' }, examples: { sample: { value: { success: true, data: { id: 1 }, message: 'Request completed successfully', errors: null } } } } },
        },
        CreatedResponse: {
          description: 'Created response',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' }, examples: { sample: { value: { success: true, data: { id: 1 }, message: 'Resource created successfully', errors: null } } } } },
        },
        ValidationErrorResponse: {
          description: 'Validation error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' }, examples: { sample: { value: { success: false, data: null, message: 'Validation failed', errors: [{ path: ['name'], message: 'Required' }] } } } } },
        },
        UnauthorizedResponse: {
          description: 'Unauthorized',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' } } },
        },
        ForbiddenResponse: {
          description: 'Forbidden',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' } } },
        },
        NotFoundResponse: {
          description: 'Not found',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' } } },
        },
        UnprocessableResponse: {
          description: 'Unprocessable entity',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' } } },
        },
        InternalErrorResponse: {
          description: 'Internal server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' } } },
        },
      },
    },
  };
}

export function toYaml(value, indent = 0) {
  const spacing = '  '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map((item) => `${spacing}- ${typeof item === 'object' && item !== null ? `\n${toYaml(item, indent + 1)}` : String(item)}`).join('\n');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => {
      if (item && typeof item === 'object') {
        if (Array.isArray(item) && item.length === 0) return `${spacing}${key}: []`;
        return `${spacing}${key}:\n${toYaml(item, indent + 1)}`;
      }
      if (typeof item === 'string') return `${spacing}${key}: ${JSON.stringify(item)}`;
      return `${spacing}${key}: ${item}`;
    }).join('\n');
  }
  return `${spacing}${String(value)}`;
}

export function writeSpecFiles() {
  const spec = createSpec();
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'swagger.json'), JSON.stringify(spec, null, 2));
  fs.writeFileSync(path.join(docsDir, 'swagger.yaml'), toYaml(spec));
  return spec;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  writeSpecFiles();
  console.log('OpenAPI spec generated at docs/swagger.json and docs/swagger.yaml');
}
