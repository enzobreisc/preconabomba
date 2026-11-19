"""Linha de comando: python -m preco_na_bomba.pipeline [--amostra]"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from . import agregacoes, amostra, extracao, fontes, limpeza

TABELAS = [
    "semanal", "postos", "municipios", "bandeiras", "paridade_uf", "paridade_municipios",
    "assimetria",
]  # fmt: skip


def calcular_tabelas(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    semanal = agregacoes.semanal(df)
    tab_postos = agregacoes.postos(df)
    return {
        "semanal": semanal,
        "postos": tab_postos,
        "municipios": agregacoes.municipios(tab_postos),
        "bandeiras": agregacoes.bandeiras(df),
        "paridade_uf": agregacoes.paridade_uf(df),
        "paridade_municipios": agregacoes.paridade_municipios(df),
        "assimetria": agregacoes.assimetria(semanal),
    }


def gravar(tabelas: dict[str, pd.DataFrame], metadados: dict, saida: Path) -> None:
    saida.mkdir(parents=True, exist_ok=True)
    for nome, tab in tabelas.items():
        destino = saida / f"{nome}.parquet"
        tmp = destino.with_suffix(".parquet.tmp")
        tab.to_parquet(tmp, index=False, compression="zstd")
        tmp.replace(destino)
    (saida / "metadados.json").write_text(
        json.dumps(metadados, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def carregar_real(ano_inicial: int, cache: Path) -> tuple[pd.DataFrame, list[str]]:
    links = fontes.classificar_links(fontes.ler_pagina())
    arquivos = fontes.selecionar_arquivos(links, ano_inicial)
    if not arquivos:
        raise RuntimeError("nenhum arquivo da ANP encontrado na página")
    partes = []
    for a in arquivos:
        print(f"  {a.tipo} {a.ano}/{a.periodo:02d}: {a.url.rsplit('/', 1)[-1]}", file=sys.stderr)
        partes.append(limpeza.limpar(extracao.ler_arquivo(extracao.baixar(a.url, cache))))
    df = pd.concat(partes, ignore_index=True)
    df = df.drop_duplicates(["cnpj", "produto", "data_coleta"], keep="last")
    return df.reset_index(drop=True), [a.url for a in arquivos]


def executar(use_amostra: bool, ano_inicial: int, saida: Path, cache: Path) -> dict:
    if use_amostra:
        df, arquivos = limpeza.limpar(amostra.gerar_amostra()), []
        fonte = "Dados sintéticos de demonstração (não são da ANP)"
    else:
        df, arquivos = carregar_real(ano_inicial, cache)
        fonte = "ANP, Levantamento de Preços de Combustíveis (LPC)"
    if df.empty:
        raise RuntimeError("nenhuma linha válida depois da limpeza")

    tabelas = calcular_tabelas(df)
    metadados = {
        "fonte": fonte,
        "sintetico": use_amostra,
        "gerado_em": datetime.now(UTC).isoformat(timespec="seconds"),
        "periodo": {
            "inicio": df["data_coleta"].min().date().isoformat(),
            "fim": df["data_coleta"].max().date().isoformat(),
        },
        "semana_referencia": df["semana"].max().date().isoformat(),
        "n_coletas": len(df),
        "n_postos": int(df["cnpj"].nunique()),
        "n_municipios": int(df[["uf", "municipio"]].drop_duplicates().shape[0]),
        "arquivos": arquivos,
        "tabelas": {nome: len(tab) for nome, tab in tabelas.items()},
    }
    gravar(tabelas, metadados, saida)
    return metadados


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="preco_na_bomba.pipeline", description=__doc__)
    p.add_argument("--amostra", action="store_true", help="usa dados sintéticos (offline)")
    p.add_argument("--ano-inicial", type=int, default=2024)
    p.add_argument("--saida", type=Path, default=Path("data/processed"))
    p.add_argument("--cache", type=Path, default=Path("data/raw"))
    args = p.parse_args(argv)
    try:
        meta = executar(args.amostra, args.ano_inicial, args.saida, args.cache)
    except Exception as erro:  # noqa: BLE001
        print(f"erro: {erro}", file=sys.stderr)
        return 1
    print(f"ok: {meta['n_coletas']} coletas, {meta['n_postos']} postos -> {args.saida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
