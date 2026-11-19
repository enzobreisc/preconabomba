import pandas as pd
import pytest

from preco_na_bomba.limpeza import (
    limpar,
    padronizar_colunas,
    semana_inicio,
    titulo_municipio,
    unificar_bandeira,
)


def linha(**kw):
    base = {
        "Estado - Sigla": "SP",
        "Municipio": "SAO PAULO",
        "Revenda": "POSTO A",
        "CNPJ da Revenda": " 08.546.610/0001-05",
        "Nome da Rua": "RUA X",
        "Bairro": "CENTRO",
        "Produto": "GASOLINA",
        "Data da Coleta": "10/01/2024",
        "Valor de Venda": "6,89",
        "Unidade de Medida": "R$ / litro",
        "Bandeira": "VIBRA",
    }
    return {**base, **kw}


def cru(*linhas):
    return pd.DataFrame(list(linhas))


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("SAO JOSE DO RIO PRETO", "Sao Jose do Rio Preto"),
        ("JUIZ DE FORA", "Juiz de Fora"),
        ("SANTA BARBARA D OESTE", "Santa Barbara d Oeste"),
        ("DE", "De"),
        ("  rio   das ostras ", "Rio das Ostras"),
        ("PORTO ALEGRE", "Porto Alegre"),
    ],
)
def test_titulo_municipio(entrada, esperado):
    assert titulo_municipio(entrada) == esperado


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("VIBRA", "Vibra"),
        ("PETROBRAS DISTRIBUIDORA S.A.", "Vibra"),
        ("ALE", "Alesat"),
        ("RAIZEN", "Shell"),
        ("BRANCA", "Bandeira branca"),
        ("", "Bandeira branca"),
        (None, "Bandeira branca"),
        ("  ipiranga ", "Ipiranga"),
        ("OUTRA COISA", "Outra Coisa"),
    ],
)
def test_unificar_bandeira(entrada, esperado):
    assert unificar_bandeira(entrada) == esperado


def test_cabecalhos_reais_e_acentuados_dao_o_mesmo_esquema():
    real = padronizar_colunas(cru(linha()))
    acentuado = padronizar_colunas(
        pd.DataFrame([{"UF": "SP", "Município": "X", "Valor de Venda": "1", "Data da Coleta": "x"}])
    )
    assert {"uf", "municipio", "preco", "data_coleta"} <= set(real.columns)
    assert {"uf", "municipio", "preco", "data_coleta"} <= set(acentuado.columns)


def test_virgula_decimal_cnpj_e_produto():
    df = limpar(cru(linha()))
    assert df.loc[0, "preco"] == pytest.approx(6.89)
    assert df.loc[0, "cnpj"] == "08546610000105"
    assert df.loc[0, "produto"] == "gasolina comum"
    assert df.loc[0, "bandeira"] == "Vibra"
    assert df.loc[0, "municipio"] == "Sao Paulo"


def test_guarda_numero_complemento_e_cep_para_geocodificar():
    df = limpar(cru(linha(**{"Numero Rua": " 2024 ", "Complemento": None, "Cep": "88010-000"})))
    assert df.loc[0, "numero"] == "2024"
    assert df.loc[0, "complemento"] == ""
    assert df.loc[0, "cep"] == "88010000"


def test_produtos_mapeados_e_glp_descartado():
    produtos = ["GASOLINA", "GASOLINA ADITIVADA", "ETANOL", "DIESEL S10", "DIESEL", "GNV", "GLP"]
    dados = [
        linha(
            Produto=p,
            **{"CNPJ da Revenda": f"{i}"},
            **({"Valor de Venda": "4,50"} if p == "GNV" else {}),
        )
        for i, p in enumerate(produtos)
    ]
    out = limpar(cru(*dados))
    assert sorted(out["produto"]) == sorted(
        ["gasolina comum", "gasolina aditivada", "etanol", "diesel s10", "diesel s500", "gnv"]
    )


@pytest.mark.parametrize(
    ("valor", "fica"),
    [
        ("0,99", False),
        ("1,00", True),
        ("20,00", True),
        ("20,01", False),
        ("abc", False),
        ("", False),
    ],
)
def test_filtro_de_preco_1_a_20(valor, fica):
    assert len(limpar(cru(linha(**{"Valor de Venda": valor})))) == int(fica)


def test_gnv_usa_limite_proprio():
    assert len(limpar(cru(linha(Produto="GNV", **{"Valor de Venda": "4,80"})))) == 1
    assert len(limpar(cru(linha(Produto="GNV", **{"Valor de Venda": "15,00"})))) == 0


@pytest.mark.parametrize("data", ["31/02/2024", "", "2024-01-10", "xx"])
def test_data_invalida_descartada(data):
    assert limpar(cru(linha(**{"Data da Coleta": data}))).empty


def test_duplicatas_por_cnpj_produto_e_data():
    out = limpar(cru(linha(), linha(**{"Valor de Venda": "7,00"}), linha(Produto="ETANOL")))
    assert len(out) == 2  # a duplicata de gasolina some; o etanol fica


def test_uf_invalida_descartada():
    assert limpar(cru(linha(**{"Estado - Sigla": "XX"}))).empty


@pytest.mark.parametrize(
    ("dia", "domingo"),
    [
        ("2024-01-07", "2024-01-07"),  # domingo
        ("2024-01-10", "2024-01-07"),  # quarta
        ("2024-01-13", "2024-01-07"),  # sábado
        ("2024-01-14", "2024-01-14"),  # próximo domingo
        ("2024-01-08", "2024-01-07"),  # segunda
    ],
)
def test_semana_comeca_no_domingo(dia, domingo):
    s = semana_inicio(pd.Series(pd.to_datetime([dia])))
    assert s.iloc[0] == pd.Timestamp(domingo)
