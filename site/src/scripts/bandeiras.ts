// Bandeiras: quanto cada bandeira cobra acima ou abaixo da mediana da própria cidade, na mesma semana.
// O prêmio vem do ETL (média das últimas 12 semanas). Segue o artifact de telas (Rodada 4).

import { COMB, COMBUSTIVEIS, artigo, brl, dataBR, esc, nf, titulo } from '../lib/dados';
import { ledSVG } from '../lib/fachada';
import { UFS, UFS_ORDEM, ligarInteracao, nb, somaDias, tipA } from '../lib/graficos';
import { $, abasCom, esconderDica, estreito, json } from '../lib/web';

type Bandeira = { bandeira: string; produto: string; n_obs: number; n_postos: number; n_cidades: number; premio_medio: number; premio_pct: number };
type Municipio = { uf: string; municipio: string; produto: string; n_postos: number; mediana: number };
type Metadados = { semana_referencia: string; periodo: { inicio: string; fim: string } };
type Linha = { n: string; p: number; pp: number; sh: number; postos: number; cidades: number };

const SEMANAS = 12; // mesma janela do ETL (agregacoes.bandeiras)
const MIN_FATIA = 2; // % dos postos comparados para a bandeira entrar no gráfico
const MIN_POSTOS = 10;

const estado = { fuel: 'gasolina comum', uf: 'SC', cidade: '' };
let BAND: Bandeira[] = [];
let MUN: Municipio[] = [];
let META: Metadados;
let NOMES: Record<string, string> = {};
let jaAnimou = false;
let mobile = estreito();

const nomeCidade = (c: { uf: string; municipio: string }) => NOMES[`${c.uf}|${c.municipio}`] ?? titulo(c.municipio);
const sinal = (v: number, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? brl(0, d) : `${v > 0 ? '+' : '−'}${brl(Math.abs(v), d)}`);
const kpi = (i: number, l: string, v: string, d: string) => `<div class="kpi rv" style="--i:${i}"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
/** "cobra R$ 0,07 a mais" / "cobra R$ 0,08 a menos" / "cobra o mesmo" */
const cobra = (p: number, u?: string) => (Math.abs(p) < 0.005 ? 'cobra o mesmo' : `cobra ${nb(brl(Math.abs(p)))} a ${p > 0 ? 'mais' : 'menos'}${u ? ` por ${u}` : ''}`);

/** Bandeiras grandes o bastante para o gráfico, do prêmio maior para o menor. */
function linhas(k: string) {
  const todas = BAND.filter((b) => b.produto === k);
  const total = todas.reduce((a, b) => a + b.n_postos, 0) || 1;
  const rows: Linha[] = todas
    .map((b) => ({ n: b.bandeira, p: b.premio_medio, pp: b.premio_pct, sh: (b.n_postos / total) * 100, postos: b.n_postos, cidades: b.n_cidades }))
    .filter((r) => r.sh >= MIN_FATIA && r.postos >= MIN_POSTOS)
    .sort((a, b) => b.p - a.p);
  const fora = todas.length - rows.length, fatiaFora = 100 - rows.reduce((a, r) => a + r.sh, 0);
  return { rows, fora, fatiaFora };
}

/** Cidades do estado com preço do combustível, da que tem mais postos para a que tem menos. */
const cidadesDe = (uf: string, k: string) => MUN.filter((m) => m.uf === uf && m.produto === k).sort((a, b) => b.n_postos - a.n_postos);

function selFuel() {
  return `<label class="fld">Combustível<select data-sel="fuel">${COMBUSTIVEIS.map((c) => `<option value="${c.k}" ${c.k === estado.fuel ? 'selected' : ''}>${c.n}</option>`).join('')}</select></label>`;
}
function selUF() {
  return `<label class="fld">Estado<select data-sel="uf">${UFS_ORDEM.map((u) => `<option value="${u}" ${u === estado.uf ? 'selected' : ''}>${UFS[u]}</option>`).join('')}</select></label>`;
}
function selCidade(cs: Municipio[]) {
  if (!cs.length) return `<label class="fld">Cidade<select data-sel="cidade" disabled><option>Sem cidade com preço</option></select></label>`;
  const ord = [...cs].sort((a, b) => nomeCidade(a).localeCompare(nomeCidade(b), 'pt-BR'));
  return `<label class="fld">Cidade<select data-sel="cidade">${ord.map((c) => `<option value="${esc(c.municipio)}" ${c.municipio === estado.cidade ? 'selected' : ''}>${esc(nomeCidade(c))}</option>`).join('')}</select></label>`;
}

function grafico(rows: Linha[], u: string) {
  const W = mobile ? Math.min(358, innerWidth - 32) : 600, lab = mobile ? 112 : 132, rh = mobile ? 46 : 52, top = 34;
  const half = (W - lab) / 2, x0 = lab + half, mx = Math.max(...rows.map((r) => Math.abs(r.p)), 0.01), sc = (half - (mobile ? 58 : 64)) / mx;
  const H = top + rows.length * rh + 4;
  const bars = rows.map((r, i) => {
    const y = top + i * rh, len = Math.abs(r.p) * sc, pos = r.p >= 0, x = pos ? x0 : x0 - len, vx = pos ? x0 + len + 8 : x0 - len - 8;
    const tip = `<b>${esc(r.n)}</b><br>${sinal(r.p)} por ${u} sobre a mediana da cidade<br><span class="mut">${r.pp >= 0 ? '+' : '−'}${nf(Math.abs(r.pp), 1)}% · ${nf(r.sh, 0)}% dos postos comparados · ${r.cidades} cidades</span>`;
    return `<g${tipA(tip)}><rect class="rrow" x="0" y="${y}" width="${W}" height="${rh}"/><line class="gl" x1="0" x2="${W}" y1="${y + rh}" y2="${y + rh}" pointer-events="none"/>
      <text class="lbl2" x="2" y="${y + rh / 2 + 4}" pointer-events="none">${esc(r.n)}</text>
      <rect class="bargrow" style="--i:${i};transform-origin:${pos ? 'left' : 'right'} center" x="${x}" y="${y + 12}" width="${len}" height="${rh - 24}" rx="4" fill="${pos ? '#e34948' : '#2a78d6'}" pointer-events="none"/>
      <text class="lbl" x="${vx}" y="${y + rh / 2 + 4}" text-anchor="${pos ? 'start' : 'end'}" pointer-events="none">${sinal(r.p)}</text></g>`;
  }).join('');
  return `<svg class="ch" viewBox="0 0 ${W} ${H}" role="img" aria-label="Prêmio de cada bandeira sobre a mediana da cidade">
    <text class="tk" x="${x0 - 8}" y="14" text-anchor="end">${mobile ? 'mais barato' : 'mais barato que a mediana'}</text><text class="tk" x="${x0 + 8}" y="14">${mobile ? 'mais caro' : 'mais caro que a mediana'}</text>${bars}
    <line x1="${x0}" x2="${x0}" y1="${top - 10}" y2="${top + rows.length * rh}" stroke="#0b0b0b" stroke-width="1.2"/></svg>`;
}

function render() {
  const k = estado.fuel, F = COMB[k], tk = F.tanque, tanque = `${tk} ${F.u === 'litro' ? 'litros' : F.u}`;
  const { rows, fora, fatiaFora } = linhas(k);
  const cs = cidadesDe(estado.uf, k);
  if (!cs.some((c) => c.municipio === estado.cidade)) estado.cidade = cs[0]?.municipio ?? '';
  const cid = cs.find((c) => c.municipio === estado.cidade);
  const filtros = `<div class="filters rv" style="--i:1">${selFuel()}${selUF()}${selCidade(cs)}</div>`;
  const ini = somaDias(META.semana_referencia, -7 * (SEMANAS - 1));
  const periodo = `de ${dataBR(ini)} a ${dataBR(META.periodo.fim)}`;
  const foot = `<p class="foot">Fonte: ANP, Levantamento de Preços de Combustíveis. Prêmio = preço do posto menos a mediana dos postos da mesma cidade e semana, só em cidades com pelo menos 3 postos e 2 bandeiras; média ${periodo}.${fora ? ` ${fora === 1 ? 'Uma bandeira menor fica' : `Outras ${fora} bandeiras menores ficam`} fora do gráfico (${nf(fatiaFora, 0)}% dos postos comparados).` : ''}</p>`;

  if (rows.length < 2) {
    $('#app').innerHTML = `
      <div class="hero rv" style="--i:0"><p class="q">Posto de bandeira é mais caro?</p><h2>Não há bandeiras suficientes para comparar ${artigo(k)} ${F.l}.</h2><p class="s">É preciso ter postos de pelo menos duas bandeiras na mesma cidade e semana, e quase todos os postos com ${F.l} na pesquisa são de uma bandeira só.</p></div>
      ${filtros}${foot}`;
    fim();
    return;
  }

  const hi = rows[0], lo = rows.at(-1)!, big = [...rows].sort((a, b) => b.sh - a.sh)[0];
  const dif = (hi.p - lo.p) * tk;
  const on = '#ffb23d', off = '#26231e';
  const bomba = cid
    ? `<section class="panel rv" style="--i:9"><h3>Na bomba, em ${esc(nomeCidade(cid))}</h3><p class="sub">A mediana da cidade (${nb(brl(cid.mediana))}, ${cid.n_postos} postos nas últimas 4 semanas) somada ao prêmio de cada ponta.</p>
        <div class="pumps2"><div class="pc"><div class="k">${esc(lo.n)}</div>${ledSVG(nf(cid.mediana + lo.p, 2), 4, on, off)}<div class="k">R$ por ${F.u}</div></div><div class="pc"><div class="k">${esc(hi.n)}</div>${ledSVG(nf(cid.mediana + hi.p, 2), 4, on, off)}<div class="k">R$ por ${F.u}</div></div></div>
        <p class="sub" style="margin:12px 0 0">Num tanque de ${tanque}, a diferença entre os dois é de <b>${nb(brl(dif, 0))}</b>.</p></section>`
    : `<section class="panel rv" style="--i:9"><h3>Na bomba</h3><p class="sub" style="margin:0">A pesquisa não tem preço de ${F.l} em nenhuma cidade deste estado nas últimas 4 semanas. Escolha outro estado.</p></section>`;

  $('#app').innerHTML = `
    <div class="hero rv" style="--i:0"><p class="q">Posto de bandeira é mais caro?</p><h2>${esc(hi.n)} ${cobra(hi.p, F.u)} que a mediana da mesma cidade. ${esc(lo.n)} ${cobra(lo.p)}.</h2><p class="s">Média das últimas ${SEMANAS} semanas (${periodo}), sempre comparando postos da mesma cidade e da mesma semana.</p></div>
    ${filtros}
    <div class="kpis">
      ${kpi(4, 'Bandeira mais cara', sinal(hi.p), esc(hi.n))}
      ${kpi(5, 'Bandeira mais barata', sinal(lo.p), esc(lo.n))}
      ${kpi(6, `Diferença num tanque de ${tanque}`, brl(dif, 0), 'entre as duas pontas')}
      ${kpi(7, 'Maior fatia dos postos', `${nf(big.sh, 0)}%`, esc(big.n))}
    </div>
    <div class="cols">
      <section class="panel rv" style="--i:8"><h3>Prêmio de cada bandeira</h3><p class="sub">Diferença para a mediana da cidade, em reais por ${F.u}. Vermelho: mais caro. Azul: mais barato.</p>${grafico(rows, F.u)}</section>
      <div class="stack">
        ${bomba}
        <section class="panel rv" style="--i:10"><h3>Por que comparar dentro da cidade</h3><p class="sub" style="margin:0">Misturar cidades e estados mede diferença de imposto e de frete, não de bandeira. Aqui cada posto é comparado só com os da própria cidade, na mesma semana.</p></section>
      </div>
    </div>
    ${foot}`;
  fim();
}

function fim() {
  if (jaAnimou) $('#app').classList.add('quiet');
  jaAnimou = true;
  abasCom({ comb: estado.fuel, uf: estado.uf });
}

/* ---------------- URL: #uf=MG&comb=etanol&cidade=Belo Horizonte ---------------- */

function gravarURL() {
  const q = new URLSearchParams();
  if (estado.uf !== 'SC') q.set('uf', estado.uf);
  if (estado.fuel !== 'gasolina comum') q.set('comb', estado.fuel);
  if (estado.cidade && estado.cidade !== cidadesDe(estado.uf, estado.fuel)[0]?.municipio) q.set('cidade', estado.cidade);
  const h = q.toString() ? '#' + q.toString() : location.pathname + location.search;
  if (h !== location.hash) history.replaceState(null, '', h);
}
function lerURL() {
  const q = new URLSearchParams(location.hash.slice(1));
  const u = q.get('uf')?.toUpperCase(), f = q.get('comb');
  estado.uf = u && UFS[u] ? u : 'SC';
  estado.fuel = f && COMB[f] ? f : 'gasolina comum';
  estado.cidade = q.get('cidade') ?? '';
}

/* ---------------- eventos ---------------- */

export async function iniciar() {
  try {
    const [B, M, Me, N] = await Promise.all([
      json<Bandeira[]>('data/bandeiras.json'),
      json<Municipio[]>('data/municipios.json'),
      json<Metadados>('data/metadados.json'),
      json<Record<string, string>>('data/nomes_municipios.json', {}),
    ]);
    BAND = B; MUN = M; META = Me; NOMES = N;
    lerURL();
    render();
    const app = $('#app');
    app.addEventListener('change', (e) => {
      const s = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-sel]');
      if (!s) return;
      const qual = s.dataset.sel!;
      if (qual === 'fuel') estado.fuel = s.value;
      else if (qual === 'uf') { estado.uf = s.value; estado.cidade = ''; }
      else estado.cidade = s.value;
      render();
      gravarURL();
      esconderDica();
      app.querySelector<HTMLSelectElement>(`select[data-sel="${qual}"]`)?.focus();
    });
    ligarInteracao();
    addEventListener('hashchange', () => { lerURL(); render(); });
    matchMedia('(max-width: 820px)').addEventListener('change', () => { mobile = estreito(); render(); });
    let larg = innerWidth, q = 0;
    addEventListener('resize', () => {
      cancelAnimationFrame(q);
      q = requestAnimationFrame(() => { if (mobile && innerWidth !== larg) { larg = innerWidth; render(); } });
    });
  } catch (erro) {
    $('#app').innerHTML = `<p class="hint">Não deu para carregar os dados agora. Tente recarregar a página.</p>`;
    console.error(erro);
  }
}
