/**
 * Generic, format-agnostic delimited-table parsing. Handles the mechanics
 * shared by every paste/CSV importer: BOM stripping, delimiter auto-detection
 * (tab-vs-comma from the header), a real quoted-field tokenizer, blank-record
 * skipping, header normalization, and alias → column-index mapping.
 *
 * It deliberately knows nothing about the meaning of any column — callers
 * supply `aliases`/`required` and read cells by key.
 */

export interface TableRowError {
  /** 1-based DATA row number (header excluded). 0 for header-level errors. */
  row: number;
  /** The offending line's raw text, for display. */
  raw: string;
  /** Human-readable reason. */
  message: string;
}

export interface ParsedTableRow {
  /** 1-based data-row number (header and blank lines excluded). */
  dataRow: number;
  /** The raw record text, for display in row errors. */
  raw: string;
  /** Read a column by key; `''` when the column is absent or the cell is missing. */
  cell: (key: string) => string;
}

export interface ParsedTable {
  /** Column key → column index, for the keys the caller asked about. */
  columns: Partial<Record<string, number>>;
  /** The raw header record text (quotes/escapes preserved), for error display. */
  headerRaw: string;
  /** One entry per non-blank data row. */
  dataRows: ParsedTableRow[];
  /** Required columns that were missing from the header. */
  missingColumns: string[];
  /** Header-level: true when there were no data rows at all. */
  headerOnly: boolean;
}

export interface TableSpec {
  /** Column key → accepted header aliases (already lowercase). */
  aliases: Record<string, string[]>;
  /** Column keys that must be present in the header. */
  required: string[];
}

/** Strip a leading UTF-8 BOM. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Tokenize one delimited record into fields, honouring double-quoted fields
 * that may contain the delimiter, embedded newlines, and escaped quotes
 * (`""` → `"`). Operates on a record string (already split on row boundaries
 * that are NOT inside quotes).
 */
function tokenizeRecord(record: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < record.length; i++) {
    const ch = record[i];
    if (inQuotes) {
      if (ch === '"') {
        if (record[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

/**
 * Split the full text into records on row boundaries, treating newlines
 * inside quoted fields as literal. Handles CRLF and LF. Returns the raw
 * record text (still containing its quotes/escapes) so callers can both
 * display the original line and tokenize it.
 */
function splitRecords(text: string): string[] {
  const records: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // Mirror the tokenizer's escaped-quote handling so quote state stays
      // in sync across embedded newlines.
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      current += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      // Collapse CRLF into a single boundary.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      records.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current !== '') records.push(current);
  return records;
}

/** A blank record is empty or only whitespace/delimiters. */
function isBlankRecord(record: string, delimiter: string): boolean {
  return record.split(delimiter).every((c) => c.trim() === '');
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function mapColumns(
  headerCells: string[],
  aliases: Record<string, string[]>,
): Partial<Record<string, number>> {
  const index: Partial<Record<string, number>> = {};
  headerCells.forEach((cellText, colIdx) => {
    const normalized = normalizeHeader(cellText);
    for (const key of Object.keys(aliases)) {
      if (aliases[key].includes(normalized)) {
        // Duplicate headers → last-wins.
        index[key] = colIdx;
      }
    }
  });
  return index;
}

/**
 * Parse delimited text into a column-mapped table. Pure mechanics — no
 * per-cell semantics. The caller validates `missingColumns`/`headerOnly`
 * and reads each data row's cells by key.
 */
export function parseDelimitedTable(
  text: string,
  spec: TableSpec,
): ParsedTable {
  const records = splitRecords(stripBom(text));

  // Find the header (first non-blank record). The delimiter is decided by
  // whether that header contains a tab.
  let headerIdx = -1;
  for (let i = 0; i < records.length; i++) {
    // Provisional blank check is delimiter-agnostic for the header search.
    if (records[i].trim() !== '') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      columns: {},
      headerRaw: '',
      dataRows: [],
      missingColumns: [],
      headerOnly: true,
    };
  }

  const headerRecord = records[headerIdx];
  const delimiter = headerRecord.includes('\t') ? '\t' : ',';

  const headerCells = tokenizeRecord(headerRecord, delimiter).map(stripBom);
  const columns = mapColumns(headerCells, spec.aliases);

  const missingColumns = spec.required.filter(
    (key) => columns[key] === undefined,
  );

  const dataRows: ParsedTableRow[] = [];
  let dataRow = 0;
  for (let i = headerIdx + 1; i < records.length; i++) {
    const record = records[i];
    if (isBlankRecord(record, delimiter)) continue;
    dataRow++;

    const cells = tokenizeRecord(record, delimiter);
    const cell = (key: string): string => {
      const idx = columns[key];
      return idx === undefined ? '' : (cells[idx] ?? '');
    };
    dataRows.push({ dataRow, raw: record, cell });
  }

  return {
    columns,
    headerRaw: headerRecord,
    dataRows,
    missingColumns,
    headerOnly: dataRows.length === 0,
  };
}
