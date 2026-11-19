import pandas as pd
import pytest

from preco_na_bomba import agregacoes as ag

DOM = pd.Timestamp("2024-01-07")


def semana(n):
    return DOM + pd.Timedelta(weeks=n)


def dados(*linhas):
    """Cada linha: (uf, municipio, cnpj, produto, bandeira, preco, semana_n)."""
    registros = [
        {
            "uf": uf, "municipio": mun, "cnpj": cnpj, "revenda": f"Posto {cnpj}", "bairro": "C",
            "endereco": "R", "produto": prod, "bandeira": band, "preco": preco,
            "semana": semana(n), "data_coleta": semana(n) + pd.Timedelta(days=2),
        }
        for uf, mun, cnpj, prod, band, preco, n in linhas
    ]  # fmt: skip
    return pd.DataFrame(registros)


def test_semanal_mediana_p10_p90_e_total_brasil():
    df = dados(
        *[("SP", "A", str(i), "etanol", "Vibra", p, 0) for i, p in enumerate([5, 6, 7, 8, 9])]
    )
    df = pd.concat([df, dados(("RJ", "B", "x", "etanol", "Vibra", 10.0, 0))], ignore_index=True)
    s = ag.semanal(df).set_index("uf")
    assert s.loc["SP", "mediana"] == pytest.approx(7)
    assert s.loc["SP", "p10"] == pytest.approx(5.4)
    assert s.loc["SP", "p90"] == pytest.approx(8.6)
    assert s.loc["SP", "n_coletas"] == 5
    assert s.loc["BR", "n_coletas"] == 6  # total Brasil sai das linhas, não das medianas dos UFs
    assert s.loc["BR", "mediana"] == pytest.approx(7.5)


def test_postos_usa_o_ultimo_preco_e_ranqueia_a_cidade():
    df = dados(
        ("SP", "A", "1", "gasolina comum", "Vibra", 9.0, 0),  # preço antigo do posto 1
        ("SP", "A", "1", "gasolina comum", "Vibra", 6.0, 1),
        ("SP", "A", "2", "gasolina comum", "Shell", 7.0, 1),
        ("SP", "A", "3", "gasolina comum", "Shell", 8.0, 1),
    )
    p = ag.postos(df).set_index("cnpj")
    assert p.loc["1", "preco"] == 6.0
    assert p.loc["1", "rank_municipio"] == 1
    assert p.loc["3", "rank_municipio"] == 3
    assert p.loc["2", "mediana_municipio"] == 7.0
    assert p.loc["3", "dif_mediana"] == pytest.approx(1.0)
    assert len(p) == 3


def test_postos_ignora_semanas_fora_da_janela():
    df = dados(
        ("SP", "A", "velho", "etanol", "Vibra", 5.0, 0),
        ("SP", "A", "novo", "etanol", "Vibra", 5.0, 10),
    )
    assert list(ag.postos(df, semanas=4)["cnpj"]) == ["novo"]


def test_municipios_filtra_menos_de_3_postos_e_calcula_economia():
    df = dados(
        ("SP", "A", "1", "etanol", "Vibra", 6.0, 0),
        ("SP", "A", "2", "etanol", "Vibra", 7.0, 0),
        ("SP", "A", "3", "etanol", "Vibra", 8.0, 0),
        ("SP", "B", "4", "etanol", "Vibra", 5.0, 0),  # cidade com 2 postos some
        ("SP", "B", "5", "etanol", "Vibra", 5.5, 0),
    )
    m = ag.municipios(ag.postos(df))
    assert list(m["municipio"]) == ["A"]
    assert m.loc[0, "economia_tanque"] == pytest.approx((7.0 - 6.0) * 50)
    assert m.loc[0, "maximo"] == 8.0


def test_bandeiras_compara_com_a_mediana_da_mesma_cidade_e_semana():
    df = dados(
        ("SP", "A", "1", "gasolina comum", "Shell", 6.20, 0),
        ("SP", "A", "2", "gasolina comum", "Vibra", 6.00, 0),
        ("SP", "A", "3", "gasolina comum", "Bandeira branca", 5.80, 0),
        # Cidade cara: se comparasse com o país, a Shell de lá pareceria barata.
        ("RJ", "B", "4", "gasolina comum", "Shell", 8.20, 0),
        ("RJ", "B", "5", "gasolina comum", "Vibra", 8.00, 0),
        ("RJ", "B", "6", "gasolina comum", "Bandeira branca", 7.80, 0),
    )
    b = ag.bandeiras(df, min_obs=1).set_index("bandeira")
    assert b.loc["Shell", "premio_medio"] == pytest.approx(0.20)
    assert b.loc["Vibra", "premio_medio"] == pytest.approx(0.0)
    assert b.loc["Bandeira branca", "premio_medio"] == pytest.approx(-0.20)
    assert b.loc["Shell", "n_cidades"] == 2


def test_bandeiras_ignora_cidade_com_uma_so_bandeira():
    df = dados(*[("SP", "A", str(i), "etanol", "Vibra", 5.0 + i, 0) for i in range(4)])
    assert ag.bandeiras(df, min_obs=1).empty


@pytest.mark.parametrize(
    ("etanol", "compensa"), [(4.2, True), (4.19, True), (4.3, False)]
)  # 4,20 / 6,00 = 0,70 exato: compensa
def test_paridade_limiar_de_70_inclusivo(etanol, compensa):
    df = dados(
        ("SP", "A", "1", "etanol", "Vibra", etanol, 0),
        ("SP", "A", "2", "gasolina comum", "Vibra", 6.0, 0),
    )
    p = ag.paridade_uf(df)
    assert p.loc[0, "razao"] == pytest.approx(etanol / 6.0)
    assert bool(p.loc[0, "etanol_compensa"]) is compensa


def test_paridade_ignora_semana_sem_um_dos_produtos():
    df = dados(
        ("SP", "A", "1", "etanol", "Vibra", 4.0, 0),
        ("SP", "A", "2", "gasolina comum", "Vibra", 6.0, 1),
    )
    assert ag.paridade_uf(df).empty


def test_paridade_municipios_exige_3_postos_por_produto():
    linhas = [("SP", "A", f"e{i}", "etanol", "Vibra", 4.0, 0) for i in range(3)]
    linhas += [("SP", "A", f"g{i}", "gasolina comum", "Vibra", 6.0, 0) for i in range(3)]
    linhas += [
        ("SP", "B", "e9", "etanol", "Vibra", 4.0, 0),
        ("SP", "B", "g9", "gasolina comum", "Vibra", 6.0, 0),
    ]
    p = ag.paridade_municipios(dados(*linhas))
    assert list(p["municipio"]) == ["A"]
    assert p.loc[0, "razao"] == pytest.approx(4 / 6)


def test_assimetria_so_conta_semanas_consecutivas():
    # semanas 1, 2, 4, 5: a queda 2 -> 4 cruza um buraco e NÃO entra.
    precos = {1: 6.00, 2: 6.20, 4: 6.00, 5: 5.90}
    df = dados(*[("SP", "A", "1", "etanol", "Vibra", p, n) for n, p in precos.items()])
    a = ag.assimetria(ag.semanal(df)).set_index(["uf", "produto"]).loc[("SP", "etanol")]
    assert a["n_altas"] == 1 and a["media_alta"] == pytest.approx(0.20)
    assert a["n_quedas"] == 1 and a["media_queda"] == pytest.approx(0.10)
    assert a["razao"] == pytest.approx(2.0)
