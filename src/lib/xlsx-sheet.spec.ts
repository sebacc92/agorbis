import { describe, expect, it } from "vitest";
import {
  parseXlsxSheet,
  readXlsxSheet,
  sheetPath,
} from "../../scripts/xlsx-sheet.mjs";
import { buildTestZip } from "./test-zip";

describe("parseXlsxSheet", () => {
  const shared =
    '<sst><si><t>adm2_name</t></si><si><t>adm2_pcode</t></si><si><t xml:space="preserve">Azote&apos;y </t></si><si><r><t>Ita</t></r><r><t>uguá</t></r></si></sst>';
  const sheet =
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
    '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>PY0102</t></is></c></row>' +
    '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="C3"><v>7</v></c></row></sheetData></worksheet>';

  it("usa la primera fila como encabezado, resuelve textos compartidos y entidades", () => {
    expect(parseXlsxSheet(shared, sheet)).toEqual([
      { adm2_name: "Azote'y", adm2_pcode: "PY0102" },
      { adm2_name: "Itauguá", adm2_pcode: "" },
    ]);
  });
});

describe("sheetPath", () => {
  it("encuentra la hoja por nombre a través de las relaciones del libro", () => {
    const workbook =
      '<workbook><sheets><sheet name="pry_admin1" sheetId="2" r:id="rId2"/><sheet name="pry_admin2" sheetId="3" r:id="rId3"/></sheets></workbook>';
    const rels =
      '<Relationships><Relationship Id="rId3" Type="x" Target="worksheets/sheet3.xml"/><Relationship Id="rId2" Type="x" Target="/xl/worksheets/sheet2.xml"/></Relationships>';

    expect(sheetPath(workbook, rels, "pry_admin2")).toBe(
      "xl/worksheets/sheet3.xml",
    );
    expect(sheetPath(workbook, rels, "pry_admin1")).toBe(
      "xl/worksheets/sheet2.xml",
    );
    expect(() => sheetPath(workbook, rels, "otra")).toThrow(/no trae la hoja/);
  });
});

describe("readXlsxSheet", () => {
  const workbook =
    '<workbook><sheets><sheet name="primera" sheetId="1" r:id="rId1"/><sheet name="datos" sheetId="2" r:id="rId2"/></sheets></workbook>';
  const rels =
    '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>';
  const shared = "<sst><si><t>codigo</t></si><si><t>Luque</t></si></sst>";
  const sheet = (value: string) =>
    `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2"${value}</c></row></sheetData></worksheet>`;
  const book = buildTestZip([
    { name: "xl/workbook.xml", text: workbook, method: 8 },
    { name: "xl/_rels/workbook.xml.rels", text: rels, method: 0 },
    { name: "xl/sharedStrings.xml", text: shared, method: 8 },
    { name: "xl/worksheets/sheet1.xml", text: sheet("><v>11</v>"), method: 8 },
    { name: "xl/worksheets/sheet2.xml", text: sheet(' t="s"><v>1</v>'), method: 8 },
  ]);

  it("lee la hoja pedida por nombre, o la primera si no se nombra", () => {
    expect(readXlsxSheet(book, "datos")).toEqual([{ codigo: "Luque" }]);
    expect(readXlsxSheet(book, null)).toEqual([{ codigo: "11" }]);
  });
});
