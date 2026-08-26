export type MatchStatus = 'Coincidencia' | 'Revisar' | 'Huérfano' | 'Confirmada' | 'Rechazada';
export type MatchCandidate = { code: string; score: number };
export type MatchRecord = { id: string; source: string; sourceCode: string; crmCode: string; score: number; status: MatchStatus; candidates: MatchCandidate[] };
export type MasterProduct = { code: string; alternativeCode?: string; brand?: string; description?: string };

export function normalizeCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const old = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = old;
    }
  }
  return previous[b.length];
}

export async function matchCodes(source: string, sourceCodes: string[], masterProducts: MasterProduct[], onProgress?: (value: number) => void) {
  const exact = new Map<string, string>();
  const buckets = new Map<string, Array<{ code: string; normalized: string }>>();
  for (const product of masterProducts) {
    for (const alias of [product.code, product.alternativeCode]) {
      const normalized = normalizeCode(alias);
      if (!normalized) continue;
      exact.set(normalized, product.code);
      const key = `${normalized.slice(0, 2)}:${normalized.length}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push({ code: product.code, normalized }); buckets.set(key, bucket);
    }
  }
  const results: MatchRecord[] = [];
  for (let index = 0; index < sourceCodes.length; index += 1) {
    const sourceCode = sourceCodes[index];
    const normalized = normalizeCode(sourceCode);
    const exactCode = exact.get(normalized);
    if (exactCode) {
      results.push({ id: crypto.randomUUID(), source, sourceCode, crmCode: exactCode, score: 100, status: 'Coincidencia', candidates: [{ code: exactCode, score: 100 }] });
    } else {
      const pool: Array<{ code: string; normalized: string }> = [];
      for (let delta = -3; delta <= 3; delta += 1) pool.push(...(buckets.get(`${normalized.slice(0, 2)}:${normalized.length + delta}`) ?? []));
      const ranked = pool.slice(0, 700).map((item) => ({ code: item.code, score: Math.round((1 - levenshtein(normalized, item.normalized) / Math.max(normalized.length, item.normalized.length, 1)) * 100) })).filter((item) => item.score >= 60).sort((a, b) => b.score - a.score);
      const candidates = Array.from(new Map(ranked.map((item) => [item.code, item])).values()).slice(0, 3);
      const best = candidates[0];
      results.push({ id: crypto.randomUUID(), source, sourceCode, crmCode: best?.code ?? '—', score: best?.score ?? 0, status: best && best.score >= 75 ? 'Revisar' : 'Huérfano', candidates });
    }
    if (index % 200 === 0) { onProgress?.(Math.round((index / Math.max(sourceCodes.length, 1)) * 100)); await new Promise((resolve) => setTimeout(resolve, 0)); }
  }
  onProgress?.(100);
  return results;
}
