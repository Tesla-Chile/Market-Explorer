from base64 import b64encode
from pathlib import Path

import pandas as pd
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(r"C:\Users\thirs\Documents\Calculo MS Tesla")
OUT = ROOT / "outputs" / "market_study"
DATA_2025 = ROOT / "inputs" / "data (33).xlsx"
DATA_2026 = Path(r"C:\Users\thirs\Downloads\data (41).xlsx")

OUTPUTS = {
    "suv": OUT / "suv-model-market-share-30-50-2025-2026.png",
    "passenger": OUT / "passenger-model-market-share-25-50-2025-2026.png",
}
PAGE = OUT / "download-model-corrected-market-share-pngs.html"


def clean(value):
    if pd.isna(value):
        return ""
    return str(value).strip().upper()


def map_model(value):
    model = clean(value)
    if model in {"RAV4 VI", "RAV 4", "RAV4 IV", "RAV 4 IV"}:
        return "RAV4"
    return model


def compute(path, year, segment, low, high, top_n=9):
    df = pd.read_excel(path, sheet_name="Export", usecols=[0, 2, 3, 6, 7, 10])
    df.columns = ["year", "brand", "model", "price", "q", "segment"]
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df["brand"] = df["brand"].map(clean)
    df["model"] = df["model"].map(map_model)
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df["q"] = pd.to_numeric(df["q"], errors="coerce").fillna(0)

    segment_text = df["segment"].astype(str).str.upper()
    if segment == "suv":
        segment_mask = segment_text.eq("SUV")
        excluded_models = {
            "NUEVO 2008",
            "3008",
            "NEW X-TRAIL",
            "X-TRAIL",
            "MULTISPACE",
            "NEW OUTLANDER",
        }
    else:
        segment_mask = segment_text.str.contains("PASAJ", na=False)
        excluded_models = {"RIFTER", "EXPERT", "MULTISPACE"}

    filtered = df[
        df["year"].eq(year)
        & segment_mask
        & df["price"].between(low, high, inclusive="both")
        & ~df["model"].isin(excluded_models)
    ].copy()

    grouped = (
        filtered.groupby(["brand", "model"], as_index=False)
        .agg(units=("q", "sum"))
        .query("units > 0")
        .sort_values("units", ascending=False)
    )
    grouped["label"] = grouped["brand"] + " " + grouped["model"]

    total = grouped["units"].sum()
    top = grouped.head(top_n)
    rest_units = total - top["units"].sum()

    rows = [
        (row["label"], int(round(row["units"])), row["units"] / total if total else 0)
        for _, row in top.iterrows()
    ]
    rows.append(("RESTO", int(round(rest_units)), rest_units / total if total else 0))
    return rows


def font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


TITLE = font(34, True)
SUBTITLE = font(22)
PANEL = font(25, True)
LABEL = font(20)
SMALL = font(17)

BG = "#ffffff"
TEXT = "#111827"
MUTED = "#4b5563"
GRID = "#d1d5db"
BAR = "#2563eb"
REST = "#f59e0b"


def fmt_units(value):
    return f"{value:,.0f}".replace(",", ".")


def fmt_share(value):
    return f"{value * 100:.1f}%".replace(".", ",")


def text(draw, xy, content, fill=TEXT, font_obj=LABEL, anchor=None):
    kwargs = {"fill": fill, "font": font_obj}
    if anchor:
        kwargs["anchor"] = anchor
    draw.text(xy, content, **kwargs)


def draw_panel(draw, y0, period, rows, max_share, chart):
    left, width = chart
    label_x = 70
    top = y0 + 56
    row_h = 50
    bar_h = 30
    chart_h = len(rows) * row_h

    text(draw, (label_x, y0), period, font_obj=PANEL)
    text(draw, (label_x, top - 16), "Modelo", fill=MUTED, font_obj=SMALL)

    for i in range(6):
        value = max_share * i / 5
        x = left + width * value / max_share
        draw.line((x, top, x, top + chart_h), fill=GRID, width=1)
        text(draw, (x, top + chart_h + 16), fmt_share(value), fill=MUTED, font_obj=SMALL, anchor="ma")

    for idx, (label, units, share) in enumerate(rows):
        y = top + idx * row_h + 8
        display = label if len(label) <= 47 else label[:46] + "..."
        text(draw, (label_x, y + 5), display, font_obj=LABEL)

        x1 = left
        bar_w = max(3, width * share / max_share)
        fill = REST if label == "RESTO" else BAR
        draw.rectangle((x1, y, x1 + bar_w, y + bar_h), fill=fill)

        value_label = f"{fmt_share(share)} | {fmt_units(units)} un."
        tx = x1 + bar_w + 12
        if tx + 190 > left + width + 260:
            tx = x1 + bar_w - 12
            anchor = "ra"
            color = "#ffffff"
        else:
            anchor = "la"
            color = TEXT
        text(draw, (tx, y + bar_h / 2), value_label, fill=color, font_obj=LABEL, anchor=anchor)

    draw.rectangle((left, top, left + width, top + chart_h), outline=GRID, width=1)
    text(draw, (left + width / 2, top + chart_h + 50), "Market share", fill=MUTED, font_obj=SMALL, anchor="ma")
    return top + chart_h + 92


def make_png(title, subtitle, rows_2025, rows_2026, output):
    width = 1800
    row_h = 50
    panel_extra = 148
    height = 70 + 95 + len(rows_2025) * row_h + panel_extra + len(rows_2026) * row_h + 110
    image = Image.new("RGB", (width, height), BG)
    draw = ImageDraw.Draw(image)

    text(draw, (70, 42), title, font_obj=TITLE)
    text(draw, (70, 82), subtitle, fill=MUTED, font_obj=SUBTITLE)

    max_observed = max([row[2] for row in rows_2025 + rows_2026])
    max_share = min(1.0, (((max_observed * 1.08 / 0.05) // 1) + 1) * 0.05)
    chart = (650, 870)
    y = 145
    y = draw_panel(draw, y, "Ene-Dic de 2025", rows_2025, max_share, chart)
    draw_panel(draw, y + 20, "Ene-Ago de 2026", rows_2026, max_share, chart)

    image.save(output, quality=95)


def encoded(path):
    return b64encode(path.read_bytes()).decode("ascii")


def make_download_page():
    suv_encoded = encoded(OUTPUTS["suv"])
    passenger_encoded = encoded(OUTPUTS["passenger"])
    html = f"""<div id="download-model-corrected-market-share" class="download-model-corrected-market-share">
  <h2>Descargar gráficos PNG por modelo</h2>
  <div class="download-grid">
    <section>
      <button class="btn btn-primary" type="button" data-file="suv">Descargar PNG SUV</button>
      <img alt="Vista previa SUV por modelo" src="data:image/png;base64,{suv_encoded}">
    </section>
    <section>
      <button class="btn btn-primary" type="button" data-file="passenger">Descargar PNG Vehículos de Pasajeros</button>
      <img alt="Vista previa Vehículos de Pasajeros por modelo" src="data:image/png;base64,{passenger_encoded}">
    </section>
  </div>
</div>

<style>
  #download-model-corrected-market-share {{
    width: 100%;
    color: var(--foreground);
  }}

  #download-model-corrected-market-share h2 {{
    margin: 0 0 14px;
    font-weight: 500;
  }}

  #download-model-corrected-market-share .download-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
  }}

  #download-model-corrected-market-share section {{
    display: grid;
    gap: 10px;
    align-content: start;
  }}

  #download-model-corrected-market-share img {{
    width: 100%;
    max-height: 240px;
    object-fit: contain;
    border: 1px solid var(--border);
  }}
</style>

<script>
  (() => {{
    const root = document.getElementById("download-model-corrected-market-share");
    const files = {{
      suv: {{
        name: "suv-model-market-share-30-50-2025-2026.png",
        data: "{suv_encoded}"
      }},
      passenger: {{
        name: "passenger-model-market-share-25-50-2025-2026.png",
        data: "{passenger_encoded}"
      }}
    }};

    function toBlob(base64) {{
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {{
        bytes[i] = binary.charCodeAt(i);
      }}
      return new Blob([bytes], {{ type: "image/png" }});
    }}

    function downloadPng(key) {{
      const file = files[key];
      if (!file) return;
      const url = URL.createObjectURL(toBlob(file.data));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}

    root.querySelectorAll("[data-file]").forEach((button) => {{
      button.addEventListener("click", () => downloadPng(button.dataset.file));
    }});
  }})();
</script>
"""
    PAGE.write_text(html, encoding="utf-8")


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    suv_2025 = compute(DATA_2025, 2025, "suv", 30_000_000, 50_000_000)
    suv_2026 = compute(DATA_2026, 2026, "suv", 30_000_000, 50_000_000)
    passenger_2025 = compute(DATA_2025, 2025, "passenger", 25_000_000, 50_000_000)
    passenger_2026 = compute(DATA_2026, 2026, "passenger", 25_000_000, 50_000_000)

    make_png(
        "SUV | Market share por modelo",
        "Rango precio lista $30MM-$50MM CLP | 2025 completo y Ene-Ago de 2026",
        suv_2025,
        suv_2026,
        OUTPUTS["suv"],
    )
    make_png(
        "Vehículos de Pasajeros | Market share por modelo",
        "Rango precio lista $25MM-$50MM CLP | 2025 completo y Ene-Ago de 2026",
        passenger_2025,
        passenger_2026,
        OUTPUTS["passenger"],
    )
    make_download_page()
    print(PAGE)
    print(OUTPUTS["suv"])
    print(OUTPUTS["passenger"])


if __name__ == "__main__":
    main()
