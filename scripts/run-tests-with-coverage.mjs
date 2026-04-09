import { spawnSync } from 'node:child_process';

const result = spawnSync('node', ['--test', '--experimental-test-coverage', 'tests/*.test.mjs'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: true,
});

process.stdout.write(result.stdout);
process.stderr.write(result.stderr);

const combinedOutput = `${result.stdout}\n${result.stderr}`;
const allFilesLine = combinedOutput.split('\n').find((line) => line.toLowerCase().includes('all files'));
if (!allFilesLine) {
  process.exit(result.status ?? 1);
}

const percentages = allFilesLine
  .split('|')
  .slice(1, 4)
  .map((segment) => Number.parseFloat(segment.trim()))
  .filter((value) => Number.isFinite(value));
const minimum = percentages.length ? Math.min(...percentages) : 0;
if (minimum < 80) {
  console.error(`Coverage threshold not met. Minimum coverage was ${minimum}%, expected at least 80%.`);
  process.exit(1);
}

process.exit(result.status ?? 0);
