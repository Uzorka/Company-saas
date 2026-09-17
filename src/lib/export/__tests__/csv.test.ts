import { describe, it, expect } from "vitest";
import { csvCell, toCsv, safeFilename } from "../csv";

describe("csvCell", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvCell("Adaeze")).toBe("Adaeze");
  });

  it("quotes a value containing a comma", () => {
    // Without this, "Apapa, Lagos" becomes two columns and every field after
    // it on that row is shifted.
    expect(csvCell("Apapa, Lagos")).toBe('"Apapa, Lagos"');
  });

  it("doubles an embedded quote", () => {
    expect(csvCell('He said "no"')).toBe('"He said ""no"""');
  });

  it("quotes a value containing a newline", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders null and undefined as empty, not as the word", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("keeps a negative number readable", () => {
    // It starts with "-", so it is prefixed — correctness before tidiness.
    // A spreadsheet still shows -1500; it simply treats it as text.
    expect(csvCell(-1500)).toBe("'-1500");
  });

  describe("formula injection", () => {
    // An applicant types their own name into the public careers form. These
    // are the characters every major spreadsheet treats as "execute this".
    it.each(["=", "+", "-", "@"])("neutralises a cell starting with %s", (char) => {
      expect(csvCell(`${char}HYPERLINK("http://evil.example")`)).toBe(
        `"'${char}HYPERLINK(""http://evil.example"")"`,
      );
    });

    it("neutralises a leading tab without quoting it", () => {
      // A tab is not a CSV delimiter here, so it needs no quotes — only the
      // prefix that stops the spreadsheet executing the cell.
      expect(csvCell("\tcmd")).toBe("'\tcmd");
    });

    it("neutralises and quotes a leading carriage return", () => {
      // A carriage return would end the record, so this one needs both.
      expect(csvCell("\rcmd")).toBe(`"'\rcmd"`);
    });

    it("does not touch a formula character in the middle", () => {
      expect(csvCell("a=b")).toBe("a=b");
    });
  });
});

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    const csv = toCsv(
      [{ name: "Tunde", dept: "Sales" }],
      [
        { header: "Name", value: (r) => r.name },
        { header: "Department", value: (r) => r.dept },
      ],
    );
    expect(csv).toBe("Name,Department\r\nTunde,Sales");
  });

  it("writes only headers when there are no rows", () => {
    const csv = toCsv<{ name: string }>([], [{ header: "Name", value: (r) => r.name }]);
    expect(csv).toBe("Name");
  });
});

describe("safeFilename", () => {
  it("slugs the parts", () => {
    expect(safeFilename(["CHF Heron Nigeria", "Employees"])).toBe(
      "chf-heron-nigeria-employees.csv",
    );
  });

  it("strips anything that would break a header", () => {
    // The quote is dropped; the newline is whitespace and collapses to a
    // dash, which keeps the two words readable rather than running them
    // together.
    expect(safeFilename(['bad"name', "a\nb"])).toBe("badname-a-b.csv");
  });

  it("falls back rather than producing a bare extension", () => {
    expect(safeFilename(["///"])).toBe("export.csv");
  });
});
