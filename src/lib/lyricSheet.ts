import { expandSongSections } from './pptTheme';

type Song = { title: string; englishTitle?: string; lyrics: string; englishLyrics?: string };

// Open a printable A4 lyric sheet (all songs flow continuously). The user can
// adjust font size / columns / translation live, then print or save as PDF.
export function openLyricSheet(songs: Song[], deckName: string) {
  const esc = (t: string) => (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = songs.map((s, i) => {
    const exp = expandSongSections(s.lyrics || '', s.englishLyrics || '');
    const cn = exp.lyrics.split('\n');
    const en = exp.english.split('\n').filter((l) => l.trim());
    let ti = 0;
    const lines: string[] = [];
    for (const l of cn) {
      if (!l.trim()) { lines.push('<div class="gap"></div>'); continue; }
      const e = en[ti++] || '';
      lines.push(`<div class="ln"><span class="cn">${esc(l)}</span>${e ? `<span class="en">${esc(e)}</span>` : ''}</div>`);
    }
    return `<section class="song"><h2>${i + 1}. ${esc(s.title || '未命名')}${s.englishTitle ? ` <small>${esc(s.englishTitle)}</small>` : ''}</h2>${lines.join('')}</section>`;
  }).join('');
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>歌词单 — ${esc(deckName || 'Worship')}</title>
<style>
  :root{ --size:16pt; --cols:1; }
  *{box-sizing:border-box}
  body{margin:0;font-family:'Microsoft YaHei','PingFang SC','Heiti SC',sans-serif;color:#111;background:#eceae7}
  .bar{position:sticky;top:0;z-index:5;display:flex;gap:18px;align-items:center;padding:12px 22px;background:#1a1a1a;color:#fff;font-size:13px;flex-wrap:wrap}
  .bar strong{font-size:14px;letter-spacing:.05em}
  .bar label{display:flex;gap:8px;align-items:center;cursor:pointer}
  .bar input[type=range]{accent-color:#10b981}
  .bar select{border-radius:6px;padding:3px 6px}
  .bar button{margin-left:auto;background:#10b981;color:#fff;border:0;border-radius:9px;padding:9px 18px;font-weight:800;cursor:pointer}
  .bar button:hover{background:#059669}
  .page{background:#fff;width:21cm;margin:18px auto;padding:1.5cm 1.5cm;box-shadow:0 3px 16px rgba(0,0,0,.15)}
  .doc{columns:var(--cols);column-gap:1cm}
  .song{break-inside:avoid;margin:0 0 16px}
  .song h2{font-size:calc(var(--size) * 1.22);margin:0 0 6px;border-bottom:2px solid #10b981;padding-bottom:3px}
  .song h2 small{font-weight:500;color:#6b7280;font-size:calc(var(--size) * 0.75)}
  .ln{font-size:var(--size);line-height:1.5;margin:1px 0}
  .ln .en{display:block;font-size:calc(var(--size) * 0.62);color:#555;font-style:italic;line-height:1.25}
  .gap{height:calc(var(--size) * 0.7)}
  @media print{ .bar{display:none} body{background:#fff} .page{box-shadow:none;margin:0;width:auto;padding:0} }
  @page{size:A4;margin:1.4cm}
</style></head>
<body>
<div class="bar">
  <strong>📄 歌词单 · ${songs.length} 首</strong>
  <label>字号 <input id="sz" type="range" min="9" max="30" value="16"><span id="szv">16</span>pt</label>
  <label>栏数 <select id="cols"><option value="1">1 栏</option><option value="2">2 栏</option></select></label>
  <label><input id="tr" type="checkbox" checked> 显示翻译</label>
  <button onclick="window.print()">🖨 打印 / 存为 PDF</button>
</div>
<div class="page"><div class="doc">${blocks}</div></div>
<script>
  var r=document.documentElement,sz=document.getElementById('sz'),szv=document.getElementById('szv');
  sz.oninput=function(){r.style.setProperty('--size',sz.value+'pt');szv.textContent=sz.value;};
  document.getElementById('cols').onchange=function(e){r.style.setProperty('--cols',e.target.value);};
  document.getElementById('tr').onchange=function(e){var d=e.target.checked?'':'none';var ns=document.querySelectorAll('.en');for(var i=0;i<ns.length;i++)ns[i].style.display=d;};
<\/script>
</body></html>`;
  const w = window.open('', '_blank', 'width=900,height=1040');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
