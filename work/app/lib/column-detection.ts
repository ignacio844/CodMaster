import { normalizeCode } from './matching';

export function detectCodeColumn(matrix: Array<Array<unknown>>) {
  const headers = matrix[0].map((value) => String(value ?? '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const samples = matrix.slice(1, Math.min(matrix.length, 301));
  let best = { index: 0, score: -Infinity };
  headers.forEach((header, index) => {
    let score = 0;
    if (/^(CODIGO|COD|SKU|SELLER SKU|SELLER_SKU|CODIGO SKU|ID PRODUCTO|ITEM SKU)$/.test(header)) score += 100;
    else if (/(CODIGO|SKU)/.test(header)) score += 55;
    if (/(DESCRIP|PRECIO|STOCK|FECHA|MARCA|CANTIDAD)/.test(header)) score -= 45;
    const values = samples.map((row) => String(row[index] ?? '').trim()).filter(Boolean);
    const normalized = values.map(normalizeCode).filter(Boolean);
    if (values.length) {
      score += (normalized.length / values.length) * 15;
      score += (new Set(normalized).size / normalized.length) * 20;
      const identifierLike = values.filter((value) => /[A-Za-z]/.test(value) && /\d/.test(value) && value.length <= 50).length;
      score += (identifierLike / values.length) * 20;
    }
    if (score > best.score) best = { index, score };
  });
  return best.index;
}
