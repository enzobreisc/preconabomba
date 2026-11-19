// Minha cidade: estado → cidade → posto, num mapa MapLibre só.
// O mapa nunca é recriado: cada passo muda as camadas, a câmera e o lugar do mapa no grid.

import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent } from 'maplibre-gl';
import {
  COMB, COMBUSTIVEIS, type Cidade, type Posto, brl, dataBR, esc, montar, nf, precosDe, resumo,
  type GeoMunicipio, type Linha,
} from '../lib/dados';
import { fachada, ledSVG } from '../lib/fachada';
import { SC } from '../lib/sc';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const ESTILO = 'https://tiles.openfreemap.org/styles/positron';
const FONTE = ['Noto Sans Bold'];
const FONTE_REG = ['Noto Sans Regular'];
const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
const estreito = () => matchMedia('(max-width: 820px)').matches;

type Estado = { fuel: string; cidade: string | null; posto: string | null };
const estado: Estado = { fuel: 'gasolina comum', cidade: null, posto: null };
let D: ReturnType<typeof montar>;
let mapa: MLMap;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

/* ---------------- dados ---------------- */

async function json<T>(caminho: string, padrao?: T): Promise<T> {
  const r = await fetch(BASE + caminho);
  if (!r.ok) {
    if (padrao !== undefined) return padrao;
    throw new Error(`${caminho}: ${r.status}`);
  }
  return r.json();
}

const cidadesOrdenadas = (k: string) =>
  [...D.cidades.values()]
    .map((c) => ({ c, r: resumo(precosDe(c.postos, k)) }))
    .filter((x) => x.r)
    .sort((a, b) => a.r!.med - b.r!.med) as { c: Cidade; r: NonNullable<ReturnType<typeof resumo>> }[];

const postosOrdenados = (c: Cidade, k: string) =>
  c.postos.filter((p) => p.precos[k]).sort((a, b) => a.precos[k].preco - b.precos[k].preco);

function corPreco(p: number, min: number, max: number) {
  const t = max > min ? (p - min) / (max - min) : 0.5;
  return Math.min(SEQ.length - 1, 1 + Math.round(t * (SEQ.length - 2)));
}

/* ---------------- mapa ---------------- */

function pilula(cor: string, borda?: string) {
  // Imagem esticável (icon-text-fit) desenhada no canvas, em 2x.
  const w = 48, h = 40, r = 12, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, r); g.fillStyle = cor; g.fill();
  if (borda) { g.lineWidth = 2; g.strokeStyle = borda; g.stroke(); }
  return {
    img: g.getImageData(0, 0, w, h),
    opt: { pixelRatio: 2, stretchX: [[16, 32]] as [number, number][], stretchY: [[16, 24]] as [number, number][], content: [10, 8, 38, 32] as [number, number, number, number] },
  };
}

function geoCidades() {
  const k = estado.fuel, lista = cidadesOrdenadas(k);
  const min = lista[0]?.r.med ?? 0, max = lista.at(-1)?.r.med ?? 0;
  return {
    type: 'FeatureCollection' as const,
    features: lista
      .filter(({ c }) => c.lat != null)
      .map(({ c, r }, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon!, c.lat!] },
        properties: { m: c.municipio, nome: c.nome, preco: nf(r.med), cor: SEQ[corPreco(r.med, min, max)], sort: i },
      })),
  };
}

function geoPostos() {
  const c = estado.cidade ? D.cidades.get(estado.cidade) : null;
  const k = estado.fuel;
  const lista = c ? postosOrdenados(c, k).filter((p) => p.lat != null) : [];
  const ps = lista.map((p) => p.precos[k].preco), min = Math.min(...ps), max = Math.max(...ps);
  return {
    type: 'FeatureCollection' as const,
    features: lista.map((p, i) => {
      const v = p.precos[k].preco, b = i === 0 ? -1 : corPreco(v, min, max);
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon!, p.lat!] },
        properties: {
          cnpj: p.cnpj, nome: p.nome, preco: nf(v), sort: i,
          img: b < 0 ? 'p-barato' : `p-${b}`, tc: b < 0 || b < 3 ? '#0b0b0b' : '#ffffff',
          cor: b < 0 ? '#eb6834' : SEQ[b], aprox: p.precisao === 'rua',
        },
      };
    }),
  };
}

function mascaraSC() {
  const mundo = [[-80, 10], [-20, 10], [-20, -40], [-80, -40], [-80, 10]];
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [mundo, ...SC] } };
}

function boundsSC(): [[number, number], [number, number]] {
  const xs = SC[0].map((p) => p[0]), ys = SC[0].map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

const pad = () => (estreito() ? { top: 60, bottom: 50, left: 30, right: 30 } : { top: 70, bottom: 60, left: 50, right: 50 });

async function criarMapa() {
  const [ml, worker] = await Promise.all([
    import('maplibre-gl'),
    // o Vite empacota o maplibre e quebra o caminho relativo do worker; apontamos para o arquivo copiado.
    import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
  ]);
  ml.setWorkerUrl(worker.default);
  mapa = new ml.Map({
    container: 'mapa',
    style: ESTILO,
    bounds: boundsSC(),
    fitBoundsOptions: { padding: pad() },
    attributionControl: { compact: true },
    cooperativeGestures: estreito(),
    dragRotate: false,
    pitchWithRotate: false,
    // sem fade: as pílulas de preço trocam de passo de uma vez, sem rótulos fantasmas no meio da troca
    fadeDuration: 0,
  });
  mapa.touchZoomRotate.disableRotation();
  mapa.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
  new ResizeObserver(() => mapa.resize()).observe($('#mapa'));

  await new Promise<void>((ok) => mapa.on('load', () => ok()));
  // a atribuição compacta começa aberta e tampa o mapa pequeno do passo 3; fica no botão (i)
  $('#mapa').querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  SEQ.forEach((cor, i) => { const p = pilula(cor); mapa.addImage(`p-${i}`, p.img, p.opt); });
  { const p = pilula('#eb6834'); mapa.addImage('p-barato', p.img, p.opt); }
  { const p = pilula('#0b0b0b'); mapa.addImage('p-ink', p.img, p.opt); }

  mapa.addSource('sc', { type: 'geojson', data: mascaraSC() });
  mapa.addLayer({ id: 'sc-mask', type: 'fill', source: 'sc', paint: { 'fill-color': '#eceae4', 'fill-opacity': 0.72 } });
  mapa.addSource('sc-linha', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: SC } } });
  mapa.addLayer({ id: 'sc-line', type: 'line', source: 'sc-linha', paint: { 'line-color': '#0b0b0b', 'line-width': 1.6, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.9, 11, 0] } });

  mapa.addSource('cidades', { type: 'geojson', data: geoCidades() });
  mapa.addLayer({ id: 'cid-dot', type: 'circle', source: 'cidades', paint: { 'circle-radius': 7, 'circle-color': ['get', 'cor'], 'circle-stroke-color': '#0b0b0b', 'circle-stroke-width': 2.2 } });
  mapa.addLayer({
    id: 'cid-pill', type: 'symbol', source: 'cidades',
    layout: {
      'icon-image': 'p-ink', 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 4, 2, 4],
      'text-field': ['format', ['get', 'nome'], { 'text-font': ['literal', FONTE_REG], 'text-color': '#c3c2b7' }, '  ', {}, ['get', 'preco'], { 'text-font': ['literal', FONTE] }],
      'text-font': FONTE, 'text-size': 12.5, 'text-anchor': 'bottom', 'text-offset': [0, -1.05],
      'symbol-sort-key': ['get', 'sort'], 'text-padding': 4,
    },
    paint: { 'text-color': '#ffffff' },
  });

  mapa.addSource('postos', { type: 'geojson', data: geoPostos() });
  mapa.addLayer({ id: 'pos-dot', type: 'circle', source: 'postos', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 7], 'circle-color': ['get', 'cor'], 'circle-stroke-color': '#fcfcfb', 'circle-stroke-width': 2 } });
  mapa.addLayer({
    id: 'pos-pill', type: 'symbol', source: 'postos',
    layout: {
      'icon-image': ['get', 'img'], 'icon-text-fit': 'both', 'icon-text-fit-padding': [1, 3, 1, 3],
      'text-field': ['get', 'preco'], 'text-font': FONTE, 'text-size': 12,
      'text-anchor': 'bottom', 'text-offset': [0, -0.75], 'symbol-sort-key': ['get', 'sort'], 'text-padding': 2,
    },
    paint: { 'text-color': ['get', 'tc'] },
  });
  mapa.addLayer({ id: 'pos-hl', type: 'circle', source: 'postos', filter: ['==', ['get', 'cnpj'], ''], paint: { 'circle-radius': 10, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#0b0b0b', 'circle-stroke-width': 2.5 } });
  mapa.addLayer({ id: 'pos-sel', type: 'circle', source: 'postos', filter: ['==', ['get', 'cnpj'], ''], paint: { 'circle-radius': 9, 'circle-color': '#eb6834', 'circle-stroke-color': '#0b0b0b', 'circle-stroke-width': 3 } });
  mapa.addLayer({
    id: 'pos-sel-nome', type: 'symbol', source: 'postos', filter: ['==', ['get', 'cnpj'], ''],
    layout: {
      'icon-image': 'p-ink', 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 5, 2, 5],
      'text-field': ['concat', ['get', 'nome'], ' · R$ ', ['get', 'preco']], 'text-font': FONTE, 'text-size': 12.5,
      'text-anchor': 'bottom', 'text-offset': [0, -1.1], 'text-allow-overlap': true, 'icon-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  });

  // interação: cursor, dica e clique
  const dica = (e: MapLayerMouseEvent, html: string) => mostrarDica(html, e.originalEvent.clientX, e.originalEvent.clientY);
  for (const id of ['cid-dot', 'cid-pill']) {
    mapa.on('mousemove', id, (e) => {
      mapa.getCanvas().style.cursor = 'pointer';
      const p = e.features![0].properties as { nome: string; preco: string; m: string };
      const c = D.cidades.get(p.m)!;
      dica(e, `<b>${esc(p.nome)}</b><br>R$ ${p.preco} na mediana<br><span class="mut">${c.postos.length} postos · clique para ver</span>`);
    });
    mapa.on('mouseleave', id, () => { mapa.getCanvas().style.cursor = ''; esconderDica(); });
    mapa.on('click', id, (e) => irCidade((e.features![0].properties as { m: string }).m));
  }
  for (const id of ['pos-dot', 'pos-pill']) {
    mapa.on('mousemove', id, (e) => {
      mapa.getCanvas().style.cursor = 'pointer';
      const p = e.features![0].properties as { nome: string; preco: string; aprox: boolean | string };
      dica(e, `<b>${esc(p.nome)}</b><br>R$ ${p.preco}${p.aprox === true || p.aprox === 'true' ? '<br><span class="mut">localização aproximada</span>' : ''}`);
    });
    mapa.on('mouseleave', id, () => { mapa.getCanvas().style.cursor = ''; esconderDica(); });
    mapa.on('click', id, (e) => irPosto((e.features![0].properties as { cnpj: string }).cnpj));
  }
}

function camadas() {
  const passo = passoAtual();
  const vis = (ids: string[], on: boolean) => ids.forEach((id) => mapa.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));
  vis(['cid-dot', 'cid-pill'], passo === 1);
  vis(['pos-dot', 'pos-pill', 'pos-hl', 'pos-sel', 'pos-sel-nome'], passo > 1);
  vis(['sc-mask'], passo === 1);
  const sel = estado.posto ?? '';
  mapa.setFilter('pos-sel', ['==', ['get', 'cnpj'], sel]);
  mapa.setFilter('pos-sel-nome', ['==', ['get', 'cnpj'], sel]);
  mapa.setPaintProperty('pos-dot', 'circle-opacity', sel ? 0.55 : 1);
  mapa.setPaintProperty('pos-pill', 'icon-opacity', sel ? 0.55 : 1);
  mapa.setPaintProperty('pos-pill', 'text-opacity', sel ? 0.6 : 1);
}

function dadosDoMapa() {
  (mapa.getSource('cidades') as GeoJSONSource).setData(geoCidades());
  (mapa.getSource('postos') as GeoJSONSource).setData(geoPostos());
}

const dur = (ms: number) => (reduzir ? 0 : ms);

function camera(animar = true) {
  const c = estado.cidade ? D.cidades.get(estado.cidade) : null;
  const p = estado.posto ? D.postos.get(estado.posto) : null;
  if (p && p.lat != null) {
    mapa.flyTo({ center: [p.lon!, p.lat!], zoom: p.precisao === 'rua' ? 15 : 16, duration: animar ? dur(1400) : 0, essential: true });
  } else if (c?.bounds) {
    const [w, s, e, n] = c.bounds;
    mapa.fitBounds([[w, s], [e, n]], { padding: pad(), maxZoom: 14.5, duration: animar ? dur(1500) : 0, essential: true });
  } else if (c?.lat != null) {
    mapa.flyTo({ center: [c.lon!, c.lat!], zoom: 12.5, duration: animar ? dur(1500) : 0 });
  } else {
    mapa.fitBounds(boundsSC(), { padding: pad(), duration: animar ? dur(1300) : 0 });
  }
}

/* ---------------- interface ---------------- */

const passoAtual = () => (estado.posto ? 3 : estado.cidade ? 2 : 1);

function selFuel(disponiveis?: Set<string>) {
  return `<label class="fld">Combustível<select data-sel="fuel">${COMBUSTIVEIS.map((c) => `<option value="${c.k}" ${c.k === estado.fuel ? 'selected' : ''} ${disponiveis && !disponiveis.has(c.k) ? 'disabled' : ''}>${c.n}</option>`).join('')}</select></label>`;
}
const kpi = (l: string, v: string, d: string) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
const difTxt = (d: number) => (Math.abs(d) < 0.005 ? 'na mediana' : `${d < 0 ? '−' : '+'}${brl(Math.abs(d))}`);

function crumbs() {
  const c = estado.cidade ? D.cidades.get(estado.cidade) : null, p = estado.posto ? D.postos.get(estado.posto) : null;
  const sc = c ? '<button type="button" data-act="estado">Santa Catarina</button>' : '<b>Santa Catarina</b>';
  const cid = c ? `<i>/</i>${p ? `<button type="button" data-act="cidade">${esc(c.nome)}</button>` : `<b>${esc(c.nome)}</b>`}` : '';
  return `${sc}${cid}${p ? `<i>/</i><b>${esc(p.nome)}</b>` : ''}`;
}

function topoEstado() {
  const F = COMB[estado.fuel], lista = cidadesOrdenadas(estado.fuel);
  const todos = precosDe([...D.postos.values()], estado.fuel), r = resumo(todos);
  if (!r || !lista.length) return `<div class="hero"><p class="q">Quanto custa em Santa Catarina?</p><h2>Nenhum posto pesquisado vende ${F.l} em Santa Catarina nesta semana.</h2></div><div class="filters">${selUF()}${selFuel()}</div>`;
  const lo = lista[0], hi = lista.at(-1)!;
  return `<div class="hero"><p class="q">Quanto custa em Santa Catarina?</p>
    <h2>Em Santa Catarina, a ${F.l} sai por ${brl(r.med)} o ${F.u} na mediana. ${esc(lo.c.nome)} tem o preço mais baixo: ${brl(lo.r.med)}.</h2>
    <p class="s">Entre a cidade mais barata e a mais cara, a diferença é de ${brl((hi.r.med - lo.r.med) * F.tanque, 0)} num tanque de ${F.tanque}&nbsp;${F.u === 'm³' ? 'm³' : 'L'}. Escolha uma cidade para ver os postos.</p></div>
    <div class="filters">${selUF()}${selFuel()}</div>
    <div class="kpis">${kpi('Preço mediano, SC', brl(r.med), `${r.n} postos com ${F.l}`)}${kpi('Cidade mais barata', brl(lo.r.med), esc(lo.c.nome))}${kpi('Cidade mais cara', brl(hi.r.med), esc(hi.c.nome))}${kpi('Postos pesquisados', String(D.postos.size), `em ${D.cidades.size} cidades`)}</div>`;
}
const selUF = () => `<label class="fld" title="Outros estados em breve"><span>Estado <small>· outros em breve</small></span><select disabled><option>Santa Catarina</option></select></label>`;

function ladoEstado() {
  const lista = cidadesOrdenadas(estado.fuel), r = resumo(precosDe([...D.postos.values()], estado.fuel));
  const semFuel = [...D.cidades.values()].filter((c) => !lista.some((x) => x.c === c));
  return `<h3 class="sl-h">Cidades de Santa Catarina, da mais barata à mais cara</h3><p class="hint">Clique numa cidade, na lista ou no mapa, para ver os postos.</p>
    <div class="srows">${lista.map(({ c, r: rc }, i) => `<button type="button" class="srow" data-act="ir-cidade" data-m="${esc(c.municipio)}"><b>${i + 1}</b><span>${esc(c.nome)}<small>${c.postos.length} postos</small></span><em>${brl(rc.med)}<small class="${rc.med <= r!.med ? 'dn' : 'up'}">${difTxt(rc.med - r!.med)}</small></em></button>`).join('')}
    ${semFuel.map((c) => `<button type="button" class="srow" data-act="ir-cidade" data-m="${esc(c.municipio)}"><b>–</b><span>${esc(c.nome)}<small>nenhum posto com ${COMB[estado.fuel].l}</small></span><em></em></button>`).join('')}</div>`;
}

function topoCidade(c: Cidade) {
  const F = COMB[estado.fuel], lista = postosOrdenados(c, estado.fuel), r = resumo(lista.map((p) => p.precos[estado.fuel].preco));
  const opts = [...D.cidades.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const selC = `<label class="fld">Cidade<select data-sel="cidade">${opts.map((o) => `<option value="${esc(o.municipio)}" ${o === c ? 'selected' : ''}>${esc(o.nome)}</option>`).join('')}</select></label>`;
  const disp = new Set(c.postos.flatMap((p) => Object.keys(p.precos)));
  if (!r) return `<div class="hero"><p class="q">Quanto dá para economizar pesquisando?</p><h2>Nenhum posto pesquisado em ${esc(c.nome)} vende ${F.l}.</h2></div><div class="filters">${selC}${selFuel(disp)}</div>`;
  const econ = (r.med - r.min) * F.tanque, un = F.u === 'm³' ? 'm³' : 'L';
  return `<div class="hero"><p class="q">Quanto dá para economizar pesquisando?</p>
    <h2>Em ${esc(c.nome)}, o posto mais barato cobra ${brl(r.min)}: ${brl(econ, 0)} a menos que um posto na mediana num tanque de ${F.tanque}&nbsp;${un}.</h2>
    <p class="s">Entre o mais barato e o mais caro, a diferença é de ${brl((r.max - r.min) * F.tanque, 0)} no mesmo tanque. Escolha um posto no mapa para ver de perto.</p></div>
    <div class="filters">${selC}${selFuel(disp)}</div>
    <div class="kpis">${kpi(`Preço mediano, ${esc(c.nome)}`, brl(r.med), `${r.n} postos com ${F.l}`)}${kpi('Posto mais barato', brl(r.min), esc(lista[0].nome))}${kpi('Posto mais caro', brl(r.max), esc(lista.at(-1)!.nome))}${kpi(`Economia num tanque de ${F.tanque}&nbsp;${un}`, brl(econ, 0), 'mais barato contra a mediana')}</div>`;
}

function ladoCidade(c: Cidade) {
  const k = estado.fuel, lista = postosOrdenados(c, k);
  if (!lista.length) return `<p class="hint">Escolha outro combustível para ver os postos de ${esc(c.nome)}.</p>`;
  const med = resumo(lista.map((p) => p.precos[k].preco))!.med;
  const linha = (p: Posto, i: number) => {
    const v = p.precos[k].preco, sem = p.lat == null;
    return `<button type="button" class="srow" data-act="ir-posto" data-cnpj="${p.cnpj}"><b>${i + 1}</b><span>${esc(p.nome)}<small>${esc(p.bairro || p.endereco)}${sem ? ' · sem pino no mapa' : ''}</small></span><em>${brl(v)}<small class="${v <= med ? 'dn' : 'up'}">${difTxt(v - med)}</small></em></button>`;
  };
  return `<h3 class="sl-h">${lista.length > 15 ? 'Os 15 postos mais baratos' : 'Postos, do mais barato ao mais caro'}</h3><p class="hint">Clique num posto, na lista ou no mapa, para dar zoom até ele. Pino sem preço: passe o cursor.</p>
    <div class="srows">${lista.slice(0, 15).map(linha).join('')}</div>`;
}

function topoPosto(c: Cidade, p: Posto) {
  const lista = postosOrdenados(c, estado.fuel), rank = lista.indexOf(p) + 1;
  const disp = new Set(Object.keys(p.precos));
  return `<div class="sthead"><div><p class="q">${rank ? `${rank}º mais barato de ${lista.length} postos em ${esc(c.nome)}` : `Não vende ${COMB[estado.fuel].l}`}</p><h2>${esc(p.nome)}</h2><p class="s">${esc(p.endereco)}${p.bairro ? ` · ${esc(p.bairro)}` : ''} · ${esc(p.bandeira)}</p></div>
    <div class="acts">${selFuel(disp)}<button type="button" class="back" data-act="cidade">← Mapa de ${esc(c.nome)}</button></div></div>`;
}

function frentePosto(c: Cidade, p: Posto) {
  const k = estado.fuel, F = COMB[k], v = p.precos[k]?.preco;
  const meds = Object.fromEntries(COMBUSTIVEIS.map((x) => [x.k, resumo(postosOrdenados(c, x.k).map((q) => q.precos[x.k].preco))?.med ?? null]));
  const P = Object.fromEntries(COMBUSTIVEIS.map((x) => [x.k, p.precos[x.k]?.preco ?? null]));
  const dif = v != null && meds[k] != null ? v - meds[k]! : null;
  const ultima = Object.values(p.precos).map((x) => x.data).sort().at(-1)!;
  return `<div class="ent"><div class="front">${fachada(p, k, P)}</div>
    <div class="fstrip"><div><span>${F.n}</span><b>${v != null ? brl(v) : '–'}</b></div><div><span>Contra a mediana${meds[k] != null ? ` (${brl(meds[k]!)})` : ''}</span><b class="${dif == null || Math.abs(dif) < 0.005 ? '' : dif < 0 ? 'dn' : 'up'}">${dif == null ? '–' : Math.abs(dif) < 0.005 ? 'igual' : (dif < 0 ? '−' : '+') + brl(Math.abs(dif))}</b></div><div><span>Tanque de ${F.tanque}&nbsp;${F.u === 'm³' ? 'm³' : 'L'}</span><b>${v != null ? brl(v * F.tanque) : '–'}</b></div><div><span>Última coleta</span><b>${dataBR(ultima)}</b></div></div>
    <p class="cap">Fachada ilustrativa: todos os postos usam o mesmo desenho, e mudam o nome e os preços. A pesquisa é amostral, e o preço pode ter mudado desde a coleta.</p></div>`;
}

function ladoPosto(c: Cidade, p: Posto) {
  const disp = COMBUSTIVEIS.filter((x) => p.precos[x.k]);
  const k = p.precos[estado.fuel] ? estado.fuel : disp[0].k;
  const P = Object.fromEntries(disp.map((x) => [x.k, p.precos[x.k].preco]));
  const M = Object.fromEntries(disp.map((x) => [x.k, resumo(postosOrdenados(c, x.k).map((q) => q.precos[x.k].preco))!.med]));
  return `<section class="card ent" style="animation-delay:.2s"><div class="card-h"><h4>Quanto vou pagar?</h4><span>preços deste posto</span></div>
    <div class="calc" data-prices='${esc(JSON.stringify(P))}' data-meds='${esc(JSON.stringify(M))}' data-fuel="${k}" data-src="l">
      <div class="chips" role="group" aria-label="Combustível">${disp.map((x) => `<button type="button" class="chip2" data-act="cfuel" data-k="${x.k}" aria-pressed="${x.k === k}">${x.n}<b>${brl(P[x.k])}</b></button>`).join('')}</div>
      <div class="ins"><label class="in2">Quantidade<span class="fieldrow"><input class="in-l" inputmode="decimal" autocomplete="off" value="${COMB[k].tanque}"><span class="un">${COMB[k].u === 'm³' ? 'm³' : 'L'}</span></span></label>
        <label class="in2">ou valor<span class="fieldrow"><input class="in-v" inputmode="decimal" autocomplete="off"><span class="un">R$</span></span></label></div>
      <div class="pres">${(COMB[k].u === 'm³' ? [5, 10, 15] : [20, 30, 50]).map((v) => `<button type="button" data-act="cpre" data-src="l" data-v="${v}">${v} ${COMB[k].u === 'm³' ? 'm³' : 'L'}</button>`).join('')}${[50, 100, 200].map((v) => `<button type="button" data-act="cpre" data-src="v" data-v="${v}">R$ ${v}</button>`).join('')}</div>
      <div class="pump"><div class="rd"><div class="k">TOTAL (R$)</div><div class="rdT"></div></div><p class="sentence"></p></div>
    </div></section>`;
}

function render() {
  const passo = passoAtual();
  const c = estado.cidade ? D.cidades.get(estado.cidade)! : null;
  const p = estado.posto ? D.postos.get(estado.posto)! : null;
  $('#crumbs').innerHTML = crumbs();
  $('#topo').innerHTML = passo === 1 ? topoEstado() : passo === 2 ? topoCidade(c!) : topoPosto(c!, p!);
  $('#side').innerHTML = passo === 1 ? ladoEstado() : passo === 2 ? ladoCidade(c!) : ladoPosto(c!, p!);
  $('#front').innerHTML = passo === 3 ? frentePosto(c!, p!) : '';
  $('#onde').textContent = p ? `${p.bairro ? p.bairro + ', ' : ''}${c!.nome}` : '';
  $('#nota-mapa').textContent = !p ? '' : p.lat == null ? 'Não achamos este endereço no mapa; o mapa mostra a cidade.' : p.precisao === 'rua' ? 'Localização aproximada: achamos a rua, mas não o número.' : '';
  if (passo === 1) {
    const lista = cidadesOrdenadas(estado.fuel);
    $('#cm-top').innerHTML = `<b>Santa Catarina</b><span>${D.cidades.size} cidades pesquisadas</span>`;
    $('#cm-leg').innerHTML = lista.length ? `<span>${brl(lista[0].r.med)}</span><i></i><span>${brl(lista.at(-1)!.r.med)}</span>` : '';
  } else if (c) {
    // conta só os postos que vendem o combustível escolhido, que são os que têm pino
    const vendem = c.postos.filter((q) => precosDe([q], estado.fuel).length);
    const r = resumo(precosDe(c.postos, estado.fuel)), loc = vendem.filter((q) => q.lat != null).length;
    $('#cm-top').innerHTML = `<b>${esc(c.nome)}</b><span>${vendem.length ? `${loc} de ${vendem.length} postos no mapa` : 'nenhum posto com este combustível'}</span>`;
    $('#cm-leg').innerHTML = r ? `<span>${brl(r.min)}</span><i></i><span>${brl(r.max)}</span>` : '';
  }
  $('#palco').dataset.passo = String(passo);
  if (passo === 3) iniciarCalc();
}

/* ---------------- transições ---------------- */

function flip(el: HTMLElement, antes: DOMRect) {
  if (reduzir) return;
  const depois = el.getBoundingClientRect();
  const k = antes.width / depois.width;
  el.animate(
    [
      { transformOrigin: '0 0', transform: `translate(${antes.left - depois.left}px, ${antes.top - depois.top}px) scale(${k})` },
      { transformOrigin: '0 0', transform: 'none' },
    ],
    { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' },
  );
}

function aplicar(opts: { historico?: boolean; animar?: boolean } = {}) {
  const { historico = true, animar = true } = opts;
  const caixa = $('#p-mapa'), antes = caixa.getBoundingClientRect(), passoAntes = Number($('#palco').dataset.passo);
  render();
  dadosDoMapa();
  camadas();
  const passo = passoAtual();
  if (animar && (passo === 3) !== (passoAntes === 3)) flip(caixa, antes);
  camera(animar);
  if (historico) gravarURL();
  esconderDica();
}

function irCidade(m: string) {
  if (!D.cidades.has(m)) return;
  estado.cidade = m;
  estado.posto = null;
  aplicar();
  rolarAte('#crumbs');
}
function irEstado() { estado.cidade = null; estado.posto = null; aplicar(); }
function irPosto(cnpj: string) {
  const p = D.postos.get(cnpj);
  if (!p) return;
  if (estado.posto == null && p.lat != null && !reduzir) {
    // zoom no mapa grande primeiro; a fachada entra quando a câmera chega
    mapa.setFilter('pos-sel', ['==', ['get', 'cnpj'], cnpj]);
    mapa.flyTo({ center: [p.lon!, p.lat!], zoom: 16, duration: 1200, essential: true });
    mapa.once('moveend', () => { estado.posto = cnpj; aplicar(); rolarAte('#crumbs'); });
    return;
  }
  estado.posto = cnpj;
  aplicar();
  rolarAte('#crumbs');
}

function rolarAte(sel: string) {
  const el = $(sel), y = el.getBoundingClientRect().top;
  if (y < 0 || y > innerHeight * 0.6) el.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
}

/* URL: #cidade=Florianopolis&posto=00000000000000&comb=etanol (voltar do navegador funciona) */
function gravarURL() {
  const q = new URLSearchParams();
  if (estado.cidade) q.set('cidade', estado.cidade);
  if (estado.posto) q.set('posto', estado.posto);
  if (estado.fuel !== 'gasolina comum') q.set('comb', estado.fuel);
  const h = q.toString() ? '#' + q.toString() : location.pathname + location.search;
  if (h !== location.hash) history.pushState(null, '', h.startsWith('#') ? h : h);
}
function lerURL() {
  const q = new URLSearchParams(location.hash.slice(1));
  const c = q.get('cidade'), p = q.get('posto'), f = q.get('comb');
  estado.fuel = f && COMB[f] ? f : 'gasolina comum';
  estado.cidade = c && D.cidades.has(c) ? c : null;
  estado.posto = estado.cidade && p && D.postos.get(p)?.municipio === estado.cidade ? p : null;
}

/* ---------------- calculadora ---------------- */

const parseN = (v: string) => { const n = parseFloat(v.replace(',', '.').replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; };
let animCalc = 0;
function calcVer(calc: HTMLElement, l: number, t: number) {
  const P = JSON.parse(calc.dataset.prices!), M = JSON.parse(calc.dataset.meds!), k = calc.dataset.fuel!, F = COMB[k];
  calc.querySelector('.rdT')!.innerHTML = ledSVG(nf(t, 2), 6, '#ffb23d', '#26231e');
  const dif = (M[k] - P[k]) * l, un = F.u === 'm³' ? 'm³' : 'litros';
  calc.querySelector('.sentence')!.innerHTML = l > 0
    ? `Você abastece <b>${nf(l, 2)} ${un}</b> de ${F.l} por <b>${brl(t)}</b>.${Math.abs(dif) >= 0.005 ? ` Num posto na mediana da cidade, o mesmo abastecimento custaria <b>${brl(Math.abs(dif))} ${dif > 0 ? 'a mais' : 'a menos'}</b>.` : ''}`
    : 'Digite os litros ou o valor para ver a conta.';
}
function calcEntrada(calc: HTMLElement, src: 'l' | 'v', animar = false) {
  const P = JSON.parse(calc.dataset.prices!), p = P[calc.dataset.fuel!];
  const il = calc.querySelector<HTMLInputElement>('.in-l')!, iv = calc.querySelector<HTMLInputElement>('.in-v')!;
  calc.dataset.src = src;
  let l: number, t: number;
  if (src === 'l') { l = Math.min(parseN(il.value), 999); t = Math.round(l * p * 100) / 100; iv.value = t ? nf(t, 2) : ''; }
  else { t = Math.min(parseN(iv.value), 9999.99); l = Math.round((t / p) * 100) / 100; il.value = l ? String(+l.toFixed(2)).replace('.', ',') : ''; }
  cancelAnimationFrame(animCalc);
  if (!animar || reduzir) { calcVer(calc, l, t); return; }
  const t0 = performance.now();
  const passo = (agora: number) => {
    const q = Math.min(1, Math.max(0, (agora - t0 - 900) / 1600)), e = 1 - Math.pow(1 - q, 2.2);
    calcVer(calc, l * e, t * e);
    if (q < 1) animCalc = requestAnimationFrame(passo);
  };
  animCalc = requestAnimationFrame(passo);
}
function iniciarCalc() {
  const calc = document.querySelector<HTMLElement>('.calc');
  if (calc) calcEntrada(calc, 'l', true);
}

/* ---------------- dica ---------------- */

const tip = () => $('#tip');
function mostrarDica(html: string, x: number, y: number) {
  const t = tip(); t.innerHTML = html; t.classList.add('on');
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.max(8, x + 16 + w > innerWidth - 8 ? x - w - 16 : x + 16) + 'px';
  t.style.top = Math.max(8, y + 16 + h > innerHeight - 8 ? y - h - 16 : y + 16) + 'px';
}
function esconderDica() { tip().classList.remove('on'); }

/* ---------------- eventos ---------------- */

function ligarEventos() {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'estado') irEstado();
    else if (act === 'cidade') { estado.posto = null; aplicar(); }
    else if (act === 'ir-cidade') irCidade(a.dataset.m!);
    else if (act === 'ir-posto') irPosto(a.dataset.cnpj!);
    else if (act === 'cfuel') {
      const calc = a.closest<HTMLElement>('.calc')!;
      calc.dataset.fuel = a.dataset.k!;
      calc.querySelectorAll('.chip2').forEach((b) => b.setAttribute('aria-pressed', String(b === a)));
      calcEntrada(calc, (calc.dataset.src as 'l' | 'v') || 'l');
    } else if (act === 'cpre') {
      const calc = a.closest<HTMLElement>('.calc')!, src = a.dataset.src as 'l' | 'v';
      calc.querySelector<HTMLInputElement>(src === 'l' ? '.in-l' : '.in-v')!.value = a.dataset.v!;
      calcEntrada(calc, src);
    }
  });
  document.addEventListener('input', (e) => {
    const i = e.target as HTMLInputElement;
    if (!i.matches('.calc input')) return;
    calcEntrada(i.closest<HTMLElement>('.calc')!, i.classList.contains('in-l') ? 'l' : 'v');
  });
  document.addEventListener('change', (e) => {
    const s = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-sel]');
    if (!s) return;
    if (s.dataset.sel === 'fuel') { estado.fuel = s.value; aplicar({ animar: false }); }
    else if (s.dataset.sel === 'cidade') irCidade(s.value);
  });
  // destaque cruzado: lista ↔ mapa
  document.addEventListener('pointerover', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('.srow[data-cnpj]');
    if (mapa?.getLayer('pos-hl')) mapa.setFilter('pos-hl', ['==', ['get', 'cnpj'], r?.dataset.cnpj ?? '']);
  });
  document.addEventListener('keydown', (e) => {
    const alvo = e.target as Element;
    if (e.key !== 'Escape' || (alvo instanceof Element && alvo.matches('input, select'))) return;
    if (estado.posto) { estado.posto = null; aplicar(); } else if (estado.cidade) irEstado();
  });
  addEventListener('popstate', () => { lerURL(); aplicar({ historico: false }); });
}

export async function iniciar() {
  try {
    const [linhas, geo] = await Promise.all([
      json<Linha[]>('data/postos/SC.json'),
      json<GeoMunicipio[]>('data/geo_municipios.json', []),
    ]);
    D = montar(linhas, geo.filter((g) => g.uf === 'SC'));
    lerURL();
    render();
    ligarEventos();
    await criarMapa();
    aplicar({ historico: false, animar: false });
  } catch (erro) {
    $('#topo').innerHTML = `<p class="hint">Não deu para carregar os dados agora. Tente recarregar a página.</p>`;
    console.error(erro);
  }
}
