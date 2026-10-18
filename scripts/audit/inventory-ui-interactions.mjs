import ts from 'typescript';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
const root = process.cwd();
async function files(dir) {
  const entries = await readdir(dir, {withFileTypes:true});
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(dir,entry.name)) : [join(dir,entry.name)]))).flat();
}
const paths = (await Promise.all(['app','components'].map(async dir => { try { return await files(join(root,dir)); } catch { return []; } }))).flat().filter(path => /\.tsx$/.test(path));
const controls = [];
for (const path of paths) {
  const text = await readFile(path,'utf8');
  const source = ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const events = attrs.filter(attr => /^(onClick|onSubmit|onChange|href)$/.test(attr.name.getText(source)));
      if (/^(button|Button|input|select|textarea|form|a|Link)$/.test(tag) || events.length) {
        const handlers = events.map(attr => ({event:attr.name.getText(source),expression:attr.initializer?.getText(source) ?? ''}));
        const labels = attrs.filter(attr => /^(aria-label|title|placeholder)$/.test(attr.name.getText(source))).map(attr => attr.initializer?.getText(source)).join(' | ');
        const parent = ts.isJsxElement(node.parent) ? node.parent : node;
        const raw = parent.getText(source).slice(0,900);
        const childText = ts.isJsxElement(parent) ? parent.children.filter(ts.isJsxText).map(child => child.text.trim()).filter(Boolean).join(' ') : '';
        const emptyHandler = handlers.some(handler => /=>\s*\{\s*\}/.test(handler.expression));
        const suspicious = /TODO|console\.log\(|placeholder/i.test(handlers.map(handler=>handler.expression).join(' '));
        controls.push({ ROUTE:'NO_ATRIBUIBLE_STATIC', COMPONENT:relative(root,path).replaceAll('\\','/'), LINE:source.getLineAndCharacterOfPosition(node.getStart()).line+1,
          CONTROL:tag, LABEL:labels || childText || 'DYNAMIC_OR_ICON_LABEL', EXPECTED_ACTION:'REQUIRES_CONTRACT_REVIEW', HANDLER:handlers,
          BACKEND_API:'NOT_TRACED', PERSISTENCE:'NOT_TRACED', CURRENT_STATUS:emptyHandler?'NO_HANDLER':'UNKNOWN', TEST_EXISTING:'NOT_LINKED',
          DEFECT:emptyHandler?'EMPTY_HANDLER':suspicious?'REVIEW_SUSPICIOUS_HANDLER':'NOT_DEMONSTRATED', SEVERITY:emptyHandler?'REQUIRES_FLOW_TRIAGE':'UNCLASSIFIED', SOURCE:raw });
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
}
const apiPaths = (await files(join(root,'app/api'))).filter(path=>/route\.(ts|js)$/.test(path));
const dir = join(root,'audit/ui-interactions'); await mkdir(dir,{recursive:true});
await writeFile(join(dir,'controls.json'),JSON.stringify({generatedAt:new Date().toISOString(),scope:'Static discovery only: no handler proves functional success',files:paths.length,controls},null,2));
const clean = value => String(value).replaceAll('|','\\|').replaceAll('\n',' ');
const md = ['# Inventario preliminar de interacciones','', 'Descubrimiento AST del working tree. UNKNOWN no implica WORKING. Falta demostrar efectos, persistencia y navegación por control.', '', '| Componente | Línea | Control | Etiqueta | Handler | Estado | Hallazgo |','|---|---:|---|---|---|---|---|',...controls.map(row=>`| ${clean(row.COMPONENT)} | ${row.LINE} | ${row.CONTROL} | ${clean(row.LABEL)} | ${clean(row.HANDLER.map(x=>`${x.event}: ${x.expression}`).join('; '))} | ${row.CURRENT_STATUS} | ${row.DEFECT} |`)];
await writeFile(join(dir,'controls.md'),md.join('\n'));
await writeFile(join(dir,'routes.json'),JSON.stringify(apiPaths.map(path=>({file:relative(root,path).replaceAll('\\','/'),route:'/'+relative(join(root,'app'),dirname(path)).replaceAll('\\','/'),status:'UNKNOWN'})),null,2));
console.log(JSON.stringify({files:paths.length,controls:controls.length,emptyHandlers:controls.filter(row=>row.CURRENT_STATUS==='NO_HANDLER').length,apiRoutes:apiPaths.length}));
