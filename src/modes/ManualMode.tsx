import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveSlideColors,
  paginateLyrics,
  expandSongSections,
  previewShadow,
  type ShadowLevel,
} from '../lib/pptTheme';
import { generateDeck, downloadBlob, toPinyin, type BgOption, type SongInput, type DeckSettings } from '../lib/pptGenerator';
import { BACKGROUND_OPTIONS, pollinationsBg } from '../lib/backgrounds';
import { saveToLibrary, searchLibraryMulti, type LibrarySong } from '../lib/songLibrary';

const LS_KEY = 'worship_ppt_maker_v1';

interface PersistShape {
  songs: SongInput[];
  settings: DeckSettings;
  deckName: string;
  customBgs: BgOption[];
}

const DEFAULT_SETTINGS: DeckSettings = {
  selectedBg: BACKGROUND_OPTIONS[0],
  slideSize: '16:9',
  linesPerSlide: 2,
  lyricColor: '#FFFFFF',
  translationColor: '#A7F3D0',
  lyricFontSize: 48,
  translationFontSize: 24,
  enableShadow: true,
  shadowLevel: 'medium',
  enablePinyin: false,
  showSongTitle: true,
  unifyFontSize: false,
  unifyBackground: true,
};

const newSong = (over: Partial<SongInput> = {}): SongInput => ({
  id: crypto.randomUUID(),
  title: '',
  englishTitle: '',
  lyrics: '',
  englishLyrics: '',
  customBg: null,
  ...over,
});

const SAMPLE_SONG = newSong({
  title: '奇异恩典',
  englishTitle: 'Amazing Grace',
  lyrics: '奇异恩典 何等甘甜\n我罪已得赦免\n前我失丧 今被寻回\n瞎眼今得看见',
  englishLyrics: "Amazing grace, how sweet the sound\nThat saved a wretch like me\nI once was lost, but now am found\nWas blind but now I see",
});

function loadState(): PersistShape {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as PersistShape;
      if (p.songs?.length) return { ...p, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
    }
  } catch {}
  return { songs: [SAMPLE_SONG], settings: DEFAULT_SETTINGS, deckName: 'Sunday Worship', customBgs: [] };
}

export default function ManualMode({ modeToggle }: { modeToggle: React.ReactNode }) {
  const initial = useMemo(loadState, []);
  const [songs, setSongs] = useState<SongInput[]>(initial.songs);
  const [activeId, setActiveId] = useState<string>(initial.songs[0].id);
  const [settings, setSettings] = useState<DeckSettings>(initial.settings);
  const [deckName, setDeckName] = useState(initial.deckName);
  const [customBgs, setCustomBgs] = useState<BgOption[]>(initial.customBgs || []);

  const [status, setStatus] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const activeSong = songs.find((s) => s.id === activeId) || songs[0];
  const allBgs = [...BACKGROUND_OPTIONS, ...customBgs];

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ songs, settings, deckName, customBgs }));
    } catch {}
  }, [songs, settings, deckName, customBgs]);

  const flash = (msg: string, ms = 2600) => {
    setStatus(msg);
    window.clearTimeout((flash as any)._t);
    (flash as any)._t = window.setTimeout(() => setStatus(null), ms);
  };

  const set = <K extends keyof DeckSettings>(k: K, v: DeckSettings[K]) => setSettings((p) => ({ ...p, [k]: v }));
  const patchSong = (id: string, patch: Partial<SongInput>) => setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addSong = () => {
    const s = newSong();
    setSongs((prev) => [...prev, s]);
    setActiveId(s.id);
  };

  // Search the song library and add a chosen song to the setlist.
  const [songQuery, setSongQuery] = useState('');
  const songResults = useMemo(() => searchLibraryMulti(songQuery), [songQuery]);
  const addFromLibrary = (e: LibrarySong) => {
    const s = newSong({ title: e.title, englishTitle: e.englishTitle || '', lyrics: e.lyrics || '', englishLyrics: e.englishLyrics || '' });
    setSongs((prev) => [...prev, s]);
    setActiveId(s.id);
    setSongQuery('');
  };

  const removeSong = (id: string) => {
    setSongs((prev) => {
      const next = prev.filter((s) => s.id !== id);
      const safe = next.length ? next : [newSong()];
      if (id === activeId) setActiveId(safe[0].id);
      return safe;
    });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const bg: BgOption = { id: `up-${Date.now()}`, label: '自定义图片', url: reader.result as string };
      setCustomBgs((p) => [...p, bg]);
      set('selectedBg', bg);
      flash('✅ 背景已上传');
    };
    reader.readAsDataURL(file);
  };

  const handleAiGen = () => {
    setAiBusy(true);
    const url = pollinationsBg(aiPrompt.trim() || 'sacred holy light, ethereal atmosphere');
    setTimeout(() => {
      const bg: BgOption = { id: `ai-${Date.now()}`, label: aiPrompt ? `AI: ${aiPrompt.slice(0, 8)}…` : 'AI 背景', url, isAiResult: true };
      setCustomBgs((p) => [...p, bg]);
      set('selectedBg', bg);
      setAiBusy(false);
      setAiOpen(false);
      setAiPrompt('');
      flash('✨ AI 背景已生成');
    }, 1800);
  };

  const handleGenerate = async () => {
    const valid = songs.filter((s) => s.title.trim() || s.lyrics.trim());
    if (!valid.length) {
      flash('❌ 请先输入歌名或歌词');
      return;
    }
    setIsGenerating(true);
    const today = new Date().toISOString().split('T')[0];
    const fileName = `Worship_${deckName || 'Setlist'}_${today}.pptx`;
    flash(`⏳ 正在生成 ${fileName}…`, 60000);
    try {
      const { blob, bgEmbedFailed } = await generateDeck(valid, settings);
      downloadBlob(blob, fileName);
      // Feed the local "database" — including the chosen background image.
      valid.forEach((s) =>
        saveToLibrary({
          title: s.title, englishTitle: s.englishTitle, lyrics: s.lyrics, englishLyrics: s.englishLyrics,
          bg: settings.unifyBackground ? settings.selectedBg : s.customBg || settings.selectedBg,
        }),
      );
      flash(bgEmbedFailed ? '⚠️ 部分背景图无法加载，已用纯色代替（文件已导出）' : `✅ 已下载 ${fileName}`, 4000);
    } catch (err) {
      console.error('Generate failed', err);
      flash('❌ 生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const previewSlides = useMemo(() => {
    if (!activeSong) return [];
    const bg = settings.unifyBackground ? settings.selectedBg : activeSong.customBg || settings.selectedBg;
    const pc = resolveSlideColors(bg, settings.lyricColor, settings.translationColor);
    const shadowCss = settings.enableShadow ? previewShadow(settings.shadowLevel) : 'none';
    const exp = expandSongSections(activeSong.lyrics || '', activeSong.englishLyrics || '');
    const lyricPages = paginateLyrics(exp.lyrics, exp.english, settings.linesPerSlide);
    const slides: { type: 'cover' | 'lyric'; title?: string; sub?: string; lines?: { cn: string; en: string }[] }[] = [];
    if (settings.showSongTitle) slides.push({ type: 'cover', title: activeSong.title, sub: activeSong.englishTitle });
    lyricPages.forEach((lines) => slides.push({ type: 'lyric', lines }));
    return slides.map((sl) => ({ ...sl, bg, pc, shadowCss }));
  }, [activeSong, settings]);

  const bgStyle = (bg: BgOption): React.CSSProperties =>
    bg?.url ? { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: `#${bg?.color || '064E3B'}` };

  // Font size in the preview, expressed in container-query-width units so it
  // scales with the slide and mirrors the .pptx exactly. A point size of P on a
  // 10"-wide design space is P/720 of the slide width = (P/7.2)cqw.
  const cqw = (pt: number) => `${(pt / 7.2).toFixed(2)}cqw`;

  // Open a printable A4 lyric sheet (all songs flow continuously). The user can
  // adjust the font size / columns live, then print or save as PDF.
  const openLyricSheet = () => {
    const valid = songs.filter((s) => s.title.trim() || s.lyrics.trim());
    if (!valid.length) { flash('❌ 请先输入歌名或歌词'); return; }
    const esc = (t: string) => (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const blocks = valid.map((s, i) => {
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
  <strong>📄 歌词单 · ${valid.length} 首</strong>
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
    if (!w) { flash('❌ 请允许弹出窗口后重试'); return; }
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#F4F1EE]/85 backdrop-blur-xl border-b border-[#E5E0DA]/70">
        <div className="max-w-[1500px] mx-auto px-6 lg:px-10 h-20 flex items-center justify-between gap-4">
          {modeToggle}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 bg-white rounded-2xl border border-[#E5E0DA]/60 px-4 h-12 shadow-sm">
              <span className="material-symbols-outlined text-outline/30 text-[18px]">edit_document</span>
              <input value={deckName} onChange={(e) => setDeckName(e.target.value)} placeholder="文件名" className="bg-transparent outline-none text-xs font-bold w-36" />
            </div>
            <button onClick={openLyricSheet} className="h-12 px-4 rounded-2xl bg-white border border-[#E5E0DA]/60 text-[11px] font-black uppercase tracking-widest hover:border-emerald-400 transition-all shadow-sm flex items-center gap-2" title="把歌词排成 A4 歌词单，可打印或存 PDF">
              <span className="material-symbols-outlined text-lg">print</span>
              <span className="hidden sm:inline">歌词单</span>
            </button>
            <button onClick={handleGenerate} disabled={isGenerating} className="h-12 px-6 rounded-2xl bg-black text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-black/10 flex items-center gap-2 disabled:opacity-50">
              <span className={`material-symbols-outlined text-lg ${isGenerating ? 'animate-spin' : ''}`}>{isGenerating ? 'progress_activity' : 'download'}</span>
              {isGenerating ? '生成中' : '生成 PPT'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 lg:px-10 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-4 space-y-5">
          <div className="bg-white rounded-3xl border border-[#E5E0DA]/50 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3 px-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-outline/50">歌单 · {songs.length} 首</h2>
              <button onClick={addSong} className="text-emerald-600 hover:text-emerald-700 flex items-center gap-1 text-[11px] font-black uppercase tracking-wider">
                <span className="material-symbols-outlined text-[18px]">add</span>空白加歌
              </button>
            </div>
            <div className="relative mb-3">
              <div className="flex items-center gap-2 bg-[#F9F7F5] rounded-xl border border-[#E5E0DA]/60 px-3 h-10 focus-within:border-emerald-500">
                <span className="material-symbols-outlined text-outline/30 text-[18px]">search</span>
                <input value={songQuery} onChange={(e) => setSongQuery(e.target.value)} placeholder="从歌库搜歌加进来…" className="flex-1 bg-transparent outline-none text-sm font-semibold" />
                {songQuery && <button onClick={() => setSongQuery('')} className="material-symbols-outlined text-outline/40 text-[18px] hover:text-[#2C2C2C]">close</button>}
              </div>
              {songQuery && (
                <div className="absolute z-20 left-0 right-0 mt-1.5 bg-white rounded-xl border border-[#E5E0DA]/70 shadow-xl max-h-64 overflow-y-auto no-scrollbar">
                  {songResults.length === 0 && <div className="px-3 py-3 text-[12px] text-outline/40 font-semibold">歌库没有匹配的歌</div>}
                  {songResults.map((r) => (
                    <button key={r.id} onClick={() => addFromLibrary(r)} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-emerald-50 text-left transition-colors">
                      <span className="material-symbols-outlined text-emerald-500 text-[18px]">add_circle</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-[#2C2C2C] truncate">{r.title || '未命名'}</span>
                        {r.englishTitle && <span className="block text-[11px] text-outline/40 font-medium truncate">{r.englishTitle}</span>}
                      </span>
                      {!(r.lyrics || '').trim() && <span className="text-[9px] font-black uppercase text-amber-600 shrink-0">无词</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
              {songs.map((s, i) => (
                <div key={s.id} onClick={() => setActiveId(s.id)} className={`group flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all ${s.id === activeId ? 'bg-emerald-600 text-white shadow-md' : 'hover:bg-[#F9F7F5] text-[#2C2C2C]'}`}>
                  <span className={`text-[10px] font-black w-5 ${s.id === activeId ? 'text-white/60' : 'text-outline/30'}`}>{i + 1}</span>
                  <span className="flex-1 text-sm font-bold truncate">{s.title || '未命名歌曲'}</span>
                  {songs.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); removeSong(s.id); }} className={`material-symbols-outlined text-[16px] opacity-0 group-hover:opacity-100 transition-opacity ${s.id === activeId ? 'text-white/80' : 'text-red-400'}`}>delete</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-[#E5E0DA]/50 p-5 shadow-sm space-y-4">
            <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-outline/50 px-1">歌曲内容</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="歌名"><input value={activeSong.title} onChange={(e) => patchSong(activeSong.id, { title: e.target.value })} placeholder="奇异恩典" className="ed-input" /></Field>
              <Field label="英文名 / 副标题"><input value={activeSong.englishTitle} onChange={(e) => patchSong(activeSong.id, { englishTitle: e.target.value })} placeholder="Amazing Grace" className="ed-input" /></Field>
            </div>
            <Field label="歌词（每行一句，空行 = 换页）"><textarea value={activeSong.lyrics} onChange={(e) => patchSong(activeSong.id, { lyrics: e.target.value })} rows={7} placeholder={'奇异恩典 何等甘甜\n我罪已得赦免'} className="ed-input resize-none leading-relaxed" /></Field>
            <Field label="翻译 / 对照歌词（按行对应，可留空）"><textarea value={activeSong.englishLyrics} onChange={(e) => patchSong(activeSong.id, { englishLyrics: e.target.value })} rows={5} placeholder={'Amazing grace how sweet the sound'} className="ed-input resize-none leading-relaxed" /></Field>
            <p className="text-[10px] text-outline/40 px-1 leading-relaxed">💡 提示：用 <code className="bg-[#F9F7F5] px-1 rounded">[副歌]</code> 标记段落，重复时只写一次标记即可自动展开。</p>
          </div>
        </section>

        <section className="lg:col-span-5 space-y-3">
          <div className="bg-[#1A1A1A] rounded-3xl overflow-hidden shadow-xl">
            <div className="px-5 h-12 flex items-center justify-between border-b border-white/10">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">实时预览</span>
              <span className="text-[10px] font-bold text-white/40">{previewSlides.length} 页 · {activeSong.title || '未命名'}</span>
            </div>
            <div className="p-4 max-h-[70vh] overflow-y-auto no-scrollbar space-y-3">
              {previewSlides.map((sl, idx) => (
                <div key={idx} className="relative rounded-xl overflow-hidden flex items-center justify-center text-center p-6" style={{ ...bgStyle(sl.bg), aspectRatio: '16/9', containerType: 'inline-size' }}>
                  {sl.bg?.url && <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/40" />}
                  <div className="relative z-10 w-full space-y-1.5">
                    {sl.type === 'cover' ? (
                      <>
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: sl.pc.lc, opacity: 0.55 }}>SLIDE {idx + 1}</p>
                        <h2 className="font-serif font-black leading-tight" style={{ fontSize: cqw(48), color: sl.pc.lc, textShadow: sl.shadowCss }}>{sl.title || '未命名'}</h2>
                        {sl.sub && <p className="font-medium" style={{ fontSize: cqw(24), color: sl.pc.tc, textShadow: sl.shadowCss }}>{sl.sub}</p>}
                      </>
                    ) : (
                      <>
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/25">SLIDE {idx + 1}</p>
                        {(sl.lines || []).map((ln, j) => (
                          <div key={j}>
                            {settings.enablePinyin && toPinyin(ln.cn) && <p style={{ fontSize: cqw(settings.lyricFontSize * 0.45), color: sl.pc.lc, textShadow: sl.shadowCss }}>{toPinyin(ln.cn)}</p>}
                            {ln.cn && <p className="font-serif font-black leading-snug" style={{ fontSize: cqw(settings.lyricFontSize), color: sl.pc.lc, textShadow: sl.shadowCss }}>{ln.cn}</p>}
                            {ln.en && <p className="italic leading-snug" style={{ fontSize: cqw(settings.translationFontSize), color: sl.pc.tc, textShadow: sl.shadowCss }}>{ln.en}</p>}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {previewSlides.length === 0 && <div className="aspect-video rounded-xl flex items-center justify-center text-white/30 text-sm font-bold">输入歌词后预览出现在这里</div>}
            </div>
          </div>
        </section>

        <section className="lg:col-span-3 space-y-5">
          <Panel title="背景">
            <div className="grid grid-cols-3 gap-2 max-h-[360px] overflow-y-auto no-scrollbar pr-0.5">
              {allBgs.map((bg) => (
                <button key={bg.id} onClick={() => set('selectedBg', bg)} title={bg.label} className={`relative aspect-video rounded-xl overflow-hidden border-2 transition-all ${settings.selectedBg.id === bg.id ? 'border-emerald-500 scale-105 shadow' : 'border-transparent hover:border-emerald-500/40'}`} style={bgStyle(bg)}>
                  {bg.url && <img src={bg.url} alt={bg.label} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => uploadRef.current?.click()} className="flex-1 h-10 rounded-xl bg-[#F9F7F5] hover:bg-[#E5E0DA] text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"><span className="material-symbols-outlined text-[16px]">upload</span>上传图</button>
              <button onClick={() => setAiOpen(true)} className="flex-1 h-10 rounded-xl bg-black text-white hover:bg-emerald-600 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"><span className="material-symbols-outlined text-[16px]">auto_awesome</span>AI 生成</button>
            </div>
            <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <Toggle label="整套统一背景" checked={settings.unifyBackground} onChange={(v) => set('unifyBackground', v)} />
          </Panel>

          <Panel title="排版">
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-[#2C2C2C]">幻灯片尺寸</span>
              <div className="flex gap-1.5">
                {([['16:9', '宽屏 16:9'], ['4:3', '标准 4:3']] as const).map(([v, t]) => (
                  <button key={v} onClick={() => set('slideSize', v)} className={`flex-1 h-9 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${settings.slideSize === v ? 'bg-emerald-600 text-white' : 'bg-[#F9F7F5] text-outline/50 hover:bg-[#E5E0DA]'}`}>{t}</button>
                ))}
              </div>
            </div>
            <SliderRow label="每页行数" value={settings.linesPerSlide} min={1} max={6} onChange={(v) => set('linesPerSlide', v)} />
            <SliderRow label="歌词字号" value={settings.lyricFontSize} min={20} max={72} onChange={(v) => set('lyricFontSize', v)} />
            <SliderRow label="翻译字号" value={settings.translationFontSize} min={12} max={48} onChange={(v) => set('translationFontSize', v)} />
            <Toggle label="包含歌名封面页" checked={settings.showSongTitle} onChange={(v) => set('showSongTitle', v)} />
            <Toggle label="显示拼音" checked={settings.enablePinyin} onChange={(v) => set('enablePinyin', v)} />
          </Panel>

          <Panel title="文字与阴影">
            <div className="grid grid-cols-2 gap-3">
              <ColorRow label="歌词颜色" value={settings.lyricColor} onChange={(v) => set('lyricColor', v)} />
              <ColorRow label="翻译颜色" value={settings.translationColor} onChange={(v) => set('translationColor', v)} />
            </div>
            <Toggle label="文字阴影" checked={settings.enableShadow} onChange={(v) => set('enableShadow', v)} />
            {settings.enableShadow && (
              <div className="flex gap-1.5">
                {(['light', 'medium', 'strong'] as ShadowLevel[]).map((lv) => (
                  <button key={lv} onClick={() => set('shadowLevel', lv)} className={`flex-1 h-9 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${settings.shadowLevel === lv ? 'bg-emerald-600 text-white' : 'bg-[#F9F7F5] text-outline/50 hover:bg-[#E5E0DA]'}`}>{lv === 'light' ? '淡' : lv === 'medium' ? '中' : '浓'}</button>
                ))}
              </div>
            )}
          </Panel>
        </section>
      </main>

      {aiOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setAiOpen(false)} />
          <div className="relative bg-white w-full max-w-lg rounded-[36px] shadow-2xl p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5"><span className="material-symbols-outlined text-3xl">auto_awesome</span></div>
            <h3 className="text-2xl font-serif font-black mb-2">AI 生成背景</h3>
            <p className="text-[11px] text-outline/40 font-medium mb-7">输入主题（如「黎明的圣殿」「星空」），AI 生成 16:9 敬拜背景。</p>
            <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAiGen()} placeholder="例如：黎明的圣殿…" className="w-full bg-[#F9F7F5] border-2 border-[#E5E0DA]/50 rounded-2xl py-4 px-6 text-sm font-bold focus:border-emerald-500 outline-none mb-8" />
            <div className="flex gap-4">
              <button onClick={() => setAiOpen(false)} className="flex-1 py-4 bg-[#F9F7F5] text-outline/50 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#E5E0DA]">取消</button>
              <button onClick={handleAiGen} disabled={aiBusy} className="flex-1 py-4 bg-black text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 flex items-center justify-center gap-2 disabled:opacity-50"><span className={`material-symbols-outlined text-sm ${aiBusy ? 'animate-spin' : ''}`}>{aiBusy ? 'progress_activity' : 'magic_button'}</span>生成</button>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-black text-white px-8 py-4 rounded-full font-black text-xs tracking-wider shadow-2xl flex items-center gap-3"><span className="material-symbols-outlined text-emerald-400 text-lg">offline_pin</span>{status}</div>
      )}

      <style>{`
        .ed-input { width:100%; background:#F9F7F5; border:1px solid rgba(229,224,218,0.6); border-radius:0.9rem; padding:0.6rem 0.85rem; font-size:0.8rem; font-weight:600; outline:none; transition:all .15s; }
        .ed-input:focus { border-color:#10b981; background:#fff; }
      `}</style>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-[#E5E0DA]/50 p-5 shadow-sm space-y-4">
      <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-outline/50">{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-outline/40 px-1">{label}</span>
      {children}
    </label>
  );
}
function SliderRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between"><span className="text-[11px] font-bold text-[#2C2C2C]">{label}</span><span className="text-[11px] font-black text-emerald-600 tabular-nums">{value}</span></div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-emerald-600 h-1.5" />
    </div>
  );
}
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-[10px] font-bold uppercase tracking-wider text-outline/40">{label}</span>
      <div className="flex items-center gap-2 bg-[#F9F7F5] rounded-xl p-1.5 border border-[#E5E0DA]/60"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded-lg border-none bg-transparent cursor-pointer p-0" /><span className="text-[11px] font-bold text-outline/60 uppercase">{value}</span></div>
    </label>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="w-full flex items-center justify-between group">
      <span className="text-[11px] font-bold text-[#2C2C2C]">{label}</span>
      <span className={`relative w-10 h-6 rounded-full transition-all ${checked ? 'bg-emerald-600' : 'bg-[#E5E0DA]'}`}><span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'translate-x-4' : ''}`} /></span>
    </button>
  );
}
