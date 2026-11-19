import json

import pandas as pd

from preco_na_bomba.exportar import exportar_json


def test_postos_levam_coordenadas_e_nome_com_acento(tmp_path):
    geo = tmp_path / "processed"
    geo.mkdir()
    (geo / "geo_postos.csv").write_text(
        "cnpj,uf,municipio,chave,lat,lon,precisao,consultado_em\n"
        "00000000000001,SC,Sao Jose,x,-27.0,-48.0,rua,2026-01-01\n"
        "00000000000001,SC,Sao Jose,y,-27.5,-48.6,endereco,2026-02-01\n",  # vale a última
        encoding="utf-8",
    )
    (geo / "geo_municipios.csv").write_text(
        "uf,municipio,nome,lat,lon,sul,norte,oeste,leste,consultado_em\n"
        "SC,Sao Jose,São José,-27.6,-48.6,-27.7,-27.5,-48.8,-48.5,2026-01-01\n",
        encoding="utf-8",
    )
    postos = pd.DataFrame(
        [
            {"uf": "SC", "municipio": "Sao Jose", "cnpj": "00000000000001", "preco": 6.5},
            {"uf": "SC", "municipio": "Sao Jose", "cnpj": "00000000000002", "preco": 6.6},
        ]
    )
    saida = tmp_path / "site"
    exportar_json({"postos": postos}, {}, saida, geo_dir=geo)

    sc = json.loads((saida / "postos" / "SC.json").read_text(encoding="utf-8"))
    assert sc[0]["lat"] == -27.5 and sc[0]["precisao"] == "endereco"
    assert sc[1]["lat"] is None and sc[1]["precisao"] is None  # ainda não geocodificado
    assert {p["municipio_nome"] for p in sc} == {"São José"}
    mun = json.loads((saida / "geo_municipios.json").read_text(encoding="utf-8"))
    assert mun[0]["nome"] == "São José" and "consultado_em" not in mun[0]


def test_sem_cache_de_geo_o_json_continua_igual(tmp_path):
    postos = pd.DataFrame([{"uf": "SC", "municipio": "X", "cnpj": "1", "preco": 6.5}])
    exportar_json({"postos": postos}, {}, tmp_path, geo_dir=tmp_path / "nao_existe")
    sc = json.loads((tmp_path / "postos" / "SC.json").read_text(encoding="utf-8"))
    assert set(sc[0]) == {"uf", "municipio", "cnpj", "preco"}


def test_nomes_oficiais_saem_do_ibge(tmp_path):
    proc = tmp_path / "processed"
    proc.mkdir()
    (proc / "ibge_municipios.csv").write_text(
        "uf,nome\nSP,São José do Rio Preto\nSP,Santa Bárbara d'Oeste\nSC,São José\n",
        encoding="utf-8",
    )
    municipios = pd.DataFrame(
        [
            {"uf": "SP", "municipio": "Sao Jose do Rio Preto", "produto": "etanol"},
            {"uf": "SP", "municipio": "Santa Barbara D Oeste", "produto": "etanol"},
            {"uf": "SC", "municipio": "Cidade Nova", "produto": "etanol"},  # fora da lista
        ]
    )
    saida = tmp_path / "site"
    exportar_json({"municipios": municipios}, {}, saida, geo_dir=proc)

    nomes = json.loads((saida / "nomes_municipios.json").read_text(encoding="utf-8"))
    assert nomes == {
        "SP|Sao Jose do Rio Preto": "São José do Rio Preto",
        "SP|Santa Barbara D Oeste": "Santa Bárbara d'Oeste",
    }
