// Panorama: o mapa do Brasil com a mediana de cada estado na última semana pesquisada,
// a lista do mais barato ao mais caro e a série de 52 semanas do país.
// O desenho segue o artifact de telas (Rodada 4); a diferença é que aqui os dados são os da ANP.

import { COMB, COMBUSTIVEIS, artigo, brl, dataBR, esc, mediana, nf } from '../lib/dados';
import { BRMAP } from '../lib/brasil';
import { $, BASE, abasComCombustivel, esconderDica, estreito, json, mostrarDica } from '../lib/web';

type Semanal = { semana: string; uf: string; produto: string; mediana: number; p10: number; p90: number; n_coletas: number };
type Municipio = { uf: string; municipio: string; produto: string; n_postos: number; mediana: number; minimo: number };
type Metadados = { periodo: { inicio: string; fim: string }; semana_referencia: string };

export const UFS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
// Artigo de cada estado: "o Ceará", "a Bahia", "Minas Gerais".
const ART: Record<string, string> = Object.fromEntries([
  ...'AC AM AP CE DF ES MA MT MS PA PR PI RJ RN RS TO'.split(' ').map((u) => [u, 'o']),
  ...'BA PB'.split(' ').map((u) => [u, 'a']),
]);
const comArtigo = (u: string, maiuscula = false) => {
  const a = ART[u] ? `${maiuscula ? ART[u].toUpperCase() : ART[u]} ` : '';
  return a + UFS[u];
};
const emUF = (u: string) => ({ o: 'no', a: 'na' })[ART[u] as 'o' | 'a'] ?? 'em';
const nb = (t: string) => t.replace(/ /g, '\u00a0');
// Estados com cidades e postos em Minha cidade.
const COM_CIDADES = new Set(['SC']);
// Abaixo disso a mediana do estado depende de pouquíssimos postos: aparece, mas não vira manchete.
const MIN_COLETAS = 5;
const SEMANAS = 52;

const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const SEM_DADO = '#e4e2db';
const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Estados pequenos do litoral: o rótulo vai para o mar, com uma linha até o estado.
const COAST: Record<string, [number, number]> = { RN: [742, 190], PB: [742, 222], PE: [742, 254], AL: [742, 286], SE: [742, 318], ES: [668, 470], RJ: [640, 552], DF: [528, 376] };
const VB = { w: 780, h: 739 };

const estado = { fuel: 'gasolina comum', uf: 'SC' };
let S: Semanal[] = [];
let M: Municipio[] = [];
let META: Metadados;
let jaAnimou = false;
let mobile = estreito();

/* ---------------- cores ---------------- */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const seqColor = (t: number) => {
  const x = clamp(t, 0, 1) * (SEQ.length - 1), i = Math.min(SEQ.length - 2, Math.floor(x));
  return mix(SEQ[i], SEQ[i + 1], x - i);
};
const lum = (h: string) => {
  const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = (bg: string) => (lum(bg) < 0.3 ? '#fff' : '#0b0b0b');

/* ---------------- texto ---------------- */

const tipA = (h: string) => ` data-tip="${esc(h)}"`;
const sgn = (v: number) => (v >= 0 ? '+' : '−') + nf(Math.abs(v) * 100, 1) + '%';
const feminino = (k: string) => k.startsWith('gasolina');
const barato = (k: string) => (feminino(k) ? 'mais barata' : 'mais barato');
const tanqueTxt = (k: string) => `${COMB[k].tanque} ${COMB[k].u === 'm³' ? 'm³' : 'L'}`;
const dm = (iso: string) => dataBR(iso).slice(0, 5);
const somaDias = (iso: string, d: number) => new Date(Date.parse(iso + 'T12:00:00Z') + d * 864e5).toISOString().slice(0, 10);

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

/* ---------------- mapa do Brasil ---------------- */

type Callout = { u: string; t: string };
function brMap(fill: (u: string) => string, tip: (u: string) => string, callouts: Callout[]) {
  const m = mobile, fs = m ? 21 : 15.5, ls = m ? 21 : 14.5;
  const order = Object.keys(BRMAP.p).sort((a, b) => BRMAP.c[a][0] - BRMAP.c[b][0]);
  const draw = order.filter((u) => u !== estado.uf).concat([estado.uf]);
  let shadow = '', body = '', lab = '', pills = '';
  order.forEach((u) => (shadow += `<path d="${BRMAP.p[u]}"/>`));
  draw.forEach((u) => {
    const i = order.indexOf(u);
    body += `<g class="st${u === estado.uf ? ' sel' : ''}" data-act="uf" data-uf="${u}" tabindex="0" role="button" aria-label="${UFS[u]}" aria-pressed="${u === estado.uf}"${tipA(tip(u))} style="--i:${i}" fill="${fill(u)}"><path d="${BRMAP.p[u]}"/></g>`;
  });
  order.forEach((u) => {
    const [cx, cy] = BRMAP.c[u];
    if (COAST[u]) {
      const [x, y] = COAST[u];
      lab += `<line x1="${cx}" y1="${cy}" x2="${x - 4}" y2="${y - ls * 0.35}" stroke="#0b0b0b" stroke-opacity=".5" stroke-width="1" pointer-events="none"/><text class="stl halo" x="${x}" y="${y}" font-size="${ls}" fill="#0b0b0b">${u}</text>`;
    } else lab += `<text class="stl" x="${cx}" y="${cy + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${onColor(fill(u))}">${u}</text>`;
  });
  // Cada destaque vai para o canto livre mais perto do estado, sem os dois dividirem o mesmo canto.
  const f2 = m ? 19 : 13.5, h = f2 + 13, usados = new Set<string>();
  callouts.forEach((c) => {
    const [cx, cy] = BRMAP.c[c.u], w = c.t.length * f2 * 0.55 + 22;
    const cantos = {
      tl: [4, 8], tr: [VB.w - 4 - w, 8], br: [VB.w - 4 - w, m ? 640 : 650], // embaixo à esquerda fica o cartão do estado
    } as Record<string, [number, number]>;
    const [nome, [px, py]] = Object.entries(cantos)
      .filter(([k]) => !usados.has(k))
      .sort(([, a], [, b]) => Math.hypot(a[0] + w / 2 - cx, a[1] + h / 2 - cy) - Math.hypot(b[0] + w / 2 - cx, b[1] + h / 2 - cy))[0];
    usados.add(nome);
    const lx = px + w / 2, ly = py < 300 ? py + h : py;
    pills += `<g class="fi" pointer-events="none"><line x1="${cx}" y1="${cy}" x2="${lx}" y2="${ly}" stroke="#0b0b0b" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="5" fill="#0b0b0b" stroke="#fcfcfb" stroke-width="2"/><rect x="${px}" y="${py}" width="${w}" height="${h}" rx="6" fill="#0b0b0b"/><text x="${px + w / 2}" y="${py + h / 2 + f2 * 0.34}" text-anchor="middle" font-size="${f2}" font-weight="650" fill="#fff">${esc(c.t)}</text></g>`;
  });
  const ref = `<g fill="none" stroke="#c3c2b7" stroke-dasharray="2 6"><line x1="0" x2="780" y1="100" y2="100"/><line x1="0" x2="780" y1="544" y2="544"/></g><text class="tk" style="font-size:${ls * 0.8}px" x="778" y="92" text-anchor="end">Linha do Equador</text><text class="tk" style="font-size:${ls * 0.8}px" x="2" y="536">Trópico de Capricórnio</text>`;
  return `<svg class="ch brmap" viewBox="0 0 ${VB.w} ${VB.h}" role="group" aria-label="Mapa do Brasil por estado">${ref}<g transform="translate(5 7)" fill="#0b0b0b" fill-opacity=".07">${shadow}</g>${body}${lab}${pills}</svg>`;
}

/* ---------------- série semanal com faixa ---------------- */

type Grafico = { W: number; mg: { l: number; r: number; t: number; b: number }; iw: number; n: number; tip: (i: number) => string; ponto: (i: number) => [number, number] };
let grafico: Grafico | null = null;
const niceStep = (r: number) => [0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2].find((s) => s >= r) || 2;

function seriesChart(data: Semanal[], W: number, H: number) {
  const m = mobile, mg = { l: m ? 44 : 50, r: m ? 64 : 78, t: 12, b: 26 }, iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
  let lo = Math.min(...data.map((d) => d.p10)), hi = Math.max(...data.map((d) => d.p90));
  const st = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / st) * st; hi = Math.ceil(hi / st) * st;
  const x = (i: number) => mg.l + (iw * i) / (data.length - 1), y = (v: number) => mg.t + ih * (1 - (v - lo) / (hi - lo));
  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v += st) grid += `<line class="gl" x1="${mg.l}" x2="${W - mg.r + 8}" y1="${y(v)}" y2="${y(v)}"/><text class="tk" x="${mg.l - 8}" y="${y(v) + 4}" text-anchor="end">${nf(v, 2)}</text>`;
  let ticks = '', k = -1;
  data.forEach((d, i) => {
    const mo = +d.semana.slice(5, 7) - 1;
    if (i > 0 && mo !== +data[i - 1].semana.slice(5, 7) - 1 && ++k % (m ? 3 : 2) === 0)
      ticks += `<text class="tk" x="${x(i)}" y="${H - 6}" text-anchor="middle">${MON[mo]} ${d.semana.slice(0, 4)}</text>`;
  });
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.mediana).toFixed(1)}`).join('');
  const band = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.p90).toFixed(1)}`).join('')
    + data.slice().reverse().map((d, i) => `L${x(data.length - 1 - i).toFixed(1)} ${y(d.p10).toFixed(1)}`).join('') + 'Z';
  const e = data.at(-1)!;
  grafico = {
    W, mg, iw, n: data.length,
    tip: (i) => { const d = data[i]; return `<b>Semana de ${dataBR(d.semana)}</b><br>Mediana <b>${brl(d.mediana)}</b><br><span class="mut">p10–p90: ${brl(d.p10)} a ${brl(d.p90)}</span><br><span class="mut">${nf(d.n_coletas, 0)} coletas</span>`; },
    ponto: (i) => [x(i), y(data[i].mediana)],
  };
  return `<svg class="ch" data-cid="br" viewBox="0 0 ${W} ${H}" role="img" aria-label="Série semanal da mediana do Brasil com a faixa p10–p90">
    ${grid}${ticks}
    <path class="fi" d="${band}" fill="#2a78d6" fill-opacity=".16"/>
    <path class="dl" pathLength="1" d="${line}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <g class="fi"><circle cx="${x(data.length - 1)}" cy="${y(e.mediana)}" r="5.5" fill="#2a78d6" stroke="#fcfcfb" stroke-width="2"/>
    <text class="lbl" x="${x(data.length - 1) + 12}" y="${y(e.mediana) + 4}">${brl(e.mediana)}</text></g>
    <g class="cur" style="display:none"><line x1="0" x2="0" y1="${mg.t}" y2="${mg.t + ih}" stroke="#0b0b0b" stroke-opacity=".35"/><circle r="5.5" fill="#2a78d6" stroke="#fcfcfb" stroke-width="2"/></g>
  </svg>`;
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
  const fimSemana = [somaDias(semana, 6), META.periodo.fim].sort()[0];
  const periodo = `de ${dm(semana)} a ${dataBR(fimSemana)}`;
  const poucas = (r: Semanal) => (r.n_coletas < MIN_COLETAS ? `<br><span class="mut">Só ${r.n_coletas} ${r.n_coletas === 1 ? 'coleta' : 'coletas'}: preço pouco firme</span>` : '');
  const tp = (u: string) => {
    const r = porUF.get(u);
    if (!r) return `<b>${UFS[u]}</b><br><span class="mut">Sem pesquisa de ${F.l} nesta semana</span>`;
    return `<b>${UFS[u]}</b><br>${brl(r.mediana)} por ${F.u}<br><span class="mut">${r.mediana <= cur.mediana ? 'abaixo' : 'acima'} da mediana do país (${brl(cur.mediana)})</span><br><span class="mut">p10–p90: ${brl(r.p10)} a ${brl(r.p90)} · ${nf(r.n_coletas, 0)} coletas</span>${poucas(r)}`;
  };
  const map = brMap(cor, tp, [{ u: mx.uf, t: `Mais caro · ${brl(mx.r.mediana)}` }, { u: mn.uf, t: `Mais barato · ${brl(mn.r.mediana)}` }]);

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
    <div class="phero"><div class="hero rv" style="--i:0"><p class="q">Onde o combustível é mais barato?</p><h2>${comArtigo(mn.uf, true)} tem ${artigo(k)} ${F.l} ${barato(k)} do país: ${nb(brl(mn.r.mediana))} o ${F.u}, ${nb(brl(mx.r.mediana - mn.r.mediana))} a menos que ${emUF(mx.uf)} ${UFS[mx.uf]}.</h2><p class="s">Mediana de cada estado na última pesquisa, ${periodo}.${foraDestaque ? ` Estados com menos de ${MIN_COLETAS} coletas na semana ficam fora dos destaques.` : ''} Toque num estado para ver os detalhes.</p></div><div class="filters rv" style="--i:1">${selFuel()}</div></div>
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
    <div class="legend"><span><i style="background:#2a78d6"></i>Mediana</span><span><i class="bd"></i>Faixa p10–p90</span></div>${seriesChart(br, W, mobile ? 210 : 220)}</section>
  <p class="foot">Fonte: ANP, Levantamento de Preços de Combustíveis, pesquisa semanal por amostragem de postos. Preços nominais, mediana das coletas de cada semana (domingo a sábado). Dados de ${dataBR(META.periodo.inicio)} a ${dataBR(META.periodo.fim)}.</p>`;
  if (jaAnimou) $('#app').classList.add('quiet');
  jaAnimou = true;
  abasComCombustivel(estado.fuel);
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
  app.addEventListener('keydown', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('g[data-act="uf"]');
    if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolherUF(a.dataset.uf!); }
  });
  app.addEventListener('change', (e) => {
    const s = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-sel="fuel"]');
    if (!s) return;
    estado.fuel = s.value;
    render();
    gravarURL();
    $('#app').querySelector<HTMLSelectElement>('select[data-sel="fuel"]')?.focus();
  });
  // destaque cruzado mapa ↔ lista, dica e cursor do gráfico
  let hl = '';
  document.addEventListener('pointermove', (e) => {
    const t = e.target as Element;
    const u = t.closest?.<HTMLElement>('[data-uf]')?.dataset.uf ?? '';
    if (u !== hl) {
      document.querySelectorAll('.hl').forEach((n) => n.classList.remove('hl'));
      if (u) document.querySelectorAll(`[data-uf="${u}"]`).forEach((n) => n.classList.add('hl'));
      hl = u;
    }
    const svg = t.closest?.<SVGSVGElement>('svg[data-cid]');
    const g = document.querySelector<SVGGElement>('svg[data-cid] g.cur');
    if (svg && grafico) {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * grafico.W, c = grafico;
      if (px >= c.mg.l - 6 && px <= c.W - 6) {
        const i = clamp(Math.round(((px - c.mg.l) / c.iw) * (c.n - 1)), 0, c.n - 1), [x, y] = c.ponto(i);
        g!.style.display = '';
        const ln = g!.querySelector('line')!, ci = g!.querySelector('circle')!;
        ln.setAttribute('x1', String(x)); ln.setAttribute('x2', String(x));
        ci.setAttribute('cx', String(x)); ci.setAttribute('cy', String(y));
        mostrarDica(c.tip(i), e.clientX, e.clientY);
        return;
      }
    }
    if (g) g.style.display = 'none';
    const d = t.closest?.<HTMLElement>('[data-tip]');
    if (d && e.pointerType !== 'touch') mostrarDica(d.dataset.tip!, e.clientX, e.clientY);
    else esconderDica();
  });
  document.addEventListener('pointerleave', esconderDica);
  addEventListener('scroll', esconderDica, { passive: true });
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
