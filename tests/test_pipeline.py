import json

import pandas as pd
import pytest

from preco_na_bomba.pipeline import TABELAS, main


@pytest.fixture(scope="module")
def saida(tmp_path_factory):
    destino = tmp_path_factory.mktemp("processed")
    assert main(["--amostra", "--saida", str(destino), "--sem-json"]) == 0
    return destino


def test_gera_todas_as_tabelas_e_metadados(saida):
    for nome in TABELAS:
        assert (saida / f"{nome}.parquet").exists(), nome
    meta = json.loads((saida / "metadados.json").read_text(encoding="utf-8"))
    assert meta["sintetico"] is True
    assert {"fonte", "periodo", "semana_referencia", "n_coletas", "arquivos", "tabelas"} <= set(
        meta
    )


def test_esquemas_das_tabelas(saida):
    esperado = {
        "semanal": {"semana", "uf", "produto", "mediana", "p10", "p90", "n_coletas"},
        "postos": {
            "uf",
            "municipio",
            "cnpj",
            "endereco",
            "numero",
            "cep",
            "produto",
            "preco",
            "rank_municipio",
            "dif_mediana",
        },  # fmt: skip
        "municipios": {
            "uf",
            "municipio",
            "produto",
            "n_postos",
            "mediana",
            "minimo",
            "maximo",
            "economia_tanque",
        },  # fmt: skip
        "bandeiras": {"bandeira", "produto", "n_postos", "n_cidades", "premio_medio", "premio_pct"},
        "paridade_uf": {
            "semana",
            "uf",
            "mediana_etanol",
            "mediana_gasolina",
            "razao",
            "etanol_compensa",
        },  # fmt: skip
        "paridade_municipios": {"uf", "municipio", "razao", "etanol_compensa"},
        "assimetria": {"uf", "produto", "n_altas", "n_quedas", "media_alta", "media_queda"},
    }
    for nome, colunas in esperado.items():
        tab = pd.read_parquet(saida / f"{nome}.parquet")
        assert colunas <= set(tab.columns), nome
        assert not tab.empty, nome


def test_conteudo_coerente(saida):
    semanal = pd.read_parquet(saida / "semanal.parquet")
    assert semanal["uf"].nunique() == 28  # 27 UFs + BR
    assert (semanal["p10"] <= semanal["mediana"]).all()
    assert (semanal["mediana"] <= semanal["p90"]).all()
    assert (pd.read_parquet(saida / "municipios.parquet")["n_postos"] >= 3).all()
    assert (
        pd.read_parquet(saida / "bandeiras.parquet")["bandeira"]
        .isin(["Vibra", "Ipiranga", "Shell", "Alesat", "Bandeira branca"])
        .any()
    )


def test_assimetria_tem_altas_maiores_que_quedas(saida):
    a = pd.read_parquet(saida / "assimetria.parquet")
    assert (a["razao"] > 1).mean() > 0.5  # a amostra foi gerada com altas mais fortes


def test_falha_com_codigo_1_quando_nao_ha_rede(tmp_path, monkeypatch):
    from preco_na_bomba import fontes

    def sem_rede(*a, **k):
        raise ConnectionError("sem rede")

    monkeypatch.setattr(fontes, "ler_pagina", sem_rede)
    assert main(["--saida", str(tmp_path / "x"), "--cache", str(tmp_path / "c")]) == 1


def test_exporta_json_para_o_site(tmp_path):
    saida_json = tmp_path / "json"
    assert main(["--amostra", "--saida", str(tmp_path / "p"), "--saida-json", str(saida_json)]) == 0
    semanal = json.loads((saida_json / "semanal.json").read_text(encoding="utf-8"))
    assert {"semana", "uf", "produto", "mediana", "p10", "p90"} <= set(semanal[0])
    assert semanal[0]["semana"][:2] == "20"  # data em ISO, não timestamp
    sp = json.loads((saida_json / "postos" / "SP.json").read_text(encoding="utf-8"))
    assert {linha["uf"] for linha in sp} == {"SP"}  # postos dividido por UF
    assert len(list((saida_json / "postos").glob("*.json"))) == 27
    assert json.loads((saida_json / "metadados.json").read_text(encoding="utf-8"))["sintetico"]


def test_sem_json_nao_cria_pasta(tmp_path):
    assert main(["--amostra", "--saida", str(tmp_path / "p"), "--sem-json"]) == 0


def test_exporta_json_a_partir_dos_parquets(saida, tmp_path):
    from preco_na_bomba.exportar import main as exportar_main

    destino = tmp_path / "json"
    assert exportar_main(["--entrada", str(saida), "--saida", str(destino)]) == 0
    assert (destino / "semanal.json").exists()
    assert len(list((destino / "postos").glob("*.json"))) == 27
