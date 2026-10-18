import { it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { runGenerationPipeline } from '@/lib/legal-engine/pipeline';
import { reconstructCaseAnalysis } from '@/lib/legal-engine/caseAnalysis';
import { exportUniversalToDocx } from '@/lib/legal-engine/exportDocxUniversal';
import { exportUniversalToPdf } from '@/lib/legal-engine/exportPdfUniversal';
import type { UploadedSourceDocument } from '@/lib/legal-engine/types';

const cases=[
  {id:'contestacion',type:'contestacion_demanda_civil',matter:'civil',instruction:'En este ejercicio ficticio, preparar contestación para PERSONA B. Postura expresamente confirmada: admitir la celebración del convenio; negar que esté probado el saldo y aclarar que no se aportó comprobante. No se confirma pago ni prescripción. Solicitar revisión documental. No citar normas sin verificación.',source:'DEMANDA CIVIL SINTÉTICA. EXPEDIENTE SYN-CIV-001. Actor: PERSONA A. Demandado: PERSONA B. HECHOS: 1. La persona A manifiesta que celebró con B un convenio de entrega de un objeto. 2. A afirma que la entrega debía realizarse el 3 de septiembre de 2026. 3. A sostiene que B no entregó el objeto. 4. A dice que le corresponde un saldo de 1200 unidades. PRESTACIONES: cumplimiento del convenio y pago del saldo alegado. PRUEBAS: copia simple del convenio. No se incorpora comprobante de entrega ni estado de cuenta. Estas afirmaciones son alegaciones, no hechos acreditados. El ejercicio no contiene resolución judicial ni legislación verificada.'},
  {id:'apelacion',type:'apelacion_civil',matter:'civil',instruction:'Ejercicio ficticio: preparar apelación para PERSONA B contra la negativa de admitir el documento. Agravio solicitado: falta de explicación individual de la pertinencia. Vincularlo al punto y constancia descritos. Efecto solicitado: nueva decisión motivada sobre admisión, no declarar ganado el juicio. No confirmar plazo ni norma.',source:'RESOLUCIÓN CIVIL SINTÉTICA. EXPEDIENTE SYN-APL-002. Recurrente: PERSONA B. Juzgado ficticio civil. Resolución fechada el 4 de septiembre de 2026: se rechaza la copia del convenio ofrecida por B porque no se estima pertinente. Punto combatido: rechazo de esa documental. Constancia del ejercicio: apartado segundo de la resolución y escrito de ofrecimiento que dice que el convenio versa sobre el objeto de la reclamación. B afirma que la resolución no explica la relación entre el documento y el objeto controvertido. No se conoce fecha de notificación. No se adjunta texto oficial de las disposiciones aplicables. No existen antecedentes suficientes para concluir oportunidad del recurso.'},
  {id:'amparo',type:'demanda_amparo_indirecto',matter:'amparo',instruction:'Preparar borrador de amparo indirecto para PERSONA C, supuesto ficticio. Acto: negativa escrita de recibir su solicitud. Agravio del ejercicio: falta de explicación individual de la negativa. Efecto pretendido: que la autoridad reciba y resuelva la solicitud mediante respuesta fundada. No dar por satisfechas procedencia, definitividad ni plazo. Premisa normativa pendiente de investigación oficial.',source:'ANTECEDENTES SINTÉTICOS DE AMPARO. EXPEDIENTE SYN-AMP-003. Quejoso ficticio: PERSONA C. Autoridad del ejercicio: OFICINA ADMINISTRATIVA FICTICIA. Acto reclamado: oficio que se niega a recibir una solicitud de acceso a un trámite. Antecedentes: C manifiesta que presentó su solicitud el 5 de septiembre de 2026 y recibió una respuesta negativa. Constancia disponible en el ejercicio: texto del oficio, que dice únicamente que no procede recibirla. C sostiene que no se explican requisitos faltantes. Perjuicio alegado: imposibilidad de obtener una decisión sobre su petición. No se dispone de constancia de notificación ni de medios ordinarios disponibles. No se aporta fuente oficial jurídica.'},
  {id:'penal',type:'apelacion_penal',matter:'penal',instruction:'Ejercicio penal ficticio, etapa investigación complementaria, PERSONA D imputada, defensa técnica. Preparar revisión preliminar de apelación sobre la resolución de admisión de un dato. No concluir recurribilidad ni plazo sin verificar oficialmente. Petición del ejercicio: individualizar pertinencia y contradicción. No inventar pruebas, delitos ni reglas del manual penal.',source:'ACTUACIÓN PENAL SINTÉTICA. CAUSA SYN-PEN-004. Etapa: investigación complementaria. Representado ficticio: PERSONA D, imputada. Acto: resolución de un órgano de control ficticio que rechaza la incorporación de una constancia solicitada por la defensa. Hechos del ejercicio: D manifiesta que ofreció una constancia de ubicación para contrastar un dato de la investigación; la resolución dice que no resulta pertinente, sin explicación adicional. Prueba o dato disponible: texto de la solicitud y texto de la negativa. No se afirma que la ubicación haya sido acreditada ni se conoce delito imputado. Riesgos: no consta fecha de notificación, recurribilidad del acto ni norma oficial vigente. Petición confirmada para el ejercicio: revisar motivación individual y posibilidad de contradicción.'},
];
for(const c of cases) it(`controlled offline produced document: ${c.id}`,async()=>{
  const directory=`audit/final-pre-windows-readiness/controlled-cases/${c.id}`;
  await mkdir(directory,{recursive:true});
  // An administrative oficio is the source, not an already drafted amparo complaint.
  const sourceText=c.id==='amparo'?'OFICIO ADMINISTRATIVO SINTÉTICO. OFICINA ADMINISTRATIVA FICTICIA. Dirigido a PERSONA C. Identificador SYN-AMP-003. RESOLUCIÓN: no procede recibir la solicitud de acceso al trámite presentada por C el 5 de septiembre de 2026. La oficina comunica únicamente esa negativa, sin explicar requisitos faltantes ni motivo individual. Constancias del ejercicio: texto de la petición y este oficio. C afirma que la negativa le impide obtener una respuesta sobre su petición. No consta fecha de notificación ni medios ordinarios disponibles. No se aporta fuente jurídica oficial. Los hechos descritos son un ejercicio ficticio; no se afirma procedencia de ningún medio de defensa.':c.source;
  const source:UploadedSourceDocument={id:`synthetic-source-${c.id}`,filename:c.id==='amparo'?'oficio-administrativo-synthetic.txt':`${c.id}-synthetic.txt`,content:sourceText,extractedText:sourceText,sourceValidated:true,pages:[{page:1,text:sourceText,chars:sourceText.length}]};
  const analysis=reconstructCaseAnalysis([source],c.instruction);
  const report:Record<string,unknown>={classification:'OFFLINE_CONTROLLED_PIPELINE_TEST_NOT_REAL_PROVIDER',SOURCE:source,CASE_ANALYSIS:analysis,legalQualityStatus:'NOT_CERTIFIED',externalProviderOptIn:false};
  try {
    const doc=await runGenerationPipeline({selectedDocumentType:c.type,documentTypeLabel:c.type,matter:c.matter,userInstruction:c.instruction,sourceDocuments:[source],flow:'DOCUMENT_ANALYSIS',externalProviderOptIn:false,workflow:{flow:'DOCUMENT_ANALYSIS',analysis,selection:{mode:'automatic'},sourceDocuments:[source],updatedAt:new Date().toISOString()},traceOptions:{enabled:true,outputDir:directory,writeMarkdown:true}});
    const trace=doc.generationMetadata.auditTrace;
    report.DOCUMENT_PLAN=trace?.documentPlanSnapshot || null;
    report.GENERATION_TASKS=trace?.generationTasks || null;
    report.MANUAL_RULES=doc.generationMetadata.operationalManual || null;
    report.LEGAL_RESEARCH=trace?.legalResearch || {status:'NO_OFFICIAL_AUTHORITY_VERIFIED_IN_OFFLINE_SCOPE'};
    report.DRAFT=doc;
    report.OPERATIONAL_AUDIT=doc.generationMetadata.operationalManual?.auditFindings || null;
    report.COVERAGE=doc.coverageMatrix || null;
    report.QUALITY_GATE=trace?.qualityGateResult || null;
    const readiness=(doc.generationMetadata as typeof doc.generationMetadata & {readiness?:string}).readiness;
    report.FINAL_STATUS={status:doc.status,readiness};
    report.sections=doc.sections.map(s=>({id:s.id,title:s.title,blocks:s.content.length,words:s.content.map(b=>b.text).join(' ').split(/\s+/).filter(Boolean).length}));
    report.structureStatus=doc.sections.length?'PARTIAL':'FAIL';
    await writeFile(`${directory}/produced-document.json`,JSON.stringify(doc,null,2));
    await writeFile(`${directory}/produced-document.txt`,doc.sections.map(s=>s.title+'\n'+s.content.map(b=>b.text).join('\n')).join('\n\n'));
    report.exports={};
    for(const format of ['docx','pdf'] as const)try {
      const bytes=format==='docx'?await exportUniversalToDocx(doc,undefined,undefined,{exportMode:'DRAFT',unsavedDraft:true}):await exportUniversalToPdf(doc,undefined,{exportMode:'DRAFT',unsavedDraft:true});
      await writeFile(`${directory}/produced-draft.${format}`,bytes);
      (report.exports as Record<string,unknown>)[format]={status:'EXPORTED_DRAFT',bytes:bytes.length};
    }catch(error){(report.exports as Record<string,unknown>)[format]={status:'BLOCKED',reason:String(error)};}
  } catch(error) {report.error=String(error);report.structureStatus='FAIL';}
  await writeFile(`${directory}/journey.json`,JSON.stringify(report,null,2));
  // Assert outside catch: pipeline/guard regressions must not become false passes.
  expect(report.error).toBeUndefined();
  expect(report.DRAFT).toBeDefined();
  expect((report.sections as unknown[]).length).toBeGreaterThan(0);
  expect((report.FINAL_STATUS as {readiness:string}).readiness).toBe('REVIEW_REQUIRED');
  expect((report.QUALITY_GATE as {passed:boolean}).passed).toBe(false);
  // Success proves produced/review-blocked artifacts, not substantive legal quality.
  expect(report.classification).toBe('OFFLINE_CONTROLLED_PIPELINE_TEST_NOT_REAL_PROVIDER');
},60000);
