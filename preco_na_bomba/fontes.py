"""Descoberta dos arquivos da ANP: lê os links da página e escolhe o que baixar."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import unquote, urljoin

import requests
from bs4 import BeautifulSoup

URL_PAGINA = (
    "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/"
    "serie-historica-de-precos-de-combustiveis"
)

SEMESTRAL = re.compile(r"/dsas/ca/ca-(\d{4})-0([12])\.(?:zip|csv)$", re.I)
SEMESTRE_NO_TEXTO = re.compile(r"([12])\s*[º°o]?\s*semestre\s+de\s+(\d{4})", re.I)
MENSAL = re.compile(r"/dsan/(\d{4})/([^/?#]+)$", re.I)
MES_NO_INICIO = re.compile(r"^(\d{2})-")
MES_NO_FIM = re.compile(r"-(\d{2})(?:\.\w+)?$")


@dataclass(frozen=True)
class ArquivoANP:
    url: str
    tipo: str  # "semestral" ou "mensal"
    ano: int
    periodo: int  # semestre (1 ou 2) ou mês (1 a 12)

    @property
    def semestre(self) -> int:
        return self.periodo if self.tipo == "semestral" else (1 if self.periodo <= 6 else 2)


def ler_pagina(url: str = URL_PAGINA, timeout: int = 30) -> str:
    r = requests.get(url, headers={"User-Agent": "preco-na-bomba/0.1"}, timeout=timeout)
    r.raise_for_status()
    return r.text


def classificar_link(url: str, texto: str = "") -> ArquivoANP | None:
    """Classifica um link como arquivo semestral ou mensal de automotivos (ou None)."""
    if "/shpc/" not in url:
        return None
    caminho = unquote(url).split("?")[0]
    m = SEMESTRAL.search(caminho)
    if m:
        return ArquivoANP(url, "semestral", int(m[1]), int(m[2]))
    if caminho.endswith("/precos-semestrais-ca.zip"):  # nome fora do padrão: o ano vem do texto
        t = SEMESTRE_NO_TEXTO.search(texto)
        return ArquivoANP(url, "semestral", int(t[2]), int(t[1])) if t else None

    m = MENSAL.search(caminho)
    if not m:
        return None
    ano, nome = int(m[1]), m[2].lower()
    if "glp" in nome or not ("gasolina" in nome or "diesel" in nome or "gnv" in nome):
        return None
    mes = MES_NO_INICIO.match(nome) or MES_NO_FIM.search(nome)
    if not mes or not 1 <= int(mes[1]) <= 12:
        return None
    return ArquivoANP(url, "mensal", ano, int(mes[1]))


def classificar_links(html: str, base: str = URL_PAGINA) -> list[ArquivoANP]:
    vistos: dict[str, ArquivoANP] = {}
    for a in BeautifulSoup(html, "html.parser").find_all("a", href=True):
        url = urljoin(base, a["href"])
        arquivo = classificar_link(url, a.get_text(" ", strip=True))
        if arquivo:
            vistos.setdefault(url, arquivo)
    return list(vistos.values())


def selecionar_arquivos(links: list[ArquivoANP], ano_inicial: int = 2024) -> list[ArquivoANP]:
    """Semestrais desde ano_inicial, completados pelos mensais dos semestres sem arquivo."""
    semestrais = [a for a in links if a.tipo == "semestral" and a.ano >= ano_inicial]
    cobertos = {(a.ano, a.periodo) for a in semestrais}
    mensais = [
        a
        for a in links
        if a.tipo == "mensal" and a.ano >= ano_inicial and (a.ano, a.semestre) not in cobertos
    ]
    chave = lambda a: (a.ano, a.periodo, a.url)  # noqa: E731
    return sorted(semestrais, key=chave) + sorted(mensais, key=chave)
