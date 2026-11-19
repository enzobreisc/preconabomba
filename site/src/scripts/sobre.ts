// Sobre os dados: preenche os metadados e a lista de arquivos a partir de metadados.json.

import { dataBR, esc, nf } from '../lib/dados';
import { $, json } from '../lib/web';

type Metadados = {
  fonte: string; sintetico: boolean; gerado_em: string;
  periodo: { inicio: string; fim: string }; semana_referencia: string;
  n_coletas: number; n_postos: number; n_municipios: number;
  arquivos: string[]; tabelas: Record<string, number>;
};

const k = (s: string) => `<span class="k">"${esc(s)}"</span>`;
const s = (v: string) => `<span class="s">"${esc(v)}"</span>`;

function metaHTML(m: Metadados) {
  const tabs = Object.entries(m.tabelas).map(([n, v]) => `    ${k(n)}: ${v}`).join(',\n');
  // as chaves do arquivo, na ordem dele; a lista de arquivos vai na tabela ao lado
  const linhas: [string, string][] = [
    ['fonte', s(m.fonte)],
    ['sintetico', String(m.sintetico)],
    ['gerado_em', s(m.gerado_em)],
    ['periodo', `{ ${k('inicio')}: ${s(m.periodo.inicio)}, ${k('fim')}: ${s(m.periodo.fim)} }`],
    ['semana_referencia', s(m.semana_referencia)],
    ['n_coletas', String(m.n_coletas)],
    ['n_postos', String(m.n_postos)],
    ['n_municipios', String(m.n_municipios)],
    ['arquivos', `[ … ${m.arquivos.length} links ]`],
    ['tabelas', `{\n${tabs}\n  }`],
  ];
  return `{\n${linhas.map(([a, b]) => `  ${k(a)}: ${b}`).join(',\n')}\n}`;
}

function tipo(nome: string) {
  if (/^ca-\d{4}-0([12])\.zip$/.test(nome)) return ['semestral', 'todos'];
  return ['mensal', /diesel|gnv/i.test(nome) ? 'diesel e GNV' : 'gasolina e etanol'];
}

function arquivosHTML(urls: string[]) {
  const rows = urls.map((u) => {
    const nome = u.split('/').pop() ?? u, [t, c] = tipo(nome);
    return `<tr><td><a href="${esc(u)}" rel="noopener">${esc(nome)}</a></td><td>${t}</td><td>${c}</td></tr>`;
  }).join('');
  return `<table class="tbl"><thead><tr><th>Arquivo</th><th>Tipo</th><th>Combustíveis</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export async function iniciar() {
  try {
    const m = await json<Metadados>('data/metadados.json');
    $('#meta').innerHTML = metaHTML(m);
    $('#arquivos').innerHTML = arquivosHTML(m.arquivos);
    $('#atualizado').textContent = `Última atualização em ${dataBR(m.gerado_em)}, com ${nf(m.n_coletas, 0)} coletas de ${dataBR(m.periodo.inicio)} a ${dataBR(m.periodo.fim)}. Os dados brutos nunca entram no repositório: só as tabelas resumidas, de poucos MB, alimentam o site.`;
    if (m.sintetico) $('#atualizado').textContent += ' Atenção: esta versão usa dados sintéticos de demonstração.';
  } catch (erro) {
    $('#meta').textContent = 'Não deu para carregar os metadados agora.';
    console.error(erro);
  }
}
