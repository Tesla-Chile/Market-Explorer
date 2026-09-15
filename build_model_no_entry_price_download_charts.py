from base64 import b64encode
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUT = Path(r"C:\Users\thirs\Documents\Calculo MS Tesla\outputs\market_study")

OUTPUTS = {
    "suv": OUT / "suv-market-share-30-50-no-entry-price-2025-2026.png",
    "passenger": OUT / "passenger-market-share-25-50-no-entry-price-2025-2026.png",
}
PAGE = OUT / "download-model-no-entry-price-market-share-pngs.html"


SUV_2025 = [
    ("TOYOTA RAV4", 1701, 0.0808),
    ("SUBARU ALL NEW FORESTER", 1578, 0.0750),
    ("SUBARU ALL NEW OUTBACK", 1010, 0.0480),
    ("KIA SPORTAGE", 835, 0.0397),
    ("VOLVO EX30", 705, 0.0335),
    ("HYUNDAI TUCSON NX4E HEV", 594, 0.0282),
    ("TESLA MODEL Y", 539, 0.0256),
    ("RESTO", 14077, 0.6691),
]

SUV_2026 = [
    ("TESLA MODEL Y", 1213, 0.0689),
    ("TOYOTA RAV4", 1150, 0.0653),
    ("SUBARU ALL NEW FORESTER", 1087, 0.0617),
    ("HYUNDAI TUCSON NX4E HEV", 673, 0.0382),
    ("SUBARU ALL NEW OUTBACK", 626, 0.0355),
    ("KIA SPORTAGE", 468, 0.0266),
    ("VOLVO EX30", 403, 0.0229),
    ("RESTO", 11992, 0.6810),
]

PV_2025 = [
    ("TESLA MODEL 3", 422, 0.0866),
    ("PEUGEOT 308", 281, 0.0577),
    ("CITROEN NEW C4", 225, 0.0462),
    ("CUPRA CUPRA LEON", 211, 0.0433),
    ("AUDI A3", 202, 0.0415),
    ("MERCEDES BENZ A", 184, 0.0378),
    ("TOYOTA COROLLA", 166, 0.0341),
    ("SUBARU IMPREZA SPORT NEW GENERATION", 137, 0.0281),
    ("BMW 120", 134, 0.0275),
    ("RESTO", 2911, 0.5974),
]

PV_2026 = [
    ("TESLA MODEL 3", 977, 0.2806),
    ("BMW 120", 207, 0.0594),
    ("CITROEN NEW C4", 181, 0.0520),
    ("SUBARU IMPREZA SPORT NEW GENERATION", 165, 0.0474),
    ("MERCEDES BENZ A", 156, 0.0448),
    ("CUPRA CUPRA LEON", 116, 0.0333),
    ("TOYOTA COROLLA", 110, 0.0316),
    ("AUDI A3", 95, 0.0273),
    ("PEUGEOT 308", 66, 0.0190),
    ("RESTO", 1409, 0.4047),
]


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
    html = f"""<div id="download-model-no-entry-price-market-share" class="download-model-no-entry-price-market-share">
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
  #download-model-no-entry-price-market-share {{
    width: 100%;
    color: var(--foreground);
  }}

  #download-model-no-entry-price-market-share h2 {{
    margin: 0 0 14px;
    font-weight: 500;
  }}

  #download-model-no-entry-price-market-share .download-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
  }}

  #download-model-no-entry-price-market-share section {{
    display: grid;
    gap: 10px;
    align-content: start;
  }}

  #download-model-no-entry-price-market-share img {{
    width: 100%;
    max-height: 240px;
    object-fit: contain;
    border: 1px solid var(--border);
  }}
</style>

<script>
  (() => {{
    const root = document.getElementById("download-model-no-entry-price-market-share");
    const files = {{
      suv: {{
        name: "suv-model-market-share-30-50-no-entry-price-2025-2026.png",
        data: "{suv_encoded}"
      }},
      passenger: {{
        name: "passenger-model-market-share-25-50-no-entry-price-2025-2026.png",
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
    make_png(
        "SUV | Market share por modelo",
        "Rango precio lista $30MM-$50MM CLP | 2025 completo y Ene-Ago de 2026",
        SUV_2025,
        SUV_2026,
        OUTPUTS["suv"],
    )
    make_png(
        "Vehículos de Pasajeros | Market share por modelo",
        "Rango precio lista $25MM-$50MM CLP | 2025 completo y Ene-Ago de 2026",
        PV_2025,
        PV_2026,
        OUTPUTS["passenger"],
    )
    make_download_page()
    print(PAGE)
    print(OUTPUTS["suv"])
    print(OUTPUTS["passenger"])


if __name__ == "__main__":
    main()
