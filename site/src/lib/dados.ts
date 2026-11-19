// Dados de Minha cidade: lê o JSON exportado pelo ETL e monta postos e cidades.

export type Linha = {
  uf: string;
  municipio: string;
  municipio_nome?: string | null;
  cnpj: string;
  revenda: string;
  bairro: string;
  endereco: string;
  numero?: string | null;
  produto: string;
  bandeira: string;
  preco: number;
  data_coleta: string;
  lat?: number | null;
  lon?: number | null;
  precisao?: 'endereco' | 'rua' | 'nao_encontrado' | null;
};

export type GeoMunicipio = {
  uf: string;
  municipio: string;
  nome: string | null;
  lat: number | null;
  lon: number | null;
};

export type Combustivel = {
  k: string; // nome do produto no JSON
  n: string; // rótulo
  l: string; // no meio da frase
  u: string; // unidade
  tot: string; // linha do totem
  cod: string; // etiqueta da bomba
  tanque: number;
};

export const COMBUSTIVEIS: Combustivel[] = [
  { k: 'gasolina comum', n: 'Gasolina comum', l: 'gasolina comum', u: 'litro', tot: 'G. COMUM', cod: 'GC', tanque: 50 },
  { k: 'gasolina aditivada', n: 'Gasolina aditivada', l: 'gasolina aditivada', u: 'litro', tot: 'G. ADITIV.', cod: 'GA', tanque: 50 },
  { k: 'etanol', n: 'Etanol', l: 'etanol', u: 'litro', tot: 'ETANOL', cod: 'ET', tanque: 50 },
  { k: 'diesel s10', n: 'Diesel S10', l: 'diesel S10', u: 'litro', tot: 'DIESEL S10', cod: 'S10', tanque: 50 },
  { k: 'diesel s500', n: 'Diesel S500', l: 'diesel S500', u: 'litro', tot: 'DIES. S500', cod: 'S500', tanque: 50 },
  { k: 'gnv', n: 'GNV', l: 'GNV', u: 'm³', tot: 'GNV', cod: 'GNV', tanque: 15 },
];
export const COMB = Object.fromEntries(COMBUSTIVEIS.map((c) => [c.k, c])) as Record<string, Combustivel>;

export type Preco = { preco: number; data: string };

export type Posto = {
  cnpj: string;
  nome: string;
  bandeira: string;
  endereco: string;
  bairro: string;
  municipio: string;
  lat: number | null;
  lon: number | null;
  precisao: Linha['precisao'];
  precos: Record<string, Preco>;
};

export type Cidade = {
  municipio: string;
  nome: string;
  lat: number | null;
  lon: number | null;
  bounds: [number, number, number, number] | null; // oeste, sul, leste, norte dos postos
  postos: Posto[];
};

export type Resumo = { med: number; min: number; max: number; n: number };

/* ---------- formatação ---------- */

export const nf = (v: number, d = 2) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const brl = (v: number, d = 2) => 'R$ ' + nf(v, d);
export const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
export const esc = (s: unknown) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd']);
/** 'RUA JOSE MANOEL GOMES' -> 'Rua Jose Manoel Gomes' (preposições em minúsculo). */
export function titulo(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((p, i) =>
      i > 0 && MINUSCULAS.has(p) ? p : p.replace(/(^|[-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()),
    )
    .join(' ');
}

// Tudo o que é razão social e não nome de posto.
const JURIDICO = [
  /\bEM RECUPERACAO JUDICIAL\b/g,
  /\bCOMERCIO (VAREJISTA )?DE (COMBUSTIVEIS|DERIVADOS DE PETROLEO)( E (LUBRIFICANTES|DERIVADOS|CONVENIENCIA))*\b/g,
  /\bDERIVADOS DE PETROLEO\b/g,
  /\b(LTDA|EIRELI|EPP|ME|SA|S\/A|S\.A\.?)\b\.?/g,
  /\b(E|&) CIA\b\.?/g,
];
/** 'REDE FURNAS COMERCIO DE COMBUSTIVEIS LTDA' -> 'Rede Furnas'. */
export function nomePosto(revenda: string): string {
  let t = ` ${revenda.toUpperCase()} `;
  for (const r of JURIDICO) t = t.replace(r, ' ');
  t = t.replace(/[\s\-–&.,]+$/g, '').replace(/^[\s\-–&.,]+/g, '').replace(/\s+/g, ' ').trim();
  return titulo(t || revenda);
}

/* ---------- agregação ---------- */

export function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

export function resumo(precos: number[]): Resumo | null {
  if (!precos.length) return null;
  return { med: mediana(precos), min: Math.min(...precos), max: Math.max(...precos), n: precos.length };
}

export function montar(linhas: Linha[], geo: GeoMunicipio[]) {
  const postos = new Map<string, Posto>();
  for (const l of linhas) {
    let p = postos.get(l.cnpj);
    if (!p) {
      const num = l.numero && /^\d/.test(l.numero) && !/^0+$/.test(l.numero) ? `, ${l.numero}` : '';
      p = {
        cnpj: l.cnpj,
        nome: nomePosto(l.revenda),
        bandeira: l.bandeira,
        endereco: titulo(l.endereco) + num,
        bairro: titulo(l.bairro || ''),
        municipio: l.municipio,
        lat: l.lat ?? null,
        lon: l.lon ?? null,
        precisao: l.precisao ?? null,
        precos: {},
      };
      postos.set(l.cnpj, p);
    }
    p.precos[l.produto] = { preco: l.preco, data: l.data_coleta };
  }

  const nomes = new Map<string, GeoMunicipio>(geo.map((g) => [g.municipio, g]));
  const cidades = new Map<string, Cidade>();
  for (const p of postos.values()) {
    let c = cidades.get(p.municipio);
    if (!c) {
      const g = nomes.get(p.municipio);
      c = { municipio: p.municipio, nome: g?.nome || p.municipio, lat: g?.lat ?? null, lon: g?.lon ?? null, bounds: null, postos: [] };
      cidades.set(p.municipio, c);
    }
    c.postos.push(p);
  }
  // O ponto da cidade no mapa do estado é a mediana dos postos com localização.
  for (const c of cidades.values()) {
    const ok = c.postos.filter((p) => p.lat != null && p.lon != null);
    if (ok.length) {
      c.lat = mediana(ok.map((p) => p.lat!));
      c.lon = mediana(ok.map((p) => p.lon!));
      const lons = ok.map((p) => p.lon!), lats = ok.map((p) => p.lat!);
      c.bounds = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    }
  }
  return { postos, cidades };
}

export const precosDe = (ps: Posto[], k: string) =>
  ps.map((p) => p.precos[k]?.preco).filter((v): v is number => v != null);
