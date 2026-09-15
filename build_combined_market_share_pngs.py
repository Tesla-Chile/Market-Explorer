from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUT = Path(r"C:\Users\thirs\Documents\Calculo MS Tesla\outputs\market_study")

SUV_2025 = [
    ("TOYOTA RAV4", 25.9, 1701, 0.0808),
    ("SUBARU ALL NEW FORESTER", 25.9, 1578, 0.0750),
    ("SUBARU ALL NEW OUTBACK", 29.9, 1010, 0.0480),
    ("KIA SPORTAGE", 21.9, 835, 0.0397),
    ("VOLVO EX30", 29.9, 705, 0.0335),
    ("HYUNDAI TUCSON NX4E HEV", 28.9, 594, 0.0282),
    ("TESLA MODEL Y", 36.9, 539, 0.0256),
    ("OTROS", None, 14077, 0.6691),
]

SUV_2026 = [
    ("TESLA MODEL Y", 36.9, 1213, 0.0689),
    ("TOYOTA RAV4", 25.9, 1150, 0.0653),
    ("SUBARU ALL NEW FORESTER", 25.9, 1087, 0.0617),
    ("HYUNDAI TUCSON NX4E HEV", 28.9, 673, 0.0382),
    ("SUBARU ALL NEW OUTBACK", 29.9, 626, 0.0355),
    ("KIA SPORTAGE", 21.9, 468, 0.0266),
    ("VOLVO EX30", 29.9, 403, 0.0229),
    ("OTROS", None, 11992, 0.6810),
]

PV_2025 = [
    ("TESLA MODEL 3", 29.9, 422, 0.0866),
    ("PEUGEOT 308", 19.9, 281, 0.0577),
    ("CITROEN NEW C4", 22.9, 225, 0.0462),
    ("CUPRA CUPRA LEON", 25.9, 211, 0.0433),
    ("AUDI A3", 29.1, 202, 0.0415),
    ("MERCEDES BENZ A", 28.9, 184, 0.0378),
    ("TOYOTA COROLLA", 21.9, 166, 0.0341),
    ("SUBARU IMPREZA SPORT NEW GENERATION", 19.9, 137, 0.0281),
    ("BMW 120", 30.5, 134, 0.0275),
    ("OTROS", None, 2911, 0.5974),
]

PV_2026 = [
    ("TESLA MODEL 3", 29.9, 977, 0.2806),
    ("BMW 120", 30.5, 207, 0.0594),
    ("CITROEN NEW C4", 22.9, 181, 0.0520),
    ("SUBARU IMPREZA SPORT NEW GENERATION", 19.9, 165, 0.0474),
    ("MERCEDES BENZ A", 28.9, 156, 0.0448),
    ("CUPRA CUPRA LEON", 25.9, 116, 0.0333),
    ("TOYOTA COROLLA", 21.9, 110, 0.0316),
    ("AUDI A3", 29.1, 95, 0.0273),
    ("PEUGEOT 308", 19.9, 66, 0.0190),
    ("OTROS", None, 1409, 0.4047),
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
OTHER = "#f59e0b"


def fmt_units(value):
    return f"{value:,.0f}".replace(",", ".")


def fmt_share(value):
    return f"{value * 100:.1f}%".replace(".", ",")


def fmt_model(name, price):
    if price is None:
        return name
    return f"{name} | {price:.1f} M"


def text(draw, xy, content, fill=TEXT, font_obj=LABEL, anchor=None):
    kwargs = {"fill": fill, "font": font_obj}
    if anchor:
        kwargs["anchor"] = anchor
    draw.text(xy, content, **kwargs)


def draw_panel(draw, y0, period, rows, max_share, chart):
    left, right, width = chart
    label_x = 70
    top = y0 + 56
    row_h = 50
    bar_h = 30
    chart_h = len(rows) * row_h

    text(draw, (label_x, y0), period, font_obj=PANEL)
    text(draw, (label_x, top - 16), "Modelo y precio de entrada", fill=MUTED, font_obj=SMALL)

    ticks = 5
    for i in range(ticks + 1):
        value = max_share * i / ticks
        x = left + width * value / max_share
        draw.line((x, top, x, top + chart_h), fill=GRID, width=1)
        text(draw, (x, top + chart_h + 16), fmt_share(value), fill=MUTED, font_obj=SMALL, anchor="ma")

    for idx, (name, price, units, share) in enumerate(rows):
        y = top + idx * row_h + 8
        label = fmt_model(name, price)
        if len(label) > 43:
            label = label[:42] + "..."
        text(draw, (label_x, y + 5), label, font_obj=LABEL)

        x1 = left
        bar_w = max(3, width * share / max_share)
        fill = OTHER if name == "OTROS" else BAR
        draw.rectangle((x1, y, x1 + bar_w, y + bar_h), fill=fill)

        value_label = f"{fmt_share(share)} | {fmt_units(units)} un."
        tx = x1 + bar_w + 12
        if tx + 185 > left + width + 260:
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
    w = 1800
    margin_top = 70
    row_h = 50
    panel_extra = 148
    h = margin_top + 95 + len(rows_2025) * row_h + panel_extra + len(rows_2026) * row_h + 110
    image = Image.new("RGB", (w, h), BG)
    draw = ImageDraw.Draw(image)

    text(draw, (70, 42), title, font_obj=TITLE)
    text(draw, (70, 82), subtitle, fill=MUTED, font_obj=SUBTITLE)

    max_share = min(1.0, ((max([r[3] for r in rows_2025 + rows_2026]) * 1.08 / 0.05) // 1 + 1) * 0.05)
    chart = (650, 0, 870)
    y = 145
    y = draw_panel(draw, y, "Ene-Dic de 2025", rows_2025, max_share, chart)
    draw_panel(draw, y + 20, "Ene-Ago de 2026", rows_2026, max_share, chart)

    image.save(output, quality=95)


if __name__ == "__main__":
    make_png(
        "SUV | Market share por modelo",
        "Rango precio lista $30MM-$50MM CLP | 2025 completo y Ene-Ago de 2026",
        SUV_2025,
        SUV_2026,
        OUT / "suv-market-share-2025-2026.png",
    )
    make_png(
        "Vehículos de Pasajeros | Market share por modelo",
        "Rango precio lista $25MM-$50MM CLP | 2025 completo y Ene-Ago de 2026",
        PV_2025,
        PV_2026,
        OUT / "passenger-market-share-2025-2026.png",
    )
    print(OUT / "suv-market-share-2025-2026.png")
    print(OUT / "passenger-market-share-2025-2026.png")
