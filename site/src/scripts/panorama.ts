// Panorama: o mapa do Brasil com a mediana de cada estado na última semana pesquisada,
// a lista do mais barato ao mais caro e a série de 52 semanas do país.
// O desenho segue o artifact de telas (Rodada 4); a diferença é que aqui os dados são os da ANP.

import { COMB, COMBUSTIVEIS, artigo, brl, dataBR, esc, mediana, nf } from '../lib/dados';
import {
  SEM_DADO, SEQ, UFS, brMap, comArtigo, emUF, graficoSemanal, ligarInteracao, nb, passoPreco, periodoSemana, seqColor,
  tecladoNoMapa, tipA,
} from '../lib/graficos';
import { $, BASE, abasCom, esconderDica, estreito, json } from '../lib/web';

type Semanal = { semana: string; uf: string; produto: string; mediana: number; p10: number; p90: number; n_coletas: number };
type Municipio = { uf: string; municipio: string; produto: string; n_postos: number; mediana: number; minimo: number };
type Metadados = { periodo: { inicio: string; fim: string }; semana_referencia: string };

// Estados com cidades e postos em Minha cidade.
const COM_CIDADES = new Set(['SC']);
// Abaixo disso a mediana do estado depende de pouquíssimos postos: aparece, mas não vira manchete.
const MIN_COLETAS = 5;
const SEMANAS = 52;

const estado = { fuel: 'gasolina comum', uf: 'SC' };
let S: Semanal[] = [];
let M: Municipio[] = [];
let META: Metadados;
let jaAnimou = false;
let mobile = estreito();

const sgn = (v: number) => (v >= 0 ? '+' : '−') + nf(Math.abs(v) * 100, 1) + '%';
const feminino = (k: string) => k.startsWith('gasolina');
const barato = (k: string) => (feminino(k) ? 'mais barata' : 'mais barato');
const tanqueTxt = (k: string) => `${COMB[k].tanque} ${COMB[k].u === 'm³' ? 'm³' : 'L'}`;

/* ---------------- dados ---------------- */

const semanasDe = (k: string) => [...new Set(S.filter((r) => r.produto === k).map((r) => r.semana))].sort();
function ultimaSemana(k: string) {
  const s = semanasDe(k).at(-1)!;
  const porUF = new Map(S.filter((r) => r.produto === k && r.semana === s).map((r) => [r.uf, r]));
  return { semana: s, porUF };
}
function serieBR(k: string) {
  return S.filter((r) => r.produto === k && r.uf === 'BR').sort((a, b) => a.semana.localeCompare(b.semana)).slice(-SEMANAS);
}
/** Economia típica: mediana, entre as cidades com 3 ou mais postos, de (mediana − mais barato) × tanque. */
function economiaTipica(k: string) {
  const v = M.filter((r) => r.produto === k && r.n_postos >= 3).map((r) => (r.mediana - r.minimo) * COMB[k].tanque);
  return v.length ? mediana(v) : null;
}

/* ---------------- tela ---------------- */

function selFuel() {
  return `<label class="fld">Combustível<select data-sel="fuel">${COMBUSTIVEIS.map((c) => `<option value="${c.k}" ${c.k === estado.fuel ? 'selected' : ''}>${c.n}</option>`).join('')}</select></label>`;
}

function render() {
  const k = estado.fuel, F = COMB[k];
  const { semana, porUF } = ultimaSemana(k);
  const br = serieBR(k), cur = porUF.get('BR')!;
  const lista = Object.keys(UFS).filter((u) => porUF.has(u)).map((u) => ({ uf: u, r: porUF.get(u)! })).sort((a, b) => a.r.mediana - b.r.mediana);
  const firmes = lista.filter((x) => x.r.n_coletas >= MIN_COLETAS);
  const mn = (firmes[0] ?? lista[0]), mx = (firmes.at(-1) ?? lista.at(-1)!);
  const foraDestaque = firmes.length < lista.length && (firmes[0] !== lista[0] || firmes.at(-1) !== lista.at(-1));
  const lo = lista[0].r.mediana, hi = lista.at(-1)!.r.mediana;
  const cor = (u: string) => (porUF.has(u) ? seqColor(hi > lo ? (porUF.get(u)!.mediana - lo) / (hi - lo) : 0.5) : SEM_DADO);
  const periodo = periodoSemana(semana, META.periodo.fim);
  const poucas = (r: Semanal) => (r.n_coletas < MIN_COLETAS ? `<br><span class="mut">Só ${r.n_coletas} ${r.n_coletas === 1 ? 'coleta' : 'coletas'}: preço pouco firme</span>` : '');
  const tp = (u: string) => {
    const r = porUF.get(u);
    if (!r) return `<b>${UFS[u]}</b><br><span class="mut">Sem pesquisa de ${F.l} nesta semana</span>`;
    return `<b>${UFS[u]}</b><br>${brl(r.mediana)} por ${F.u}<br><span class="mut">${r.mediana <= cur.mediana ? 'abaixo' : 'acima'} da mediana do país (${brl(cur.mediana)})</span><br><span class="mut">p10–p90: ${brl(r.p10)} a ${brl(r.p90)} · ${nf(r.n_coletas, 0)} coletas</span>${poucas(r)}`;
  };
  const map = brMap({ sel: estado.uf, m: mobile, fill: cor, tip: tp, destaques: [{ u: mx.uf, t: `Mais caro · ${brl(mx.r.mediana)}` }, { u: mn.uf, t: `Mais barato · ${brl(mn.r.mediana)}` }] });

  const su = estado.uf, sr = porUF.get(su), rk = lista.findIndex((x) => x.uf === su) + 1;
  const link = COM_CIDADES.has(su)
    ? `<a class="lnk" href="${BASE}minha-cidade/${k === 'gasolina comum' ? '' : `#comb=${encodeURIComponent(k)}`}">Ver as cidades e os postos →</a>`
    : '';
  let card: string;
  if (sr) {
    const dd = sr.mediana - cur.mediana;
    card = `<div class="selcard"><div class="n">${UFS[su]} · ${rk}º mais barato de ${lista.length}</div><div class="p">${brl(sr.mediana)}</div><div class="n"><span class="${dd <= 0 ? 'dn' : 'up'}">${Math.abs(dd) < 0.005 ? 'na mediana' : (dd < 0 ? '−' : '+') + brl(Math.abs(dd))}</span> contra o Brasil</div><div class="n" style="margin-top:6px">p10–p90: ${brl(sr.p10)} a ${brl(sr.p90)}</div><div class="n">${nf(sr.n_coletas, 0)} coletas${sr.n_coletas < MIN_COLETAS ? ', preço pouco firme' : ''}</div>${link}</div>`;
  } else card = `<div class="selcard"><div class="n">${UFS[su]}</div><div class="p sem">Sem preço</div><div class="n">Nenhum posto de ${UFS[su]} vendendo ${F.l} entrou na pesquisa desta semana.</div>${link}</div>`;

  const ant = br.at(-5), dv = ant ? cur.mediana / ant.mediana - 1 : 0;
  const eco = economiaTipica(k);
  const semUF = Object.keys(UFS).filter((u) => !porUF.has(u)).sort((a, b) => UFS[a].localeCompare(UFS[b], 'pt-BR'));
  const rows = lista.map((x) => `<button type="button" class="lrow" data-act="uf" data-uf="${x.uf}" aria-pressed="${x.uf === su}"${tipA(tp(x.uf))}><i style="background:${cor(x.uf)}"></i><b>${x.uf}</b><span>${UFS[x.uf]}</span><em>${nf(x.r.mediana, 2)}${x.r.n_coletas < MIN_COLETAS ? '<sup>*</sup>' : ''}</em></button>`).join('')
    + semUF.map((u) => `<button type="button" class="lrow na" data-act="uf" data-uf="${u}" aria-pressed="${u === su}"${tipA(tp(u))}><i style="background:${SEM_DADO}"></i><b>${u}</b><span>${UFS[u]}</span><em>–</em></button>`).join('');
  const nota = lista.some((x) => x.r.n_coletas < MIN_COLETAS) ? `<p class="lnota"><sup>*</sup> menos de ${MIN_COLETAS} coletas na semana</p>` : '';
  const W = mobile ? Math.min(358, innerWidth - 32) : 1136;

  $('#app').innerHTML = `<div class="pgrid">
    <div class="phero"><div class="hero rv" style="--i:0"><p class="q">Onde o combustível é mais barato?</p><h2>${comArtigo(mn.uf, true)} tem ${artigo(k)} ${F.l} ${barato(k)} do país: ${nb(brl(mn.r.mediana))} o ${F.u}, ${nb(brl(mx.r.mediana - mn.r.mediana))} a menos que ${emUF(mx.uf)}.</h2><p class="s">Mediana de cada estado na última pesquisa, ${periodo}.${foraDestaque ? ` Estados com menos de ${MIN_COLETAS} coletas na semana ficam fora dos destaques.` : ''} Toque num estado para ver os detalhes.</p></div><div class="filters rv" style="--i:1">${selFuel()}</div></div>
    <div class="pmap">${map}${card}<div class="scalebar"><span>${brl(lo)}</span><i class="gr" style="background:linear-gradient(90deg,${SEQ.join(',')})"></i><span>${brl(hi)}</span>${semUF.length ? `<i class="sw"></i><span>sem pesquisa</span>` : ''}</div></div>
    <div class="pstats rv" style="--i:3">
      <div class="pstat"><div class="l">Preço mediano, Brasil</div><div class="v">${brl(cur.mediana)}</div><div class="d">${!ant ? '' : Math.abs(dv) < 0.0005 ? 'estável em 4 semanas' : `<span class="${dv > 0 ? 'up' : 'dn'}">${dv > 0 ? '▲' : '▼'} ${sgn(dv)}</span> em 4 semanas`}</div></div>
      <div class="pstat"><div class="l">Estado mais barato</div><div class="v">${brl(mn.r.mediana)}</div><div class="d">${UFS[mn.uf]}</div></div>
      <div class="pstat"><div class="l">Estado mais caro</div><div class="v">${brl(mx.r.mediana)}</div><div class="d">${UFS[mx.uf]}</div></div>
      <div class="pstat"><div class="l">Economia típica pesquisando</div><div class="v">${eco == null ? '–' : brl(eco, eco < 10 ? 2 : 0)}</div><div class="d">num tanque de ${tanqueTxt(k)}, na mesma cidade</div></div>
    </div>
    <div class="plist rv" style="--i:4"><h3>Do mais barato ao mais caro</h3><div class="lrows">${rows}</div>${nota}</div>
  </div>
  <section class="panel rv" style="--i:5"><h3>O preço ao longo de ${br.length} semanas</h3><p class="sub">Mediana do Brasil. A faixa mostra onde estão 80% dos preços pesquisados.</p>
    <div class="legend"><span><i style="background:#2a78d6"></i>Mediana</span><span><i class="bd"></i>Faixa p10–p90</span></div>${graficoSemanal({
    id: 'br', semanas: br.map((d) => d.semana), W, H: mobile ? 210 : 220, m: mobile, fmt: (v) => nf(v, 2), passo: passoPreco,
    linhas: [{ v: br.map((d) => d.mediana), cor: '#2a78d6', faixa: [br.map((d) => d.p10), br.map((d) => d.p90)], rotulo: brl(cur.mediana) }],
    aria: 'Série semanal da mediana do Brasil com a faixa p10–p90',
    tip: (i) => { const d = br[i]; return `<b>Semana de ${dataBR(d.semana)}</b><br>Mediana <b>${brl(d.mediana)}</b><br><span class="mut">p10–p90: ${brl(d.p10)} a ${brl(d.p90)}</span><br><span class="mut">${nf(d.n_coletas, 0)} coletas</span>`; },
  })}</section>
  <p class="foot">Fonte: ANP, Levantamento de Preços de Combustíveis, pesquisa semanal por amostragem de postos. Preços nominais, mediana das coletas de cada semana (domingo a sábado). Dados de ${dataBR(META.periodo.inicio)} a ${dataBR(META.periodo.fim)}.</p>`;
  if (jaAnimou) $('#app').classList.add('quiet');
  jaAnimou = true;
  abasCom({ comb: estado.fuel, uf: estado.uf });
}

/* ---------------- URL: #uf=MG&comb=etanol ---------------- */

function gravarURL() {
  const q = new URLSearchParams();
  if (estado.uf !== 'SC') q.set('uf', estado.uf);
  if (estado.fuel !== 'gasolina comum') q.set('comb', estado.fuel);
  const h = q.toString() ? '#' + q.toString() : location.pathname + location.search;
  if (h !== location.hash) history.replaceState(null, '', h);
}
function lerURL() {
  const q = new URLSearchParams(location.hash.slice(1));
  const u = q.get('uf')?.toUpperCase(), f = q.get('comb');
  estado.uf = u && UFS[u] ? u : 'SC';
  estado.fuel = f && COMB[f] ? f : 'gasolina comum';
}

/* ---------------- eventos ---------------- */

function escolherUF(u: string) {
  if (u === estado.uf) return;
  estado.uf = u;
  // Re-render preserva o foco do teclado no estado escolhido.
  const foco = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-uf]');
  const tipo = foco?.tagName.toLowerCase();
  render();
  gravarURL();
  esconderDica();
  if (foco && tipo) document.querySelector<HTMLElement>(`${tipo}[data-uf="${u}"]`)?.focus({ preventScroll: true });
}

function ligarEventos() {
  const app = $('#app');
  app.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act="uf"]');
    if (a) escolherUF(a.dataset.uf!);
  });
  tecladoNoMapa(app, escolherUF);
  app.addEventListener('change', (e) => {
    const s = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-sel="fuel"]');
    if (!s) return;
    estado.fuel = s.value;
    render();
    gravarURL();
    $('#app').querySelector<HTMLSelectElement>('select[data-sel="fuel"]')?.focus();
  });
  ligarInteracao();
  addEventListener('hashchange', () => { lerURL(); render(); });
  // O desenho do mapa e do gráfico muda entre celular e computador (tamanho dos rótulos), não só o CSS.
  matchMedia('(max-width: 820px)').addEventListener('change', () => { mobile = estreito(); render(); });
  let larg = innerWidth, q = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(q);
    q = requestAnimationFrame(() => { if (mobile && innerWidth !== larg) { larg = innerWidth; render(); } });
  });
}

export async function iniciar() {
  try {
    [S, M, META] = await Promise.all([
      json<Semanal[]>('data/semanal.json'),
      json<Municipio[]>('data/municipios.json'),
      json<Metadados>('data/metadados.json'),
    ]);
    lerURL();
    render();
    ligarEventos();
  } catch (erro) {
    $('#app').innerHTML = `<p class="hint">Não deu para carregar os dados agora. Tente recarregar a página.</p>`;
    console.error(erro);
  }
}
