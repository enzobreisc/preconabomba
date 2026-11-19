"""Dados sintéticos no formato cru da ANP, para rodar offline e nos testes."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

COLUNAS_ANP = [
    "Regiao - Sigla", "Estado - Sigla", "Municipio", "Revenda", "CNPJ da Revenda",
    "Nome da Rua", "Numero Rua", "Complemento", "Bairro", "Cep", "Produto",
    "Data da Coleta", "Valor de Venda", "Valor de Compra", "Unidade de Medida", "Bandeira",
]  # fmt: skip

CAPITAIS = {
    "AC": "RIO BRANCO", "AL": "MACEIO", "AP": "MACAPA", "AM": "MANAUS", "BA": "SALVADOR",
    "CE": "FORTALEZA", "DF": "BRASILIA", "ES": "VITORIA", "GO": "GOIANIA", "MA": "SAO LUIS",
    "MT": "CUIABA", "MS": "CAMPO GRANDE", "MG": "BELO HORIZONTE", "PA": "BELEM",
    "PB": "JOAO PESSOA", "PR": "CURITIBA", "PE": "RECIFE", "PI": "TERESINA",
    "RJ": "RIO DE JANEIRO", "RN": "NATAL", "RS": "PORTO ALEGRE", "RO": "PORTO VELHO",
    "RR": "BOA VISTA", "SC": "FLORIANOPOLIS", "SP": "SAO PAULO", "SE": "ARACAJU",
    "TO": "PALMAS",
}  # fmt: skip
REGIAO = {
    **dict.fromkeys(["AC", "AM", "AP", "PA", "RO", "RR", "TO"], "N"),
    **dict.fromkeys(["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"], "NE"),
    **dict.fromkeys(["DF", "GO", "MT", "MS"], "CO"),
    **dict.fromkeys(["ES", "MG", "RJ", "SP"], "SE"),
    **dict.fromkeys(["PR", "RS", "SC"], "S"),
}
OUTRAS_CIDADES = ["SAO JOSE DOS PINHAIS", "JUIZ DE FORA", "SANTA BARBARA D OESTE"]
BANDEIRAS = ["VIBRA", "IPIRANGA", "RAIZEN", "ALE", "BRANCA", "PETROBRAS DISTRIBUIDORA S.A."]
PREMIO = {"VIBRA": 0.0, "IPIRANGA": 0.10, "RAIZEN": 0.12, "ALE": 0.05, "BRANCA": -0.15,
          "PETROBRAS DISTRIBUIDORA S.A.": 0.0}  # fmt: skip
PRODUTOS_ANP = ["GASOLINA", "GASOLINA ADITIVADA", "ETANOL", "DIESEL S10", "DIESEL", "GNV"]
SEMANAS_FALTANDO = {"AC": {8, 9, 15}}  # buracos de propósito, para testar semanas consecutivas


def _cnpj(rng: np.random.Generator) -> str:
    n = rng.integers(10**13, 10**14)
    s = f"{n:014d}"
    return f" {s[:2]}.{s[2:5]}.{s[5:8]}/{s[8:12]}-{s[12:]}"  # espaço à frente, como na ANP


def gerar_amostra(
    semanas: int = 24, seed: int = 42, inicio: date = date(2024, 1, 7)
) -> pd.DataFrame:
    """Devolve o DataFrame cru (só texto), com as colunas e os vícios do CSV real da ANP."""
    rng = np.random.default_rng(seed)
    linhas: list[dict[str, str]] = []

    for uf, capital in CAPITAIS.items():
        fator_etanol = rng.uniform(0.64, 0.76)  # parte dos estados abaixo de 70%, parte acima
        base = 5.80 + rng.uniform(-0.4, 0.6)
        # Índice semanal do estado: altas fortes e quedas lentas (assimetria).
        passos = np.where(
            rng.random(semanas) < 0.4,
            np.abs(rng.normal(0.012, 0.004, semanas)),
            -np.abs(rng.normal(0.004, 0.002, semanas)),
        )
        indice = base * np.cumprod(1 + passos)

        cidades = [capital, *OUTRAS_CIDADES]
        for j, cidade in enumerate(cidades):
            n_postos = 2 if (j == 3 and rng.random() < 0.5) else int(rng.integers(3, 7))
            for p in range(n_postos):
                cnpj = _cnpj(rng)
                bandeira = BANDEIRAS[int(rng.integers(0, len(BANDEIRAS)))]
                ajuste_posto = rng.normal(0, 0.08)
                for s in range(semanas):
                    if s in SEMANAS_FALTANDO.get(uf, set()) or rng.random() > 0.85:
                        continue
                    gasolina = indice[s] + PREMIO[bandeira] + ajuste_posto
                    preco = {
                        "GASOLINA": gasolina,
                        "GASOLINA ADITIVADA": gasolina + 0.30,
                        "ETANOL": gasolina * fator_etanol,
                        "DIESEL S10": gasolina + 0.25,
                        "DIESEL": gasolina + 0.15,
                        "GNV": 4.5 + ajuste_posto,
                    }
                    coleta = inicio + timedelta(weeks=s, days=int(rng.integers(1, 6)))
                    for produto in PRODUTOS_ANP:
                        linhas.append(
                            {
                                "Regiao - Sigla": REGIAO[uf],
                                "Estado - Sigla": uf,
                                "Municipio": cidade,
                                "Revenda": f"POSTO {cidade[:4]} {p + 1}",
                                "CNPJ da Revenda": cnpj,
                                "Nome da Rua": "RUA CENTRAL",
                                "Numero Rua": str(10 + p),
                                "Complemento": "",
                                "Bairro": "CENTRO",
                                "Cep": "00000-000",
                                "Produto": produto,
                                "Data da Coleta": coleta.strftime("%d/%m/%Y"),
                                "Valor de Venda": f"{preco[produto]:.2f}".replace(".", ","),
                                "Valor de Compra": "",
                                "Unidade de Medida": "R$ / m³"
                                if produto == "GNV"
                                else "R$ / litro",
                                "Bandeira": bandeira,
                            }
                        )

    df = pd.DataFrame(linhas, columns=COLUNAS_ANP)
    return _sujar(df, rng)


def _sujar(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Injeta problemas reais: duplicatas, preços absurdos, datas e preços inválidos."""
    n = len(df)
    duplicatas = df.sample(frac=0.01, random_state=int(rng.integers(0, 10**6)))
    df = pd.concat([df, duplicatas], ignore_index=True)

    idx = rng.choice(n, size=6, replace=False)
    df.loc[idx[0], "Valor de Venda"] = "0,50"
    df.loc[idx[1], "Valor de Venda"] = "55,00"
    df.loc[idx[2], "Valor de Venda"] = "99,90"
    df.loc[idx[3], "Valor de Venda"] = "abc"
    df.loc[idx[4], "Data da Coleta"] = "31/02/2024"
    df.loc[idx[5], "Data da Coleta"] = ""
    return df


def para_csv(df: pd.DataFrame, destino, encoding: str = "utf-8-sig") -> None:
    """Grava no formato da ANP: ';', CRLF, UTF-8 com BOM (ou Latin-1)."""
    with open(destino, "w", encoding=encoding, newline="") as f:
        df.to_csv(f, sep=";", index=False, lineterminator="\r\n")
