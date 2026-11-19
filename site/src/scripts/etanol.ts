// Etanol ou gasolina?: a razão entre o preço do etanol e o da gasolina comum em cada estado.
// Abaixo de 70% o etanol compensa (rende cerca de 30% menos por litro). Segue o artifact de telas (Rodada 4).

import { brl, dataBR, esc, nf, titulo } from '../lib/dados';
import {
  DIVS, SEM_DADO, UFS, UFS_ORDEM, brMap, divColor, emUF, graficoSemanal, ligarInteracao, nb, passoPct, pct,
  periodoSemana, tecladoNoMapa, tipA,
} from '../lib/graficos';
import { $, abasCom, esconderDica, estreito, json } from '../lib/web';

type Semanal = { semana: string; uf: string; produto: string; mediana: number; n_coletas: number };
type Cidade = { uf: string; municipio: string; mediana_etanol: number; mediana_gasolina: number; razao: number };
type Metadados = { periodo: { inicio: string; fim: string } };
type Razao = { r: number; et: number; gc: number; n: number };

const LIMITE = 0.7;
const MIN_COLETAS = 5; // coletas de etanol na semana para o estado entrar nos destaques
const SEMANAS = 52;
const TANQUE = 50;
const compensa = (r: number) => Math.round(r * 1e4) / 1e4 <= LIMITE; // mesma regra do ETL

const estado = { uf: 'SC' };
let RZ = new Map<string, Map<string, Razao>>(); // semana → uf → razão (inclui 'BR')
let SEMS: string[] = [];
let CID: Cidade[] = [];
let META: Metadados;
let jaAnimou = false;
let mobile = estreito();

function montar(S: Semanal[]) {
  const et = new Map<string, Semanal>(), gc = new Map<string, Semanal>();
  for (const r of S) {
    if (r.produto === 'etanol') et.set(`${r.semana}|${r.uf}`, r);
    else if (r.produto === 'gasolina comum') gc.set(`${r.semana}|${r.uf}`, r);
  }
  RZ = new Map();
  for (const [k, e] of et) {
    const g = gc.get(k);
    if (!g) continue;
    if (!RZ.has(e.semana)) RZ.set(e.semana, new Map());
    RZ.get(e.semana)!.set(e.uf, { r: e.mediana / g.mediana, et: e.mediana, gc: g.mediana, n: e.n_coletas });
  }
  SEMS = [...RZ.keys()].filter((s) => RZ.get(s)!.has('BR')).sort().slice(-SEMANAS);
}

const fala = (r: number) => (compensa(r) ? 'etanol compensa' : 'gasolina compensa');
/** "No Paraná", "Em Santa Catarina" */
const Em = (u: string) => emUF(u)[0].toUpperCase() + emUF(u).slice(1);
let NOMES: Record<string, string> = {}; // "UF|municipio da ANP" → nome do IBGE, com acento
const nomeCidade = (c: Cidade) => `${NOMES[`${c.uf}|${c.municipio}`] ?? titulo(c.municipio)} (${c.uf})`;

function selUF() {
  return `<label class="fld">Estado<select data-sel="uf">${UFS_ORDEM.map((u) => `<option value="${u}" ${u === estado.uf ? 'selected' : ''}>${UFS[u]}</option>`).join('')}</select></label>`;
}
const kpi = (i: number, l: string, v: string, d: string) => `<div class="kpi rv" style="--i:${i}"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;

function render() {
  const semana = SEMS.at(-1)!, agora = RZ.get(semana)!, br = agora.get('BR')!;
  const ufs = UFS_ORDEM.filter((u) => agora.has(u));
  const firmes = ufs.filter((u) => agora.get(u)!.n >= MIN_COLETAS).sort((a, b) => agora.get(a)!.r - agora.get(b)!.r);
  const melhor = firmes[0];
  const nComp = ufs.filter((u) => compensa(agora.get(u)!.r)).length;
  const cs = [...CID].sort((a, b) => a.razao - b.razao), melhorC = cs[0];

  const u = estado.uf, z = agora.get(u);
  const fraco = (x: Razao) => (x.n < MIN_COLETAS ? `<br><span class="mut">Só ${x.n} ${x.n === 1 ? 'coleta' : 'coletas'} de etanol: razão pouco firme</span>` : '');
  const tp = (v: string) => {
    const x = agora.get(v);
    if (!x) return `<b>${UFS[v]}</b><br><span class="mut">Sem pesquisa de etanol e gasolina nesta semana</span>`;
    return `<b>${UFS[v]}</b><br>Etanol a ${pct(x.r)} da gasolina<br><span class="mut">${brl(x.et)} contra ${brl(x.gc)} · ${fala(x.r)}</span>${fraco(x)}`;
  };
  const fill = (v: string) => (agora.has(v) ? divColor((agora.get(v)!.r - LIMITE) / 0.12) : SEM_DADO);
  const map = brMap({ sel: u, m: mobile, fill, tip: tp, destaques: melhor ? [{ u: melhor, t: `Mais favorável · ${pct(agora.get(melhor)!.r)}`, perto: true }] : [] });

  // herói: a resposta para o estado escolhido e quanto ela vale num tanque
  let h2: string, sub: string;
  if (z) {
    const custoGas = TANQUE * z.gc, custoEt = (TANQUE / LIMITE) * z.et, dif = custoGas - custoEt;
    h2 = `${Em(u)}, o etanol custa ${pct(z.r)} do preço da gasolina, então ${compensa(z.r) ? 'compensa abastecer com etanol' : 'a gasolina compensa'}.`;
    sub = `Para rodar o mesmo que ${TANQUE} litros de gasolina (${nb(brl(custoGas, 0))}), você gasta ${nb(brl(custoEt, 0))} de etanol: ${nb(brl(Math.abs(dif), 0))} ${dif >= 0 ? 'a menos' : 'a mais'}. A conta considera que o etanol rende 70% da gasolina por litro.${z.n < MIN_COLETAS ? ` Atenção: só ${z.n} ${z.n === 1 ? 'coleta' : 'coletas'} de etanol ${emUF(u)} nesta semana.` : ''}`;
  } else {
    h2 = `${Em(u)}, não há preço de etanol e gasolina nesta semana.`;
    sub = 'A pesquisa da ANP é por amostragem e nem toda semana passa por todos os estados.';
  }

  // histórico: estado × Brasil
  const W = mobile ? Math.min(358, innerWidth - 32) : 535;
  const hist = graficoSemanal({
    id: 'razao', semanas: SEMS, W, H: mobile ? 200 : 230, m: mobile, fmt: (v) => pct(v, 0), passo: passoPct,
    ref: { v: LIMITE, txt: 'limite de 70%' },
    linhas: [
      { v: SEMS.map((s) => RZ.get(s)!.get('BR')?.r ?? null), cor: '#2a78d6', rotulo: pct(br.r) },
      { v: SEMS.map((s) => RZ.get(s)!.get(u)?.r ?? null), cor: '#eb6834', rotulo: z ? pct(z.r) : undefined },
    ],
    aria: `Razão etanol sobre gasolina por semana, ${UFS[u]} e Brasil`,
    tip: (i) => {
      const a = RZ.get(SEMS[i])!.get('BR'), b = RZ.get(SEMS[i])!.get(u);
      return `<b>Semana de ${dataBR(SEMS[i])}</b><br>Brasil <b>${a ? pct(a.r) : '–'}</b><br>${UFS[u]} <b>${b ? pct(b.r) : 'sem pesquisa'}</b>${b ? `<br><span class="mut">${fala(b.r)} ${emUF(u)}</span>` : ''}`;
    },
  });

  // barras: as cidades mais longe do limite, para baixo
  const top = cs.slice(0, 8), bh = mobile ? 26 : 28, bt = 22, bl = mobile ? 176 : 196, bW = W, pr = 62;
  const x70 = bW - pr, fundo = Math.max(...top.map((c) => LIMITE - c.razao), 0.01), sc = (x70 - bl - 4) / fundo;
  const bars = top.map((c, i) => {
    const y = bt + i * bh, len = Math.max(0, (LIMITE - c.razao) * sc);
    return `<g${tipA(`<b>${esc(nomeCidade(c))}</b><br>Etanol a ${pct(c.razao)} da gasolina<br><span class="mut">${brl(c.mediana_etanol)} contra ${brl(c.mediana_gasolina)} · ${nf((LIMITE - c.razao) * 100, 1)} pontos abaixo do limite</span>`)}><rect x="0" y="${y}" width="${bW}" height="${bh}" fill="transparent"/><line class="gl" x1="0" x2="${bW}" y1="${y + bh}" y2="${y + bh}"/>
      <text class="lbl2" x="2" y="${y + bh / 2 + 4}">${esc(nomeCidade(c))}</text>
      <rect class="bargrow" style="--i:${i}" x="${x70 - len}" y="${y + 5}" width="${len}" height="${bh - 10}" rx="4" fill="#1c5cab"/>
      <text class="lbl" x="${x70 + 8}" y="${y + bh / 2 + 4}">${pct(c.razao)}</text></g>`;
  }).join('');
  const barsSVG = `<svg class="ch" viewBox="0 0 ${bW} ${bt + top.length * bh + 6}" role="img" aria-label="Cidades onde o etanol mais compensa">
    <text class="tk" x="${x70}" y="12" text-anchor="middle">70%</text><line x1="${x70}" x2="${x70}" y1="${bt - 4}" y2="${bt + top.length * bh}" stroke="#0b0b0b" stroke-width="1.2"/>${bars}</svg>`;
  const doEstado = CID.filter((c) => c.uf === u).sort((a, b) => a.razao - b.razao);
  const notaEstado = doEstado.length === 1
    ? `${Em(u)}, só ${esc(nomeCidade(doEstado[0]))} tem postos suficientes para a comparação: ${pct(doEstado[0].razao)}.`
    : doEstado.length
    ? `${Em(u)}, a cidade mais favorável é ${esc(nomeCidade(doEstado[0]))}, com ${pct(doEstado[0].razao)}${doEstado.length > 1 ? `, e a menos favorável é ${esc(nomeCidade(doEstado.at(-1)!))}, com ${pct(doEstado.at(-1)!.razao)}` : ''}.`
    : `Nenhuma cidade ${emUF(u).replace(/^(no|na|em) /, (m) => ({ 'no ': 'do ', 'na ': 'da ', 'em ': 'de ' })[m]!)} tem postos suficientes para a comparação.`;

  $('#app').innerHTML = `
    <div class="hero rv" style="--i:0"><p class="q">Etanol ou gasolina?</p><h2>${h2}</h2><p class="s">${sub} Abaixo de 70%, abasteça com etanol.</p></div>
    <div class="filters rv" style="--i:1">${selUF()}</div>
    <div class="kpis">
      ${kpi(2, 'Razão no Brasil', pct(br.r), `<span class="${compensa(br.r) ? 'dn' : 'up'}">${fala(br.r)}</span>`)}
      ${kpi(3, 'Estados onde o etanol compensa', `${nComp} de ${ufs.length}`, 'razão até 70%')}
      ${kpi(4, 'Estado mais favorável', melhor ? pct(agora.get(melhor)!.r) : '–', melhor ? UFS[melhor] : '')}
      ${kpi(5, 'Cidade mais favorável', melhorC ? pct(melhorC.razao) : '–', melhorC ? esc(nomeCidade(melhorC)) : '')}
    </div>
    <div class="cols">
      <section class="panel rv" style="--i:6"><h3>Quem compensa em cada estado</h3><p class="sub">Razão entre o preço do etanol e o da gasolina comum na semana ${periodoSemana(semana, META.periodo.fim)}. Azul: etanol compensa. Vermelho: gasolina compensa. Toque num estado para ver o histórico.</p>${map}
        <div class="scalebar"><span>etanol compensa</span><div class="gw"><i class="gr2" style="background:linear-gradient(90deg,${DIVS.map((d) => d[1]).join(',')})"></i><div class="tks"><span>58%</span><span>70%</span><span>82%</span></div></div><span>gasolina compensa</span></div></section>
      <div class="stack">
        <section class="panel rv" style="--i:7"><h3>Histórico da razão, em ${SEMS.length} semanas</h3><p class="sub">${UFS[u]} contra o Brasil. A linha tracejada é o limite de 70%.</p>
          <div class="legend"><span><i style="background:#2a78d6"></i>Brasil</span><span><i style="background:#eb6834"></i>${UFS[u]}</span></div>${hist}</section>
        <section class="panel rv" style="--i:8"><h3>Cidades onde o etanol mais compensa</h3><p class="sub">Distância até o limite de 70%, nas últimas 4 semanas, entre as cidades com pelo menos 3 postos de cada combustível.</p>${barsSVG}<p class="sub nota-uf">${notaEstado}</p></section>
      </div>
    </div>
    <p class="foot">Fonte: ANP, Levantamento de Preços de Combustíveis. Razão = mediana do etanol ÷ mediana da gasolina comum na mesma semana. O limite de 70% é a regra prática para carros flex; o rendimento real varia com o carro e o uso. Dados de ${dataBR(META.periodo.inicio)} a ${dataBR(META.periodo.fim)}.</p>`;
  if (jaAnimou) $('#app').classList.add('quiet');
  jaAnimou = true;
  abasCom({ uf: estado.uf });
}

/* ---------------- URL: #uf=MG ---------------- */

function gravarURL() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (estado.uf !== 'SC') q.set('uf', estado.uf); else q.delete('uf');
  const h = q.toString() ? '#' + q.toString() : location.pathname + location.search;
  if (h !== location.hash) history.replaceState(null, '', h);
}
function lerURL() {
  const v = new URLSearchParams(location.hash.slice(1)).get('uf')?.toUpperCase();
  estado.uf = v && UFS[v] ? v : 'SC';
}

function escolherUF(v: string) {
  if (v === estado.uf) return;
  estado.uf = v;
  const foco = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-uf]');
  render();
  gravarURL();
  esconderDica();
  if (foco) document.querySelector<HTMLElement>(`g[data-uf="${v}"]`)?.focus({ preventScroll: true });
}

export async function iniciar() {
  try {
    const [S, C, Me, N] = await Promise.all([
      json<Semanal[]>('data/semanal.json'),
      json<Cidade[]>('data/paridade_municipios.json'),
      json<Metadados>('data/metadados.json'),
      json<Record<string, string>>('data/nomes_municipios.json', {}),
    ]);
    montar(S); CID = C; META = Me; NOMES = N;
    lerURL();
    render();
    const app = $('#app');
    app.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act="uf"]');
      if (a) escolherUF(a.dataset.uf!);
    });
    app.addEventListener('change', (e) => {
      const s = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-sel="uf"]');
      if (s) { escolherUF(s.value); $('#app').querySelector<HTMLSelectElement>('select[data-sel="uf"]')?.focus(); }
    });
    tecladoNoMapa(app, escolherUF);
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
