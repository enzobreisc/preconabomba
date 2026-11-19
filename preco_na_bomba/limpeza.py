"""Padronização e limpeza dos CSVs da ANP."""

from __future__ import annotations

import re
import unicodedata

import pandas as pd

UFS = frozenset(
    [
        "AC",
        "AL",
        "AP",
        "AM",
        "BA",
        "CE",
        "DF",
        "ES",
        "GO",
        "MA",
        "MT",
        "MS",
        "MG",
        "PA",
        "PB",
        "PR",
        "PE",
        "PI",
        "RJ",
        "RN",
        "RS",
        "RO",
        "RR",
        "SC",
        "SP",
        "SE",
        "TO",
    ]
)

# Cabeçalho normalizado (sem acento, minúsculo, só [a-z0-9_]) -> nome canônico.
COLUNAS = {
    "estado_sigla": "uf",
    "uf": "uf",
    "municipio": "municipio",
    "revenda": "revenda",
    "cnpj_da_revenda": "cnpj",
    "cnpj": "cnpj",
    "bairro": "bairro",
    "nome_da_rua": "endereco",
    "endereco": "endereco",
    "numero_rua": "numero",
    "numero": "numero",
    "complemento": "complemento",
    "cep": "cep",
    "produto": "produto",
    "data_da_coleta": "data_coleta",
    "data_coleta": "data_coleta",
    "valor_de_venda": "preco",
    "preco": "preco",
    "unidade_de_medida": "unidade",
    "bandeira": "bandeira",
}

# Nome na ANP (normalizado, maiúsculo) -> nome canônico. Fora daqui (ex.: GLP) é descartado.
PRODUTOS = {
    "GASOLINA": "gasolina comum",
    "GASOLINA COMUM": "gasolina comum",
    "GASOLINA ADITIVADA": "gasolina aditivada",
    "ETANOL": "etanol",
    "ETANOL HIDRATADO": "etanol",
    "DIESEL": "diesel s500",
    "DIESEL S500": "diesel s500",
    "DIESEL S10": "diesel s10",
    "GNV": "gnv",
}

# Limites de preço plausíveis (R$/litro; R$/m³ no GNV).
LIMITE_PADRAO = (1.0, 20.0)
LIMITES = {"gnv": (1.0, 10.0)}

BANDEIRAS = {
    "VIBRA": "Vibra",
    "VIBRA ENERGIA": "Vibra",
    "BR": "Vibra",
    "PETROBRAS DISTRIBUIDORA": "Vibra",
    "PETROBRAS DISTRIBUIDORA S.A.": "Vibra",
    "IPIRANGA": "Ipiranga",
    "SHELL": "Shell",
    "RAIZEN": "Shell",  # a Raízen opera a marca Shell no Brasil
    "ALE": "Alesat",
    "ALESAT": "Alesat",
    "BRANCA": "Bandeira branca",
    "": "Bandeira branca",
}

PREPOSICOES = frozenset({"de", "da", "do", "das", "dos", "e", "d"})


def sem_acento(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))


def normalizar_coluna(nome: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", sem_acento(nome).lower()).strip("_")


def padronizar_colunas(df: pd.DataFrame) -> pd.DataFrame:
    """Renomeia para o esquema canônico e mantém só as colunas usadas."""
    renomear = {
        c: COLUNAS[normalizar_coluna(c)] for c in df.columns if normalizar_coluna(c) in COLUNAS
    }
    df = df.rename(columns=renomear)
    return df.loc[:, ~df.columns.duplicated()][list(dict.fromkeys(renomear.values()))]


def titulo_municipio(nome: str) -> str:
    """'SAO JOSE DO RIO PRETO' -> 'Sao Jose do Rio Preto' (preposições em minúsculo)."""
    palavras = re.sub(r"\s+", " ", str(nome)).strip().lower().split(" ")
    saida = []
    for i, p in enumerate(palavras):
        if i > 0 and p in PREPOSICOES:
            saida.append(p)
        else:
            saida.append("-".join(parte.capitalize() for parte in p.split("-")))
    return " ".join(saida)


def unificar_bandeira(valor: object) -> str:
    chave = sem_acento("" if pd.isna(valor) else str(valor)).upper().strip()
    return BANDEIRAS.get(chave, chave.title())


def semana_inicio(datas: pd.Series) -> pd.Series:
    """Domingo que abre a semana da coleta (a semana da ANP vai de domingo a sábado)."""
    dias = (datas.dt.weekday + 1) % 7
    return (datas - pd.to_timedelta(dias, unit="D")).dt.normalize()


def limpar(df: pd.DataFrame) -> pd.DataFrame:
    """Do CSV cru (tudo texto) ao esquema limpo usado nas agregações."""
    df = padronizar_colunas(df).copy()

    df["uf"] = df["uf"].astype(str).str.strip().str.upper()
    df = df[df["uf"].isin(UFS)]

    produto = df["produto"].astype(str).map(lambda p: sem_acento(p).upper().strip())
    df["produto"] = produto.map(PRODUTOS)
    df = df.dropna(subset=["produto"])

    df["preco"] = pd.to_numeric(
        df["preco"].astype(str).str.strip().str.replace(",", ".", regex=False), errors="coerce"
    )
    df["data_coleta"] = pd.to_datetime(df["data_coleta"], format="%d/%m/%Y", errors="coerce")
    df = df.dropna(subset=["preco", "data_coleta"])

    minimo = df["produto"].map(lambda p: LIMITES.get(p, LIMITE_PADRAO)[0])
    maximo = df["produto"].map(lambda p: LIMITES.get(p, LIMITE_PADRAO)[1])
    df = df[(df["preco"] >= minimo) & (df["preco"] <= maximo)]

    df["cnpj"] = df["cnpj"].astype(str).str.replace(r"\D", "", regex=True).str.zfill(14)
    df["municipio"] = df["municipio"].map(titulo_municipio)
    df["bandeira"] = df["bandeira"].map(unificar_bandeira)
    for coluna in ("revenda", "bairro", "endereco", "numero", "complemento"):
        if coluna in df:
            df[coluna] = df[coluna].fillna("").astype(str).str.strip()
    if "cep" in df:  # só os dígitos: '88010-000' e '88010000' viram o mesmo CEP
        df["cep"] = df["cep"].fillna("").astype(str).str.replace(r"\D", "", regex=True)

    df = df.sort_values("data_coleta", kind="stable")
    df = df.drop_duplicates(["cnpj", "produto", "data_coleta"], keep="last")
    df["semana"] = semana_inicio(df["data_coleta"])
    return df.reset_index(drop=True)
