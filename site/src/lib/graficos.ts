// Peças de desenho comuns às telas nacionais: estados, cores, mapa do Brasil, gráfico semanal
// e a interação (destaque cruzado, dica, cursor do gráfico). Portado do artifact de telas (Rodada 4).

import { BRMAP } from './brasil';
import { dataBR, esc, nf } from './dados';
import { esconderDica, mostrarDica } from './web';

export const UFS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
export const UFS_ORDEM = Object.keys(UFS).sort((a, b) => UFS[a].localeCompare(UFS[b], 'pt-BR'));

// Artigo de cada estado: "o Ceará", "a Bahia", "Minas Gerais".
const ART: Record<string, string> = Object.fromEntries([
  ...'AC AM AP CE DF ES MA MT MS PA PR PI RJ RN RS TO'.split(' ').map((u) => [u, 'o']),
  ...'BA PB'.split(' ').map((u) => [u, 'a']),
]);
export const comArtigo = (u: string, maiuscula = false) => {
  const a = ART[u] ? `${maiuscula ? ART[u].toUpperCase() : ART[u]} ` : '';
  return a + UFS[u];
};
/** "no Ceará", "na Bahia", "em Minas Gerais" */
export const emUF = (u: string) => `${({ o: 'no', a: 'na' })[ART[u] as 'o' | 'a'] ?? 'em'} ${UFS[u]}`;

/* ---------------- texto ---------------- */

export const nb = (t: string) => t.replace(/ /g, ' ');
export const tipA = (h: string) => ` data-tip="${esc(h)}"`;
export const pct = (v: number, d = 1) => nf(v * 100, d) + '%';
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const somaDias = (iso: string, d: number) => new Date(Date.parse(iso + 'T12:00:00Z') + d * 864e5).toISOString().slice(0, 10);
/** "de 25/10 a 30/10/2026": a semana vai de domingo a sábado, sem passar do último dia com dados. */
export const periodoSemana = (semana: string, fimDados: string) =>
  `de ${dataBR(semana).slice(0, 5)} a ${dataBR([somaDias(semana, 6), fimDados].sort()[0])}`;

/* ---------------- cores ---------------- */

export const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
export const DIVS: [number, string][] = [[-1, '#1c5cab'], [-0.5, '#6da7ec'], [0, '#f0efec'], [0.5, '#ee8f8e'], [1, '#b8302f']];
export const SEM_DADO = '#e4e2db';
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
export const seqColor = (t: number) => {
  const x = clamp(t, 0, 1) * (SEQ.length - 1), i = Math.min(SEQ.length - 2, Math.floor(x));
  return mix(SEQ[i], SEQ[i + 1], x - i);
};
/** Escala divergente: −1 azul, 0 neutro, +1 vermelho. */
export const divColor = (t: number) => {
  t = clamp(t, -1, 1);
  for (let i = 0; i < DIVS.length - 1; i++) {
    const [a, ca] = DIVS[i], [b, cb] = DIVS[i + 1];
    if (t <= b) return mix(ca, cb, (t - a) / (b - a));
  }
  return DIVS.at(-1)![1];
};
const lum = (h: string) => {
  const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const onColor = (bg: string) => (lum(bg) < 0.3 ? '#fff' : '#0b0b0b');

/* ---------------- mapa do Brasil ---------------- */

// Estados pequenos do litoral: o rótulo vai para o mar, com uma linha até o estado.
const COAST: Record<string, [number, number]> = { RN: [742, 190], PB: [742, 222], PE: [742, 254], AL: [742, 286], SE: [742, 318], ES: [668, 470], RJ: [640, 552], DF: [528, 376] };
const VB = { w: 780, h: 739 };

/** perto: a pílula fica logo acima (ou abaixo) do estado; sem isso, vai para o canto livre mais próximo. */
export type Destaque = { u: string; t: string; perto?: boolean };
type OpcoesMapa = { sel: string; m: boolean; fill: (u: string) => string; tip: (u: string) => string; destaques: Destaque[] };

export function brMap({ sel, m, fill, tip, destaques }: OpcoesMapa) {
  const fs = m ? 21 : 15.5, ls = m ? 21 : 14.5;
  const order = Object.keys(BRMAP.p).sort((a, b) => BRMAP.c[a][0] - BRMAP.c[b][0]);
  const draw = order.filter((u) => u !== sel).concat([sel]);
  let shadow = '', body = '', lab = '', pills = '';
  order.forEach((u) => (shadow += `<path d="${BRMAP.p[u]}"/>`));
  draw.forEach((u) => {
    const i = order.indexOf(u);
    body += `<g class="st${u === sel ? ' sel' : ''}" data-act="uf" data-uf="${u}" tabindex="0" role="button" aria-label="${UFS[u]}" aria-pressed="${u === sel}"${tipA(tip(u))} style="--i:${i}" fill="${fill(u)}"><path d="${BRMAP.p[u]}"/></g>`;
  });
  order.forEach((u) => {
    const [cx, cy] = BRMAP.c[u];
    if (COAST[u]) {
      const [x, y] = COAST[u];
      lab += `<line x1="${cx}" y1="${cy}" x2="${x - 4}" y2="${y - ls * 0.35}" stroke="#0b0b0b" stroke-opacity=".5" stroke-width="1" pointer-events="none"/><text class="stl halo" x="${x}" y="${y}" font-size="${ls}" fill="#0b0b0b">${u}</text>`;
    } else lab += `<text class="stl" x="${cx}" y="${cy + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="${onColor(fill(u))}">${u}</text>`;
  });
  // Cantos livres; embaixo à esquerda fica o cartão do estado no Panorama.
  const f2 = m ? 19 : 13.5, h = f2 + 13, usados = new Set<string>();
  destaques.forEach((c) => {
    const [cx, cy] = BRMAP.c[c.u], w = c.t.length * f2 * 0.55 + 22;
    let px: number, py: number, lx: number, ly: number;
    if (c.perto) {
      px = clamp(cx - w / 2, 4, VB.w - 4 - w);
      const cima = cy - 34 - h > 2;
      py = cima ? cy - 34 - h : cy + 34;
      lx = cx; ly = cima ? py + h : py;
    } else {
      const cantos: Record<string, [number, number]> = { tl: [4, 8], tr: [VB.w - 4 - w, 8], br: [VB.w - 4 - w, m ? 640 : 650] };
      const [nome, xy] = Object.entries(cantos)
        .filter(([k]) => !usados.has(k))
        .sort(([, a], [, b]) => Math.hypot(a[0] + w / 2 - cx, a[1] + h / 2 - cy) - Math.hypot(b[0] + w / 2 - cx, b[1] + h / 2 - cy))[0];
      usados.add(nome);
      [px, py] = xy; lx = px + w / 2; ly = py < 300 ? py + h : py;
    }
    pills += `<g class="fi" pointer-events="none"><line x1="${cx}" y1="${cy}" x2="${lx}" y2="${ly}" stroke="#0b0b0b" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="5" fill="#0b0b0b" stroke="#fcfcfb" stroke-width="2"/><rect x="${px}" y="${py}" width="${w}" height="${h}" rx="6" fill="#0b0b0b"/><text x="${px + w / 2}" y="${py + h / 2 + f2 * 0.34}" text-anchor="middle" font-size="${f2}" font-weight="650" fill="#fff">${esc(c.t)}</text></g>`;
  });
  const ref = `<g fill="none" stroke="#c3c2b7" stroke-dasharray="2 6"><line x1="0" x2="780" y1="100" y2="100"/><line x1="0" x2="780" y1="544" y2="544"/></g><text class="tk" style="font-size:${ls * 0.8}px" x="778" y="92" text-anchor="end">Linha do Equador</text><text class="tk" style="font-size:${ls * 0.8}px" x="2" y="536">Trópico de Capricórnio</text>`;
  return `<svg class="ch brmap" viewBox="0 0 ${VB.w} ${VB.h}" role="group" aria-label="Mapa do Brasil por estado">${ref}<g transform="translate(5 7)" fill="#0b0b0b" fill-opacity=".07">${shadow}</g>${body}${lab}${pills}</svg>`;
}

/* ---------------- gráfico semanal ---------------- */

export type Linha = { v: (number | null)[]; cor: string; faixa?: [number[], number[]]; rotulo?: string };
type OpcoesGrafico = {
  id: string; semanas: string[]; linhas: Linha[]; W: number; H: number; m: boolean;
  fmt: (v: number) => string; passo: (faixa: number) => number;
  ref?: { v: number; txt: string }; tip: (i: number) => string; aria: string;
};
type Cursor = { W: number; l: number; iw: number; n: number; tip: (i: number) => string; pontos: (i: number) => ([number, number] | null)[] };
const cursores: Record<string, Cursor> = {};

export function graficoSemanal(o: OpcoesGrafico) {
  const { W, H, m } = o, mg = { l: m ? 44 : 50, r: m ? 64 : 78, t: 12, b: 26 }, iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
  const vals = o.linhas.flatMap((l) => [...l.v, ...(l.faixa ? [...l.faixa[0], ...l.faixa[1]] : [])]).filter((v): v is number => v != null);
  if (o.ref) vals.push(o.ref.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const st = o.passo((hi - lo) / 4);
  lo = Math.floor(lo / st - 1e-9) * st; hi = Math.ceil(hi / st + 1e-9) * st;
  const n = o.semanas.length, x = (i: number) => mg.l + (iw * i) / (n - 1), y = (v: number) => mg.t + ih * (1 - (v - lo) / (hi - lo));
  let grid = '';
  for (let v = lo; v <= hi + st / 1e3; v += st) grid += `<line class="gl" x1="${mg.l}" x2="${W - mg.r + 8}" y1="${y(v)}" y2="${y(v)}"/><text class="tk" x="${mg.l - 8}" y="${y(v) + 4}" text-anchor="end">${o.fmt(v)}</text>`;
  let ticks = '', k = -1;
  o.semanas.forEach((s, i) => {
    if (i > 0 && s.slice(5, 7) !== o.semanas[i - 1].slice(5, 7) && ++k % (m ? 3 : 2) === 0)
      ticks += `<text class="tk" x="${x(i)}" y="${H - 6}" text-anchor="middle">${MON[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}</text>`;
  });
  const caminho = (v: (number | null)[]) => {
    let d = '', ant = false;
    v.forEach((p, i) => { if (p == null) { ant = false; return; } d += `${ant ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p).toFixed(1)}`; ant = true; });
    return d;
  };
  let corpo = '';
  if (o.ref) {
    // O rótulo da referência vai para o canto (esquerda/direita, acima/abaixo) mais longe das linhas.
    const yr = y(o.ref.v), larg = o.ref.txt.length * 6.2, fim = W - mg.r;
    const lugares = [
      { x: mg.l + 6, dy: -6, ancora: 'start' }, { x: mg.l + 6, dy: 15, ancora: 'start' },
      { x: fim, dy: -6, ancora: 'end' }, { x: fim, dy: 15, ancora: 'end' },
    ].map((p) => {
      const x0 = p.ancora === 'start' ? p.x : p.x - larg, x1 = x0 + larg, yt = yr + p.dy - 4;
      let dist = Infinity;
      o.linhas.forEach((l) => l.v.forEach((v, i) => { if (v != null && x(i) >= x0 - 4 && x(i) <= x1 + 4) dist = Math.min(dist, Math.abs(y(v) - yt)); }));
      return { ...p, dist };
    }).sort((a, b) => b.dist - a.dist);
    const r = lugares[0];
    corpo += `<line x1="${mg.l}" x2="${W - mg.r + 8}" y1="${yr}" y2="${yr}" stroke="#0b0b0b" stroke-width="1.2" stroke-dasharray="4 4"/><text class="lbl2 halo" x="${r.x}" y="${yr + r.dy}" text-anchor="${r.ancora}">${esc(o.ref.txt)}</text>`;
  }
  o.linhas.forEach((l, j) => {
    if (l.faixa) {
      const [a, b] = l.faixa;
      corpo += `<path class="fi" d="${a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b[i]).toFixed(1)}`).join('')}${a.slice().reverse().map((v, i) => `L${x(n - 1 - i).toFixed(1)} ${y(v).toFixed(1)}`).join('')}Z" fill="${l.cor}" fill-opacity=".16"/>`;
    }
    corpo += `<path class="dl" pathLength="1" d="${caminho(l.v)}" fill="none" stroke="${l.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" style="animation-delay:${0.15 + j * 0.3}s"/>`;
  });
  // ponto e valor no fim de cada linha, sem um rótulo cobrir o outro
  const fins = o.linhas.map((l) => ({ l, i: l.v.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).at(-1) ?? -1 })).filter((f) => f.i >= 0);
  const ys = fins.map((f) => y(f.l.v[f.i]!));
  if (ys.length === 2 && Math.abs(ys[0] - ys[1]) < 15) { const meio = (ys[0] + ys[1]) / 2, s = ys[0] <= ys[1] ? -1 : 1; ys[0] = meio + s * 7.5; ys[1] = meio - s * 7.5; }
  corpo += `<g class="fi">${fins.map((f, j) => `<circle cx="${x(f.i)}" cy="${y(f.l.v[f.i]!)}" r="5.5" fill="${f.l.cor}" stroke="#fcfcfb" stroke-width="2"/><text class="lbl" x="${x(f.i) + 12}" y="${ys[j] + 4}">${f.l.rotulo ?? o.fmt(f.l.v[f.i]!)}</text>`).join('')}</g>`;
  cursores[o.id] = { W, l: mg.l, iw, n, tip: o.tip, pontos: (i) => o.linhas.map((l) => (l.v[i] == null ? null : [x(i), y(l.v[i]!)])) };
  return `<svg class="ch" data-cid="${o.id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}">
    ${grid}${ticks}${corpo}
    <g class="cur" style="display:none"><line x1="0" x2="0" y1="${mg.t}" y2="${mg.t + ih}" stroke="#0b0b0b" stroke-opacity=".35"/>${o.linhas.map((l) => `<circle r="5.5" fill="${l.cor}" stroke="#fcfcfb" stroke-width="2"/>`).join('')}</g>
  </svg>`;
}

export const passoPreco = (r: number) => [0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2].find((s) => s >= r) || 2;
export const passoPct = (r: number) => [0.01, 0.02, 0.025, 0.05, 0.1].find((s) => s >= r) || 0.1;

/* ---------------- interação ---------------- */

/** Destaque cruzado por [data-uf], dica de [data-tip] e cursor dos gráficos semanais. */
export function ligarInteracao() {
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
    document.querySelectorAll<SVGGElement>('svg[data-cid] g.cur').forEach((g) => { if (!svg?.contains(g)) g.style.display = 'none'; });
    const c = svg && cursores[svg.dataset.cid!];
    if (svg && c) {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * c.W;
      const g = svg.querySelector<SVGGElement>('g.cur')!;
      if (px >= c.l - 6 && px <= c.W - 6) {
        const i = clamp(Math.round(((px - c.l) / c.iw) * (c.n - 1)), 0, c.n - 1), pts = c.pontos(i);
        const xx = String(pts.find(Boolean)?.[0] ?? c.l + (c.iw * i) / (c.n - 1));
        g.style.display = '';
        const ln = g.querySelector('line')!;
        ln.setAttribute('x1', xx); ln.setAttribute('x2', xx);
        g.querySelectorAll('circle').forEach((ci, j) => {
          const p = pts[j];
          ci.style.display = p ? '' : 'none';
          if (p) { ci.setAttribute('cx', String(p[0])); ci.setAttribute('cy', String(p[1])); }
        });
        mostrarDica(c.tip(i), e.clientX, e.clientY);
        return;
      }
      g.style.display = 'none';
    }
    const d = t.closest?.<HTMLElement>('[data-tip]');
    if (d && e.pointerType !== 'touch') mostrarDica(d.dataset.tip!, e.clientX, e.clientY);
    else esconderDica();
  });
  document.addEventListener('pointerleave', esconderDica);
  addEventListener('scroll', esconderDica, { passive: true });
}

/** Enter/Espaço nos estados do mapa (são <g role=button>). */
export function tecladoNoMapa(raiz: HTMLElement, escolher: (u: string) => void) {
  raiz.addEventListener('keydown', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('g[data-act="uf"]');
    if (a && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); escolher(a.dataset.uf!); }
  });
}
