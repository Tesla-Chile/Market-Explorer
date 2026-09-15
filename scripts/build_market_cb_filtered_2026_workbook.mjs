import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "outputs", "market_study");
const resultPath = path.join(outputDir, "market_results_cb_filtrado_2026.json");
const finalPath = path.join(outputDir, "estudio_mercado_modelos_cb_filtrado_2026.xlsx");
const previewPath = path.join(outputDir, "preview_estudio_mercado_modelos_cb_filtrado_2026.png");

const data = JSON.parse(await fs.readFile(resultPath, "utf8"));

function writeSection(sheet, segment, startRow) {
  const bracket = `$${segment.price_min.toLocaleString("en-US")} a $${segment.price_max.toLocaleString("en-US")} CLP`;
  sheet.getRange(`A${startRow}:F${startRow}`).merge();
  sheet.getRange(`A${startRow}`).values = [[`${segment.segment} | bracket ${bracket} | CB filtrado | 2026`]];
  sheet.getRange(`A${startRow}`).format = {
    fill: "#15343D",
    font: { bold: true, color: "#FFFFFF", size: 13 },
  };

  sheet.getRange(`A${startRow + 1}:F${startRow + 1}`).merge();
  sheet.getRange(`A${startRow + 1}`).values = [[
    `Mercado seleccionado 2026: ${segment.selected_market_demanda_anual_2026.toLocaleString("en-US")} Demanda Anual | Modelos: ${segment.selected_model_count}`,
  ]];
  sheet.getRange(`A${startRow + 1}`).format = {
    fill: "#EAF3F6",
    font: { color: "#173B45" },
  };

  const headerRow = startRow + 3;
  const headers = [
    "Ranking",
    "Marca",
    "Modelo",
    "Precio bruto historico",
    "Demanda Anual 2026",
    "MS 2026",
  ];
  const values = [
    headers,
    ...segment.rows.map((row) => [
      row.ranking ?? "",
      row.marca,
      row.modelo,
      row.precio_bruto_historico,
      row.demanda_anual_2026,
      null,
    ]),
  ];
  const endRow = headerRow + values.length - 1;
  sheet.getRange(`A${headerRow}:F${endRow}`).values = values;

  for (let row = headerRow + 1; row <= endRow; row++) {
    sheet.getRange(`F${row}`).formulas = [[`=E${row}/${segment.selected_market_demanda_anual_2026}`]];
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
const sheet = workbook.worksheets.add("CB filtrado 2026");
const assumptions = workbook.worksheets.add("Supuestos");

sheet.showGridLines = false;
assumptions.showGridLines = false;

sheet.getRange("A1:F1").merge();
sheet.getRange("A1").values = [["Estudio de mercado por modelo | CB filtrado | 2026"]];
sheet.getRange("A1").format = {
  fill: "#0F252C",
  font: { bold: true, color: "#FFFFFF", size: 15 },
};

let nextRow = 3;
for (const segment of data.segments) {
  nextRow = writeSection(sheet, segment, nextRow) + 3;
}

sheet.getRange("A:F").format.autofitColumns();
sheet.getRange("A:A").format.columnWidth = 12;
sheet.getRange("B:B").format.columnWidth = 18;
sheet.getRange("C:C").format.columnWidth = 36;
sheet.getRange("D:D").format.columnWidth = 22;
sheet.getRange("E:E").format.columnWidth = 21;
sheet.getRange("F:F").format.columnWidth = 14;
sheet.freezePanes.freezeRows(1);

const noteRows = [
  ["Campo", "Detalle"],
  ["Fuente", data.source_file],
  ["Hoja fuente", data.source_sheet],
  ["Anio incluido", String(data.year)],
  ["CB excluidos", data.excluded_cb.join(", ")],
  ["CB incluidos", data.included_cb.join(", ")],
  ["Filtro SUV", "$30.000.000 a $50.000.000 CLP sobre precio bruto historico del modelo."],
  ["Filtro Vehiculo de Pasajeros", "$25.000.000 a $50.000.000 CLP sobre precio bruto historico del modelo."],
  ["Market share", "Demanda Anual 2026 del modelo dividido por Demanda Anual 2026 total del mercado seleccionado."],
  ["Metodo", data.method],
];
assumptions.getRange(`A1:B${noteRows.length}`).values = noteRows;
assumptions.getRange("A1:B1").format = {
  fill: "#2F6F7E",
  font: { bold: true, color: "#FFFFFF" },
};
assumptions.getRange(`A1:B${noteRows.length}`).format.borders = {
  preset: "inside",
  style: "thin",
  color: "#D9E3E7",
};
assumptions.getRange(`A1:B${noteRows.length}`).format.borders = {
  preset: "outside",
  style: "medium",
  color: "#9BB5BD",
};
assumptions.getRange("A:A").format.columnWidth = 28;
assumptions.getRange("B:B").format.columnWidth = 120;
assumptions.getRange("B:B").format.wrapText = true;

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  maxChars: 4000,
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "CB filtrado 2026",
  range: `A1:F${nextRow - 2}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(finalPath);

console.log(JSON.stringify({ workbook: finalPath, preview: previewPath }, null, 2));
