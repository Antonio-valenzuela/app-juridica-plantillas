import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : npmCommand;
const checks = [
  ['security audit', ['audit', '--omit=dev', '--audit-level=high']],
  ['full test suite', ['test']],
  ['typecheck', ['run', 'typecheck']],
  ['lint', ['run', 'lint']],
  ['production build', ['run', 'build']],
];

const baseEnv = {
  ...process.env,
  NVIDIA_API_KEY: '',
  NVIDIA_REAL_TEST: 'false',
  ALLOW_DEV_ADMIN_TOKEN: 'false',
};

const results = [];

for (const [name, args] of checks) {
  console.log(`\n[release-gate] ${name}`);
  const isProductionBuild = name === 'production build';
  const env = {
    ...baseEnv,
    NODE_ENV: isProductionBuild ? 'production' : 'test',
    DEMO_MODE_ENABLED: isProductionBuild ? 'false' : 'true',
  };
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [npmCommand, ...args].join(' ')]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) console.error(`[release-gate] process error: ${result.error.message}`);
  const passed = result.status === 0 && !result.error;
  results.push({ name, passed });
  console.log(`[release-gate] ${name}: ${passed ? 'PASS' : 'FAIL'}`);
}

const failed = results.filter(({ passed }) => !passed).map(({ name }) => name);
console.log(`\n[release-gate] ${failed.length === 0 ? 'GO' : 'NO-GO'}`);
if (failed.length > 0) {
  console.log(`[release-gate] Bloqueos: ${failed.join(', ')}`);
  process.exitCode = 1;
}
