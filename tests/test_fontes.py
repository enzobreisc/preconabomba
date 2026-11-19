import pytest

from preco_na_bomba.fontes import (
    ArquivoANP,
    classificar_link,
    classificar_links,
    selecionar_arquivos,
)

B = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc"


@pytest.mark.parametrize(
    ("nome", "tipo", "ano", "periodo"),
    [
        ("dsas/ca/ca-2026-01.zip", "semestral", 2026, 1),
        ("dsas/ca/ca-2025-02.zip", "semestral", 2025, 2),
        ("dsas/ca/ca-2021-02.csv", "semestral", 2021, 2),
        ("dsan/2026/10-gasolina-etanol.csv", "mensal", 2026, 10),
        ("dsan/2025/precos-gasolina-etanol-12.csv", "mensal", 2025, 12),
        ("dsan/2026/02-cados-abertos-preco-gasolina-etanol.csv", "mensal", 2026, 2),
        ("dsan/2026/10-diesel-gnv.csv", "mensal", 2026, 10),
        ("dsan/2026/04-dados-abertos-precos-diesel-gnv", "mensal", 2026, 4),  # sem extensão
    ],
)
def test_classifica_nomes_reais_e_estranhos(nome, tipo, ano, periodo):
    a = classificar_link(f"{B}/{nome}")
    assert (a.tipo, a.ano, a.periodo) == (tipo, ano, periodo)


@pytest.mark.parametrize(
    "nome",
    [
        "dsan/2026/10-glp.csv",
        "dsan/2026/04-dados-abertos-precos-glp",
        "dsas/glp/glp-2026-01.csv",
        "qus/ultimas-4-semanas-gasolina-etanol.csv",
        "metadados-serie-historica-precos-combustiveis-1.pdf",
    ],
)
def test_ignora_o_que_nao_e_automotivo(nome):
    assert classificar_link(f"{B}/{nome}") is None


def test_link_fora_do_shpc_e_ignorado():
    assert classificar_link("https://exemplo.com/ca-2026-01.zip") is None


def test_semestral_com_nome_fora_do_padrao_usa_o_texto_do_link():
    a = classificar_link(f"{B}/dsas/ca/precos-semestrais-ca.zip", "1º semestre de 2022")
    assert (a.tipo, a.ano, a.periodo) == ("semestral", 2022, 1)


def test_html_sem_duplicados_e_com_url_relativa():
    html = f"""
    <a href="{B}/dsas/ca/ca-2026-01.zip">1º semestre de 2026</a>
    <a href="{B}/dsas/ca/ca-2026-01.zip">de novo</a>
    <a href="/anp/arquivos/shpc/dsan/2026/10-gasolina-etanol.csv">Outubro</a>
    <a href="https://x.com/outro.csv">fora</a>
    """
    links = classificar_links(html)
    assert [a.tipo for a in links] == ["semestral", "mensal"]


def _l(tipo, ano, periodo, nome="x"):
    return ArquivoANP(f"u/{nome}", tipo, ano, periodo)


def test_selecao_mensais_completam_so_o_semestre_sem_arquivo():
    links = [
        _l("semestral", 2023, 1),  # antes do ano inicial
        _l("semestral", 2024, 1),
        _l("mensal", 2024, 3, "m-2024-03"),  # coberto pelo semestral: sai
        _l("mensal", 2024, 8, "m-2024-08"),  # semestre 2 sem arquivo: entra
        _l("mensal", 2024, 9, "m-2024-09"),
    ]
    escolhidos = selecionar_arquivos(links, ano_inicial=2024)
    assert [(a.tipo, a.ano, a.periodo) for a in escolhidos] == [
        ("semestral", 2024, 1),
        ("mensal", 2024, 8),
        ("mensal", 2024, 9),
    ]
