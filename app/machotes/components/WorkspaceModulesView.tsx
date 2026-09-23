'use client';

import React, { useMemo, useState } from 'react';

export type WorkspaceModule =
  | 'inicio'
  | 'expedientes'
  | 'terminos'
  | 'jurisprudencia'
  | 'biblioteca'
  | 'alertas'
  | 'configuracion'
  | 'ayuda';

interface WorkspaceModulesViewProps {
  mode: WorkspaceModule;
  onNavigate: (mode: WorkspaceModule) => void;
}

const muted = 'text-slate-500';
const card = 'rounded-2xl border border-slate-200 bg-white shadow-[0_5px_18px_rgba(15,23,42,.045)]';
const input = 'h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition focus:border-[#0B2545] focus:bg-white focus:ring-2 focus:ring-[#0B2545]/10';

function Icon({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{children}</span>;
}

function Header({ title, eyebrow, description, action }: { title: string; eyebrow: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[.18em] text-[#B58A5A]">{eyebrow}</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#0B2545]">{title}</h1>
        <p className={`mt-1 text-sm ${muted}`}>{description}</p>
      </div>
      {action}
    </div>
  );
}

function HomeView({ onNavigate }: { onNavigate: (mode: WorkspaceModule) => void }) {
  const towers = [
    { icon: 'folder_open', title: 'Expedientes', value: '12', label: 'asuntos activos', tone: 'bg-blue-50 text-blue-700', action: 'expedientes' as const },
    { icon: 'description', title: 'Redacción', value: '04', label: 'borradores recientes', tone: 'bg-amber-50 text-amber-700', action: 'biblioteca' as const },
    { icon: 'gavel', title: 'Investigación', value: '08', label: 'criterios pendientes', tone: 'bg-emerald-50 text-emerald-700', action: 'jurisprudencia' as const },
  ];
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-6 md:px-8">
      <Header eyebrow="Centro de trabajo" title="Inicio" description="Tu despacho jurídico, organizado en un solo lugar." action={<button type="button" onClick={() => onNavigate('expedientes')} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0B2545] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#081d39]"><Icon>add</Icon> Nuevo expediente</button>} />
      <div className="workspace-home-towers grid grid-cols-1 gap-4 lg:grid-cols-3">
        {towers.map((tower) => (
          <button key={tower.title} type="button" onClick={() => onNavigate(tower.action)} className={`${card} group min-h-[210px] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#B58A5A] hover:shadow-lg`}>
            <div className="flex items-start justify-between"><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tower.tone}`}><Icon>{tower.icon}</Icon></span><Icon className="text-slate-300 transition group-hover:text-[#B58A5A]">arrow_forward</Icon></div>
            <p className="mt-9 text-sm font-bold text-slate-500">{tower.title}</p>
            <div className="mt-1 flex items-end gap-3"><strong className="text-4xl font-extrabold tracking-tight text-[#0B2545]">{tower.value}</strong><span className="pb-1 text-sm text-slate-500">{tower.label}</span></div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-2/3 rounded-full bg-[#B58A5A]" /></div>
          </button>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <section className={`${card} p-5`}><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-[#0B2545]">Actividad reciente</h2><p className={`mt-1 text-xs ${muted}`}>Últimos movimientos de tu espacio de trabajo.</p></div><button type="button" onClick={() => onNavigate('expedientes')} className="text-xs font-bold text-[#0B5ED7]">Ver todos</button></div><div className="mt-4 divide-y divide-slate-100">{['800/2024 · Contestación revisada', '512/2024 · Nuevo documento agregado', 'Criterio 2021456 · Guardado en favoritos'].map((item, index) => <div key={item} className="flex items-center gap-3 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-[#0B2545]"><Icon className="text-[18px]">{index === 2 ? 'bookmark' : 'history'}</Icon></span><span className="text-sm font-semibold text-slate-700">{item}</span><span className="ml-auto text-xs text-slate-400">{index + 1} h</span></div>)}</div></section>
        <section className={`${card} p-5`}><div className="flex items-center gap-2"><Icon className="text-[#B58A5A]">event</Icon><h2 className="text-lg font-extrabold text-[#0B2545]">Próximos términos</h2></div><p className={`mt-1 text-xs ${muted}`}>Revisa tus fechas críticas.</p><div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-amber-700">En 3 días</p><p className="mt-1 text-sm font-bold text-slate-800">Contestación · EXP-800/2026</p><p className="mt-1 text-xs text-slate-500">Juzgado 3º Civil CDMX</p></div><button type="button" onClick={() => onNavigate('terminos')} className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-[#0B2545] hover:bg-slate-50">Abrir cómputo de términos</button></section>
      </div>
    </div>
  );
}

function TemplatesView() {
  return <WorkspaceFrame title="Mis Plantillas" eyebrow="Biblioteca personal" description="Tus formatos reutilizables, ordenados para volver a trabajar rápido." action="Nueva plantilla"><div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"><section className={`${card} p-5`}><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_150px]"><label className="relative"><Icon className="absolute left-3 top-3 text-[20px] text-slate-400">search</Icon><input className={`${input} pl-10`} placeholder="Buscar plantillas..." /></label><select className={input} defaultValue="todas"><option value="todas">Todas las materias</option><option>Civil</option><option>Amparo</option><option>Mercantil</option></select><select className={input} defaultValue="recientes"><option value="recientes">Más recientes</option><option>Favoritas</option><option>Más usadas</option></select></div><div className="mt-5 flex items-center justify-between border-b border-slate-100 pb-3"><div><h2 className="text-lg font-extrabold text-[#0B2545]">Tus formatos</h2><p className={`mt-1 text-xs ${muted}`}>4 plantillas disponibles</p></div><button type="button" className="text-xs font-bold text-[#0B5ED7]">Solo favoritas</button></div><div className="mt-3 grid gap-3 md:grid-cols-2">{['Contestación de demanda civil', 'Recurso de apelación civil', 'Escrito de pruebas', 'Solicitud de copias certificadas'].map((name, index) => <article key={name} className="rounded-xl border border-slate-200 p-4 transition hover:border-[#B58A5A]"><div className="flex items-start justify-between"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-[#0B5ED7]"><Icon className="text-[19px]">description</Icon></span><button type="button" aria-label={`Marcar ${name} como favorita`} className="text-slate-400 hover:text-amber-500"><Icon>star</Icon></button></div><h3 className="mt-4 text-sm font-extrabold text-[#0B2545]">{name}</h3><p className="mt-1 text-xs text-slate-500">{index % 2 ? 'Amparo' : 'Civil'} · Editada hace {index + 1} días</p><div className="mt-4 flex gap-2"><button type="button" className="flex-1 rounded-lg bg-[#0B2545] py-2 text-xs font-bold text-white">Usar</button><button type="button" className="rounded-lg border border-slate-200 px-3 text-slate-600" aria-label={`Más acciones para ${name}`}><Icon className="text-[18px]">more_horiz</Icon></button></div></article>)}</div></section><aside className={`${card} p-5`}><p className="text-xs font-bold uppercase tracking-wider text-[#B58A5A]">Resumen</p><h2 className="mt-2 text-xl font-extrabold text-[#0B2545]">Tu biblioteca</h2><div className="mt-5 space-y-3">{[['star', 'Favoritas', '2'], ['trending_up', 'Más usadas', '3'], ['schedule', 'Editadas esta semana', '1']].map(([icon, label, value]) => <div key={label} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Icon className="text-[#B58A5A]">{icon}</Icon><span className="flex-1 text-sm font-semibold text-slate-700">{label}</span><strong className="text-lg text-[#0B2545]">{value}</strong></div>)}</div></aside></div></WorkspaceFrame>;
}

function ExpedientesView() {
  const rows = [['EXP-800/2026', 'Yahir Valenzuela vs. Grupo Norte', 'Civil', 'Juzgado 3º Civil CDMX', 'En trámite', 'Contestación · 3 días'], ['512/2024', 'Banco Fiduciario vs. Grupo Logístico', 'Mercantil', 'Juzgado 2º Mercantil', 'Pruebas', 'Audiencia · 12 sep'], ['AD-114/2025', 'María López', 'Amparo', 'TCC en Materia Civil', 'Revisión', 'Proyecto · 18 sep']];
  return <WorkspaceFrame title="Expedientes" eyebrow="Gestor de asuntos" description="Consulta causas, partes, órganos y próximas actuaciones." action="Nuevo expediente"><div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"><section className={`${card} overflow-hidden`}><div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row"><label className="relative flex-1"><Icon className="absolute left-3 top-3 text-[20px] text-slate-400">search</Icon><input className={`${input} pl-10`} placeholder="Buscar expediente, cliente o juzgado..." /></label><select className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"><option>Todos los estados</option><option>En trámite</option><option>Revisión</option></select><button type="button" className="rounded-xl border border-slate-200 px-4 text-xs font-bold text-[#0B2545]">Filtros</button></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr>{['Expediente', 'Cliente / partes', 'Materia', 'Juzgado', 'Estado', 'Próxima actuación'].map((head) => <th key={head} className="px-5 py-3 font-bold">{head}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => <tr key={row[0]} className="cursor-pointer hover:bg-slate-50">{row.map((cell, index) => <td key={cell} className={`px-5 py-4 ${index === 0 ? 'font-bold text-[#0B2545]' : 'text-slate-600'}`}>{cell}</td>)}</tr>)}</tbody></table></div></section><aside className={`${card} p-5`}><div className="flex items-center gap-2"><Icon className="text-[#B58A5A]">folder_open</Icon><h2 className="text-lg font-extrabold text-[#0B2545]">EXP-800/2026</h2></div><p className="mt-1 text-xs text-slate-500">Resumen del expediente seleccionado</p><dl className="mt-5 space-y-3 text-sm"><div><dt className="text-xs text-slate-400">Partes</dt><dd className="font-semibold text-slate-700">Yahir Valenzuela vs. Grupo Norte</dd></div><div><dt className="text-xs text-slate-400">Estado</dt><dd className="font-semibold text-emerald-700">En trámite</dd></div></dl><div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Timeline</h3>{['Documento recibido', 'Análisis jurídico', 'Próxima actuación'].map((item, index) => <div key={item} className="mt-3 flex gap-3"><span className={`mt-1 h-2 w-2 rounded-full ${index === 2 ? 'bg-amber-500' : 'bg-[#0B2545]'}`} /><span className="text-xs text-slate-600">{item}</span></div>)}</div></aside></div></WorkspaceFrame>;
}

function TermsView() {
  const [date, setDate] = useState('2026-09-22');
  const deadline = useMemo(() => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + 10); return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }); }, [date]);
 return <WorkspaceFrame title="Cómputo de Términos" eyebrow="Herramienta procesal" description="Calcula fechas límite con claridad y deja un historial consultable."><div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"><section className={`${card} p-5`}><h2 className="text-lg font-extrabold text-[#0B2545]">Datos del término</h2><div className="mt-5 space-y-4"><label className="block text-xs font-bold text-slate-600">Fecha de notificación<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1.5`} /></label><label className="block text-xs font-bold text-slate-600">Tipo de término<select className={`${input} mt-1.5`}><option>Contestación de demanda</option><option>Recurso</option><option>Promoción libre</option></select></label><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-bold text-slate-600">Días<input defaultValue="10" type="number" className={`${input} mt-1.5`} /></label><label className="block text-xs font-bold text-slate-600">Calendario<select className={`${input} mt-1.5`}><option>Hábiles</option><option>Naturales</option></select></label></div><label className="block text-xs font-bold text-slate-600">Materia<select className={`${input} mt-1.5`}><option>Civil</option><option>Mercantil</option><option>Amparo</option></select></label><button type="button" className="w-full rounded-xl bg-[#0B2545] py-3 text-sm font-bold text-white">Calcular término</button></div></section><div className="space-y-4"><section className="rounded-2xl bg-[#0B2545] p-6 text-white shadow-lg"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#D6B887]">Fecha límite</p><p className="mt-3 text-3xl font-extrabold">{deadline}</p><p className="mt-2 text-sm text-slate-300">Cómputo provisional · excluye días inhábiles registrados</p></section><section className={`${card} p-5`}><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold text-[#0B2545]">Calendario</h2><span className="text-xs font-bold text-slate-500">Septiembre 2026</span></div><div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs">{['L','M','M','J','V','S','D'].map((day, index) => <span key={`${day}-${index}`} className="py-2 font-bold text-slate-400">{day}</span>)}{Array.from({ length: 30 }, (_, i) => <span key={i} className={`rounded-lg py-2 ${i + 1 === 22 ? 'bg-[#0B2545] font-bold text-white' : i + 1 === 30 ? 'bg-amber-100 font-bold text-amber-800' : 'text-slate-600 hover:bg-slate-50'}`}>{i + 1}</span>)}</div></section><section className={`${card} p-5`}><h2 className="text-sm font-extrabold text-[#0B2545]">Historial de cómputos</h2><p className="mt-3 text-xs text-slate-500">Aún no hay cálculos guardados en esta sesión.</p></section></div></div></WorkspaceFrame>;
}

function ResearchView() {
  return <WorkspaceFrame title="Jurisprudencia SCJN" eyebrow="Investigación jurídica" description="Encuentra criterios con una lectura clara de su autoridad y materia."><div className="grid grid-cols-1 gap-4 xl:grid-cols-[210px_minmax(0,1fr)_300px]"><aside className={`${card} p-4`}><h2 className="text-sm font-extrabold text-[#0B2545]">Filtros</h2>{['Materia', 'Tipo de criterio', 'Órgano', 'Fecha', 'Registro'].map((label) => <label key={label} className="mt-4 block text-xs font-bold text-slate-600">{label}<select className={`${input} mt-1.5`}><option>Todos</option><option>Civil</option><option>Amparo</option></select></label>)}</aside><section className="min-w-0"><div className={`${card} flex items-center gap-2 p-3`}><Icon className="text-slate-400">search</Icon><input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar rubro, registro, texto o materia..." /><button type="button" className="rounded-lg bg-[#0B2545] px-4 py-2 text-xs font-bold text-white">Buscar</button></div><div className="mt-4 space-y-3">{['Prueba ilícita. Su exclusión del proceso constituye una garantía constitucional.', 'Tutela judicial efectiva. Alcance del derecho de acceso a la justicia.', 'Carga de la prueba. Reglas aplicables en materia civil.'].map((title, index) => <article key={title} className={`${card} cursor-pointer p-4 hover:border-[#B58A5A]`}><div className="flex items-center gap-2"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Jurisprudencia</span><span className="text-xs text-slate-400">Registro 20{21450 + index}</span></div><h3 className="mt-3 text-sm font-extrabold leading-snug text-[#0B2545]">{title}</h3><p className="mt-2 text-xs leading-relaxed text-slate-500">Primera Sala · Undécima Época · Criterio localizado en el Semanario Judicial.</p></article>)}</div></section><aside className={`${card} p-5`}><p className="text-xs font-bold uppercase tracking-wide text-[#B58A5A]">Criterio seleccionado</p><h2 className="mt-3 text-lg font-extrabold text-[#0B2545]">Ficha jurisprudencial</h2><p className="mt-3 text-sm leading-relaxed text-slate-600">Selecciona un resultado para consultar su rubro, texto, precedentes y relación con tu expediente.</p><button type="button" className="mt-5 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-[#0B2545]">Guardar en biblioteca</button></aside></div></WorkspaceFrame>;
}

function LibraryView() { return <WorkspaceFrame title="Biblioteca" eyebrow="Centro documental" description="Leyes, códigos, reglamentos, formatos y referencias de consulta."><div className="grid grid-cols-1 gap-4 xl:grid-cols-[190px_minmax(0,1fr)_280px]"><aside className={`${card} p-4`}><h2 className="text-sm font-extrabold text-[#0B2545]">Colecciones</h2>{['Constituciones', 'Códigos', 'Leyes', 'Reglamentos', 'Formatos', 'Doctrina'].map((item, index) => <button key={item} type="button" className={`mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${index === 1 ? 'bg-[#0B2545] text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="text-[18px]">folder</Icon>{item}</button>)}</aside><section><div className={`${card} flex items-center gap-2 p-3`}><Icon className="text-slate-400">search</Icon><input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar en la biblioteca..." /></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{['Código Nacional de Procedimientos Civiles', 'Código de Comercio', 'Ley de Amparo', 'Constitución Política'].map((item) => <article key={item} className={`${card} p-4`}><Icon className="text-[#B58A5A]">menu_book</Icon><h3 className="mt-3 text-sm font-extrabold text-[#0B2545]">{item}</h3><p className="mt-1 text-xs text-slate-500">Documento oficial · Actualizado 2026</p><button type="button" className="mt-4 text-xs font-bold text-[#0B5ED7]">Abrir documento →</button></article>)}</div></section><aside className={`${card} p-5`}><p className="text-xs font-bold uppercase tracking-wide text-[#B58A5A]">Vista previa</p><div className="mt-4 rounded-xl bg-slate-50 p-4"><Icon className="text-3xl text-slate-300">article</Icon><p className="mt-3 text-sm font-bold text-[#0B2545]">Selecciona un documento</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Aquí aparecerán sus datos, favoritos y documentos relacionados.</p></div></aside></div></WorkspaceFrame>; }

function AlertsView() { return <WorkspaceFrame title="Alertas DOF y Boletín" eyebrow="Novedades legales" description="Revisa publicaciones y cambios relevantes para tu práctica."><div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]"><section><div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[['campaign', 'Nuevas alertas', '12'], ['today', 'Últimas publicadas', '08'], ['priority_high', 'Pendientes de revisar', '03']].map(([icon, label, value]) => <div key={label} className={`${card} p-4`}><Icon className="text-[#B58A5A]">{icon}</Icon><strong className="mt-2 block text-2xl font-extrabold text-[#0B2545]">{value}</strong><span className="text-xs text-slate-500">{label}</span></div>)}</div><div className={`${card} mt-4 p-4`}><div className="flex flex-col gap-3 md:flex-row"><input className={input} placeholder="Buscar alertas..." /><select className={input}><option>Todas las fuentes</option><option>DOF</option><option>Boletín judicial</option></select><select className={input}><option>Todas las prioridades</option><option>Críticas</option><option>Informativas</option></select></div><div className="mt-4 divide-y divide-slate-100">{['Reforma publicada en materia de justicia alternativa', 'Acuerdo general del órgano jurisdiccional', 'Actualización de criterios fiscales'].map((title, index) => <article key={title} className="flex gap-3 py-4"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${index === 0 ? 'bg-red-500' : 'bg-[#B58A5A]'}`} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold text-[#0B2545]">{title}</h3><span className="text-[10px] font-bold uppercase text-slate-400">{index === 0 ? 'Crítica' : 'Informativa'}</span></div><p className="mt-1 text-xs text-slate-500">DOF · 22 de septiembre de 2026 · Extracto breve de la publicación relevante.</p></div></article>)}</div></div></section><aside className={`${card} p-5`}><p className="text-xs font-bold uppercase tracking-wide text-[#B58A5A]">Detalle de alerta</p><h2 className="mt-3 text-lg font-extrabold text-[#0B2545]">Selecciona una novedad</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">Consulta el origen, extracto completo y relación con tus expedientes.</p></aside></div></WorkspaceFrame>; }

function SettingsView() {
  const [section, setSection] = useState<'perfil' | 'metricas'>('perfil');
  const providers = [
    { name: 'Gemini', model: 'gemini-flash-lite-latest', status: 'En línea', latency: '1.2 s', tone: 'bg-emerald-50 text-emerald-700' },
    { name: 'Groq', model: 'llama-3.3-70b-versatile', status: 'En línea', latency: '0.8 s', tone: 'bg-emerald-50 text-emerald-700' },
    { name: 'NVIDIA', model: 'llama-3.2-11b-vision-instruct', status: 'En línea', latency: '1.6 s', tone: 'bg-emerald-50 text-emerald-700' },
  ];

  return (
    <WorkspaceFrame title="Configuración" eyebrow="Preferencias del despacho" description="Administra tu perfil, apariencia, documentos, integraciones y métricas.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[210px_minmax(0,1fr)]">
        <aside className={`${card} h-fit p-3`}>
          {[
            ['perfil', 'Perfil del abogado'],
            ['metricas', 'Métricas del sistema'],
            ['firma', 'Firma electrónica'],
            ['apariencia', 'Apariencia'],
            ['notificaciones', 'Notificaciones'],
            ['documentos', 'Documentos'],
            ['integraciones', 'Integraciones'],
            ['seguridad', 'Seguridad'],
          ].map(([value, label], index) => (
            <button type="button" key={value} onClick={() => (value === 'perfil' || value === 'metricas') && setSection(value as 'perfil' | 'metricas')} className={`flex w-full items-center rounded-lg px-3 py-3 text-left text-xs font-bold ${section === value || (section === 'perfil' && index === 0) ? 'bg-[#0B2545] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </aside>

        {section === 'metricas' ? (
          <section className="space-y-4">
            <div className={`${card} p-5`}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-xl font-extrabold text-[#0B2545]">Métricas del sistema</h2><p className="mt-1 text-sm text-slate-500">Registro local de uso y disponibilidad. Se conectará a telemetría real posteriormente.</p></div><span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Vista de demostración</span></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['schedule', 'Tiempo de uso', '03 h 42 min', 'Esta sesión'],
                  ['api', 'Llamadas al API', '128', '124 exitosas · 4 fallidas'],
                  ['speed', 'Latencia promedio', '1.2 s', 'Últimas 24 horas'],
                  ['data_usage', 'Documentos procesados', '26', '12.4 MB analizados'],
                ].map(([icon, label, value, detail]) => <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Icon className="text-[#B58A5A]">{icon}</Icon><p className="mt-3 text-xs font-bold text-slate-500">{label}</p><strong className="mt-1 block text-2xl font-extrabold text-[#0B2545]">{value}</strong><p className="mt-1 text-[11px] text-slate-500">{detail}</p></div>)}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className={`${card} p-5`}><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-[#0B2545]">Estado de las IAs</h2><p className="mt-1 text-xs text-slate-500">Disponibilidad del último chequeo de proveedores.</p></div><button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#0B2545] hover:bg-slate-50">Actualizar</button></div><div className="mt-4 space-y-3">{providers.map((provider) => <div key={provider.name} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-[#0B2545]"><Icon>smart_toy</Icon></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold text-[#0B2545]">{provider.name}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${provider.tone}`}><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />{provider.status}</span></div><p className="mt-1 truncate text-xs text-slate-500">{provider.model}</p></div><div className="text-left sm:text-right"><p className="text-[11px] text-slate-400">Latencia</p><p className="text-sm font-bold text-slate-700">{provider.latency}</p></div></div>)}</div></section>
              <section className={`${card} p-5`}><h2 className="text-lg font-extrabold text-[#0B2545]">Resumen de consumo</h2><div className="mt-5 space-y-4">{[['Generación', '64 llamadas', '62%'], ['Análisis', '38 llamadas', '36%'], ['Exportación', '26 llamadas', '22%']].map(([label, value, percentage]) => <div key={label}><div className="flex justify-between text-xs"><span className="font-semibold text-slate-600">{label}</span><span className="font-bold text-[#0B2545]">{value}</span></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#B58A5A]" style={{ width: percentage }} /></div></div>)}</div><p className="mt-5 border-t border-slate-100 pt-4 text-[11px] leading-relaxed text-slate-500">Los porcentajes son informativos y se actualizarán al conectar el registro real de eventos.</p></section>
            </div>

            <section className={`${card} p-5`}><div className="flex items-center justify-between"><div><h2 className="text-lg font-extrabold text-[#0B2545]">Actividad reciente</h2><p className="mt-1 text-xs text-slate-500">Últimas operaciones registradas en esta sesión.</p></div><button type="button" className="text-xs font-bold text-[#0B5ED7]">Exportar registro</button></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400"><tr>{['Hora', 'Servicio', 'Operación', 'Estado', 'Duración'].map((heading) => <th key={heading} className="px-3 py-3 font-bold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{[['20:18', 'Gemini', 'Generación de sección', 'Correcta', '1.1 s'], ['20:16', 'Groq', 'Clasificación de documento', 'Correcta', '0.8 s'], ['20:12', 'NVIDIA', 'Análisis visual', 'Correcta', '1.6 s'], ['20:08', 'Gemini', 'Consulta de criterio', 'Reintento', '2.4 s']].map((row) => <tr key={`${row[0]}-${row[1]}`} className="hover:bg-slate-50">{row.map((cell, index) => <td key={cell} className={`px-3 py-3 ${index === 3 ? (cell === 'Reintento' ? 'font-bold text-amber-700' : 'font-bold text-emerald-700') : 'text-slate-600'}`}>{cell}</td>)}</tr>)}</tbody></table></div></section>
          </section>
        ) : (
          <section className={`${card} p-5`}><h2 className="text-xl font-extrabold text-[#0B2545]">Perfil del abogado / despacho</h2><p className="mt-1 text-sm text-slate-500">Estos datos aparecerán en tus documentos cuando los conectes.</p><div className="mt-6 grid gap-4 md:grid-cols-2"><label className="text-xs font-bold text-slate-600">Nombre<input className={`${input} mt-1.5`} defaultValue="Yahir Valenzuela" /></label><label className="text-xs font-bold text-slate-600">Despacho<input className={`${input} mt-1.5`} defaultValue="LexPlantillas" /></label><label className="text-xs font-bold text-slate-600">Cédula profesional<input className={`${input} mt-1.5`} placeholder="Pendiente de configurar" /></label><label className="text-xs font-bold text-slate-600">Correo<input className={`${input} mt-1.5`} placeholder="correo@despacho.mx" /></label></div><button type="button" className="mt-6 rounded-xl bg-[#0B2545] px-4 py-3 text-xs font-bold text-white">Guardar cambios</button></section>
        )}
      </div>
    </WorkspaceFrame>
  );
}

function HelpView() { return <WorkspaceFrame title="Ayuda" eyebrow="Centro de soporte" description="Resuelve dudas y conoce las mejores prácticas del sistema."><div className={`${card} mx-auto max-w-3xl p-5`}><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4"><Icon className="text-slate-400">search</Icon><input className="h-12 w-full bg-transparent text-sm outline-none" placeholder="¿Qué necesitas saber?" /></div><div className="mt-6 grid gap-3 md:grid-cols-2">{[['help', 'Preguntas frecuentes', 'Respuestas rápidas para empezar.'], ['school', 'Guías rápidas', 'Aprende a trabajar por módulos.'], ['play_circle', 'Tutoriales', 'Recorridos paso a paso.'], ['support_agent', 'Contacto y soporte', 'Estamos para ayudarte.']].map(([icon, title, description]) => <button type="button" key={title} className="rounded-xl border border-slate-200 p-4 text-left hover:border-[#B58A5A]"><Icon className="text-[#B58A5A]">{icon}</Icon><h2 className="mt-3 text-sm font-extrabold text-[#0B2545]">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></button>)}</div><div className="mt-5 rounded-xl bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">Estado del sistema: operativo</p><p className="mt-1 text-xs text-emerald-700/80">Última actualización: hoy · versión de trabajo estable.</p></div></div></WorkspaceFrame>; }

function WorkspaceFrame({ title, eyebrow, description, action, children }: { title: string; eyebrow: string; description: string; action?: string; children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1600px] px-5 py-6 md:px-8"><Header title={title} eyebrow={eyebrow} description={description} action={action ? <button type="button" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0B2545] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#081d39]"><Icon>add</Icon>{action}</button> : undefined} />{children}</div>;
}

export function WorkspaceModulesView({ mode, onNavigate }: WorkspaceModulesViewProps) {
  if (mode === 'inicio') return <HomeView onNavigate={onNavigate} />;
  if (mode === 'expedientes') return <ExpedientesView />;
  if (mode === 'terminos') return <TermsView />;
  if (mode === 'jurisprudencia') return <ResearchView />;
  if (mode === 'biblioteca') return <LibraryView />;
  if (mode === 'alertas') return <AlertsView />;
  if (mode === 'configuracion') return <SettingsView />;
  if (mode === 'ayuda') return <HelpView />;
  return <TemplatesView />;
}

export default WorkspaceModulesView;
