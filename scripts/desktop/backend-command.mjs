import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export function buildDesktopBackendArgs({projectDir,port,development}) {
  if(!development)return [join(projectDir,'scripts/start-standalone.mjs')];
  return ['--import',pathToFileURL(join(projectDir,'scripts/desktop/local-next-lifecycle.mjs')).href,
    join(projectDir,'node_modules/next/dist/bin/next'),development?'dev':'start',
    ...(development?['--turbopack']:[]),'--hostname','127.0.0.1','--port',String(port)];
}
