"""Tabelas resumidas que o dashboard lê. Entrada: DataFrame limpo (ver limpeza.limpar)."""

from __future__ import annotations

import pandas as pd

LITROS_TANQUE = 50.0
LIMIAR_ETANOL = 0.70
MIN_POSTOS = 3


def janela(df: pd.DataFrame, semanas: int) -> pd.DataFrame:
    """Últimas `semanas` semanas, contadas a partir da semana mais recente dos dados."""
    corte = df["semana"].max() - pd.Timedelta(weeks=semanas - 1)
    return df[df["semana"] >= corte]


def _p(q: float):
    return lambda s: s.quantile(q)


def semanal(df: pd.DataFrame) -> pd.DataFrame:
    """Mediana, p10, p90 e coletas por semana x UF x produto, mais o total Brasil (uf='BR')."""
    saidas = []
    for chaves, uf_fixa in ((["semana", "uf", "produto"], None), (["semana", "produto"], "BR")):
        agg = df.groupby(chaves, observed=True)["preco"].agg(
            mediana="median", p10=_p(0.10), p90=_p(0.90), n_coletas="size"
        )
        agg = agg.reset_index()
        if uf_fixa:
            agg["uf"] = uf_fixa
        saidas.append(agg)
    out = pd.concat(saidas, ignore_index=True)
    return out[["semana", "uf", "produto", "mediana", "p10", "p90", "n_coletas"]]


def postos(df: pd.DataFrame, semanas: int = 4) -> pd.DataFrame:
    """Último preço de cada posto por produto, com posição no ranking da cidade."""
    base = janela(df, semanas).sort_values("data_coleta", kind="stable")
    ultimo = base.groupby(["cnpj", "produto"], observed=True).tail(1).copy()
    cidade = ["uf", "municipio", "produto"]
    g = ultimo.groupby(cidade, observed=True)["preco"]
    ultimo["n_postos_municipio"] = g.transform("size")
    ultimo["mediana_municipio"] = g.transform("median")
    ultimo["rank_municipio"] = g.rank(method="min").astype(int)
    ultimo["dif_mediana"] = ultimo["preco"] - ultimo["mediana_municipio"]
    # número, complemento e CEP servem para geocodificar; ficam de fora se o arquivo não os tiver
    extras = [c for c in ("numero", "complemento", "cep") if c in ultimo]
    colunas = [
        "uf", "municipio", "cnpj", "revenda", "bairro", "endereco", *extras, "produto",
        "bandeira", "preco", "data_coleta", "n_postos_municipio", "mediana_municipio",
        "rank_municipio", "dif_mediana",
    ]  # fmt: skip
    return ultimo[colunas].sort_values(["uf", "municipio", "produto", "rank_municipio"])


def municipios(
    tab_postos: pd.DataFrame, min_postos: int = MIN_POSTOS, litros: float = LITROS_TANQUE
) -> pd.DataFrame:
    """Mediana, mínimo, máximo e economia por cidade (só cidades com `min_postos` ou mais).

    economia_tanque = (mediana - posto mais barato) x litros: quanto se poupa num tanque
    ao abastecer no posto mais barato em vez de num posto típico da cidade.
    """
    g = tab_postos.groupby(["uf", "municipio", "produto"], observed=True)["preco"]
    out = g.agg(n_postos="size", mediana="median", minimo="min", maximo="max").reset_index()
    out = out[out["n_postos"] >= min_postos].copy()
    out["economia_tanque"] = (out["mediana"] - out["minimo"]) * litros
    return out.reset_index(drop=True)


def bandeiras(
    df: pd.DataFrame, semanas: int = 12, min_postos: int = MIN_POSTOS, min_obs: int = 30
) -> pd.DataFrame:
    """Prêmio de cada bandeira sobre a mediana da MESMA cidade e semana (nunca entre estados).

    O prêmio é a média, não a mediana: a maioria dos postos cobra exatamente a mediana da cidade,
    e a mediana dos prêmios sairia 0 para quase todas as bandeiras.
    """
    base = janela(df, semanas).copy()
    chave = ["uf", "municipio", "semana", "produto"]
    g = base.groupby(chave, observed=True)
    base["mediana_cs"] = g["preco"].transform("median")
    base["n_postos_cs"] = g["cnpj"].transform("nunique")
    base["n_bandeiras_cs"] = g["bandeira"].transform("nunique")
    base = base[(base["n_postos_cs"] >= min_postos) & (base["n_bandeiras_cs"] >= 2)].copy()
    base["premio"] = base["preco"] - base["mediana_cs"]
    base["premio_pct"] = base["premio"] / base["mediana_cs"] * 100

    out = (
        base.groupby(["bandeira", "produto"], observed=True)
        .agg(
            n_obs=("premio", "size"),
            n_postos=("cnpj", "nunique"),
            n_cidades=("municipio", "nunique"),
            premio_medio=("premio", "mean"),
            premio_pct=("premio_pct", "mean"),
        )
        .reset_index()
    )
    return out[out["n_obs"] >= min_obs].reset_index(drop=True)


def _paridade(base: pd.DataFrame, chaves: list[str], min_postos: int = 1) -> pd.DataFrame:
    base = base[base["produto"].isin(["etanol", "gasolina comum"])]
    g = base.groupby([*chaves, "produto"], observed=True)
    med = g["preco"].median().rename("mediana")
    n = g["cnpj"].nunique().rename("n_postos")
    t = pd.concat([med, n], axis=1).reset_index()
    p = t.pivot_table(index=chaves, columns="produto", values=["mediana", "n_postos"])
    p.columns = [f"{a}_{b}".replace(" comum", "") for a, b in p.columns]
    p = p.dropna().reset_index()
    p = p[(p["n_postos_etanol"] >= min_postos) & (p["n_postos_gasolina"] >= min_postos)]
    p["razao"] = p["mediana_etanol"] / p["mediana_gasolina"]
    p["etanol_compensa"] = p["razao"].round(4) <= LIMIAR_ETANOL
    return p.drop(columns=["n_postos_etanol", "n_postos_gasolina"]).reset_index(drop=True)


def paridade_uf(df: pd.DataFrame) -> pd.DataFrame:
    """Razão etanol/gasolina por UF e semana (histórico inteiro)."""
    return _paridade(df, ["semana", "uf"])


def paridade_municipios(
    df: pd.DataFrame, semanas: int = 4, min_postos: int = MIN_POSTOS
) -> pd.DataFrame:
    """Razão etanol/gasolina por cidade nas últimas semanas (cidades com postos suficientes)."""
    return _paridade(janela(df, semanas), ["uf", "municipio"], min_postos)
