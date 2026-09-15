import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "outputs", "market_study");
const resultPath = path.join(outputDir, "market_results_cb_filtrado_2026.json");
const finalPath = path.join(outputDir, "estudio_mercado_modelos_cb_filtrado_2026_ajustado.xlsx");
const previewPath = path.join(outputDir, "preview_estudio_mercado_modelos_cb_filtrado_2026_ajustado.png");

const data = JSON.parse(await fs.readFile(resultPath, "utf8"));

function weightedPrice(rows) {
  const demand = rows.reduce((sum, row) => sum + row.demanda_anual_2026, 0);
  if (!demand) return 0;
  return rows.reduce((sum, row) => sum + row.precio_bruto_historico * row.demanda_anual_2026, 0) / demand;
}

function combinedPropulsion(rows) {
  const values = [...new Set(rows.map((row) => row.tipo_propulsion).filter(Boolean))];
  return values.length ? values.join(" / ") : "";
}

function adjustedRows(segment) {
  let rows = segment.rows.map((row) => ({ ...row }));

  if (segment.segment === "SUV") {
    const rav4Rows = rows.filter(
      (row) => row.marca === "TOYOTA" && ["RAV4", "RAV4 VI"].includes(row.modelo),
    );
    rows = rows.filter(
      (row) => !(row.marca === "TOYOTA" && ["RAV4", "RAV4 VI"].includes(row.modelo)),
    );
    if (rav4Rows.length) {
      rows.push({
        ranking: null,
        marca: "TOYOTA",
        modelo: "RAV4",
        tipo_propulsion: combinedPropulsion(rav4Rows),
        precio_bruto_historico: weightedPrice(rav4Rows),
        demanda_anual_2026: rav4Rows.reduce((sum, row) => sum + row.demanda_anual_2026, 0),
      });
    }
  }

  if (segment.segment === "Vehiculo de Pasajeros") {
    const removeFromDisplay = new Set([
      "DONG FENG|E70",
      "MINI|COOPER SE",
      "MINI|COOPER E",
      "PEUGEOT|NUEVO 208",
    ]);
    const removed = rows.filter((row) => removeFromDisplay.has(`${row.marca}|${row.modelo}`));
    rows = rows.filter((row) => !removeFromDisplay.has(`${row.marca}|${row.modelo}`));
    if (removed.length) {
      rows.push({
        ranking: null,
        marca: "RESTO",
        modelo: "Modelos restantes",
        tipo_propulsion: "Varios",
        precio_bruto_historico: weightedPrice(removed),
        demanda_anual_2026: removed.reduce((sum, row) => sum + row.demanda_anual_2026, 0),
      });
    }
  }

  const rest = rows.filter((row) => row.marca === "RESTO");
  const display = rows
    .filter((row) => row.marca !== "RESTO")
    .sort((a, b) => b.demanda_anual_2026 - a.demanda_anual_2026 || a.marca.localeCompare(b.marca));

  return [
    ...display.map((row, index) => ({ ...row, ranking: index + 1 })),
    ...rest.map((row) => ({ ...row, ranking: null })),
  ];
}

function writeSection(sheet, segment, startRow) {
  const rows = adjustedRows(segment);
  const bracket = `$${segment.price_min.toLocaleString("en-US")} a $${segment.price_max.toLocaleString("en-US")} CLP`;
  sheet.getRange(`A${startRow}:G${startRow}`).merge();
  sheet.getRange(`A${startRow}`).values = [[`${segment.segment} | bracket ${bracket} | CB filtrado | 2026`]];
  sheet.getRange(`A${startRow}`).format = {
    fill: "#15343D",
    font: { bold: true, color: "#FFFFFF", size: 13 },
  };

  sheet.getRange(`A${startRow + 1}:G${startRow + 1}`).merge();
  sheet.getRange(`A${startRow + 1}`).values = [[
    `Mercado seleccionado 2026: ${segment.selected_market_demanda_anual_2026.toLocaleString("en-US")} Demanda Anual`,
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
    "Tipo de propulsion",
    "Precio bruto historico",
    "Demanda Anual 2026",
    "MS 2026",
  ];
  const values = [
    headers,
    ...rows.map((row) => [
      row.ranking ?? "",
      row.marca,
      row.modelo,
      row.tipo_propulsion,
      row.precio_bruto_historico,
      row.demanda_anual_2026,
      null,
    ]),
  ];
  const endRow = headerRow + values.length - 1;
  sheet.getRange(`A${headerRow}:G${endRow}`).values = values;

  for (let row = headerRow + 1; row <= endRow; row++) {
    sheet.getRange(`G${row}`).formulas = [[`=F${row}/${segment.selected_market_demanda_anual_2026}`]];
  }

  sheet.getRange(`A${headerRow}:G${headerRow}`).format = {
    fill: "#2F6F7E",
    font: { bold: true, color: "#FFFFFF" },
  };
  sheet.getRange(`A${headerRow}:G${endRow}`).format.borders = {
    preset: "inside",
    style: "thin",
    color: "#D9E3E7",
  };
  sheet.getRange(`A${headerRow}:G${endRow}`).format.borders = {
    preset: "outside",
    style: "medium",
    color: "#9BB5BD",
  };
  sheet.getRange(`E${headerRow + 1}:E${endRow}`).format.numberFormat = '"$"#,##0';
  sheet.getRange(`F${headerRow + 1}:F${endRow}`).format.numberFormat = "#,##0";
  sheet.getRange(`G${headerRow + 1}:G${endRow}`).format.numberFormat = "0.0%";
  sheet.getRange(`A${endRow}:G${endRow}`).format = {
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

sheet.getRange("A1:G1").merge();
sheet.getRange("A1").values = [["Estudio de mercado por modelo | CB filtrado | 2026"]];
sheet.getRange("A1").format = {
  fill: "#0F252C",
  font: { bold: true, color: "#FFFFFF", size: 15 },
};

let nextRow = 3;
for (const segment of data.segments) {
  nextRow = writeSection(sheet, segment, nextRow) + 3;
}

sheet.getRange("A:G").format.autofitColumns();
sheet.getRange("A:A").format.columnWidth = 12;
sheet.getRange("B:B").format.columnWidth = 18;
sheet.getRange("C:C").format.columnWidth = 36;
sheet.getRange("D:D").format.columnWidth = 46;
sheet.getRange("E:E").format.columnWidth = 22;
sheet.getRange("F:F").format.columnWidth = 21;
sheet.getRange("G:G").format.columnWidth = 14;
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
  ["Ajustes manuales", "Se combinaron variantes equivalentes y se movieron modelos solicitados a RESTO."],
  ["Tipo de propulsion", "Valor tomado desde la columna CB del archivo fuente. RESTO agrupa varios modelos."],
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
  range: `A1:G${nextRow - 2}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(finalPath);

console.log(JSON.stringify({ workbook: finalPath, preview: previewPath }, null, 2));
