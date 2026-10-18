import ts from 'typescript';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(); const input='audit/ui-interactions/controls.json';
const original=await readFile(input); const inventory=JSON.parse(original);
if(inventory.controls.length!==446) throw new Error('INVENTORY_COUNT_CHANGED');
const reachable=new Set();
async function resolveImport(from,specifier) {
  const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):specifier.startsWith('.')?path.resolve(path.dirname(from),specifier):null;
  if(!base)return;
  for(const file of [base,base+'.tsx',base+'.ts',base+'.js',base+'/index.ts',base+'/index.tsx']) {
    try {await access(file);return file;}catch{}
  }
}
async function visit(file) {
  const rel=path.relative(root,file).replaceAll('\\','/'); if(reachable.has(rel))return; reachable.add(rel);
  const text=await readFile(file,'utf8'); const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
  const imports=[];
  function walk(node) {
    if(ts.isImportDeclaration(node)&&!node.importClause?.isTypeOnly&&ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node,walk);
  } walk(ast);
  for(const specifier of imports) {const resolved=await resolveImport(file,specifier);if(resolved&&/\.[jt]sx?$/.test(resolved))await visit(resolved);}
}
for(const route of ['app/layout.tsx','app/page.tsx','app/machotes/page.tsx','app/legal-hub/machotes/page.tsx','app/not-found.tsx'])try {await visit(path.join(root,route));}catch(e){if(e.code!=='ENOENT')throw e;}
const tabs={AnalyticsPanel:'configuracion',WorkspaceDocumentEditor:'responses_resources',TemplateLibraryManager:'my-templates',ExpedientesView:'expedientes',InicioView:'inicio',ContestacionesView:'responses_resources',WorkspaceDraftGeneratorModal:'initial_writings',LawyerStyleProfileCard:'configuracion',LocalImportPanel:'biblioteca',WorkspaceLibraryPanel:'biblioteca'};
const editorTests=[
  ['handleUndo','initial block/title restored'],['handleRedo','edited block/title restored'],
  ['handleSaveTitle','rename undo/redo rendered'],
  ['setZoomLevel','110% displayed then 100% restored'],['setSearchQuery','match count appears and clears'],
];
const controls=inventory.controls.map((c,index)=>{
  const mounted=reachable.has(c.COMPONENT);
  const basename=path.basename(c.COMPONENT,'.tsx'); const handlers=c.HANDLER.map(h=>`${h.event}: ${h.expression}`).join('; ');
  const source=c.SOURCE||'';
  const inlineApis=[...new Set([...source.matchAll(/['"`]((?:\/api\/)[^'"`\s?]+)/g)].map(m=>m[1]))];
  let status=mounted?'PARTIAL':'NOT_APPLICABLE';
  let effect=mounted?'NOT_OBSERVED: parent callback/state contract requires behavioral verification':'Not reachable from current app routes by static value imports; no active-render claim';
  let test='NOT_EXECUTED_FOR_THIS_CONTROL';
  if(mounted&&basename==='WorkspaceDocumentEditor')for(const [handler,result]of editorTests)if(handlers.includes(handler)) {
    if(handler==='setZoomLevel'&&!/Acercar|Alejar/.test(source))continue;
    status='PASS';effect=result;test='tests/components/WorkspaceDocumentEditorBehavior.test.tsx (observed React state effect; not database persistence)';break;
  }
  if(mounted&&basename==='WorkspaceDocumentEditor'&&/handleSaveMachoteTemplate|handleSave\}|handleReopen/.test(handlers)) {effect='Failed store is handled with alert/retry; successful persistence/reopen NOT_DEMONSTRATED';test='WorkspaceDocumentEditorBehavior: explicit store-failure tests';}
  if(mounted&&basename==='WorkspaceDocumentEditor'&&handlers.includes('onFormatDocument')) {effect='callback dispatched, formatting result not verified';test='WorkspaceDocumentEditorBehavior: callback assertion only';}
  if(!handlers&&/type="submit"/.test(source)){effect='Form submission handler inherited from enclosing form; end effect still unverified';}
  if(c.CONTROL==='div'){status='NOT_APPLICABLE';effect='AST wrapper rather than independent toolbar command; nested controls reviewed separately';}
  return {inventoryId:`control-${String(index+1).padStart(3,'0')}`,ROUTE:mounted?`/machotes${tabs[basename]?`?tab=${tabs[basename]}`:' (shared/module-dependent)'}`:'NOT_IN_ACTIVE_IMPORT_GRAPH',COMPONENT:c.COMPONENT,LINE:c.LINE,CONTROL:c.CONTROL,LABEL:c.LABEL,EXPECTED_ACTION:handlers||(/type="submit"/.test(source)?'Enclosing form submission':'Requires parent or forwarded-prop contract inspection'),HANDLER:c.HANDLER,EFFECT:effect,API:inlineApis.length?inlineApis:'NO_DIRECT_API_IN_CAPTURE: parent callback/API attribution pending',PERSISTENCE:status==='PASS'?'Observed local React state or handled store failure only; actual save/reopen pending':'NOT_DEMONSTRATED',TEST:test,STATUS:status,SOURCE:c.SOURCE};
});
const counts={};for(const c of controls)counts[c.STATUS]=(counts[c.STATUS]||0)+1;
const report={generatedAt:new Date().toISOString(),sourceInventory:input,sourceSha256:createHash('sha256').update(original).digest('hex'),scope:'Existing rows enriched, not re-enumerated. PARTIAL is explicitly unproven, never functional success. Static import reachability is not runtime visibility proof.',counts,controls};
const dir='audit/final-pre-windows-readiness';await mkdir(dir,{recursive:true});
await writeFile(`${dir}/controls-functional.json`,JSON.stringify(report,null,2));
const escape=s=>String(typeof s==='object'?JSON.stringify(s):s).replaceAll('|','\\|').replaceAll('\n',' ');
const columns=['inventoryId','ROUTE','COMPONENT','CONTROL','EXPECTED_ACTION','HANDLER','EFFECT','API','PERSISTENCE','TEST','STATUS'];
await writeFile(`${dir}/controls-functional.md`, `# Existing 446-control inventory: functional evidence\n\n${report.scope}\n\nCounts: ${JSON.stringify(counts)}\n\n| ${columns.join(' | ')} |\n| ${columns.map(()=> '---').join(' | ')} |\n${controls.map(c=>'| '+columns.map(k=>escape(c[k])).join(' | ')+' |').join('\n')}\n`);
console.log(JSON.stringify({counts,total:controls.length,sourceSha256:report.sourceSha256}));
