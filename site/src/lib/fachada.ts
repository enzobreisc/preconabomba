// @ts-nocheck -- o desenho é uma string SVG grande; a tipagem fica nas assinaturas exportadas.
// Fachada ilustrada do posto e mostrador de sete segmentos (portados do artifact de telas).
import { COMB, brl, esc, nf } from './dados';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const T=1.15;
const HP=(x0: number,x1: number,y: number)=>`${x0},${y} ${x0+T/2},${y-T/2} ${x1-T/2},${y-T/2} ${x1},${y} ${x1-T/2},${y+T/2} ${x0+T/2},${y+T/2}`;
const VP=(y0: number,y1: number,x: number)=>`${x},${y0} ${x+T/2},${y0+T/2} ${x+T/2},${y1-T/2} ${x},${y1} ${x-T/2},${y1-T/2} ${x-T/2},${y0+T/2}`;
const SEGP: Record<string, string> = {a:HP(.95,5.05,.6),b:VP(.75,4.85,5.4),c:VP(5.15,9.25,5.4),d:HP(.95,5.05,9.4),e:VP(5.15,9.25,.6),f:VP(.75,4.85,.6),g:HP(.95,5.05,5)};
const DIG: Record<string, string> = {'-':'g',0:'abcdef',1:'bc',2:'abdeg',3:'abcdg',4:'bcfg',5:'acdfg',6:'acdefg',7:'abc',8:'abcdefg',9:'abcdfg'};
export function led(str: string, x: number, y: number, k: number, on: string, off: string) {
  let cx=0,o='';
  for(const ch of str){
    if(ch===','||ch==='.'){o+=`<circle cx="${cx+1}" cy="9.4" r=".78" fill="${on}"/>`;cx+=3;continue}
    const lit=DIG[ch]||'';
    for(const s in SEGP)o+=`<polygon points="${SEGP[s]}" transform="translate(${cx} 0)" fill="${lit.includes(s)?on:off}"/>`;
    cx+=7.2;
  }
  return{svg:`<g transform="translate(${x} ${y}) scale(${k})">${o}</g>`,w:cx*k,u:cx};
}
export function ledSVG(str: string, cells: number, on: string, off: string) {
  const dig=str.replace(/[,.]/g,'').length, text=' '.repeat(Math.max(0,cells-dig))+str;
  const r=led(text,0,0,1,on,off);
  return `<svg viewBox="0 0 ${r.u-1.2} 10" role="img" aria-label="${esc(str)}" class="lsvg">${r.svg}</svg>`;
}

export function fachada(st: { nome: string; bandeira: string }, f: string, P: Record<string, number | null>): string {
  const on='#ffb23d',off='#2b2824';
  // Placa com 4 linhas: as três gasolinas/etanol e o diesel S10, ou o combustível escolhido no lugar dele.
  const base=['gasolina comum','gasolina aditivada','etanol','diesel s10'];
  if(!base.includes(f))base[3]=f;
  const FR=base.map(k=>[k,COMB[k].tot,COMB[k].cod]);
  const txt=(k:string)=>P[k]!=null?nf(P[k] as number,2):'-,--';
  let tot='',pumps='',call='';
  FR.forEach(([k,l,c],i)=>{
    const y=102+i*56,sel=k===f,r=led(txt(k),120,y+12,2.8,on,off);
    tot+=`${sel?`<rect x="30" y="${y-4}" width="162" height="52" rx="5" fill="#2c2924"/><rect x="30" y="${y-4}" width="4" height="52" rx="2" fill="#eb6834"/>`:''}<text x="42" y="${y+28}" font-size="11.5" font-weight="700" fill="${sel?'#fff':'#c7c4ba'}">${l}</text><g class="${sel?'ledg':''}" opacity="${sel?1:.82}">${r.svg}</g>${i<3?`<line x1="32" x2="190" y1="${y+48}" y2="${y+48}" stroke="#3a3832" stroke-width=".8"/>`:''}`;
    const px=224+i*66,d=led(txt(k),px+9.5,238,1.4,on,off);
    pumps+=`<g class="fv-pump" style="animation-delay:${.35+i*.12}s"><ellipse cx="${px+27}" cy="351" rx="40" ry="4.5" fill="#000" opacity=".18"/>
      <rect x="${px}" y="204" width="54" height="140" rx="7" fill="url(#fpump)" stroke="#b9b7ae"/><rect x="${px}" y="204" width="54" height="22" rx="7" fill="#2b2d31"/><rect x="${px+6}" y="211" width="42" height="3" rx="1.5" fill="#fffbe8" opacity=".55"/>
      <rect x="${px+7}" y="231" width="40" height="32" rx="3" fill="#0e0e0d" stroke="#3a3d42"/><g class="${sel?'ledg':''}" style="animation-delay:1.1s">${d.svg}</g>
      <rect x="${px+7}" y="268" width="40" height="18" rx="3" fill="#dcdad3"/><text x="${px+27}" y="281" text-anchor="middle" font-size="11" font-weight="700" fill="#0b0b0b">${c}</text>
      <rect x="${px+8}" y="292" width="38" height="26" rx="3" fill="#cfcdc5"/><g fill="#8e8c84"><rect x="${px+11}" y="296" width="7" height="5" rx="1"/><rect x="${px+23}" y="296" width="7" height="5" rx="1"/><rect x="${px+35}" y="296" width="7" height="5" rx="1"/><rect x="${px+11}" y="306" width="7" height="5" rx="1"/><rect x="${px+23}" y="306" width="7" height="5" rx="1"/><rect x="${px+35}" y="306" width="7" height="5" rx="1"/></g>
      <rect x="${px+50}" y="262" width="8" height="34" rx="3" fill="#2b2d31"/><path d="M${px+57} 276C${px+80} 280 ${px+74} 328 ${px+62} 320" stroke="#17181a" stroke-width="4.5" fill="none" stroke-linecap="round"/></g>`;
    if(sel){const t=`${COMB[f].n} · ${P[k]!=null?brl(P[k] as number):'não vende'}`,w=t.length*7.6+26,cx=clamp(px+27,208+w/2,516-w/2);
      call=`<path class="fv-line" pathLength="1" d="M198 ${y+22}C214 ${y+22} 214 139 ${cx-w/2} 139" fill="none" stroke="#eb6834" stroke-width="2" stroke-dasharray="1" stroke-linecap="round"/>
      <rect x="${px-4}" y="200" width="62" height="148" rx="9" fill="none" stroke="#eb6834" stroke-width="3" class="fv-pop"/>
      <g class="fv-pop"><line x1="${px+27}" x2="${px+27}" y1="159" y2="198" stroke="#eb6834" stroke-width="2" stroke-dasharray="3 3"/><rect x="${cx-w/2}" y="126" width="${w}" height="26" rx="7" fill="#0b0b0b"/><path d="M${px+21} 152h12l-6 7z" fill="#0b0b0b"/><text x="${cx}" y="143.5" text-anchor="middle" font-size="13" font-weight="650" fill="#fff">${t}</text></g>`}
  });
  const nm0=st.nome.toUpperCase(),nm=nm0.length>22?nm0.slice(0,21)+'…':nm0,fs=nm.length>17?11.5:nm.length>13?14:17;
  return `<svg viewBox="0 -70 720 520" role="img" aria-label="Fachada ilustrada do posto com placa de preços, cobertura, bombas e loja de conveniência">
  <defs><linearGradient id="fsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9cbe6"/><stop offset="1" stop-color="#eaf1f1"/></linearGradient>
  <linearGradient id="froof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdfcfa"/><stop offset="1" stop-color="#d9d8d1"/></linearGradient>
  <linearGradient id="fpump" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ecebe6"/><stop offset="1" stop-color="#cfcdc5"/></linearGradient>
  <linearGradient id="fcol" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f3f2ee"/><stop offset="1" stop-color="#c9c7bf"/></linearGradient>
  <linearGradient id="fglass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9d4e6"/><stop offset="1" stop-color="#8fb0c9"/></linearGradient>
  <linearGradient id="fasf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#54585d"/><stop offset="1" stop-color="#43474c"/></linearGradient>
  <pattern id="fhaz" width="14" height="10" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)"><rect width="7" height="10" fill="#f0c33a"/><rect x="7" width="7" height="10" fill="#1b1c1e"/></pattern></defs>
  <rect y="-70" width="720" height="440" fill="url(#fsky)"/>
  <g fill="#fff" opacity=".8"><ellipse cx="120" cy="40" rx="60" ry="9"/><ellipse cx="160" cy="32" rx="34" ry="8"/><ellipse cx="520" cy="26" rx="70" ry="9"/></g>
  <g fill="#c9d2d6"><rect x="200" y="262" width="52" height="84"/><rect x="258" y="278" width="38" height="68"/><rect x="590" y="250" width="70" height="96"/><rect x="662" y="270" width="58" height="76"/></g>
  <g fill="#b3bdc2" opacity=".7"><rect x="206" y="270" width="6" height="8"/><rect x="218" y="270" width="6" height="8"/><rect x="230" y="270" width="6" height="8"/><rect x="206" y="286" width="6" height="8"/><rect x="230" y="286" width="6" height="8"/><rect x="598" y="258" width="6" height="8"/><rect x="612" y="258" width="6" height="8"/><rect x="626" y="258" width="6" height="8"/><rect x="598" y="276" width="6" height="8"/><rect x="626" y="276" width="6" height="8"/></g>
  <path d="M0 300C100 278 210 292 330 284S560 270 720 292V348H0Z" fill="#b2c2b3"/><g fill="#86a088"><circle cx="212" cy="318" r="22"/><circle cx="246" cy="326" r="16"/><circle cx="690" cy="306" r="24"/></g><rect x="205" y="330" width="5" height="22" fill="#6b5a48"/><rect x="687" y="324" width="6" height="28" fill="#6b5a48"/>
  <rect y="340" width="720" height="24" fill="#c9c8c0"/><rect y="364" width="720" height="28" fill="#d7d6cf"/><g stroke="#bdbcb4" stroke-width="1"><path d="M70 364v28M190 364v28M310 364v28M430 364v28M550 364v28M670 364v28"/></g>
  <rect y="392" width="720" height="7" fill="#e6e5df"/><rect y="399" width="720" height="51" fill="url(#fasf)"/><line x1="0" x2="720" y1="428" y2="428" stroke="#fff" stroke-opacity=".75" stroke-width="3" stroke-dasharray="44 30"/>
  <g class="fv-can" style="animation-delay:.1s"><rect x="520" y="146" width="200" height="198" fill="#e6e4dd"/><rect x="514" y="136" width="206" height="12" fill="#c9c7bf"/><rect x="514" y="136" width="206" height="3" fill="#dcdad3"/>
    <rect x="544" y="154" width="150" height="22" rx="3" fill="#0b0b0b"/><text x="619" y="169.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" letter-spacing="2.2">CONVENIÊNCIA</text>
    <rect x="534" y="196" width="76" height="110" fill="url(#fglass)" stroke="#9a988f" stroke-width="2"/><g stroke="#7d9bb2" stroke-width="2"><path d="M534 226H610M534 256H610M534 286H610"/></g>
    <g><rect x="540" y="204" width="14" height="18" rx="2" fill="#eb6834"/><rect x="558" y="206" width="12" height="16" rx="2" fill="#2a78d6"/><rect x="576" y="204" width="14" height="18" rx="2" fill="#f0c33a"/><rect x="594" y="206" width="10" height="16" rx="2" fill="#cde2fb"/><rect x="541" y="234" width="16" height="18" rx="2" fill="#2a78d6"/><rect x="562" y="236" width="12" height="16" rx="2" fill="#eb6834"/><rect x="580" y="234" width="18" height="18" rx="2" fill="#fcfcfb"/></g>
    <path d="M534 306L568 196H592L558 306Z" fill="#fff" opacity=".2"/>
    <rect x="626" y="206" width="70" height="134" fill="url(#fglass)" stroke="#9a988f" stroke-width="2"/><line x1="661" x2="661" y1="206" y2="340" stroke="#9a988f" stroke-width="2"/><rect x="654" y="262" width="3" height="22" rx="1.5" fill="#52514e"/><rect x="665" y="262" width="3" height="22" rx="1.5" fill="#52514e"/>
    <rect x="626" y="196" width="70" height="10" fill="#cfcdc5"/><path d="M626 340L660 206H684L650 340Z" fill="#fff" opacity=".18"/></g>
  <g class="fv-can"><rect x="190" y="54" width="530" height="38" rx="3" fill="url(#froof)"/><rect x="190" y="80" width="530" height="4" fill="#2a78d6"/><rect x="190" y="54" width="530" height="2" fill="#fff"/><path d="M190 92H720L700 112H210Z" fill="#cbcac3"/>
    <g fill="#fffbe8"><rect x="250" y="100" width="46" height="4" rx="2"/><rect x="350" y="100" width="46" height="4" rx="2"/><rect x="450" y="100" width="46" height="4" rx="2"/><rect x="560" y="100" width="46" height="4" rx="2"/></g>
    <rect x="206" y="112" width="24" height="230" fill="url(#fcol)"/><rect x="200" y="336" width="36" height="9" fill="#bdbbb3"/><rect x="204" y="288" width="28" height="3" fill="#2a78d6"/>
    <rect x="486" y="112" width="24" height="230" fill="url(#fcol)"/><rect x="480" y="336" width="36" height="9" fill="#bdbbb3"/></g>
  <rect x="214" y="338" width="276" height="12" fill="#e5e3dc"/><rect x="214" y="338" width="276" height="3" fill="url(#fhaz)"/>
  ${pumps}
  <g class="fv-pump" style="animation-delay:.2s"><rect x="498" y="318" width="8" height="30" rx="2" fill="#f0c33a"/><rect x="498" y="328" width="8" height="5" fill="#222"/><rect x="196" y="318" width="8" height="30" rx="2" fill="#f0c33a"/><rect x="196" y="328" width="8" height="5" fill="#222"/></g>
  <g class="fv-car"><g transform="translate(440 388)"><ellipse cx="82" cy="66" rx="92" ry="6" fill="#000" opacity=".28"/><rect x="6" y="26" width="152" height="42" rx="13" fill="#d7d9dc"/><path d="M28 26L44 2H122L138 26Z" fill="#c3c6ca"/><path d="M36 24L48 6H118L130 24Z" fill="#35566f"/><path d="M82 6V24" stroke="#c3c6ca" stroke-width="3"/><path d="M40 22L50 8H70L60 22Z" fill="#fff" opacity=".18"/><rect x="0" y="34" width="164" height="10" rx="5" fill="#bcbfc3"/><ellipse cx="32" cy="43" rx="14" ry="7" fill="#fff7d6"/><ellipse cx="132" cy="43" rx="14" ry="7" fill="#fff7d6"/><rect x="56" y="45" width="52" height="12" rx="2" fill="#8f959b"/><rect x="62" y="52" width="40" height="11" rx="1.5" fill="#f6f6f6" stroke="#8a8a8a" stroke-width=".6"/><rect x="62" y="52" width="40" height="3" fill="#2a78d6"/><text x="82" y="61" text-anchor="middle" font-size="7.5" font-weight="700" fill="#1b1c1e">PNB1D23</text><rect x="12" y="62" width="24" height="8" rx="3" fill="#1b1c1e"/><rect x="128" y="62" width="24" height="8" rx="3" fill="#1b1c1e"/><rect x="-4" y="24" width="12" height="6" rx="3" fill="#bcbfc3"/><rect x="156" y="24" width="12" height="6" rx="3" fill="#bcbfc3"/></g></g>
  <g class="fv-tot"><ellipse cx="111" cy="360" rx="70" ry="6" fill="#000" opacity=".16"/><rect x="100" y="324" width="22" height="34" fill="#3a3c40"/><rect x="72" y="354" width="78" height="8" rx="2" fill="#2b2d31"/>
    <rect x="198" y="30" width="6" height="296" rx="2" fill="#0b0b0b" opacity=".35"/><rect x="24" y="28" width="174" height="298" rx="11" fill="#1b1c1e"/><rect x="24" y="28" width="174" height="298" rx="11" fill="none" stroke="#3a3c40" stroke-width="2"/>
    <path d="M24 88V39a11 11 0 0 1 11-11H187a11 11 0 0 1 11 11V88Z" fill="#f6f5f1"/><text x="111" y="48" text-anchor="middle" font-size="10.5" font-weight="700" fill="#52514e" letter-spacing="1.2">${esc(st.bandeira.toUpperCase())}</text><text x="111" y="74" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#0b0b0b">${esc(nm)}</text><rect x="24" y="87" width="174" height="3" fill="#2a78d6"/>
    ${tot}<text x="111" y="318" text-anchor="middle" font-size="9.5" font-weight="600" fill="#a9a79f" letter-spacing=".8">R$ POR ${COMB[f].u==='m³'?'M³':'LITRO'}</text></g>
  ${call}</svg>`;
}
