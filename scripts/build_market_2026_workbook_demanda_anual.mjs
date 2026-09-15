import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "outputs", "market_study");
const finalPath = path.join(outputDir, "mercado_modelos_2026_normal.xlsx");
const previewPath = path.join(outputDir, "preview_mercado_modelos_2026_normal.png");

const sections = [
  {
    title: "SUV | bracket $30.000.000 a $50.000.000 CLP | 2026",
    total2026: 14259,
    rows: [
      [1, "TOYOTA", "RAV4", 32439397, 1590],
      [2, "SUBARU", "ALL NEW FORESTER", 36786740, 670],
      [3, "KIA", "SPORTAGE", 31140195, 970],
      [4, "TESLA", "MODEL Y", 44099134, 846],
      [5, "SUBARU", "ALL NEW OUTBACK", 37864541, 250],
      [6, "HYUNDAI", "TUCSON NX4E HEV", 34566797, 522],
      [7, "VOLVO", "EX30", 38183396, 379],
      ["", "RESTO", "Modelos restantes", 37359549, 9032],
    ],
  },
  {
    title: "Vehículo de Pasajeros | bracket $25.000.000 a $50.000.000 CLP | 2026",
    total2026: 2814,
    rows: [
      [1, "TESLA", "MODEL 3", 39343857, 693],
      [2, "SUBARU", "IMPREZA SPORT NEW GENERATION", 25560208, 162],
      [3, "CITROEN", "NEW C4", 30110190, 166],
      [4, "PEUGEOT", "308", 31927052, 50],
      [5, "MERCEDES BENZ", "A", 46120874, 112],
      [6, "TOYOTA", "COROLLA", 27182153, 118],
      [7, "BMW", "120", 46658331, 177],
      [8, "CUPRA", "CUPRA LEON", 31884137, 96],
      [9, "AUDI", "A3", 42501148, 51],
      ["", "RESTO", "Modelos restantes", 33014880, 1189],
    ],
  },
];

function writeSection(sheet, section, startRow) {
  sheet.getRange(`A${startRow}:F${startRow}`).merge();
  sheet.getRange(`A${startRow}`).values = [[section.title]];
  sheet.getRange(`A${startRow}`).format = {
    fill: "#15343D",
    font: { bold: true, color: "#FFFFFF", size: 13 },
  };

  const headerRow = startRow + 2;
  const headers = ["Ranking", "Marca", "Modelo", "Promedio precio lista", "Demanda Anual 2026", "MS 2026"];
  const values = [headers, ...section.rows.map((row) => [...row, null])];
  const endRow = headerRow + values.length - 1;
  sheet.getRange(`A${headerRow}:F${endRow}`).values = values;

  for (let row = headerRow + 1; row <= endRow; row++) {
    sheet.getRange(`F${row}`).formulas = [[`=E${row}/${section.total2026}`]];
  }

  sheet.getRange(`A${headerRow}:F${headerRow}`).format = {
    fill: "#2F6F7E",
    font: { bold: true, color: "#FFFFFF" },
  };
  sheet.getRange(`A${headerRow}:F${endRow}`).format.borders = {
    preset: "inside",
    style: "thin",
    color: "#D9E3E7",
  };
  sheet.getRange(`A${headerRow}:F${endRow}`).format.borders = {
    preset: "outside",
    style: "medium",
    color: "#9BB5BD",
  };
  sheet.getRange(`D${headerRow + 1}:D${endRow}`).format.numberFormat = '"$"#,##0';
  sheet.getRange(`E${headerRow + 1}:E${endRow}`).format.numberFormat = "#,##0";
  sheet.getRange(`F${headerRow + 1}:F${endRow}`).format.numberFormat = "0.0%";
  sheet.getRange(`A${endRow}:F${endRow}`).format = {
    fill: "#F3F7F9",
    font: { bold: true },
  };
  return endRow;
}

await fs.mkdir(outputDir, { recursive: true });
const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Tabla 2026");
sheet.showGridLines = false;

sheet.getRange("A1:F1").merge();
sheet.getRange("A1").values = [["Tabla mercado modelos 2026"]];
sheet.getRange("A1").format = {
  fill: "#0F252C",
  font: { bold: true, color: "#FFFFFF", size: 15 },
};

let nextRow = 3;
for (const section of sections) {
  nextRow = writeSection(sheet, section, nextRow) + 3;
}

sheet.getRange("A:F").format.autofitColumns();
sheet.getRange("A:A").format.columnWidth = 12;
sheet.getRange("B:B").format.columnWidth = 18;
sheet.getRange("C:C").format.columnWidth = 34;
sheet.getRange("D:D").format.columnWidth = 22;
sheet.getRange("E:E").format.columnWidth = 21;
sheet.getRange("F:F").format.columnWidth = 14;
sheet.freezePanes.freezeRows(1);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  maxChars: 2000,
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Tabla 2026",
  range: `A1:F${nextRow - 2}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(finalPath);

console.log(JSON.stringify({ workbook: finalPath, preview: previewPath }, null, 2));
