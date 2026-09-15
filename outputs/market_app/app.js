const DATA = window.ANAC_DATA.records;
const META = window.ANAC_DATA.metadata;
const viewMode = document.body.dataset.view || "model";
const isBrandView = viewMode === "brand";
const STORAGE_KEY = "anac-market-explorer-state";

const state = {
  year: 2026,
  showYoY: false,
  category: "SUV",
  minPriceMM: 30,
  maxPriceMM: 50,
  topCount: 8,
  generalFilterDefaultApplied: false,
  excludedBrands: new Set(),
  excludedModels: new Set(),
  excludedVersions: new Set(),
  selectedBrandKey: null,
  selectedModelKey: null,
  currentModelRows: [],
  currentModelTotal: 0,
  currentGroupCount: 0,
};

const els = {
  dataNote: document.getElementById("data-note"),
  year: document.getElementById("year-select"),
  category: document.getElementById("category-select"),
  minPrice: document.getElementById("price-min"),
  maxPrice: document.getElementById("price-max"),
  topCount: document.getElementById("top-count"),
  reset: document.getElementById("reset-filters"),
  excludeBrandInput: document.getElementById("exclude-brand-input"),
  brandOptions: document.getElementById("brand-options"),
  excludeModelInput: document.getElementById("exclude-model-input"),
  excludeModelOptions: document.getElementById("exclude-model-options"),
  excludeVersionInput: document.getElementById("exclude-version-input"),
  versionOptions: document.getElementById("version-options"),
  addExclusion: document.getElementById("add-exclusion"),
  clearExclusions: document.getElementById("clear-exclusions"),
  generalFilter: document.getElementById("general-filter"),
  excludedList: document.getElementById("excluded-list"),
  marketUnits: document.getElementById("market-units"),
  modelCount: document.getElementById("model-count"),
  priceRangeLabel: document.getElementById("price-range-label"),
  mainTitle: document.getElementById("main-title"),
  mainSubtitle: document.getElementById("main-subtitle"),
  yoyToggle: document.getElementById("yoy-toggle"),
  downloadChart: document.getElementById("download-chart"),
  modelChart: document.getElementById("model-chart"),
  versionTitle: document.getElementById("version-title"),
  versionSubtitle: document.getElementById("version-subtitle"),
  versionChart: document.getElementById("version-chart"),
};

const unitsFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

let brandLookup = new Map();
let excludeModelLookup = new Map();
let versionLookup = new Map();

const GENERAL_FILTER_MODELS = [
  { brand: "CITROEN", model: "MULTISPACE" },
  { brand: "KIA", model: "CARNIVAL" },
  { brand: "PEUGEOT", model: "RIFTER" },
  { brand: "PEUGEOT", model: "EXPERT" },
  { brand: "PEUGEOT", model: "3008" },
  { brand: "PEUGEOT", model: "NUEVO 2008" },
  { brand: "FORD", model: "TERRITORY" },
];

function normalizedModelName(model, brand = "") {
  const value = String(model || "").trim();
  const upper = value.toUpperCase();
  const upperBrand = String(brand || "").trim().toUpperCase();
  if (upperBrand === "BMW" && ["118", "120"].includes(upper)) {
    return "120";
  }
  if (upperBrand === "BMW" && ["218", "218I", "220"].includes(upper)) {
    return "220";
  }
  if (["RAV4 VI", "RAV 4", "RAV4 IV", "RAV 4 IV"].includes(upper)) {
    return "RAV4";
  }
  return value;
}

function modelKey(record) {
  return `${record.brand}|||${normalizedModelName(record.model, record.brand)}`;
}

function modelLabel(record) {
  return `${record.brand} ${normalizedModelName(record.model, record.brand)}`.trim();
}

function brandKey(record) {
  return record.brand;
}

function versionKeyFromValues(brand, model, version) {
  return `${brand}|||${normalizedModelName(model, brand)}|||${version}`;
}

function versionKey(record) {
  return versionKeyFromValues(record.brand, record.model, record.version || "Versión no informada");
}

function normalizeStoredModelKey(key) {
  const [brand, model] = String(key || "").split("|||");
  if (!brand || !model) return key;
  return `${brand}|||${normalizedModelName(model, brand)}`;
}

function normalizeStoredVersionKey(key) {
  const [brand, model, ...versionParts] = String(key || "").split("|||");
  if (!brand || !model || !versionParts.length) return key;
  return `${brand}|||${normalizedModelName(model, brand)}|||${versionParts.join("|||")}`;
}

function formatUnits(value) {
  return `${unitsFormatter.format(Math.round(value))} un.`;
}

function formatShare(value) {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function moneyRangeLabel() {
  return `$${trimNumber(state.minPriceMM)}MM-$${trimNumber(state.maxPriceMM)}MM`;
}

function trimNumber(value) {
  return Number(value).toLocaleString("es-CL", { maximumFractionDigits: 1 });
}

function formatPriceMM(value) {
  if (!Number.isFinite(value) || value <= 0) return "Precio lista s/i";
  return `$${trimNumber(value / 1_000_000)}MM`;
}

function formatPriceRangeMM(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "Precio lista s/i";
  return `${formatPriceMM(min)} - ${formatPriceMM(max)}`;
}

function sanitizedTopCount() {
  return sanitizedTopCountForValue(state.topCount);
}

function sanitizedTopCountForValue(value) {
  return Math.max(1, Math.min(50, Math.round(Number(value) || 8)));
}

function topDescription(groupPlural, totalGroups) {
  const topCount = sanitizedTopCount();
  if (totalGroups > topCount) return `top ${topCount} ${groupPlural} y otros`;
  return groupPlural === "marcas" ? "todas las marcas" : "todos los modelos";
}

function periodLabel() {
  return state.year === 2026 ? "Ene-Ago de 2026" : "Ene-Dic de 2025";
}

function currentPeriodLabel() {
  return activeYear() === 2026 ? "Ene-Ago de 2026" : "Ene-Dic de 2025";
}

function periodSlug() {
  if (showComparisonMode()) return "interanual";
  return state.year === 2026 ? "ene-ago" : "ene-dic";
}

function categorySlug() {
  return state.category === "SUV" ? "SUV" : "Vehiculos-de-Pasajeros";
}

function activeYear() {
  return Number(state.year);
}

function comparisonYear() {
  return activeYear() - 1;
}

function showComparisonMode() {
  return state.year === 2026 && state.showYoY;
}

function loadSavedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      applyDefaultGeneralFilter();
      return;
    }
    const saved = JSON.parse(raw);
    if (saved.year === "yoy") {
      state.year = 2026;
      state.showYoY = true;
    }
    if ([2025, 2026].includes(Number(saved.year))) state.year = Number(saved.year);
    if (typeof saved.showYoY === "boolean") state.showYoY = saved.showYoY;
    if (state.year !== 2026) state.showYoY = false;
    if (["SUV", "Vehículos de Pasajeros"].includes(saved.category)) state.category = saved.category;
    if (Number.isFinite(Number(saved.minPriceMM))) state.minPriceMM = Number(saved.minPriceMM);
    if (Number.isFinite(Number(saved.maxPriceMM))) state.maxPriceMM = Number(saved.maxPriceMM);
    if (Number.isFinite(Number(saved.topCount))) state.topCount = sanitizedTopCountForValue(saved.topCount);
    state.excludedBrands = new Set(Array.isArray(saved.excludedBrands) ? saved.excludedBrands : []);
    state.excludedModels = new Set(Array.isArray(saved.excludedModels) ? saved.excludedModels.map(normalizeStoredModelKey) : []);
    state.excludedVersions = new Set(Array.isArray(saved.excludedVersions) ? saved.excludedVersions.map(normalizeStoredVersionKey) : []);
    state.generalFilterDefaultApplied = saved.generalFilterDefaultApplied === true;
    applyDefaultGeneralFilter();
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    applyDefaultGeneralFilter();
  }
}

function saveState() {
  const payload = {
    year: state.year,
    showYoY: state.showYoY,
    category: state.category,
    minPriceMM: state.minPriceMM,
    maxPriceMM: state.maxPriceMM,
    topCount: sanitizedTopCount(),
    generalFilterDefaultApplied: state.generalFilterDefaultApplied,
    excludedBrands: Array.from(state.excludedBrands),
    excludedModels: Array.from(state.excludedModels),
    excludedVersions: Array.from(state.excludedVersions),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function syncControlsFromState() {
  els.year.value = String(state.year);
  els.category.value = state.category;
  els.minPrice.value = state.minPriceMM;
  els.maxPrice.value = state.maxPriceMM;
  els.topCount.value = sanitizedTopCount();
  syncYoYToggle();
}

function syncYoYToggle() {
  els.yoyToggle.checked = state.year === 2026 && state.showYoY;
  els.yoyToggle.disabled = state.year !== 2026;
  els.yoyToggle.closest(".comparison-toggle")?.classList.toggle("disabled", els.yoyToggle.disabled);
}

function selectedBounds() {
  const min = Math.min(Number(state.minPriceMM), Number(state.maxPriceMM)) * 1_000_000;
  const max = Math.max(Number(state.minPriceMM), Number(state.maxPriceMM)) * 1_000_000;
  return { min, max };
}

function baseFilteredRecords({ applyExclusions = true, year = activeYear() } = {}) {
  const { min, max } = selectedBounds();
  return DATA.filter((record) => {
    if (record.year !== Number(year)) return false;
    if (record.category !== state.category) return false;
    if (record.price < min || record.price > max) return false;
    if (applyExclusions && state.excludedBrands.has(brandKey(record))) return false;
    if (applyExclusions && state.excludedModels.has(modelKey(record))) return false;
    if (applyExclusions && state.excludedVersions.has(versionKey(record))) return false;
    return true;
  });
}

function recordsForModel(key) {
  return baseFilteredRecords().filter((record) => modelKey(record) === key);
}

function recordsForBrand(key) {
  return baseFilteredRecords().filter((record) => brandKey(record) === key);
}

function groupModels(records, { includeBrand = true } = {}) {
  const grouped = new Map();
  records.forEach((record) => {
    const key = modelKey(record);
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: includeBrand ? modelLabel(record) : normalizedModelName(record.model, record.brand),
        units: 0,
      });
    }
    grouped.get(key).units += Number(record.units) || 0;
  });

  return Array.from(grouped.values())
    .filter((row) => row.units > 0)
    .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label));
}

function groupBrands(records) {
  const grouped = new Map();
  records.forEach((record) => {
    const key = record.brand;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: record.brand,
        units: 0,
      });
    }
    grouped.get(key).units += Number(record.units) || 0;
  });

  return Array.from(grouped.values())
    .filter((row) => row.units > 0)
    .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label));
}

function groupVersions(records) {
  const grouped = new Map();
  const shouldKeepSourceModel = records.some((record) => {
    const normalized = normalizedModelName(record.model, record.brand);
    return record.brand === "BMW" && ["120", "220"].includes(normalized);
  });
  records.forEach((record) => {
    const version = record.version || "Versión no informada";
    const rawModel = String(record.model || "").trim();
    const key = shouldKeepSourceModel ? `${rawModel}|||${version}` : version;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: shouldKeepSourceModel ? `${rawModel} ${version}`.trim() : version,
        units: 0,
        priceSum: 0,
        priceCount: 0,
      });
    }
    const row = grouped.get(key);
    row.units += Number(record.units) || 0;
    if (Number.isFinite(Number(record.price)) && Number(record.price) > 0) {
      row.priceSum += Number(record.price);
      row.priceCount += 1;
    }
  });

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      avgPrice: row.priceCount ? row.priceSum / row.priceCount : null,
    }))
    .filter((row) => row.units > 0)
    .sort((a, b) => {
      const priceDiff = (b.avgPrice || 0) - (a.avgPrice || 0);
      return priceDiff || b.units - a.units || a.label.localeCompare(b.label);
    });
}

function modelAveragePriceRange(records) {
  const versionPrices = groupVersions(records)
    .map((row) => row.avgPrice)
    .filter((price) => Number.isFinite(price) && price > 0);
  if (!versionPrices.length) return { min: null, max: null };
  return {
    min: Math.min(...versionPrices),
    max: Math.max(...versionPrices),
  };
}

function chartRowsFromGroups(groups, topN = 9, restLabel = "OTROS") {
  const total = groups.reduce((sum, row) => sum + row.units, 0);
  const topRows = groups.slice(0, topN).map((row) => ({
    ...row,
    share: total ? row.units / total : 0,
    isRest: false,
  }));
  const topUnits = topRows.reduce((sum, row) => sum + row.units, 0);
  const restUnits = total - topUnits;
  if (restUnits > 0.000001) {
    topRows.push({
      key: "__REST__",
      label: restLabel,
      units: restUnits,
      share: total ? restUnits / total : 0,
      isRest: true,
    });
  }
  return { rows: topRows, total };
}

function addPriorYearUnits(rows, priorGroups, currentTotal) {
  const priorByKey = new Map(priorGroups.map((row) => [row.key, row.units]));
  const topKeys = rows.filter((row) => !row.isRest).map((row) => row.key);
  const priorTopUnits = topKeys.reduce((sum, key) => sum + (priorByKey.get(key) || 0), 0);
  const priorTotal = priorGroups.reduce((sum, row) => sum + row.units, 0);

  return rows.map((row) => {
    const priorUnits = row.isRest ? Math.max(0, priorTotal - priorTopUnits) : (priorByKey.get(row.key) || 0);
    return {
      ...row,
      priorUnits,
      priorShareForWidth: currentTotal ? priorUnits / currentTotal : 0,
    };
  });
}

function maxShareFor(rows) {
  const max = Math.max(0, ...rows.flatMap((row) => [row.share, row.priorShareForWidth || 0]));
  if (max <= 0.1) return 0.1;
  return Math.min(1, Math.ceil((max * 1.08) / 0.05) * 0.05);
}

function renderBarChart(container, rows, options = {}) {
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = options.emptyText || "No hay datos para los filtros seleccionados.";
    container.appendChild(empty);
    return;
  }

  if (options.showComparison) {
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    [
      { label: "2026", className: "legend-swatch current-year" },
      { label: "2025", className: "legend-swatch prior-year" },
    ].forEach((item) => {
      const legendItem = document.createElement("span");
      legendItem.className = "legend-item";
      const swatch = document.createElement("span");
      swatch.className = item.className;
      const label = document.createElement("span");
      label.textContent = item.label;
      legendItem.append(swatch, label);
      legend.appendChild(legendItem);
    });
    container.appendChild(legend);
  }

  const maxShare = maxShareFor(rows);
  const axis = document.createElement("div");
  axis.className = "chart-axis";
  const axisLabel = document.createElement("div");
  axisLabel.textContent = options.labelHeader || "Modelo";
  const axisTrack = document.createElement("div");
  axisTrack.className = "axis-track";
  const axisScale = document.createElement("div");
  axisScale.className = "axis-scale";
  for (let i = 0; i <= 5; i += 1) {
    const tick = document.createElement("span");
    tick.className = "axis-tick";
    tick.style.left = `${i * 20}%`;
    tick.textContent = formatShare((maxShare * i) / 5);
    axisScale.appendChild(tick);
  }
  axisTrack.appendChild(axisScale);
  axis.append(axisLabel, axisTrack);
  container.appendChild(axis);

  rows.forEach((row) => {
    const barRow = document.createElement("div");
    barRow.className = "bar-row";
    if (options.onSelect && !row.isRest) {
      barRow.classList.add("clickable");
      barRow.role = "button";
      barRow.tabIndex = 0;
      barRow.setAttribute("aria-label", `Seleccionar ${row.label}`);
      barRow.addEventListener("click", () => options.onSelect(row));
      barRow.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          options.onSelect(row);
        }
      });
    }

    const label = document.createElement("div");
    label.className = "bar-label";
    if (row.metaLabel) {
      label.classList.add("with-meta");
      const name = document.createElement("span");
      name.className = "bar-label-name";
      name.textContent = row.label;
      const meta = document.createElement("span");
      meta.className = "bar-label-meta";
      meta.textContent = row.metaLabel;
      label.append(name, meta);
    } else {
      label.textContent = row.label;
    }

    const track = document.createElement("div");
    track.className = "bar-track";
    if (options.showComparison) track.classList.add("comparison");
    const scale = document.createElement("div");
    scale.className = "bar-scale";
    const fill = document.createElement("div");
    fill.className = `bar-fill${row.isRest && !options.showComparison ? " rest" : ""}${row.key === options.selectedKey ? " selected" : ""}`;
    const width = Math.max(0.4, (row.share / maxShare) * 100);
    track.dataset.currentWidth = String(width);
    fill.style.width = `${width}%`;
    scale.append(fill);

    if (options.showComparison) {
      const priorFill = document.createElement("div");
      priorFill.className = "bar-fill prior";
      const priorWidth = Math.max(0.4, ((row.priorShareForWidth || 0) / maxShare) * 100);
      track.dataset.currentWidth = String(Math.max(width, priorWidth));
      priorFill.style.width = `${priorWidth}%`;
      scale.appendChild(priorFill);
    }
    track.appendChild(scale);

    const value = document.createElement("div");
    value.className = "bar-value";
    if (options.showComparison) {
      const current = document.createElement("span");
      current.textContent = `2026: ${formatShare(row.share)} | ${formatUnits(row.units)}`;
      const prior = document.createElement("span");
      prior.className = "prior-value";
      prior.textContent = `2025: ${formatUnits(row.priorUnits || 0)}`;
      value.append(current, prior);
    } else {
      value.textContent = `${formatShare(row.share)} | ${formatUnits(row.units)}`;
    }
    track.appendChild(value);
    barRow.append(label, track);
    container.appendChild(barRow);
  });
  positionBarValues(container);
}

function positionBarValues(container) {
  if (!container) return;
  container.querySelectorAll(".bar-track").forEach((track) => {
    const scale = track.querySelector(".bar-scale");
    const value = track.querySelector(".bar-value");
    if (!scale || !value) return;

    const width = Number(track.dataset.currentWidth || 0);
    const fillEnd = (scale.clientWidth * width) / 100;
    const left = Math.min(fillEnd + 10, track.clientWidth - value.offsetWidth);
    value.style.left = `${Math.max(0, left)}px`;
  });
}

function updateBrandOptions() {
  const brands = new Set();
  baseFilteredRecords({ applyExclusions: false }).forEach((record) => {
    if (record.brand) brands.add(record.brand);
  });

  brandLookup = new Map();
  els.brandOptions.replaceChildren();
  Array.from(brands)
    .sort((a, b) => a.localeCompare(b))
    .forEach((brand) => {
      brandLookup.set(brand.toLocaleLowerCase("es-CL"), brand);
      const option = document.createElement("option");
      option.value = brand;
      els.brandOptions.appendChild(option);
    });
}

function selectedExclusionBrand() {
  const typed = els.excludeBrandInput.value.trim();
  if (!typed) return "";
  const exact = brandLookup.get(typed.toLocaleLowerCase("es-CL"));
  if (exact) return exact;
  const match = Array.from(brandLookup.entries()).find(([label]) =>
    label.includes(typed.toLocaleLowerCase("es-CL"))
  );
  return match ? match[1] : "";
}

function selectedExclusionModel() {
  const typed = els.excludeModelInput.value.trim();
  if (!typed) return "";
  const exact = excludeModelLookup.get(typed.toLocaleLowerCase("es-CL"));
  if (exact) return exact;
  const match = Array.from(excludeModelLookup.entries()).find(([label]) =>
    label.includes(typed.toLocaleLowerCase("es-CL"))
  );
  return match ? match[1] : "";
}

function updateExcludeModelOptions() {
  const brand = selectedExclusionBrand();
  const models = new Set();

  excludeModelLookup = new Map();
  els.excludeModelOptions.replaceChildren();

  if (!brand) return;

  baseFilteredRecords({ applyExclusions: false }).forEach((record) => {
    if (record.brand !== brand) return;
    const model = normalizedModelName(record.model, record.brand);
    if (model) models.add(model);
  });

  Array.from(models)
    .sort((a, b) => a.localeCompare(b))
    .forEach((model) => {
      excludeModelLookup.set(model.toLocaleLowerCase("es-CL"), model);
      const option = document.createElement("option");
      option.value = model;
      els.excludeModelOptions.appendChild(option);
    });
}

function updateVersionOptions() {
  const brand = selectedExclusionBrand();
  const model = selectedExclusionModel();
  const versions = new Set();

  versionLookup = new Map();
  els.versionOptions.replaceChildren();

  if (!brand || !model) return;

  baseFilteredRecords({ applyExclusions: false }).forEach((record) => {
    if (record.brand !== brand) return;
    if (normalizedModelName(record.model, record.brand) !== model) return;
    const version = record.version || "Versión no informada";
    versions.add(version);
  });

  Array.from(versions)
    .sort((a, b) => a.localeCompare(b))
    .forEach((version) => {
      versionLookup.set(version.toLocaleLowerCase("es-CL"), version);
      const option = document.createElement("option");
      option.value = version;
      els.versionOptions.appendChild(option);
    });
}

function renderExcludedItems() {
  els.excludedList.replaceChildren();
  if (!state.excludedBrands.size && !state.excludedModels.size && !state.excludedVersions.size) {
    const none = document.createElement("span");
    none.className = "empty-state";
    none.textContent = "Sin marcas, modelos ni versiones excluidas.";
    els.excludedList.appendChild(none);
    return;
  }

  const brandLabelsByKey = new Map();
  const modelLabelsByKey = new Map();
  const versionLabelsByKey = new Map();
  DATA.forEach((record) => {
    const brandItemKey = brandKey(record);
    if (state.excludedBrands.has(brandItemKey) && !brandLabelsByKey.has(brandItemKey)) {
      brandLabelsByKey.set(brandItemKey, `${record.brand} | Toda la marca`);
    }

    const modelItemKey = modelKey(record);
    if (state.excludedModels.has(modelItemKey) && !modelLabelsByKey.has(modelItemKey)) {
      modelLabelsByKey.set(modelItemKey, `${record.brand} ${normalizedModelName(record.model, record.brand)} | Todas las versiones`);
    }

    const versionItemKey = versionKey(record);
    if (state.excludedVersions.has(versionItemKey) && !versionLabelsByKey.has(versionItemKey)) {
      versionLabelsByKey.set(
        versionItemKey,
        `${record.brand} ${normalizedModelName(record.model, record.brand)} | ${record.version || "Versión no informada"}`
      );
    }
  });

  const items = [
    ...Array.from(state.excludedBrands).map((key) => ({
      type: "brand",
      key,
      label: brandLabelsByKey.get(key) || `${key} | Toda la marca`,
    })),
    ...Array.from(state.excludedModels).map((key) => ({
      type: "model",
      key,
      label: modelLabelsByKey.get(key) || key,
    })),
    ...Array.from(state.excludedVersions).map((key) => ({
      type: "version",
      key,
      label: versionLabelsByKey.get(key) || key,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label));

  items.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "excluded-chip";
      const label = document.createElement("span");
      label.textContent = item.label;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Quitar";
      remove.addEventListener("click", () => {
        if (item.type === "brand") state.excludedBrands.delete(item.key);
        if (item.type === "model") state.excludedModels.delete(item.key);
        if (item.type === "version") state.excludedVersions.delete(item.key);
        render();
      });
      chip.append(label, remove);
      els.excludedList.appendChild(chip);
    });
}

function addExclusionFromInput() {
  const brand = selectedExclusionBrand();
  const model = selectedExclusionModel();
  const typedVersion = els.excludeVersionInput.value.trim();
  if (!brand) return;

  if (!model) {
    state.excludedBrands.add(brand);
    if (state.selectedBrandKey === brand) state.selectedBrandKey = null;
    els.excludeBrandInput.value = "";
    els.excludeModelInput.value = "";
    els.excludeVersionInput.value = "";
    render();
    return;
  }

  if (!typedVersion) {
    const key = `${brand}|||${model}`;
    state.excludedModels.add(key);
    if (state.selectedModelKey === key) state.selectedModelKey = null;
    els.excludeModelInput.value = "";
    els.excludeVersionInput.value = "";
    render();
    return;
  }

  const exactVersion = versionLookup.get(typedVersion.toLocaleLowerCase("es-CL"));
  let version = exactVersion;
  if (!version) {
    const match = Array.from(versionLookup.entries()).find(([label]) =>
      label.includes(typedVersion.toLocaleLowerCase("es-CL"))
    );
    if (match) version = match[1];
  }
  if (!version) return;

  const key = versionKeyFromValues(brand, model, version);
  state.excludedVersions.add(key);
  els.excludeVersionInput.value = "";
  render();
}

function addGeneralFilterModels() {
  GENERAL_FILTER_MODELS.forEach(({ brand, model }) => {
    state.excludedModels.add(`${brand}|||${normalizedModelName(model, brand)}`);
  });

  if (state.selectedModelKey && state.excludedModels.has(state.selectedModelKey)) {
    state.selectedModelKey = null;
  }
  if (state.selectedBrandKey && state.excludedBrands.has(state.selectedBrandKey)) {
    state.selectedBrandKey = null;
  }
}

function applyDefaultGeneralFilter() {
  addGeneralFilterModels();
  state.generalFilterDefaultApplied = true;
}

function applyGeneralFilter() {
  addGeneralFilterModels();
  state.generalFilterDefaultApplied = true;

  els.excludeBrandInput.value = "";
  els.excludeModelInput.value = "";
  els.excludeVersionInput.value = "";
  render();
}

function renderMainChart() {
  const records = baseFilteredRecords();
  const groups = isBrandView ? groupBrands(records) : groupModels(records);
  const topCount = sanitizedTopCount();
  let { rows, total } = chartRowsFromGroups(groups, topCount, "OTROS");
  const showComparison = showComparisonMode();
  if (showComparison) {
    const priorRecords = baseFilteredRecords({ year: comparisonYear() });
    const priorGroups = isBrandView ? groupBrands(priorRecords) : groupModels(priorRecords);
    rows = addPriorYearUnits(rows, priorGroups, total);
  }
  state.currentModelRows = rows;
  state.currentModelTotal = total;
  state.currentGroupCount = groups.length;
  const selectableRows = rows.filter((row) => !row.isRest);

  if (isBrandView) {
    state.selectedModelKey = null;
    if (!selectableRows.some((row) => row.key === state.selectedBrandKey)) {
      state.selectedBrandKey = selectableRows[0]?.key || null;
    }
  } else {
    state.selectedBrandKey = null;
    if (!selectableRows.some((row) => row.key === state.selectedModelKey)) {
      state.selectedModelKey = selectableRows[0]?.key || null;
    }
  }

  els.marketUnits.textContent = formatUnits(total);
  els.modelCount.textContent = unitsFormatter.format(groups.length);
  els.priceRangeLabel.textContent = moneyRangeLabel();
  const groupLabel = isBrandView ? "marca" : "modelo";
  const groupPlural = isBrandView ? "marcas" : "modelos";
  const topText = topDescription(groupPlural, groups.length);
  els.mainTitle.textContent = `${state.category} | Market share por ${groupLabel}`;
  els.mainSubtitle.textContent = showComparison
    ? `Evolución interanual · Ene-Ago de 2026 vs 2025 · rango precio lista ${moneyRangeLabel()} CLP · ${topText}`
    : `${periodLabel()} · rango precio lista ${moneyRangeLabel()} CLP · ${topText}`;

  renderBarChart(els.modelChart, rows, {
    labelHeader: isBrandView ? "Marca" : "Modelo",
    showComparison,
    selectedKey: isBrandView ? state.selectedBrandKey : state.selectedModelKey,
    onSelect: (row) => {
      if (isBrandView) {
        state.selectedBrandKey = row.key;
      } else {
        state.selectedModelKey = row.key;
      }
      renderMainChart();
      renderVersionChart();
    },
  });
}

function downloadFileName() {
  return [
    activeYear(),
    categorySlug(),
    periodSlug(),
    `${trimNumber(Math.min(state.minPriceMM, state.maxPriceMM)).replace(",", ".")}-${trimNumber(Math.max(state.minPriceMM, state.maxPriceMM)).replace(",", ".")}MM`,
    isBrandView ? "marca" : "modelo",
  ].join("_") + ".png";
}

function drawDownloadChart() {
  const rows = state.currentModelRows;
  if (!rows.length) return;
  const showComparison = showComparisonMode();

  const scale = 2;
  const width = 1800;
  const rowHeight = showComparison ? 74 : 58;
  const top = showComparison ? 230 : 190;
  const bottom = 100;
  const height = top + rows.length * rowHeight + bottom;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const colors = {
    bg: "#ffffff",
    text: "#111827",
    muted: "#4b5563",
    grid: "#d1d5db",
    bar: "#2563eb",
    prior: "rgba(37, 99, 235, 0.28)",
    rest: "#f59e0b",
  };

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = colors.text;
  ctx.font = "700 36px Arial, Segoe UI, sans-serif";
  ctx.fillText(`${state.category} | Market share por ${isBrandView ? "marca" : "modelo"}`, 70, 58);

  ctx.fillStyle = colors.muted;
  ctx.font = "600 24px Arial, Segoe UI, sans-serif";
  const groupPlural = isBrandView ? "marcas" : "modelos";
  const topText = topDescription(groupPlural, state.currentGroupCount);
  const subtitle = showComparison
    ? `Evolución interanual · Ene-Ago de 2026 vs 2025 · rango precio lista ${moneyRangeLabel()} CLP · ${topText}`
    : `${periodLabel()} · rango precio lista ${moneyRangeLabel()} CLP · ${topText}`;
  ctx.fillText(subtitle, 70, 94);

  ctx.font = "600 18px Arial, Segoe UI, sans-serif";
  if (showComparison) {
    ctx.fillStyle = colors.bar;
    ctx.fillRect(70, 116, 22, 14);
    ctx.fillStyle = colors.text;
    ctx.fillText("2026", 100, 129);
    ctx.fillStyle = colors.prior;
    ctx.fillRect(170, 116, 22, 14);
    ctx.fillStyle = colors.text;
    ctx.fillText("2025", 200, 129);
  }

  ctx.fillStyle = colors.muted;
  ctx.fillText(
    `Mercado seleccionado: ${formatUnits(state.currentModelTotal)} · ${isBrandView ? "Marcas" : "Modelos"} considerados dentro del filtro`,
    70,
    showComparison ? 166 : 128
  );

  const labelX = 70;
  const chartX = 650;
  const scaleW = 760;
  const valueSpace = 360;
  const chartW = scaleW + valueSpace;
  const chartY = top;
  const chartH = rows.length * rowHeight;
  const maxShare = maxShareFor(rows);

  ctx.fillStyle = colors.muted;
  ctx.font = "600 18px Arial, Segoe UI, sans-serif";
  ctx.fillText(isBrandView ? "Marca" : "Modelo", labelX, chartY - 12);

  ctx.strokeStyle = colors.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.muted;
  ctx.font = "16px Arial, Segoe UI, sans-serif";
  for (let i = 0; i <= 5; i += 1) {
    const value = maxShare * i / 5;
    const x = chartX + scaleW * i / 5;
    ctx.beginPath();
    ctx.moveTo(x, chartY);
    ctx.lineTo(x, chartY + chartH);
    ctx.stroke();
    const tick = formatShare(value);
    const metrics = ctx.measureText(tick);
    ctx.fillText(tick, x - metrics.width / 2, chartY + chartH + 34);
  }

  ctx.strokeStyle = colors.grid;
  ctx.strokeRect(chartX, chartY, scaleW, chartH);

  rows.forEach((row, index) => {
    const y = chartY + index * rowHeight + 12;
    ctx.fillStyle = colors.text;
    ctx.font = "600 22px Arial, Segoe UI, sans-serif";
    const label = row.label.length > 44 ? `${row.label.slice(0, 43)}...` : row.label;
    ctx.fillText(label, labelX, y + 22);

    const barW = Math.max(4, scaleW * row.share / maxShare);
    ctx.fillStyle = showComparison ? colors.bar : row.isRest ? colors.rest : colors.bar;
    ctx.fillRect(chartX, y, barW, showComparison ? 22 : 34);

    if (showComparison) {
      const priorW = Math.max(4, scaleW * (row.priorShareForWidth || 0) / maxShare);
      ctx.fillStyle = colors.prior;
      ctx.fillRect(chartX, y + 28, priorW, 22);
    }

    const valueLabel = `${formatShare(row.share)} | ${formatUnits(row.units)}`;
    ctx.font = "600 22px Arial, Segoe UI, sans-serif";
    ctx.fillStyle = colors.text;
    if (showComparison) {
      const currentText = `2026: ${valueLabel}`;
      const priorText = `2025: ${formatUnits(row.priorUnits || 0)}`;
      const priorW = Math.max(4, scaleW * (row.priorShareForWidth || 0) / maxShare);
      const anchorW = Math.max(barW, priorW);
      const textW = Math.max(ctx.measureText(currentText).width, ctx.measureText(priorText).width);
      const valueX = Math.min(chartX + anchorW + 16, chartX + chartW - textW);
      ctx.fillText(currentText, valueX, y + 20);
      ctx.fillStyle = colors.muted;
      ctx.fillText(priorText, valueX, y + 48);
    } else {
      const textW = ctx.measureText(valueLabel).width;
      const valueX = Math.min(chartX + barW + 16, chartX + chartW - textW);
      ctx.fillText(valueLabel, valueX, y + 24);
    }
  });

  ctx.fillStyle = colors.muted;
  ctx.font = "18px Arial, Segoe UI, sans-serif";
  ctx.fillText("Market share", chartX + scaleW / 2 - 52, chartY + chartH + 72);

  const link = document.createElement("a");
  link.download = downloadFileName();
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderVersionChart() {
  if (!els.versionChart) return;

  if (isBrandView) {
    if (!state.selectedBrandKey) {
      els.versionTitle.textContent = "Modelos por marca";
      els.versionSubtitle.textContent = "Selecciona una marca del gráfico principal.";
      renderBarChart(els.versionChart, [], {
        emptyText: "Selecciona una marca para ver los modelos considerados.",
      });
      return;
    }

    const records = recordsForBrand(state.selectedBrandKey);
    const groups = groupModels(records, { includeBrand: false });
    const total = groups.reduce((sum, row) => sum + row.units, 0);
    const rows = groups.map((row) => {
      const range = modelAveragePriceRange(records.filter((record) => modelKey(record) === row.key));
      return {
        ...row,
        metaLabel: formatPriceRangeMM(range.min, range.max),
        share: total ? row.units / total : 0,
        isRest: false,
      };
    });

    els.versionTitle.textContent = `${state.selectedBrandKey} | modelos vendidos`;
    els.versionSubtitle.textContent = `${currentPeriodLabel()} · modelos de la marca dentro del mismo rango y categoría · ${formatUnits(total)}`;

    renderBarChart(els.versionChart, rows, {
      labelHeader: "Modelo",
      emptyText: "No hay modelos con demanda positiva para esta marca.",
    });
    return;
  }

  if (!state.selectedModelKey) {
    els.versionTitle.textContent = "Distribución por versión";
    els.versionSubtitle.textContent = "Selecciona un modelo del gráfico principal.";
    renderBarChart(els.versionChart, [], {
      emptyText: "Selecciona un modelo para ver las versiones consideradas.",
    });
    return;
  }

  const records = recordsForModel(state.selectedModelKey);
  const selectedLabel = records[0] ? modelLabel(records[0]) : "Modelo seleccionado";
  const groups = groupVersions(records);
  const total = groups.reduce((sum, row) => sum + row.units, 0);
  const rows = groups.map((row) => ({
    ...row,
    metaLabel: formatPriceMM(row.avgPrice),
    share: total ? row.units / total : 0,
    isRest: false,
  }));

  els.versionTitle.textContent = `${selectedLabel} | distribución por versión`;
  els.versionSubtitle.textContent = `${currentPeriodLabel()} · versiones dentro del mismo rango y categoría · precio lista promedio anual · ${formatUnits(total)}`;

  renderBarChart(els.versionChart, rows, {
    labelHeader: "Versión",
    emptyText: "No hay versiones con demanda positiva para este modelo.",
  });
}

function render() {
  syncYoYToggle();
  updateBrandOptions();
  updateExcludeModelOptions();
  updateVersionOptions();
  renderExcludedItems();
  renderMainChart();
  renderVersionChart();
  saveState();
}

function applyDefaultsForCategory() {
  if (state.category === "SUV") {
    state.minPriceMM = 30;
    state.maxPriceMM = 50;
  } else {
    state.minPriceMM = 25;
    state.maxPriceMM = 50;
  }
  els.minPrice.value = state.minPriceMM;
  els.maxPrice.value = state.maxPriceMM;
}

els.year.addEventListener("change", () => {
  state.year = Number(els.year.value);
  if (state.year !== 2026) state.showYoY = false;
  state.selectedBrandKey = null;
  state.selectedModelKey = null;
  render();
});

els.yoyToggle.addEventListener("change", () => {
  state.showYoY = state.year === 2026 && els.yoyToggle.checked;
  render();
});

els.category.addEventListener("change", () => {
  state.category = els.category.value;
  state.selectedBrandKey = null;
  state.selectedModelKey = null;
  applyDefaultsForCategory();
  render();
});

els.minPrice.addEventListener("input", () => {
  state.minPriceMM = Number(els.minPrice.value || 0);
  state.selectedBrandKey = null;
  state.selectedModelKey = null;
  render();
});

els.maxPrice.addEventListener("input", () => {
  state.maxPriceMM = Number(els.maxPrice.value || 0);
  state.selectedBrandKey = null;
  state.selectedModelKey = null;
  render();
});

els.topCount.addEventListener("input", () => {
  if (els.topCount.value === "") {
    state.topCount = "";
  } else {
    state.topCount = sanitizedTopCountForValue(els.topCount.value);
  }
  state.selectedBrandKey = null;
  state.selectedModelKey = null;
  render();
});

els.topCount.addEventListener("blur", () => {
  state.topCount = sanitizedTopCount();
  els.topCount.value = state.topCount;
  render();
});

els.topCount.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    els.topCount.blur();
  }
});

els.reset.addEventListener("click", () => {
  state.year = 2026;
  state.showYoY = false;
  state.category = "SUV";
  state.excludedBrands.clear();
  state.excludedModels.clear();
  state.excludedVersions.clear();
  applyDefaultGeneralFilter();
  state.selectedBrandKey = null;
  state.selectedModelKey = null;
  state.topCount = 8;
  els.year.value = "2026";
  els.yoyToggle.checked = false;
  els.category.value = "SUV";
  els.topCount.value = "8";
  els.excludeBrandInput.value = "";
  els.excludeModelInput.value = "";
  els.excludeVersionInput.value = "";
  applyDefaultsForCategory();
  render();
});

els.addExclusion.addEventListener("click", addExclusionFromInput);
els.generalFilter.addEventListener("click", applyGeneralFilter);
els.excludeBrandInput.addEventListener("input", () => {
  els.excludeModelInput.value = "";
  els.excludeVersionInput.value = "";
  updateExcludeModelOptions();
  updateVersionOptions();
});
els.excludeBrandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.excludeModelInput.focus();
  }
});
els.excludeModelInput.addEventListener("input", () => {
  els.excludeVersionInput.value = "";
  updateVersionOptions();
});
els.excludeModelInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    els.excludeVersionInput.focus();
  }
});
els.excludeVersionInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addExclusionFromInput();
  }
});

els.clearExclusions.addEventListener("click", () => {
  state.excludedBrands.clear();
  state.excludedModels.clear();
  state.excludedVersions.clear();
  render();
});

els.downloadChart.addEventListener("click", drawDownloadChart);
window.addEventListener("resize", () => {
  positionBarValues(els.modelChart);
  positionBarValues(els.versionChart);
});

loadSavedState();
syncControlsFromState();
els.dataNote.textContent = `${unitsFormatter.format(META.recordCount)} registros · base local`;
render();
