import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildDesktopBackendArgs } from '../../scripts/desktop/backend-command.mjs';
test('production launcher uses staged standalone entry, not next start',()=>{
  const root=path.resolve('synthetic-project');
  assert.deepEqual(buildDesktopBackendArgs({projectDir:root,port:3200,development:false}),[path.join(root,'scripts/start-standalone.mjs')]);
});
test('development launcher retains loopback binding and turbopack',()=>{
  const args=buildDesktopBackendArgs({projectDir:path.resolve('synthetic-project'),port:3200,development:true});
  assert.ok(args.includes('dev'));assert.ok(args.includes('--turbopack'));
  assert.equal(args[args.indexOf('--hostname')+1],'127.0.0.1');
  assert.equal(args[args.indexOf('--port')+1],'3200');
});
