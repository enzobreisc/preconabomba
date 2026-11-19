"""Download com cache em disco e leitura de .zip e .csv da ANP."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
import requests

USER_AGENT = "preco-na-bomba/0.1 (projeto de dados abertos)"


def baixar(url: str, cache_dir: Path, forcar: bool = False, timeout: int = 120) -> Path:
    """Baixa para o cache (grava em .part e renomeia, para não deixar arquivo pela metade)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    destino = cache_dir / (Path(urlparse(url).path).name or "arquivo")
    if destino.exists() and not forcar:
        return destino
    parcial = destino.with_name(destino.name + ".part")
    with requests.get(url, headers={"User-Agent": USER_AGENT}, stream=True, timeout=timeout) as r:
        r.raise_for_status()
        with parcial.open("wb") as f:
            for bloco in r.iter_content(chunk_size=1 << 20):
                f.write(bloco)
    parcial.replace(destino)
    return destino


def ler_csv(conteudo: bytes) -> pd.DataFrame:
    """CSV da ANP: separador ';', tudo como texto. UTF-8 (com ou sem BOM), senão Latin-1."""
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")
    return pd.read_csv(io.StringIO(texto), sep=";", dtype=str, keep_default_na=False)


def ler_arquivo(caminho: Path) -> pd.DataFrame:
    """Lê .csv ou .zip (todos os CSVs de dentro). Os nomes dentro do zip da ANP vêm corrompidos,
    então só olhamos o conteúdo."""
    if zipfile.is_zipfile(caminho):
        partes = []
        with zipfile.ZipFile(caminho) as z:
            for info in z.infolist():
                if not info.is_dir():
                    partes.append(ler_csv(z.read(info)))
        return pd.concat(partes, ignore_index=True)
    return ler_csv(caminho.read_bytes())
