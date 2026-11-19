// Peças de navegador usadas por todas as páginas: base do site, leitura de JSON, dica e abas.

export const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const estreito = () => matchMedia('(max-width: 820px)').matches;
export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

export async function json<T>(caminho: string, padrao?: T): Promise<T> {
  const r = await fetch(BASE + caminho);
  if (!r.ok) {
    if (padrao !== undefined) return padrao;
    throw new Error(`${caminho}: ${r.status}`);
  }
  return r.json();
}

/* dica que segue o cursor */
const tip = () => $('#tip');
export function mostrarDica(html: string, x: number, y: number) {
  const t = tip();
  t.innerHTML = html;
  t.classList.add('on');
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.max(8, x + 16 + w > innerWidth - 8 ? x - w - 16 : x + 16) + 'px';
  t.style.top = Math.max(8, y + 16 + h > innerHeight - 8 ? y - h - 16 : y + 16) + 'px';
}
export function esconderDica() {
  tip().classList.remove('on');
}

/** O combustível e o estado escolhidos acompanham a troca de aba (#uf=MG&comb=etanol).
 *  Cada tela informa só o que ela tem; o resto vem do endereço com que ela foi aberta. */
const contexto = (() => {
  const q = new URLSearchParams(location.hash.slice(1));
  return { comb: q.get('comb') ?? 'gasolina comum', uf: (q.get('uf') ?? 'SC').toUpperCase() };
})();
export function abasCom(p: { comb?: string; uf?: string }) {
  Object.assign(contexto, p);
  const q = new URLSearchParams();
  if (contexto.uf !== 'SC') q.set('uf', contexto.uf);
  if (contexto.comb !== 'gasolina comum') q.set('comb', contexto.comb);
  document.querySelectorAll<HTMLAnchorElement>('.f-nav a[data-aba]').forEach((a) => {
    const u = new URL(a.href);
    u.hash = q.toString();
    a.href = u.toString();
  });
}
export const abasComCombustivel = (comb: string) => abasCom({ comb });
