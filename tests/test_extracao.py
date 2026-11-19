import io
import zipfile

from preco_na_bomba import extracao

CSV = "Estado - Sigla;Municipio;Valor de Venda\r\nSP;SÃO PAULO;6,89\r\n"


def test_utf8_com_bom():
    df = extracao.ler_csv(b"\xef\xbb\xbf" + CSV.encode("utf-8"))
    assert list(df.columns)[0] == "Estado - Sigla"  # BOM não vaza para o cabeçalho
    assert df.loc[0, "Municipio"] == "SÃO PAULO"


def test_latin1_decodifica_igual():
    assert extracao.ler_csv(CSV.encode("latin-1")).equals(extracao.ler_csv(CSV.encode("utf-8")))


def test_zip_le_membro_com_nome_corrompido(tmp_path):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(zipfile.ZipInfo("Pre\xe7os semestrais.csv"), CSV.encode("utf-8"))
    caminho = tmp_path / "ca.zip"
    caminho.write_bytes(buf.getvalue())
    assert extracao.ler_arquivo(caminho).loc[0, "Valor de Venda"] == "6,89"


def test_baixar_usa_cache_e_nao_deixa_parcial(tmp_path, monkeypatch):
    chamadas = []

    class Resposta:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def raise_for_status(self):
            pass

        def iter_content(self, chunk_size):
            yield b"abc"

    def falso_get(url, **kw):
        chamadas.append(url)
        return Resposta()

    monkeypatch.setattr(extracao.requests, "get", falso_get)
    p1 = extracao.baixar("https://x.gov.br/a/arquivo.csv", tmp_path)
    p2 = extracao.baixar("https://x.gov.br/a/arquivo.csv", tmp_path)
    assert p1 == p2 and p1.read_bytes() == b"abc"
    assert len(chamadas) == 1
    assert not list(tmp_path.glob("*.part"))
