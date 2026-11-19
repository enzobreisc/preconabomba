import pandas as pd
import pytest

from preco_na_bomba.amostra import COLUNAS_ANP, gerar_amostra, para_csv
from preco_na_bomba.extracao import ler_csv
from preco_na_bomba.limpeza import limpar


@pytest.fixture(scope="module")
def cru():
    return gerar_amostra(semanas=24)


@pytest.fixture(scope="module")
def limpo(cru):
    return limpar(cru)


def test_deterministico():
    assert gerar_amostra(semanas=4).equals(gerar_amostra(semanas=4))


def test_formato_cru_da_anp(cru):
    assert list(cru.columns) == COLUNAS_ANP
    assert cru["Valor de Venda"].str.contains(",").any()
    assert cru["Data da Coleta"].str.match(r"^\d{2}/\d{2}/\d{4}$").sum() > len(cru) * 0.99


def test_csv_utf8_e_latin1_leem_igual(cru, tmp_path):
    para_csv(cru.head(500), tmp_path / "a.csv")
    para_csv(cru.head(500), tmp_path / "b.csv", encoding="latin-1")
    a = ler_csv((tmp_path / "a.csv").read_bytes())
    b = ler_csv((tmp_path / "b.csv").read_bytes())
    assert a.equals(b)


def test_cobre_27_ufs_e_produtos(limpo):
    assert limpo["uf"].nunique() == 27
    assert limpo["produto"].nunique() == 6


def test_tem_cidades_com_menos_de_3_postos(limpo):
    postos = limpo.groupby(["uf", "municipio"])["cnpj"].nunique()
    assert (postos < 3).any() and (postos >= 3).any()


def test_marcas_presentes(limpo):
    assert {"Vibra", "Ipiranga", "Shell", "Alesat", "Bandeira branca"} <= set(limpo["bandeira"])


def test_limpeza_remove_a_sujeira(cru, limpo):
    assert len(limpo) < len(cru)
    assert limpo["preco"].between(1, 20).all()
    assert not limpo.duplicated(["cnpj", "produto", "data_coleta"]).any()


def test_lacuna_de_semanas_no_acre(limpo):
    semanas = pd.Series(limpo.loc[limpo["uf"] == "AC", "semana"].unique())
    inicio = pd.Timestamp("2024-01-07")
    faltando = {inicio + pd.Timedelta(weeks=s) for s in (8, 9, 15)}
    assert not faltando & set(semanas)


def test_etanol_acompanha_a_regra_dos_70(limpo):
    med = limpo.pivot_table(index="uf", columns="produto", values="preco", aggfunc="median")
    razao = med["etanol"] / med["gasolina comum"]
    assert (razao < 0.70).any() and (razao > 0.70).any()
