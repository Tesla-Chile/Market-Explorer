import { chromium } from "playwright";
import path from "path";

const appPath = path.resolve("outputs/market_app/index.html");
const url = `file:///${appPath.replaceAll("\\", "/")}`;
const brandPath = path.resolve("outputs/market_app/brand.html");
const brandUrl = `file:///${brandPath.replaceAll("\\", "/")}`;

const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();
const errors = [];

async function labelsAvoidBars(page, rootSelector) {
  return page.locator(`${rootSelector} .bar-track`).evaluateAll((tracks) =>
    tracks.every((track) => {
      const scale = track.querySelector(".bar-scale");
      const value = track.querySelector(".bar-value");
      if (!scale || !value) return false;
      const fills = Array.from(scale.querySelectorAll(".bar-fill"));
      const maxFillRight = Math.max(...fills.map((fill) => fill.getBoundingClientRect().right));
      const valueLeft = value.getBoundingClientRect().left;
      return valueLeft >= maxFillRight + 6;
    })
  );
}

function priceMMFromLabel(label) {
  const match = String(label).match(/\$([\d.,]+)MM/);
  if (!match) return NaN;
  return Number(match[1].replace(/\./g, "").replace(",", "."));
}

page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(error.message));

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector(".bar-row");

const initialTitle = await page.locator("#main-title").textContent();
const initialRows = await page.locator("#model-chart .bar-row").count();
const versionTitle = await page.locator("#version-title").textContent();
const defaultFilterText = await page.locator("#excluded-list").textContent();
const defaultGeneralFilterApplied =
  defaultFilterText.includes("CITROEN MULTISPACE | Todas las versiones") &&
  defaultFilterText.includes("KIA CARNIVAL | Todas las versiones") &&
  defaultFilterText.includes("PEUGEOT RIFTER | Todas las versiones") &&
  defaultFilterText.includes("PEUGEOT EXPERT | Todas las versiones") &&
  defaultFilterText.includes("PEUGEOT 3008 | Todas las versiones") &&
  defaultFilterText.includes("PEUGEOT NUEVO 2008 | Todas las versiones") &&
  defaultFilterText.includes("FORD TERRITORY | Todas las versiones");
const yearOptions = await page.locator("#year-select option").evaluateAll((options) =>
  options.map((option) => option.value)
);
const yoyInControls = await page.locator(".controls #yoy-toggle").count();
const yoyInHeading = await page.locator(".section-heading #yoy-toggle").count();
const initialTopCount = await page.locator("#top-count").inputValue();
await page.locator("#top-count").click();
await page.keyboard.press("Control+A");
await page.keyboard.press("Backspace");
const topCountEmptyValue = await page.locator("#top-count").inputValue();
await page.keyboard.type("20");
await page.waitForTimeout(250);
const topCountTypedValue = await page.locator("#top-count").inputValue();
await page.fill("#top-count", "5");
await page.waitForTimeout(250);
const topCountValue = await page.locator("#top-count").inputValue();
const topCountRows = await page.locator("#model-chart .bar-row").count();
const topCountSubtitle = await page.locator("#main-subtitle").textContent();

await page.selectOption("#category-select", "Vehículos de Pasajeros");
await page.waitForTimeout(250);
const passengerTitle = await page.locator("#main-title").textContent();
const passengerRows = await page.locator("#model-chart .bar-row").count();

await page.fill("#exclude-brand-input", "TESLA");
await page.waitForTimeout(100);
const modelOptions = await page.locator("#exclude-model-options option").evaluateAll((options) =>
  options.map((option) => option.value)
);
await page.fill("#exclude-model-input", modelOptions[0]);
await page.waitForTimeout(100);
const versionOptions = await page.locator("#version-options option").evaluateAll((options) =>
  options.map((option) => option.value)
);
await page.fill("#exclude-version-input", versionOptions[0]);
await page.click("#add-exclusion");
await page.waitForTimeout(250);
const excludedText = await page.locator("#excluded-list").textContent();
const afterExcludeRows = await page.locator("#model-chart .bar-row").count();

await page.fill("#exclude-brand-input", "BMW");
await page.waitForTimeout(100);
const bmwModelOptions = await page.locator("#exclude-model-options option").evaluateAll((options) =>
  options.map((option) => option.value)
);
const bmwModelsGrouped =
  bmwModelOptions.includes("120") &&
  bmwModelOptions.includes("220") &&
  !bmwModelOptions.includes("118 / 120") &&
  !bmwModelOptions.includes("218 / 220") &&
  !bmwModelOptions.includes("118") &&
  !bmwModelOptions.includes("218I") &&
  !bmwModelOptions.includes("218");
await page.fill("#exclude-model-input", bmwModelOptions[0]);
await page.fill("#exclude-version-input", "");
await page.click("#add-exclusion");
await page.waitForTimeout(250);
const excludedModelText = await page.locator("#excluded-list").textContent();

await page.fill("#exclude-brand-input", "MINI");
await page.fill("#exclude-model-input", "");
await page.fill("#exclude-version-input", "");
await page.click("#add-exclusion");
await page.waitForTimeout(250);
const excludedBrandText = await page.locator("#excluded-list").textContent();

await page.click("#general-filter");
await page.waitForTimeout(250);
const generalFilterText = await page.locator("#excluded-list").textContent();

const clickableModelRows = await page.locator("#model-chart .bar-row.clickable").count();
await page.locator("#model-chart .bar-row.clickable").first().click({ position: { x: 720, y: 20 } });
await page.waitForTimeout(250);
const detailRows = await page.locator("#version-chart .bar-row").count();
const firstVersionLabel = await page.locator("#version-chart .bar-label").first().textContent();
const versionPriceLabels = await page.locator("#version-chart .bar-label-meta").evaluateAll((labels) =>
  labels.map((label) => label.textContent)
);
const versionPrices = versionPriceLabels.map(priceMMFromLabel);
const versionsSortedByPrice = versionPrices.every((price, index) => index === 0 || versionPrices[index - 1] >= price);

await page.selectOption("#category-select", "SUV");
await page.fill("#price-min", "35");
await page.fill("#price-max", "50");
await page.waitForTimeout(250);
const downloadPromise = page.waitForEvent("download");
await page.click("#download-chart");
const download = await downloadPromise;
const suggestedFilename = download.suggestedFilename();
const valuesInsideBars = await page.locator(".bar-track .bar-value").count();
const valuesAvoidBars = await labelsAvoidBars(page, "#model-chart");

await page.check("#yoy-toggle");
await page.waitForTimeout(250);
const yoySubtitle = await page.locator("#main-subtitle").textContent();
const comparisonTracks = await page.locator("#model-chart .bar-track.comparison").count();
const priorValues = await page.locator("#model-chart .prior-value").count();
const yoyLegendText = await page.locator("#model-chart .chart-legend").textContent();
const yoyValuesInsideBars = await page.locator(".bar-track .bar-value").count();
const yoyValuesAvoidBars = await labelsAvoidBars(page, "#model-chart");
const yoyToggleChecked = await page.locator("#yoy-toggle").isChecked();
const yoyDownloadPromise = page.waitForEvent("download");
await page.click("#download-chart");
const yoyDownload = await yoyDownloadPromise;
const yoySuggestedFilename = yoyDownload.suggestedFilename();

await page.screenshot({ path: "outputs/market_app/market-app-preview.png", fullPage: true });

console.log(JSON.stringify({
  url,
  initialTitle,
  initialRows,
  versionTitle,
  defaultFilterText,
  defaultGeneralFilterApplied,
  yearOptions,
  yoyInControls,
  yoyInHeading,
  initialTopCount,
  topCountEmptyValue,
  topCountTypedValue,
  topCountValue,
  topCountRows,
  topCountSubtitle,
  passengerTitle,
  passengerRows,
  modelOptions: modelOptions.slice(0, 5),
  bmwModelOptions: bmwModelOptions.slice(0, 8),
  bmwModelsGrouped,
  versionOptions: versionOptions.slice(0, 5),
  excludedText,
  excludedModelText,
  excludedBrandText,
  generalFilterText,
  afterExcludeRows,
  clickableModelRows,
  detailRows,
  firstVersionLabel,
  versionPriceLabels,
  versionsSortedByPrice,
  suggestedFilename,
  valuesInsideBars,
  valuesAvoidBars,
  yoySubtitle,
  comparisonTracks,
  priorValues,
  yoyLegendText,
  yoyValuesInsideBars,
  yoyValuesAvoidBars,
  yoyToggleChecked,
  yoySuggestedFilename,
  errors,
}, null, 2));

if (
  errors.length ||
  yearOptions.includes("yoy") ||
  yoyInControls !== 1 ||
  yoyInHeading !== 0 ||
  initialTopCount !== "8" ||
  topCountEmptyValue !== "" ||
  topCountTypedValue !== "20" ||
  topCountValue !== "5" ||
  topCountRows !== 6 ||
  !topCountSubtitle.includes("top 5") ||
  !defaultGeneralFilterApplied ||
  initialRows < 1 ||
  passengerRows < 1 ||
  modelOptions.length < 1 ||
  !bmwModelsGrouped ||
  versionOptions.length < 1 ||
  afterExcludeRows < 1 ||
  clickableModelRows < 1 ||
  detailRows < 1 ||
  !firstVersionLabel.includes("$") ||
  !firstVersionLabel.includes("MM") ||
  !versionsSortedByPrice ||
  valuesInsideBars < 1 ||
  !valuesAvoidBars ||
  !yoySubtitle.includes("Evolución interanual") ||
  !yoySubtitle.includes("Ene-Ago de 2026") ||
  comparisonTracks < 1 ||
  priorValues < 1 ||
  !yoyLegendText.includes("2026") ||
  !yoyLegendText.includes("2025") ||
  yoyValuesInsideBars < 1 ||
  !yoyValuesAvoidBars ||
  !yoyToggleChecked ||
  !excludedModelText.includes("Todas las versiones") ||
  !excludedBrandText.includes("Toda la marca") ||
  !generalFilterText.includes("CITROEN MULTISPACE | Todas las versiones") ||
  !generalFilterText.includes("KIA CARNIVAL | Todas las versiones") ||
  !generalFilterText.includes("PEUGEOT RIFTER | Todas las versiones") ||
  !generalFilterText.includes("PEUGEOT EXPERT | Todas las versiones") ||
  !generalFilterText.includes("PEUGEOT 3008 | Todas las versiones") ||
  !generalFilterText.includes("PEUGEOT NUEVO 2008 | Todas las versiones") ||
  !generalFilterText.includes("FORD TERRITORY | Todas las versiones") ||
  suggestedFilename !== "2026_SUV_ene-ago_35-50MM_modelo.png" ||
  yoySuggestedFilename !== "2026_SUV_interanual_35-50MM_modelo.png"
) {
  process.exit(1);
}

const brandPage = await context.newPage();
const brandErrors = [];
brandPage.on("console", (msg) => {
  if (msg.type() === "error") brandErrors.push(msg.text());
});
brandPage.on("pageerror", (error) => brandErrors.push(error.message));
await brandPage.goto(brandUrl);
await brandPage.waitForSelector(".bar-row");
const brandTitle = await brandPage.locator("#main-title").textContent();
const brandRows = await brandPage.locator("#model-chart .bar-row").count();
const persistedMin = await brandPage.locator("#price-min").inputValue();
const persistedCategory = await brandPage.locator("#category-select").inputValue();
const persistedYear = await brandPage.locator("#year-select").inputValue();
const persistedYoY = await brandPage.locator("#yoy-toggle").isChecked();
const persistedTopCount = await brandPage.locator("#top-count").inputValue();
const brandValuesInsideBars = await brandPage.locator(".bar-track .bar-value").count();
const brandValuesAvoidBars = await labelsAvoidBars(brandPage, "#model-chart");
const brandComparisonTracks = await brandPage.locator("#model-chart .bar-track.comparison").count();
const brandPriorValues = await brandPage.locator("#model-chart .prior-value").count();
const brandYoyLegendText = await brandPage.locator("#model-chart .chart-legend").textContent();
const clickableBrandRows = await brandPage.locator("#model-chart .bar-row.clickable").count();
await brandPage.locator("#model-chart .bar-row.clickable").first().click({ position: { x: 720, y: 20 } });
await brandPage.waitForTimeout(250);
const brandDetailTitle = await brandPage.locator("#version-title").textContent();
const brandDetailRows = await brandPage.locator("#version-chart .bar-row").count();
const brandDetailPriceLabels = await brandPage.locator("#version-chart .bar-label-meta").evaluateAll((labels) =>
  labels.map((label) => label.textContent)
);
const brandDetailValuesAvoidBars = await labelsAvoidBars(brandPage, "#version-chart");
await brandPage.waitForTimeout(250);
const brandDownloadPromise = brandPage.waitForEvent("download");
await brandPage.click("#download-chart");
const brandDownload = await brandDownloadPromise;
const brandSuggestedFilename = brandDownload.suggestedFilename();

console.log(JSON.stringify({
  brandUrl,
  brandTitle,
  brandRows,
  persistedMin,
  persistedCategory,
  persistedYear,
  persistedYoY,
  persistedTopCount,
  brandValuesInsideBars,
  brandValuesAvoidBars,
  brandComparisonTracks,
  brandPriorValues,
  brandYoyLegendText,
  clickableBrandRows,
  brandDetailTitle,
  brandDetailRows,
  brandDetailPriceLabels,
  brandDetailValuesAvoidBars,
  brandSuggestedFilename,
  brandErrors,
}, null, 2));

if (
  brandErrors.length ||
  brandTitle !== "SUV | Market share por marca" ||
  brandRows < 1 ||
  persistedMin !== "35" ||
  persistedCategory !== "SUV" ||
  persistedYear !== "2026" ||
  !persistedYoY ||
  persistedTopCount !== "5" ||
  brandValuesInsideBars < 1 ||
  !brandValuesAvoidBars ||
  brandComparisonTracks < 1 ||
  brandPriorValues < 1 ||
  !brandYoyLegendText.includes("2026") ||
  !brandYoyLegendText.includes("2025") ||
  clickableBrandRows < 1 ||
  !brandDetailTitle.includes("| modelos vendidos") ||
  brandDetailRows < 1 ||
  !brandDetailPriceLabels.every((label) => label.includes("$") && label.includes(" - ")) ||
  !brandDetailValuesAvoidBars ||
  brandSuggestedFilename !== "2026_SUV_interanual_35-50MM_marca.png"
) {
  process.exit(1);
}

await context.close();
await browser.close();
