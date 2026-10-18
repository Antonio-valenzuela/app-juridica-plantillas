import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createDesktopSession, assertPortAvailable } from '../../scripts/desktop/local-launcher.mjs';

test('per-launch capabilities rotate and override inherited desktop settings', () => {
  const first = createDesktopSession({ port: 3200, inheritedEnv: { LEX_DESKTOP_CAPABILITY: 'static', LEX_RUNTIME_MODE: 'WEB' } });
  const second = createDesktopSession({ port: 3200 });
  assert.match(first.capability, /^[a-f0-9]{64}$/);
  assert.notEqual(first.capability, second.capability);
  assert.equal(first.env.LEX_RUNTIME_MODE, 'DESKTOP_LOCAL');
  assert.equal(first.env.LEX_DESKTOP_BIND_ADDRESS, '127.0.0.1');
  assert.equal(first.env.LEX_DESKTOP_CAPABILITY, first.capability);
});
test('invalid port and unreasonable lifetime fail before launch', () => {
  for (const port of [0, -1, 65536, 1.5]) assert.throws(() => createDesktopSession({port}));
  assert.throws(() => createDesktopSession({port:3200, lifetimeMs:0}));
});
test('occupied port is rejected rather than attaching to another server', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(assertPortAvailable(server.address().port)); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
