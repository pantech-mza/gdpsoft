// GDPSoft v3.13.47 — normativas en Excel (.xlsx/.xls).
// File Search de OpenAI no indexa planillas: se convierten a texto (una línea por fila,
// con el nombre de cada columna) y ese texto es el que se indexa. El archivo original
// se conserva intacto para «Ver fuente».

export const SPREADSHEET_EXTENSIONS = ['xlsx', 'xls'];
const MAX_CHARS = 1_500_000;
const MAX_CELL_CHARS = 1500;

export function isSpreadsheetFile(filename = '', bytes = null) {
  const ext = String(filename).toLowerCase().split('.').pop();
  if (!SPREADSHEET_EXTENSIONS.includes(ext)) return false;
  if (!bytes || bytes.length < 4) return true;
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const ole = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  return zip || ole;
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CELL_CHARS);

/** rowsBySheet: [{ name, rows: string[][] }] -> texto indexable. */
export function sheetsToText(sheets, title = '') {
  const parts = [];
  if (title) parts.push(`DOCUMENTO: ${title}`);
  for (const sheet of sheets || []) {
    const rows = (sheet.rows || []).map((row) => (row || []).map(clean)).filter((row) => row.some(Boolean));
    if (!rows.length) continue;
    parts.push(`HOJA: ${sheet.name}`);
    const header = rows[0].filter(Boolean).length > 1 && rows.length > 1 ? rows[0] : null;
    if (header) parts.push(`Columnas: ${header.filter(Boolean).join(' | ')}`);
    for (const row of header ? rows.slice(1) : rows) {
      const cells = row
        .map((cell, index) => (cell ? (header && header[index] ? `${header[index]}: ${cell}` : cell) : ''))
        .filter(Boolean);
      if (cells.length) parts.push(cells.join(' | '));
    }
    parts.push('');
  }
  return parts.join('\n').slice(0, MAX_CHARS).trim();
}

export async function spreadsheetBufferToText(buffer, filename = '') {
  const xlsx = (await import('xlsx')).default;
  const workbook = xlsx.read(buffer, { type: 'buffer', bookVBA: false, cellFormula: false, cellHTML: false });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', blankrows: false, raw: false }),
  }));
  return sheetsToText(sheets, filename);
}
