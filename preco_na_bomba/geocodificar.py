"""Geocodifica os postos com o Nominatim (OpenStreetMap), com cache por CNPJ.

Uso: python -m preco_na_bomba.geocodificar --uf SC

A ANP publica só o endereço dos postos. Este módulo transforma o endereço em latitude e
longitude e guarda o resultado em CSVs versionados (data/processed/geo_*.csv), para que
cada posto seja consultado uma vez só. Um posto volta a ser consultado quando o endereço muda.

Precisão de cada posto:
- "endereco": o Nominatim achou o número na rua.
- "rua": achou a rua, mas não o número (o ponto fica em algum trecho da rua).
- "nao_encontrado": nada confiável dentro do município. O posto aparece na lista, sem pino.

A política de uso do Nominatim pede no máximo 1 consulta por segundo e um User-Agent
que identifique a aplicação: https://operations.osmfoundation.org/policies/nominatim/
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import time
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import requests

from .extracao import USER_AGENT as USER_AGENT_PADRAO
from .limpeza import sem_acento

URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = os.environ.get("PNB_USER_AGENT", USER_AGENT_PADRAO)
INTERVALO = 1.1  # segundos entre consultas (a política pede no máximo 1 por segundo)

CACHE_POSTOS = Path("data/processed/geo_postos.csv")
CACHE_MUNICIPIOS = Path("data/processed/geo_municipios.csv")
CAMPOS_POSTO = ["cnpj", "uf", "municipio", "chave", "lat", "lon", "precisao", "consultado_em"]
CAMPOS_MUNICIPIO = [
    "uf", "municipio", "nome", "lat", "lon", "sul", "norte", "oeste", "leste", "consultado_em",
]  # fmt: skip

NOME_UF = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia",
    "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás",
    "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí",
    "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul",
    "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
    "SE": "Sergipe", "TO": "Tocantins",
}  # fmt: skip

TIPOS_MUNICIPIO = {"city", "town", "municipality", "village", "administrative"}
CHAVES_CIDADE = ("city", "town", "village", "municipality")
MARGEM_BBOX = 0.01  # graus (~1 km): pontos na divisa ainda contam como dentro do município

Buscar = Callable[[dict], list[dict]]


def _buscar_http(params: dict) -> list[dict]:
    r = requests.get(URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.json()


class Nominatim:
    """Cliente mínimo, com o intervalo entre consultas embutido. `buscar` é trocável nos testes."""

    def __init__(
        self,
        buscar: Buscar | None = None,
        intervalo: float = INTERVALO,
        dormir: Callable[[float], None] = time.sleep,
        relogio: Callable[[], float] = time.monotonic,
    ) -> None:
        self._buscar = buscar or _buscar_http
        self._intervalo, self._dormir, self._relogio = intervalo, dormir, relogio
        self._ultima: float | None = None
        self.consultas = 0

    def buscar(self, **params: str) -> list[dict]:
        if self._ultima is not None:
            espera = self._intervalo - (self._relogio() - self._ultima)
            if espera > 0:
                self._dormir(espera)
        params = {"format": "jsonv2", "addressdetails": "1", "countrycodes": "br", **params}
        try:
            return self._buscar(params)
        finally:
            self._ultima = self._relogio()
            self.consultas += 1


def normalizar(texto: object) -> str:
    """Maiúsculo, sem acento e sem pontuação: serve para comparar nomes e montar a chave."""
    t = sem_acento("" if texto is None or pd.isna(texto) else str(texto)).upper()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]+", " ", t)).strip()


def numero_valido(numero: object) -> str | None:
    """'2024' -> '2024'; 'S/N', 'SN', '0' e vazio -> None. '120A' -> '120'."""
    m = re.match(r"\s*(\d+)", "" if numero is None or pd.isna(numero) else str(numero))
    if not m or int(m.group(1)) == 0:
        return None
    return str(int(m.group(1)))


def chave_endereco(posto: dict) -> str:
    """Muda quando o endereço muda; aí o posto é consultado de novo."""
    partes = [posto.get(c) for c in ("endereco", "numero", "cep", "municipio", "uf")]
    return "|".join(normalizar(p) for p in partes)


@dataclass(frozen=True)
class Municipio:
    uf: str
    municipio: str
    nome: str
    lat: float
    lon: float
    sul: float
    norte: float
    oeste: float
    leste: float

    def contem(self, lat: float, lon: float) -> bool:
        m = MARGEM_BBOX
        return self.sul - m <= lat <= self.norte + m and self.oeste - m <= lon <= self.leste + m


def geocodificar_municipio(cli: Nominatim, uf: str, municipio: str) -> Municipio | None:
    """Centro, contorno (bbox) e nome com acento ('Florianopolis' -> 'Florianópolis')."""
    resultados = cli.buscar(city=municipio, state=NOME_UF[uf], country="Brasil", limit="5")
    alvo = normalizar(municipio)
    for r in resultados:
        tipo = r.get("addresstype") or r.get("type")
        if tipo not in TIPOS_MUNICIPIO or normalizar(r.get("name")) != alvo:
            continue
        sul, norte, oeste, leste = (float(v) for v in r["boundingbox"])
        return Municipio(
            uf, municipio, r["name"], float(r["lat"]), float(r["lon"]), sul, norte, oeste, leste
        )
    return None


def _aceita(r: dict, mun: Municipio) -> bool:
    """O resultado só vale se cair no município certo (homônimos em outra cidade são comuns)."""
    lat, lon = float(r["lat"]), float(r["lon"])
    if not mun.contem(lat, lon):
        return False
    endereco = r.get("address") or {}
    cidades = {normalizar(endereco[c]) for c in CHAVES_CIDADE if endereco.get(c)}
    return not cidades or normalizar(mun.nome) in cidades


def geocodificar_posto(cli: Nominatim, posto: dict, mun: Municipio) -> tuple[float, float, str]:
    """(lat, lon, precisão). Tenta rua com número e depois só a rua."""
    rua = str(posto.get("endereco") or "").strip()
    if not rua:
        return float("nan"), float("nan"), "nao_encontrado"
    base = {"city": mun.nome, "state": NOME_UF[mun.uf], "country": "Brasil", "limit": "3"}
    numero = numero_valido(posto.get("numero"))
    tentativas = ([f"{numero} {rua}"] if numero else []) + [rua]
    for street in tentativas:
        for r in cli.buscar(street=street, **base):
            if _aceita(r, mun):
                exato = numero is not None and bool((r.get("address") or {}).get("house_number"))
                return float(r["lat"]), float(r["lon"]), "endereco" if exato else "rua"
    return float("nan"), float("nan"), "nao_encontrado"


def postos_unicos(tab_postos: pd.DataFrame, uf: str | None = None) -> pd.DataFrame:
    """Um registro por CNPJ, com o endereço da coleta mais recente."""
    t = tab_postos if uf is None else tab_postos[tab_postos["uf"] == uf]
    t = t.sort_values("data_coleta", kind="stable")
    return t.drop_duplicates("cnpj", keep="last").reset_index(drop=True)


def ler_cache(caminho: Path, chave: list[str]) -> pd.DataFrame:
    """CSV só cresce (uma linha por consulta); vale a última linha de cada chave."""
    if not caminho.exists():
        return pd.DataFrame()
    df = pd.read_csv(caminho, dtype={"cnpj": str})
    return df.drop_duplicates(chave, keep="last").reset_index(drop=True)


def _anexar(caminho: Path, campos: list[str], linha: dict) -> None:
    novo = not caminho.exists()
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with caminho.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        if novo:
            w.writeheader()
        w.writerow(linha)


def _agora() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _num(v: float) -> str:
    return "" if pd.isna(v) else f"{v:.6f}"


def executar(
    tab_postos: pd.DataFrame,
    uf: str,
    cli: Nominatim | None = None,
    cache_postos: Path = CACHE_POSTOS,
    cache_municipios: Path = CACHE_MUNICIPIOS,
    limite: int | None = None,
    log: Callable[[str], None] = lambda m: print(m, file=sys.stderr),
) -> Counter:
    """Geocodifica os postos de `uf` que ainda não estão no cache. Devolve a contagem final."""
    cli = cli or Nominatim()
    postos = postos_unicos(tab_postos, uf)

    muns = ler_cache(cache_municipios, ["uf", "municipio"])
    feitos = set() if muns.empty else set(zip(muns["uf"], muns["municipio"], strict=True))
    for municipio in sorted(postos["municipio"].unique()):
        if (uf, municipio) in feitos:
            continue
        m = geocodificar_municipio(cli, uf, municipio)
        log(f"  município {municipio}: {m.nome if m else 'NÃO ENCONTRADO'}")
        linha = {"uf": uf, "municipio": municipio, "consultado_em": _agora()}
        if m:
            linha |= {
                "nome": m.nome, "lat": _num(m.lat), "lon": _num(m.lon), "sul": _num(m.sul),
                "norte": _num(m.norte), "oeste": _num(m.oeste), "leste": _num(m.leste),
            }  # fmt: skip
        _anexar(cache_municipios, CAMPOS_MUNICIPIO, linha)
    muns = ler_cache(cache_municipios, ["uf", "municipio"]).dropna(subset=["lat"])
    por_nome = {
        r.municipio: Municipio(
            r.uf, r.municipio, r.nome, r.lat, r.lon, r.sul, r.norte, r.oeste, r.leste
        )
        for r in muns[muns["uf"] == uf].itertuples()
    }

    cache = ler_cache(cache_postos, ["cnpj"])
    chaves = {} if cache.empty else dict(zip(cache["cnpj"], cache["chave"], strict=True))
    pendentes = [p for p in postos.to_dict("records") if chaves.get(p["cnpj"]) != chave_endereco(p)]
    if limite is not None:
        pendentes = pendentes[:limite]
    log(f"{uf}: {len(postos)} postos, {len(pendentes)} para consultar")
    nada = (float("nan"), float("nan"), "nao_encontrado")
    for i, p in enumerate(pendentes, 1):
        mun = por_nome.get(p["municipio"])
        lat, lon, precisao = geocodificar_posto(cli, p, mun) if mun else nada
        _anexar(
            cache_postos,
            CAMPOS_POSTO,
            {
                "cnpj": p["cnpj"],
                "uf": uf,
                "municipio": p["municipio"],
                "chave": chave_endereco(p),
                "lat": _num(lat),
                "lon": _num(lon),
                "precisao": precisao,
                "consultado_em": _agora(),
            },  # fmt: skip
        )
        if i % 25 == 0 or i == len(pendentes):
            log(f"  {i}/{len(pendentes)}")

    final = ler_cache(cache_postos, ["cnpj"])
    final = final[final["cnpj"].isin(postos["cnpj"])]
    return Counter(final["precisao"])


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="preco_na_bomba.geocodificar", description=__doc__)
    p.add_argument("--uf", required=True, choices=sorted(NOME_UF))
    p.add_argument("--entrada", type=Path, default=Path("data/processed/postos.parquet"))
    p.add_argument("--limite", type=int, help="consulta no máximo N postos (para testar)")
    args = p.parse_args(argv)
    contagem = executar(pd.read_parquet(args.entrada), args.uf, limite=args.limite)
    total = sum(contagem.values()) or 1
    for precisao in ("endereco", "rua", "nao_encontrado"):
        n = contagem.get(precisao, 0)
        print(f"{precisao:>15}: {n:4d}  ({n / total:.0%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
