import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('required devops files exist', () => {
  const requiredFiles = [
    'Dockerfile',
    'docker-compose.yml',
    '.github/workflows/ci.yml',
    '.env.example',
  ];

  for (const file of requiredFiles) {
    assert.ok(fs.existsSync(path.join(process.cwd(), file)), `${file} should exist`);
  }
});
