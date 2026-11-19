"""Exporta as tabelas em JSON para o site estático (Astro) ler no navegador."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

SAIDA_PADRAO = Path("site/public/data")


def _registros(tab: pd.DataFrame) -> list[dict]:
    """Lista de objetos pronta para JSON: datas em ISO, floats arredondados, NaN vira null."""
    t = tab.copy()
    for coluna in t.columns:
        if pd.api.types.is_datetime64_any_dtype(t[coluna]):
            t[coluna] = t[coluna].dt.strftime("%Y-%m-%d")
        elif pd.api.types.is_float_dtype(t[coluna]):
            t[coluna] = t[coluna].round(4)
    t = t.astype(object).where(t.notna(), None)
    return t.to_dict(orient="records")


def _gravar(caminho: Path, conteudo: object) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(
        json.dumps(conteudo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )


def exportar_json(
    tabelas: dict[str, pd.DataFrame], metadados: dict, saida: Path = SAIDA_PADRAO
) -> list[Path]:
    """Uma tabela por arquivo; `postos` é dividido por UF (o site baixa só o estado escolhido)."""
    escritos: list[Path] = []
    for nome, tab in tabelas.items():
        if nome == "postos":
            for uf, parte in tab.groupby("uf", observed=True):
                caminho = saida / "postos" / f"{uf}.json"
                _gravar(caminho, _registros(parte))
                escritos.append(caminho)
        else:
            caminho = saida / f"{nome}.json"
            _gravar(caminho, _registros(tab))
            escritos.append(caminho)
    caminho = saida / "metadados.json"
    _gravar(caminho, metadados)
    escritos.append(caminho)
    return escritos


def exportar_de_parquet(entrada: Path, saida: Path = SAIDA_PADRAO) -> list[Path]:
    """Lê os parquets versionados em `entrada` e gera o JSON do site (sem refazer o ETL)."""
    from .pipeline import TABELAS

    tabelas = {nome: pd.read_parquet(entrada / f"{nome}.parquet") for nome in TABELAS}
    metadados = json.loads((entrada / "metadados.json").read_text(encoding="utf-8"))
    return exportar_json(tabelas, metadados, saida)


def main(argv: list[str] | None = None) -> int:
    import argparse

    p = argparse.ArgumentParser(
        prog="preco_na_bomba.exportar", description="Gera o JSON do site a partir dos parquets."
    )
    p.add_argument("--entrada", type=Path, default=Path("data/processed"))
    p.add_argument("--saida", type=Path, default=SAIDA_PADRAO)
    args = p.parse_args(argv)
    escritos = exportar_de_parquet(args.entrada, args.saida)
    print(f"ok: {len(escritos)} arquivos JSON -> {args.saida}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
