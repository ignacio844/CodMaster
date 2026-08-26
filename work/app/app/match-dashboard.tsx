'use client';

import { upload } from '@vercel/blob/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { detectCodeColumn } from '../lib/column-detection';
import { matchCodes, type MasterProduct, type MatchRecord } from '../lib/matching';
import type { AppRole, AppUser } from '../lib/store';

type ImportRecord = { id: string; source: string; filename: string; row_count: number; matched_count: number; review_count: number; orphan_count: number; created_at: string };
type TeamUser = { user_id: string; email: string; display_name: string; role: AppRole; system: string | null };
type DashboardPayload = { user: AppUser; imports: ImportRecord[]; users: TeamUser[]; rows: MatchRecord[]; rowTotal: number; decisions: Array<{ row_id: string; crm_code: string; score: number; status: MatchRecord['status'] }>; currentImportId: string | null };
const systems = ['Octosis', 'Sistema de Facturación', 'MELI / Kobo', 'Torettos', 'Warnes'];
const filters = ['Todos', 'Coincidencia', 'Revisar', 'Huérfano', 'Confirmada'] as const;
const emptyRows: MatchRecord[] = [];

function parseCsv(text: string) {
  return text.split(/\r?\n/).filter(Boolean).map((line) => line.split(/[,;\t]/).map((cell) => cell.trim().replace(/^"|"$/g, '')));
}

export default function MatchDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]>('Todos');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<'upload' | 'orphans' | 'team' | 'review' | null>(null);
  const [selected, setSelected] = useState<MatchRecord | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [matrix, setMatrix] = useState<Array<Array<unknown>>>([]);
  const [column, setColumn] = useState(0);
  const [source, setSource] = useState(systems[0]);

  const fetchDashboard = useCallback(async (importId?: string) => {
    const response = await fetch(`/api/dashboard${importId ? `?importId=${encodeURIComponent(importId)}` : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar la información compartida.');
    const payload = await response.json() as DashboardPayload;
    const decisions = new Map(payload.decisions.map((item) => [item.row_id, item]));
    payload.rows = payload.rows.map((row) => decisions.has(row.id) ? { ...row, crmCode: String(decisions.get(row.id)?.crm_code), score: Number(decisions.get(row.id)?.score), status: decisions.get(row.id)?.status ?? row.status } : row);
    return payload;
  }, []);

  const loadDashboard = useCallback(async (importId?: string) => {
    setData(await fetchDashboard(importId));
  }, [fetchDashboard]);

  useEffect(() => {
    let active = true;
    void fetchDashboard().then(
      (payload) => { if (active) setData(payload); },
      (error: Error) => { if (active) setNotice(error.message); },
    );
    return () => { active = false; };
  }, [fetchDashboard]);
  const latest = data?.imports.find((item) => item.id === data.currentImportId) ?? data?.imports.find((item) => item.source !== 'CRM BAMinds');
  const hasMaster = data?.imports.some((item) => item.source === 'CRM BAMinds') ?? false;
  const rows = data?.rows ?? emptyRows;
  const visibleRows = useMemo(() => rows.filter((row) => (filter === 'Todos' || row.status === filter) && (!search || `${row.source} ${row.sourceCode} ${row.crmCode}`.toUpperCase().includes(search.toUpperCase()))), [rows, filter, search]);
  const totalCrm = data?.imports.find((item) => item.source === 'CRM BAMinds')?.row_count ?? 0;
  const roleLabels: Record<AppRole, string> = { ADMIN: 'Administrador', RESPONSIBLE: 'Responsable', REVIEWER: 'Revisor', VIEWER: 'Consulta' };

  async function pickFile(nextFile: File | null) {
    if (!nextFile) return;
    setBusy(true); setNotice('Leyendo columnas del archivo…'); setFile(nextFile);
    try {
      const nextMatrix = nextFile.name.toLowerCase().endsWith('.csv')
        ? parseCsv(await nextFile.text())
        : await import('read-excel-file').then(({ default: readXlsxFile }) => readXlsxFile(nextFile)) as Array<Array<unknown>>;
      if (nextMatrix.length < 2) throw new Error('El archivo no contiene filas suficientes.');
      const detected = detectCodeColumn(nextMatrix);
      setMatrix(nextMatrix); setColumn(detected); setNotice(`${nextMatrix.length - 1} filas detectadas. Reconocimos “${String(nextMatrix[0][detected] || `Columna ${detected + 1}`)}” como columna de códigos.`);
    } catch { setFile(null); setMatrix([]); setNotice('No se pudo leer el archivo. Verificá que sea un Excel o CSV válido.'); }
    finally { setBusy(false); }
  }

  async function submitImport() {
    if (!file || !matrix.length || !data) return;
    if (source !== 'CRM BAMinds' && !hasMaster) { setNotice('Primero un administrador debe cargar la base maestra de CRM BAMinds.'); return; }
    setBusy(true); setProgress(0); setNotice('Preparando códigos…');
    try {
      const codes = matrix.slice(1).map((row) => String(row[column] ?? '').trim()).filter(Boolean);
      const masterResponse = await fetch('/api/master');
      const master = await masterResponse.json() as { products: MasterProduct[] };
      const results = await matchCodes(source, codes, master.products, setProgress);
      const resultsText = JSON.stringify(results);
      const importId = crypto.randomUUID();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const sourcePayload = JSON.stringify({ importId, kind: 'source', source });
      const resultPayload = JSON.stringify({ importId, kind: 'results', source });
      setNotice('Subiendo el archivo de origen…');
      const sourceBlob = await upload(`imports/${importId}/${safeName}`, file, {
        access: 'private',
        handleUploadUrl: '/api/uploads',
        clientPayload: sourcePayload,
        multipart: file.size > 4 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage / 2)),
      });
      const resultFile = new Blob([resultsText], { type: 'application/json' });
      setNotice('Subiendo los resultados…');
      const resultBlob = await upload(`results/${importId}.json`, resultFile, {
        access: 'private',
        handleUploadUrl: '/api/uploads',
        clientPayload: resultPayload,
        multipart: resultFile.size > 4 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => setProgress(50 + Math.round(percentage / 2)),
      });
      const response = await fetch('/api/imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: importId, source, filename: file.name, objectKey: sourceBlob.pathname, resultKey: resultBlob.pathname }),
      });
      if (!response.ok) throw new Error(response.status === 403 ? 'No tenés permiso para cargar esta base.' : 'No se pudo guardar la importación.');
      await loadDashboard(); setDialog(null); setFile(null); setMatrix([]); setNotice('La base fue procesada y quedó disponible para el equipo.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Ocurrió un error al procesar el archivo.'); }
    finally { setBusy(false); setProgress(0); }
  }

  async function decide(status: 'Confirmada' | 'Rechazada', crmCode = selected?.crmCode ?? '') {
    if (!selected || !latest) return;
    setBusy(true);
    const response = await fetch('/api/decisions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ importId: latest.id, rowId: selected.id, source: selected.source, sourceCode: selected.sourceCode, crmCode, score: selected.score, status }) });
    if (response.ok) { await loadDashboard(); setDialog(null); setSelected(null); setNotice(status === 'Confirmada' ? 'Coincidencia confirmada.' : 'Sugerencia rechazada.'); }
    else setNotice('No tenés permiso para revisar coincidencias.');
    setBusy(false);
  }

  function exportCsv() {
    const content = [['Sistema', 'Código sistema', 'Código CRM', 'Coincidencia', 'Estado'], ...rows.map((row) => [row.source, row.sourceCode, row.crmCode, String(row.score), row.status])].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); anchor.download = 'coincidencias-sku.csv'; anchor.click(); URL.revokeObjectURL(anchor.href);
  }

  async function updateUser(userId: string, role: AppRole, system: string | null) {
    const response = await fetch('/api/users', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, role, system }) });
    if (response.ok) await loadDashboard(); else setNotice('No se pudo actualizar el permiso.');
  }

  async function loadMore() {
    if (!data?.currentImportId || data.rows.length >= data.rowTotal) return;
    setBusy(true);
    const response = await fetch(`/api/results?importId=${encodeURIComponent(data.currentImportId)}&offset=${data.rows.length}&limit=1000`);
    if (response.ok) {
      const next = await response.json() as { rows: MatchRecord[]; total: number };
      setData((current) => current ? { ...current, rows: [...current.rows, ...next.rows], rowTotal: next.total } : current);
    } else setNotice('No se pudieron cargar más filas.');
    setBusy(false);
  }

  const kpis: Array<{ value: number; label: string; hint: string; accent: 'accent' | 'success' | 'warning' | 'danger'; onClick?: () => void }> = [
    { value: totalCrm, label: 'Códigos CRM', hint: hasMaster ? 'Base de referencia cargada' : 'Falta cargar la base', accent: 'accent' },
    { value: latest?.matched_count ?? 0, label: 'Coincidencias', hint: 'Exactas normalizadas', accent: 'success' },
    { value: latest?.review_count ?? 0, label: 'Pendientes', hint: 'Requieren revisión', accent: 'warning' },
    { value: latest?.orphan_count ?? 0, label: 'Huérfanos', hint: 'Sin candidato confiable', accent: 'danger', onClick: () => setDialog('orphans') },
  ];
  const accentBorder: Record<string, string> = {
    accent: 'border-l-[var(--color-accent)]',
    success: 'border-l-[var(--color-success)]',
    warning: 'border-l-[var(--color-warning)]',
    danger: 'border-l-[var(--color-danger)]',
  };

  return (
    <main className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-paper)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-accent)] font-mono text-xs font-bold text-white">BA</div>
            <div>
              <p className="text-sm font-semibold tracking-tight">BAMinds</p>
              <p className="text-xs text-[var(--color-ink-muted)]">Control de códigos SKU</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.user.role === 'ADMIN' && (
              <button onClick={() => setDialog('team')} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]">
                Equipo
              </button>
            )}
            <button
              onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.reload(); }}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
            >
              Salir
            </button>
            <div className="mx-1 hidden h-6 w-px bg-[var(--color-border)] sm:block" />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{data?.user.displayName ?? 'Cargando…'}</p>
              <p className="text-xs text-[var(--color-ink-faint)]">{data ? roleLabels[data.user.role] : '—'}{data?.user.system ? ` · ${data.user.system}` : ''}</p>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-accent-soft)] text-xs font-bold text-[var(--color-accent-ink)]">
              {data?.user.displayName.slice(0, 2).toUpperCase() ?? 'BA'}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        {/* Page intro */}
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">Base central · CRM BAMinds</p>
            <h1 className="text-[26px] font-semibold tracking-tight sm:text-3xl">Coincidencias entre sistemas</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
              Cada responsable carga su base. Las coincidencias exactas se consolidan y el resto queda disponible para revisión.
            </p>
          </div>
          {data && ['ADMIN', 'RESPONSIBLE'].includes(data.user.role) && (
            <button
              onClick={() => { setSource(data.user.role === 'RESPONSIBLE' && data.user.system ? data.user.system : systems[0]); setDialog('upload'); setNotice(''); }}
              className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-strong)]"
            >
              + Cargar nueva base
            </button>
          )}
        </div>

        {notice && (
          <div role="status" className="mt-5 flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-teal)]/25 bg-[var(--color-teal-soft)] px-4 py-3 text-sm text-[var(--color-ink)]">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Cerrar aviso" className="rounded-[var(--radius-sm)] px-1 font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">×</button>
          </div>
        )}

        {/* KPI cards */}
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <button
              key={kpi.label}
              onClick={kpi.onClick}
              disabled={!kpi.onClick}
              className={`rounded-[var(--radius-lg)] border border-[var(--color-border)] border-l-[3px] ${accentBorder[kpi.accent]} bg-white p-5 text-left transition-colors ${kpi.onClick ? 'hover:border-[var(--color-border-strong)]' : 'cursor-default'}`}
            >
              <p className="font-mono text-2xl font-bold tabular-nums tracking-tight">{Number(kpi.value).toLocaleString('es-AR')}</p>
              <p className="mt-1.5 text-sm font-semibold text-[var(--color-ink)]">{kpi.label}</p>
              <p className="mt-3 text-xs text-[var(--color-ink-faint)]">{kpi.hint}</p>
            </button>
          ))}
        </div>

        {/* Results panel */}
        <section className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
          <div className="flex flex-col gap-4 border-b border-[var(--color-border)] px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="text-xs font-semibold text-[var(--color-ink-muted)]">
                Base compartida
                <select
                  value={data?.currentImportId ?? ''}
                  onChange={(event) => loadDashboard(event.target.value)}
                  className="ml-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-normal text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-accent)]"
                >
                  <option value="">Última importación</option>
                  {data?.imports.filter((item) => item.source !== 'CRM BAMinds').map((item) => <option key={item.id} value={item.id}>{item.source} · {item.filename}</option>)}
                </select>
              </label>
              <div className="flex gap-2">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Buscar código"
                  placeholder="Buscar código…"
                  className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus-visible:border-[var(--color-accent)]"
                />
                <button
                  onClick={exportCsv}
                  disabled={!rows.length}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Exportar
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`rounded-[var(--radius-full)] px-3 py-1.5 text-xs font-semibold transition-colors ${filter === item ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent-ink)]' : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-paper-2)]'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {!visibleRows.length ? (
            <div className="px-6 py-16 text-center">
              <p className="font-semibold text-[var(--color-ink)]">{data ? 'Todavía no hay resultados para mostrar' : 'Cargando información…'}</p>
              <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{hasMaster ? 'Cargá una base de otro sistema para comenzar el cruce.' : 'Un administrador debe cargar primero la base maestra de CRM.'}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[840px] border-collapse text-left text-sm">
                  <thead className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
                    <tr>{['Sistema', 'Código del sistema', 'Código CRM sugerido', 'Coincidencia', 'Estado', 'Acción'].map((head) => <th key={head} className="px-5 py-3 font-semibold">{head}</th>)}</tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.id} className={`border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-paper-2)] ${row.score === 100 || row.status === 'Confirmada' ? 'border-l-2 border-l-[var(--color-success)]' : ''}`}>
                        <td className="px-5 py-4 font-medium text-[var(--color-ink-muted)]">{row.source}</td>
                        <td className="px-5 py-4 font-mono text-xs font-semibold tabular-nums">{row.sourceCode}</td>
                        <td className="px-5 py-4 font-mono text-xs tabular-nums text-[var(--color-ink-muted)]">{row.crmCode}</td>
                        <td className="px-5 py-4">
                          <span className={`font-mono font-bold tabular-nums ${row.score === 100 ? 'text-[var(--color-success)]' : row.score ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]'}`}>{row.score}%</span>
                        </td>
                        <td className="px-5 py-4"><Status value={row.status} /></td>
                        <td className="px-5 py-4">
                          <button onClick={() => { setSelected(row); setDialog('review'); }} className="text-xs font-bold text-[var(--color-accent)] hover:underline">Ver detalle</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && data.rows.length < data.rowTotal && (
                <div className="border-t border-[var(--color-border)] p-4 text-center">
                  <button disabled={busy} onClick={loadMore} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)] disabled:opacity-50">
                    Cargar 1.000 filas más · {data.rows.length.toLocaleString('es-AR')} de {data.rowTotal.toLocaleString('es-AR')}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </section>

      {/* Dialogs */}
      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[var(--color-ink)]/50 p-4" onMouseDown={() => setDialog(null)}>
          <section role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="my-6 w-full max-w-2xl rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-6 shadow-[0_20px_60px_rgba(16,24,40,0.16)]">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight">{dialog === 'upload' ? 'Cargar una base' : dialog === 'orphans' ? 'Códigos huérfanos' : dialog === 'team' ? 'Usuarios y permisos' : 'Revisar coincidencia'}</h2>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{dialog === 'upload' ? 'El archivo se comparte con el equipo y se cruza contra CRM.' : dialog === 'team' ? 'Los usuarios aparecen después de ingresar por primera vez.' : 'Confirmá el candidato correcto o rechazá la sugerencia.'}</p>
              </div>
              <button aria-label="Cerrar" onClick={() => setDialog(null)} className="rounded-[var(--radius-sm)] px-2 py-1 text-xl text-[var(--color-ink-faint)] hover:bg-[var(--color-paper-2)]">×</button>
            </div>

            {dialog === 'upload' && (
              <div className="mt-6 space-y-4">
                <label className="block text-sm font-semibold">
                  Sistema
                  <select
                    value={source}
                    disabled={data?.user.role === 'RESPONSIBLE'}
                    onChange={(event) => setSource(event.target.value)}
                    className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-3 font-normal outline-none focus-visible:border-[var(--color-accent)] disabled:bg-[var(--color-paper-2)]"
                  >
                    {systems.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="grid cursor-pointer place-items-center rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border)] px-6 py-8 text-center transition-colors hover:border-[var(--color-accent)]">
                  <span className="font-semibold">{file?.name ?? 'Arrastrá el Excel o hacé clic para elegirlo'}</span>
                  <span className="mt-1 text-xs text-[var(--color-ink-faint)]">Formatos .xlsx o .csv · máximo 30 MB</span>
                  <input type="file" accept=".xlsx,.csv" onChange={(event) => pickFile(event.target.files?.[0] ?? null)} className="sr-only" />
                </label>
                {matrix.length > 0 && (
                  <label className="block text-sm font-semibold">
                    Columna detectada automáticamente
                    <select value={column} onChange={(event) => setColumn(Number(event.target.value))} className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-3 font-normal outline-none focus-visible:border-[var(--color-accent)]">
                      {matrix[0].map((header, index) => <option key={index} value={index}>{String(header || `Columna ${index + 1}`)}</option>)}
                    </select>
                    <span className="mt-1 block text-xs font-normal text-[var(--color-ink-faint)]">Podés corregirla antes de procesar si fuera necesario.</span>
                  </label>
                )}
                {busy && (
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-[var(--radius-full)] bg-[var(--color-paper-3)]">
                      <div className="h-full rounded-[var(--radius-full)] bg-[var(--color-accent)] transition-all duration-[var(--dur-base)] ease-[var(--ease-out)]" style={{ width: `${progress || 15}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Procesando… {progress ? `${progress}%` : ''}</p>
                  </div>
                )}
                <button disabled={!file || !matrix.length || busy} onClick={submitImport} className="w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-40">
                  Procesar y compartir
                </button>
              </div>
            )}

            {dialog === 'orphans' && (
              <div className="mt-5 max-h-[55vh] space-y-2 overflow-y-auto">
                {rows.filter((row) => row.status === 'Huérfano').map((row) => (
                  <div key={row.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] border-l-[3px] border-l-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4">
                    <div>
                      <p className="font-mono text-sm font-bold tabular-nums">{row.sourceCode}</p>
                      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{row.source}</p>
                    </div>
                    <button onClick={() => { setSelected(row); setDialog('review'); }} className="text-xs font-bold text-[var(--color-accent)] hover:underline">Asignar código</button>
                  </div>
                ))}
                {!rows.some((row) => row.status === 'Huérfano') && <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">No hay huérfanos en la última importación.</p>}
              </div>
            )}

            {dialog === 'team' && (
              <div className="mt-5 space-y-3">
                {data?.users.map((person) => (
                  <div key={person.user_id} className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 sm:grid-cols-[1fr_150px_180px]">
                    <div>
                      <p className="text-sm font-semibold">{person.display_name}</p>
                      <p className="text-xs text-[var(--color-ink-muted)]">{person.email}</p>
                    </div>
                    <select value={person.role} onChange={(event) => updateUser(person.user_id, event.target.value as AppRole, person.system)} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2 text-xs outline-none focus-visible:border-[var(--color-accent)]">
                      <option value="ADMIN">Administrador</option>
                      <option value="RESPONSIBLE">Responsable</option>
                      <option value="REVIEWER">Revisor</option>
                      <option value="VIEWER">Consulta</option>
                    </select>
                    <select value={person.system ?? ''} disabled={person.role !== 'RESPONSIBLE'} onChange={(event) => updateUser(person.user_id, person.role, event.target.value || null)} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-2 text-xs outline-none focus-visible:border-[var(--color-accent)] disabled:bg-[var(--color-paper-2)]">
                      <option value="">Todos / sin asignar</option>
                      {systems.map((item) => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {dialog === 'review' && selected && (
              <div className="mt-6">
                <div className="grid gap-3 rounded-[var(--radius-md)] bg-[var(--color-paper-2)] p-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-[var(--color-ink-muted)]">Código del sistema</p>
                    <p className="mt-1 font-mono text-sm font-bold tabular-nums">{selected.sourceCode}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-ink-muted)]">Mejor candidato</p>
                    <p className="mt-1 font-mono text-sm font-bold tabular-nums">{selected.crmCode}</p>
                  </div>
                </div>
                <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">Candidatos</p>
                <div className="mt-2 space-y-2">
                  {selected.candidates.length ? selected.candidates.map((candidate) => (
                    <button
                      key={candidate.code}
                      onClick={() => setSelected({ ...selected, crmCode: candidate.code, score: candidate.score })}
                      className={`flex w-full items-center justify-between rounded-[var(--radius-md)] border p-3 text-left transition-colors ${selected.crmCode === candidate.code ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]' : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'}`}
                    >
                      <span className="font-mono text-sm tabular-nums">{candidate.code}</span>
                      <strong className="font-mono text-sm tabular-nums">{candidate.score}%</strong>
                    </button>
                  )) : (
                    <input
                      value={selected.crmCode === '—' ? '' : selected.crmCode}
                      onChange={(event) => setSelected({ ...selected, crmCode: event.target.value, score: 100 })}
                      placeholder="Ingresar código CRM manualmente"
                      className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 text-sm outline-none focus-visible:border-[var(--color-accent)]"
                    />
                  )}
                </div>
                {['ADMIN', 'REVIEWER'].includes(data?.user.role ?? 'VIEWER') && (
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <button disabled={busy} onClick={() => decide('Rechazada')} className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/35 py-3 text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger-soft)] disabled:opacity-50">Rechazar</button>
                    <button disabled={busy || !selected.crmCode || selected.crmCode === '—'} onClick={() => decide('Confirmada')} className="rounded-[var(--radius-md)] bg-[var(--color-accent)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-accent-strong)] disabled:cursor-not-allowed disabled:opacity-40">Confirmar</button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function Status({ value }: { value: MatchRecord['status'] }) {
  const style = value === 'Coincidencia' || value === 'Confirmada'
    ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]'
    : value === 'Revisar'
      ? 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'
      : 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]';
  return <span className={`rounded-[var(--radius-full)] px-2.5 py-1 text-xs font-semibold ${style}`}>{value}</span>;
}
