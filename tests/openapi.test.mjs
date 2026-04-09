import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSpec, inferTag, toOpenApiPath, writeSpecFiles } from '../scripts/generate-openapi.mjs';

test('openapi helpers derive paths and tags correctly', () => {
  const filePath = path.join(process.cwd(), 'src', 'app', 'api', 'readers', '[id]', 'heartbeat', 'route.ts');
  assert.equal(toOpenApiPath(filePath), '/api/readers/{id}/heartbeat');
  assert.equal(inferTag('/api/payroll/generate'), 'payroll');
});

test('openapi generator writes swagger files with populated paths', () => {
  const spec = createSpec();
  assert.equal(spec.openapi, '3.0.3');
  assert.ok(Object.keys(spec.paths).length > 20);

  writeSpecFiles();
  const swaggerJsonPath = path.join(process.cwd(), 'docs', 'swagger.json');
  const swaggerYamlPath = path.join(process.cwd(), 'docs', 'swagger.yaml');
  assert.ok(fs.existsSync(swaggerJsonPath));
  assert.ok(fs.existsSync(swaggerYamlPath));
});
