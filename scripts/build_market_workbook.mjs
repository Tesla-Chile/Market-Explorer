import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "outputs", "market_study");
const resultPath = path.join(outputDir, "market_results.json");
const finalPath = path.join(outputDir, "estudio_mercado_modelos_2025_2026.xlsx");
const previewPath = path.join(outputDir, "preview_estudio.png");

const data = JSON.parse(await fs.readFile(resultPath, "utf8"));

function a1(row, col) {
  let n = col;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return `${s}${row}`;
}

function rowValues(row) {
  return [
    row.ranking ?? "",
    row.marca,
    row.modelo,
    row.precio_bruto_historico,
    row.q_mes_2025,
    row.q_mes_2026,
    row.q_mes_total,
    null,
  ];
}

function writeSection(sheet, segment, startRow) {
  const title = `${segment.segment} | Top 10 modelos + resto`;
  sheet.getRange(`A${startRow}:H${startRow}`).merge();
  sheet.getRange(`A${startRow}`).values = [[title]];
  sheet.getRange(`A${startRow}`).format = {
    fill: "#1F4E5F",
    font: { bold: true, color: "#FFFFFF", size: 13 },
  };

  const filterText = `Filtro precio bruto historico: $${segment.price_min.toLocaleString("en-US")} a $${segment.price_max.toLocaleString("en-US")} CLP`;
  sheet.getRange(`A${startRow + 1}:H${startRow + 1}`).merge();
  sheet.getRange(`A${startRow + 1}`).values = [[`${filterText} | Mercado seleccionado: ${segment.selected_market_q_mes.toLocaleString("en-US")} Demanda Anual | Modelos seleccionados: ${segment.selected_model_count}`]];
  sheet.getRange(`A${startRow + 1}`).format = {
    fill: "#EAF3F6",
    font: { color: "#173B45" },
  };

  const headers = [
    "Ranking",
    "Marca",
    "Modelo",
    "Precio bruto historico",
    "Demanda Anual 2025",
    "Demanda Anual 2026",
    "Demanda Anual total",
    "Market share",
  ];
  const tableStart = startRow + 3;
  const values = [headers, ...segment.rows.map(rowValues)];
  const tableEnd = tableStart + values.length - 1;
  sheet.getRange(`A${tableStart}:H${tableEnd}`).values = values;

  for (let r = tableStart + 1; r <= tableEnd; r++) {
    sheet.getRange(`H${r}`).formulas = [[`=G${r}/SUM($G$${tableStart + 1}:$G$${tableEnd})`]];
  }

  sheet.getRange(`A${tableStart}:H${tableStart}`).format = {
    fill: "#2F6F7E",
    font: { bold: true, color: "#FFFFFF" },
  };
  sheet.getRange(`A${tableStart}:H${tableEnd}`).format.borders = {
    preset: "inside",
    style: "thin",
    color: "#D9E3E7",
  };
  sheet.getRange(`A${tableStart}:H${tableEnd}`).format.borders = {
    preset: "outside",
    style: "medium",
    color: "#9BB5BD",
  };
  sheet.getRange(`D${tableStart + 1}:D${tableEnd}`).format.numberFormat = '"$"#,##0';
  sheet.getRange(`E${tableStart + 1}:G${tableEnd}`).format.numberFormat = "#,##0";
  sheet.getRange(`H${tableStart + 1}:H${tableEnd}`).format.numberFormat = "0.0%";
  sheet.getRange(`A${tableEnd}:H${tableEnd}`).format = {
    fill: "#F3F7F9",
    font: { bold: true },
  };

  return tableEnd;
}

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Estudio");
const notes = workbook.worksheets.add("Supuestos");

sheet.showGridLines = false;
notes.showGridLines = false;

sheet.getRange("A1:H1").merge();
sheet.getRange("A1").values = [["Estudio de mercado por modelo | 2025-2026"]];
sheet.getRange("A1").format = {
  fill: "#15343D",
  font: { bold: true, color: "#FFFFFF", size: 15 },
};
sheet.getRange("A2:H2").merge();
sheet.getRange("A2").values = [[
  "Demanda Anual agrupada a nivel marca-modelo. Precio bruto historico calculado como promedio ponderado por Demanda Anual.",
]];
sheet.getRange("A2").format = { fill: "#F4F7F8", font: { color: "#2D4A52" } };

let nextRow = 4;
for (const segment of data.segments) {
  nextRow = writeSection(sheet, segment, nextRow) + 3;
}

sheet.getRange("A:H").format.autofitColumns();
sheet.getRange("A:A").format.columnWidth = 12;
sheet.getRange("B:B").format.columnWidth = 18;
sheet.getRange("C:C").format.columnWidth = 34;
sheet.getRange("D:D").format.columnWidth = 20;
sheet.getRange("E:G").format.columnWidth = 14;
sheet.getRange("H:H").format.columnWidth = 14;
sheet.freezePanes.freezeRows(3);

const noteRows = [
  ["Campo", "Detalle"],
  ["Fuente", data.source_file],
  ["Hoja fuente", data.source_sheet],
  ["Anios incluidos", data.years.join(", ")],
  ["Agrupacion", "Primero se agrupan versiones por trimestre a nivel marca-modelo; luego se consolida 2025-2026."],
  ["Precio bruto historico", "Promedio ponderado por Demanda Anual de los precios brutos trimestrales del modelo."],
  ["Filtro SUV", "$30.000.000 a $50.000.000 CLP sobre precio bruto historico del modelo."],
  ["Filtro Vehiculo de Pasajeros", "$25.000.000 a $50.000.000 CLP sobre precio bruto historico del modelo."],
  ["Market share", "Demanda Anual del modelo dividido por Demanda Anual total del mercado seleccionado del segmento."],
  ["Unidad", "Demanda Anual acumulada historica 2025-2026."],
];
notes.getRange(`A1:B${noteRows.length}`).values = noteRows;
notes.getRange("A1:B1").format = {
  fill: "#2F6F7E",
  font: { bold: true, color: "#FFFFFF" },
};
notes.getRange(`A1:B${noteRows.length}`).format.borders = {
  preset: "inside",
  style: "thin",
  color: "#D9E3E7",
};
notes.getRange(`A1:B${noteRows.length}`).format.borders = {
  preset: "outside",
  style: "medium",
  color: "#9BB5BD",
};
notes.getRange("A:A").format.columnWidth = 28;
notes.getRange("B:B").format.columnWidth = 110;
notes.getRange("B:B").format.wrapText = true;

const inspect = await workbook.inspect({
  kind: "table",
  range: "Estudio!A1:H32",
  include: "values,formulas",
  tableMaxRows: 32,
  tableMaxCols: 8,
  maxChars: 12000,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 4000,
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Estudio",
  range: `A1:H${nextRow - 2}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(finalPath);

console.log(JSON.stringify({
  workbook: finalPath,
  preview: previewPath,
}, null, 2));
