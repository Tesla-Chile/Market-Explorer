import json
import math
import warnings
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "inputs" / "data (33).xlsx"
OUT_DIR = ROOT / "outputs" / "market_study"
OUT_JSON = OUT_DIR / "market_results_cb_filtrado_2026.json"

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

SEGMENTS = [
    {
        "match": "SUV",
        "label": "SUV",
        "price_min": 30_000_000,
        "price_max": 50_000_000,
    },
    {
        "match": "Pasajeros",
        "label": "Vehículo de Pasajeros",
        "price_min": 25_000_000,
        "price_max": 50_000_000,
    },
]

EXCLUDED_CB = {
    "Gasolina",
    "Diesel",
    "Flex Fuel",
    "Mild Hybrid - Gasolina",
    "Mild Hybrid - Diesel",
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
        segment_df.groupby(["marca", "modelo", "anio", "quarter"], dropna=False)
        .apply(
            lambda g: pd.Series(
                {
                    "demanda_anual": g["demanda"].sum(),
                    "precio_bruto_pond": weighted_average(g["precio_bruto"], g["demanda"]),
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
                    "demanda_2026": g.loc[g["anio"] == 2026, "demanda_anual"].sum(),
                    "demanda_total": g["demanda_anual"].sum(),
                    "precio_bruto_historico": weighted_average(
                        g["precio_bruto_pond"], g["demanda_anual"]
                    ),
                }
            ),
            include_groups=False,
        )
        .reset_index()
    )

    cb_by_model = (
        segment_df[segment_df["anio"] == 2026]
        .groupby(["marca", "modelo", "cb"], dropna=False)["demanda"]
        .sum()
        .reset_index()
        .sort_values(["marca", "modelo", "demanda"], ascending=[True, True, False])
    )
    propulsion_map = {}
    for (marca, modelo), group in cb_by_model.groupby(["marca", "modelo"], dropna=False):
        propulsion_map[(marca, modelo)] = " / ".join(group["cb"].astype(str).tolist())

    selected = model_totals[
        (model_totals["precio_bruto_historico"] >= cfg["price_min"])
        & (model_totals["precio_bruto_historico"] <= cfg["price_max"])
        & (model_totals["demanda_2026"] > 0)
    ].copy()

    selected = selected.sort_values(
        ["demanda_2026", "marca", "modelo"], ascending=[False, True, True]
    ).reset_index(drop=True)
    selected["rank"] = selected.index + 1

    total_2026 = float(selected["demanda_2026"].sum())
    top = selected.head(10).copy()
    rest = selected.iloc[10:].copy()

    rows = []
    for _, row in top.iterrows():
        rows.append(
            {
                "ranking": int(row["rank"]),
                "marca": str(row["marca"]),
                "modelo": str(row["modelo"]),
                "tipo_propulsion": propulsion_map.get((row["marca"], row["modelo"]), ""),
                "precio_bruto_historico": clean_number(row["precio_bruto_historico"]),
                "demanda_anual_2026": clean_int(row["demanda_2026"]),
                "market_share_2026": float(row["demanda_2026"] / total_2026)
                if total_2026
                else 0,
            }
        )

    if len(rest) > 0:
        rest_2026 = float(rest["demanda_2026"].sum())
        rows.append(
            {
                "ranking": None,
                "marca": "RESTO",
                "modelo": "Modelos restantes",
                "tipo_propulsion": "Varios",
                "precio_bruto_historico": weighted_average(
                    rest["precio_bruto_historico"], rest["demanda_2026"]
                ),
                "demanda_anual_2026": clean_int(rest_2026),
                "market_share_2026": rest_2026 / total_2026 if total_2026 else 0,
            }
        )

    return {
        "segment": cfg["label"],
        "price_min": cfg["price_min"],
        "price_max": cfg["price_max"],
        "selected_model_count": int(len(selected)),
        "selected_market_demanda_anual_2026": clean_int(total_2026),
        "rows": rows,
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
            "Q Mes": "demanda",
            country_col: "pais",
            "Segmento": "segmento",
            "CB": "cb",
        }
    )

    df["anio"] = pd.to_numeric(df["anio"], errors="coerce")
    df["demanda"] = pd.to_numeric(df["demanda"], errors="coerce")
    df["precio_bruto"] = pd.to_numeric(df["precio_bruto"], errors="coerce")
    df["quarter"] = df["mes"].map(MONTH_TO_QUARTER)
    df["cb"] = df["cb"].astype(str).str.strip()

    clean = df[
        df["anio"].isin([2025, 2026])
        & df["quarter"].notna()
        & df["marca"].notna()
        & df["modelo"].notna()
        & df["segmento"].notna()
        & df["precio_bruto"].notna()
        & df["demanda"].notna()
        & (df["demanda"] > 0)
        & (~df["cb"].isin(EXCLUDED_CB))
    ].copy()
    clean["anio"] = clean["anio"].astype(int)

    result = {
        "source_file": str(INPUT),
        "source_sheet": "Export",
        "year": 2026,
        "excluded_cb": sorted(EXCLUDED_CB),
        "included_cb": sorted(clean["cb"].dropna().unique().tolist()),
        "method": (
            "Primero se excluyen los valores CB solicitados. Luego las versiones se "
            "agrupan a nivel modelo-trimestre. El precio bruto histórico se pondera por "
            "Demanda Anual. Los filtros de precio se aplican sobre ese precio histórico "
            "del modelo y el ranking se basa en Demanda Anual 2026."
        ),
        "segments": [build_segment(clean, cfg) for cfg in SEGMENTS],
    }
    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(
        {
            "output": str(OUT_JSON),
            "segments": [
                {
                    "segment": s["segment"],
                    "models": s["selected_model_count"],
                    "demanda_anual_2026": s["selected_market_demanda_anual_2026"],
                }
                for s in result["segments"]
            ],
        },
        ensure_ascii=False,
        indent=2,
    ))


if __name__ == "__main__":
    main()
