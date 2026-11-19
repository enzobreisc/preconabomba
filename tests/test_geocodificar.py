import pandas as pd
import pytest

from preco_na_bomba import geocodificar as geo

FLORIPA = {
    "name": "Florianópolis", "addresstype": "city", "lat": "-27.59", "lon": "-48.54",
    "boundingbox": ["-27.85", "-27.38", "-48.62", "-48.33"],
}  # fmt: skip


def resultado(lat, lon, cidade="Florianópolis", numero=None):
    endereco = {"city": cidade, **({"house_number": numero} if numero else {})}
    return {"lat": str(lat), "lon": str(lon), "address": endereco}


class Falso:
    """Nominatim de mentira: responde conforme a rua pedida e guarda as consultas."""

    def __init__(self, respostas):
        self.respostas, self.pedidos = respostas, []

    def __call__(self, params):
        self.pedidos.append(params)
        if "street" not in params:
            return [FLORIPA]
        return self.respostas.get(params["street"], [])


def cliente(respostas=None):
    falso = Falso(respostas or {})
    return geo.Nominatim(buscar=falso, dormir=lambda s: None), falso


def posto(**kw):
    base = {
        "cnpj": "1", "uf": "SC", "municipio": "Florianopolis", "endereco": "RUA BOCAIUVA",
        "numero": "2024", "cep": "88015530", "data_coleta": pd.Timestamp("2026-10-01"),
    }  # fmt: skip
    return {**base, **kw}


MUN = geo.Municipio(
    "SC", "Florianopolis", "Florianópolis", -27.59, -48.54, -27.85, -27.38, -48.62, -48.33
)


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [("2024", "2024"), (" 35 ", "35"), ("S/N", None), ("SN", None), ("0", None), ("", None),
     (None, None), ("120A", "120"), ("0012", "12")],
)  # fmt: skip
def test_numero_valido(entrada, esperado):
    assert geo.numero_valido(entrada) == esperado


def test_municipio_traz_nome_com_acento_e_bbox():
    cli, _ = cliente()
    m = geo.geocodificar_municipio(cli, "SC", "Florianopolis")
    assert m.nome == "Florianópolis"
    assert m.contem(-27.6, -48.5)
    assert not m.contem(-26.3, -48.8)  # Joinville


def test_endereco_exato_quando_acha_o_numero():
    cli, _ = cliente({"2024 RUA BOCAIUVA": [resultado(-27.59, -48.55, numero="2024")]})
    lat, lon, precisao = geo.geocodificar_posto(cli, posto(), MUN)
    assert (lat, lon, precisao) == (-27.59, -48.55, "endereco")


def test_cai_para_a_rua_sem_numero():
    cli, falso = cliente({"RUA BOCAIUVA": [resultado(-27.6, -48.5)]})
    *_, precisao = geo.geocodificar_posto(cli, posto(), MUN)
    assert precisao == "rua"
    assert [p["street"] for p in falso.pedidos] == ["2024 RUA BOCAIUVA", "RUA BOCAIUVA"]


def test_sem_numero_vai_direto_na_rua():
    cli, falso = cliente({"RUA BOCAIUVA": [resultado(-27.6, -48.5)]})
    geo.geocodificar_posto(cli, posto(numero="S/N"), MUN)
    assert [p["street"] for p in falso.pedidos] == ["RUA BOCAIUVA"]


def test_recusa_homonimo_em_outra_cidade():
    joinville = resultado(-26.30, -48.85, cidade="Joinville", numero="2024")
    dentro_mas_outra = resultado(-27.6, -48.5, cidade="São José", numero="2024")
    cli, _ = cliente({"2024 RUA BOCAIUVA": [joinville, dentro_mas_outra]})
    *_, precisao = geo.geocodificar_posto(cli, posto(), MUN)
    assert precisao == "nao_encontrado"


def test_respeita_o_intervalo_entre_consultas():
    esperas, agora = [], [0.0]
    cli = geo.Nominatim(buscar=lambda p: [], dormir=esperas.append, relogio=lambda: agora[0])
    cli.buscar(q="a")
    agora[0] = 0.3
    cli.buscar(q="b")
    assert esperas == [pytest.approx(geo.INTERVALO - 0.3)]


def test_executar_usa_cache_e_reconsulta_quando_o_endereco_muda(tmp_path):
    cp, cm = tmp_path / "geo_postos.csv", tmp_path / "geo_municipios.csv"
    respostas = {"2024 RUA BOCAIUVA": [resultado(-27.59, -48.55, numero="2024")],
                 "10 RUA NOVA": [resultado(-27.6, -48.5, numero="10")]}  # fmt: skip
    tab = pd.DataFrame([posto(), posto(cnpj="2", endereco="RUA SEM MAPA", numero="S/N")])

    cli, falso = cliente(respostas)
    contagem = geo.executar(tab, "SC", cli, cp, cm, log=lambda m: None)
    assert contagem == {"endereco": 1, "nao_encontrado": 1}
    n = len(falso.pedidos)

    geo.executar(tab, "SC", cli, cp, cm, log=lambda m: None)  # nada mudou: nenhuma consulta
    assert len(falso.pedidos) == n

    mudou = tab.assign(endereco=["RUA NOVA", "RUA SEM MAPA"], numero=["10", "S/N"])
    contagem = geo.executar(mudou, "SC", cli, cp, cm, log=lambda m: None)
    assert len(falso.pedidos) == n + 1  # só o posto que mudou de endereço
    assert contagem == {"endereco": 1, "nao_encontrado": 1}
    assert geo.ler_cache(cp, ["cnpj"]).set_index("cnpj").loc["1", "lat"] == pytest.approx(-27.6)
