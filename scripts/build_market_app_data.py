import json
from pathlib import Path

import pandas as pd


ROOT = Path(r"C:\Users\thirs\Documents\Calculo MS Tesla")
DATA_2025 = ROOT / "inputs" / "data (33).xlsx"
DATA_2026 = Path(r"C:\Users\thirs\Downloads\data (41).xlsx")
OUT = ROOT / "outputs" / "market_app"


def clean_text(value):
    if pd.isna(value):
        return ""
    return str(value).strip()


def normalize_model(value):
    model = clean_text(value)
    if model.upper() in {"RAV4 VI", "RAV 4", "RAV4 IV", "RAV 4 IV"}:
        return "RAV4"
    return model


def load_source(path, target_year):
    df = pd.read_excel(path, sheet_name="Export", usecols=[0, 1, 2, 3, 5, 6, 7, 10])
    df.columns = ["year", "month", "brand", "model", "version", "price", "units", "segment"]
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df = df[df["year"].eq(target_year)].copy()

    df["month"] = df["month"].map(clean_text)
    df["brand"] = df["brand"].map(clean_text)
    df["model"] = df["model"].map(normalize_model)
    df["version"] = df["version"].map(clean_text)
    df["segment"] = df["segment"].map(clean_text)
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df["units"] = pd.to_numeric(df["units"], errors="coerce").fillna(0)

    df = df[df["price"].notna() & df["segment"].ne("")]
    return df


def category_from_segment(segment):
    segment_upper = segment.upper()
    if segment_upper == "SUV":
        return "SUV"
    if "PASAJ" in segment_upper:
        return "Vehículos de Pasajeros"
    return None


def main():
    source = pd.concat(
        [load_source(DATA_2025, 2025), load_source(DATA_2026, 2026)],
        ignore_index=True,
    )
    source["category"] = source["segment"].map(category_from_segment)
    source = source[source["category"].notna()].copy()

    source["price"] = source["price"].round(0).astype(int)
    source["units"] = source["units"].round(6)

    records = source[
        ["year", "month", "category", "brand", "model", "version", "price", "units"]
    ].to_dict(orient="records")

    metadata = {
        "sources": {
            "2025": str(DATA_2025),
            "2026": str(DATA_2026),
        },
        "recordCount": len(records),
        "years": sorted(source["year"].dropna().astype(int).unique().tolist()),
        "categories": ["SUV", "Vehículos de Pasajeros"],
    }

    OUT.mkdir(parents=True, exist_ok=True)
    payload = {"metadata": metadata, "records": records}
    (OUT / "anac-data.js").write_text(
        "window.ANAC_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(OUT / "anac-data.js")
    print(f"{len(records):,} records")


if __name__ == "__main__":
    main()
