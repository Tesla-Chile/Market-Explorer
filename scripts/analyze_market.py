import json
import math
import warnings
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "inputs" / "data (33).xlsx"
OUT_DIR = ROOT / "outputs" / "market_study"
OUT_JSON = OUT_DIR / "market_results.json"

MONTH_TO_QUARTER = {
    "Ene": "Q1",
    "Feb": "Q1",
    "Mar": "Q1",
    "Abr": "Q2",
    "May": "Q2",
    "Jun": "Q2",
    "Jul": "Q3",
    "Ago": "Q3",
    "Sep": "Q3",
    "Oct": "Q4",
    "Nov": "Q4",
    "Dic": "Q4",
}

SEGMENTS = {
    "SUV": {
        "match": "SUV",
        "label": "SUV",
        "price_min": 30_000_000,
        "price_max": 50_000_000,
    },
    "VP": {
        "match": "Pasajeros",
        "label": "Vehiculo de Pasajeros",
        "price_min": 25_000_000,
        "price_max": 50_000_000,
    },
}


def weighted_average(values: pd.Series, weights: pd.Series) -> float | None:
    valid = values.notna() & weights.notna() & (weights > 0)
    if not valid.any():
        return None
    return float((values[valid] * weights[valid]).sum() / weights[valid].sum())


def clean_number(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return float(value)


def clean_int(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return 0
    return int(round(float(value)))


def build_segment(df: pd.DataFrame, cfg: dict) -> dict:
    segment_df = df[df["segmento"].astype(str).str.contains(cfg["match"], case=False, na=False)].copy()

    quarterly = (
        segment_df.groupby(["segmento", "marca", "modelo", "anio", "quarter"], dropna=False)
        .apply(
            lambda g: pd.Series(
                {
                    "demanda_q_mes": g["q_mes"].sum(),
                    "precio_bruto_pond": weighted_average(g["precio_bruto"], g["q_mes"]),
                }
            ),
            include_groups=False,
        )
        .reset_index()
    )

    model_totals = (
        quarterly.groupby(["marca", "modelo"], dropna=False)
        .apply(
            lambda g: pd.Series(
                {
                    "demanda_2025": g.loc[g["anio"] == 2025, "demanda_q_mes"].sum(),
                    "demanda_2026": g.loc[g["anio"] == 2026, "demanda_q_mes"].sum(),
                    "demanda_total": g["demanda_q_mes"].sum(),
                    "precio_bruto_historico": weighted_average(
                        g["precio_bruto_pond"], g["demanda_q_mes"]
                    ),
                }
            ),
            include_groups=False,
        )
        .reset_index()
    )

    selected = model_totals[
        (model_totals["precio_bruto_historico"] >= cfg["price_min"])
        & (model_totals["precio_bruto_historico"] <= cfg["price_max"])
        & (model_totals["demanda_total"] > 0)
    ].copy()

    selected = selected.sort_values(
        ["demanda_total", "marca", "modelo"], ascending=[False, True, True]
    ).reset_index(drop=True)
    selected["rank"] = selected.index + 1

    total_market = float(selected["demanda_total"].sum())
    top = selected.head(10).copy()
    rest = selected.iloc[10:].copy()

    rows = []
    for _, row in top.iterrows():
        rows.append(
            {
                "ranking": int(row["rank"]),
                "marca": str(row["marca"]),
                "modelo": str(row["modelo"]),
                "precio_bruto_historico": clean_number(row["precio_bruto_historico"]),
                "q_mes_2025": clean_int(row["demanda_2025"]),
                "q_mes_2026": clean_int(row["demanda_2026"]),
                "q_mes_total": clean_int(row["demanda_total"]),
                "market_share": float(row["demanda_total"] / total_market) if total_market else 0,
            }
        )

    if len(rest) > 0:
        rows.append(
            {
                "ranking": None,
                "marca": "RESTO",
                "modelo": "Modelos restantes",
                "precio_bruto_historico": weighted_average(
                    rest["precio_bruto_historico"], rest["demanda_total"]
                ),
                "q_mes_2025": clean_int(rest["demanda_2025"].sum()),
                "q_mes_2026": clean_int(rest["demanda_2026"].sum()),
                "q_mes_total": clean_int(rest["demanda_total"].sum()),
                "market_share": float(rest["demanda_total"].sum() / total_market)
                if total_market
                else 0,
            }
        )

    full_rows = []
    for _, row in selected.iterrows():
        full_rows.append(
            {
                "ranking": int(row["rank"]),
                "marca": str(row["marca"]),
                "modelo": str(row["modelo"]),
                "precio_bruto_historico": clean_number(row["precio_bruto_historico"]),
                "q_mes_2025": clean_int(row["demanda_2025"]),
                "q_mes_2026": clean_int(row["demanda_2026"]),
                "q_mes_total": clean_int(row["demanda_total"]),
                "market_share": float(row["demanda_total"] / total_market) if total_market else 0,
            }
        )

    return {
        "segment": cfg["label"],
        "price_min": cfg["price_min"],
        "price_max": cfg["price_max"],
        "selected_model_count": int(len(selected)),
        "total_segment_model_count": int(len(model_totals)),
        "selected_market_q_mes": clean_int(total_market),
        "rows": rows,
        "all_selected_models": full_rows,
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    warnings.filterwarnings("ignore", message="Workbook contains no default style")

    df = pd.read_excel(INPUT, sheet_name="Export")
    year_col = df.columns[0]
    version_id_col = df.columns[4]
    version_col = df.columns[5]
    country_col = df.columns[9]

    df = df.rename(
        columns={
            year_col: "anio",
            "Mes": "mes",
            "Marca": "marca",
            "Modelo": "modelo",
            version_id_col: "id_version",
            version_col: "version",
            "Precio Bruto": "precio_bruto",
            "Q Mes": "q_mes",
            country_col: "pais",
            "Segmento": "segmento",
        }
    )

    df["anio"] = pd.to_numeric(df["anio"], errors="coerce")
    df["q_mes"] = pd.to_numeric(df["q_mes"], errors="coerce")
    df["precio_bruto"] = pd.to_numeric(df["precio_bruto"], errors="coerce")
    df["quarter"] = df["mes"].map(MONTH_TO_QUARTER)

    clean = df[
        df["anio"].isin([2025, 2026])
        & df["quarter"].notna()
        & df["marca"].notna()
        & df["modelo"].notna()
        & df["segmento"].notna()
        & df["precio_bruto"].notna()
        & df["q_mes"].notna()
        & (df["q_mes"] > 0)
    ].copy()
    clean["anio"] = clean["anio"].astype(int)

    result = {
        "source_file": str(INPUT),
        "source_sheet": "Export",
        "years": [2025, 2026],
        "method": (
            "Version rows are first aggregated to model-quarter level. "
            "Historical model price is a Q Mes-weighted average of quarterly model prices. "
            "Price filters are applied to that fixed historical model price."
        ),
        "segments": [build_segment(clean, cfg) for cfg in SEGMENTS.values()],
    }

    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    for segment in result["segments"]:
        safe_name = segment["segment"].replace(" ", "_").lower()
        pd.DataFrame(segment["rows"]).to_csv(OUT_DIR / f"{safe_name}_top10_resto.csv", index=False)
        pd.DataFrame(segment["all_selected_models"]).to_csv(
            OUT_DIR / f"{safe_name}_modelos_seleccionados.csv", index=False
        )

    print(json.dumps({
        "output": str(OUT_JSON),
        "segments": [
            {
                "segment": s["segment"],
                "models": s["selected_model_count"],
                "selected_market_q_mes": s["selected_market_q_mes"],
            }
            for s in result["segments"]
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
