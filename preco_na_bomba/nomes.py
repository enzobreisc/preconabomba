"""Nome oficial (com acento) dos municípios, a partir da lista do IBGE.

Uso: python -m preco_na_bomba.nomes   (baixa a lista e grava data/processed/ibge_municipios.csv)

A ANP publica o município em maiúsculas e sem acento ("SAO JOSE DO RIO PRETO"). O site mostra
o nome do IBGE ("São José do Rio Preto"). A lista muda raramente, então fica versionada e só é
baixada de novo à mão. Um município que não casar com a lista continua com o nome da ANP.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

import requests

from .extracao import USER_AGENT
from .limpeza import sem_acento

URL = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado"
CACHE = Path("data/processed/ibge_municipios.csv")


def chave(nome: str) -> str:
    """Forma de comparar nomes: sem acento, sem caixa, sem espaço, hífen ou apóstrofo."""
    return re.sub(r"[^a-z0-9]", "", sem_acento(nome).lower())


def ler(caminho: Path = CACHE) -> dict[tuple[str, str], str]:
    """{(uf, chave): nome oficial}; vazio se a lista ainda não foi baixada."""
    if not caminho.exists():
        return {}
    with caminho.open(encoding="utf-8", newline="") as f:
        return {(r["uf"], chave(r["nome"])): r["nome"] for r in csv.DictReader(f)}


def nomes_oficiais(pares: set[tuple[str, str]], ibge: dict[tuple[str, str], str]) -> dict[str, str]:
    """{"UF|municipio da ANP": nome oficial}, só para os municípios que casaram."""
    out = {}
    for uf, municipio in sorted(pares):
        nome = ibge.get((uf, chave(municipio)))
        if nome:
            out[f"{uf}|{municipio}"] = nome
    return out


def baixar(caminho: Path = CACHE) -> int:
    r = requests.get(URL, headers={"User-Agent": USER_AGENT}, timeout=60)
    r.raise_for_status()
    linhas = sorted({(m["UF-sigla"], m["municipio-nome"]) for m in r.json()})
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with caminho.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["uf", "nome"])
        w.writerows(linhas)
    return len(linhas)


if __name__ == "__main__":
    n = baixar()
    print(f"ok: {n} municípios -> {CACHE}")
    sys.exit(0)
