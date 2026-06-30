import React, { useMemo, useState } from 'react';
import { expandSongSections, paginateLyrics, resolveSlideColors, previewShadow } from '../lib/pptTheme';
import type { BgOption, SongInput, DeckSettings } from '../lib/pptGenerator';
import { BACKGROUND_OPTIONS, pollinationsBg } from '../lib/backgrounds';
import { searchLibrary, searchLibraryMulti, saveToLibrary, libraryStats } from '../lib/songLibrary';
import type { LibrarySong } from '../lib/songLibrary';
import { detectChorus, deriveBackground, parseEntryLine } from '../lib/autoStructure';
import { exportMerged, exportZip } from '../lib/exporter';
import { openLyricSheet } from '../lib/lyricSheet';
import { PreviewModal } from './SlidePreview';

type Step = 'count' | 'entries' | 'confirm' | 'export';

interface AutoSong {
  id: string;
  raw: string;
  title: string;
  englishTitle: string;
  producer: string;
  lyrics: string;
  englishLyrics: string;
  bg: BgOption;
  matched: boolean;
}

const AUTO_SETTINGS: Omit<DeckSettings, 'selectedBg' | 'showSongTitle' | 'unifyBackground' | 'slideSize'> = {
  linesPerSlide: 2,
  lyricColor: '#FFFFFF',
  translationColor: '#A7F3D0',
  lyricFontSize: 48,
  translationFontSize: 24,
  enableShadow: true,
  shadowLevel: 'medium',
  enablePinyin: false,
  unifyFontSize: false,
};

const uid = () => crypto.randomUUID();

export default function AutoMode({ modeToggle }: { modeToggle: React.ReactNode }) {
  const [step, setStep] = useState<Step>('count');
  const [count, setCount] = useState(3);
  const [entries, setEntries] = useState<string[]>(['', '', '']);
  const [songs, setSongs] = useState<AutoSong[]>([]);

  // export options
  const [withTitle, setWithTitle] = useState(true);
  const [merge, setMerge] = useState(true); // true = 合并一个PPT, false = ZIP 分开
  const [unifyBg, setUnifyBg] = useState(false);
  const [slideSize, setSlideSize] = useState<DeckSettings['slideSize']>('16:9');
  const [deckName, setDeckName] = useState('Sunday Worship');

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const libStats = useMemo(() => libraryStats(), [step]);
  const [focusedEntry, setFocusedEntry] = useState<number | null>(null);
  const entryResults = useMemo(
    () => (focusedEntry !== null && entries[focusedEntry]?.trim())
      ? searchLibraryMulti(entries[focusedEntry])
      : [],
    [focusedEntry, entries],
  );

  const handleLyricSheet = () => {
    const valid = songs.filter((s) => s.title || s.lyrics);
    const ok = openLyricSheet(
      valid.map((s) => ({ title: s.title, englishTitle: s.englishTitle, lyrics: s.lyrics, englishLyrics: s.englishLyrics })),
      deckName,
    );
    if (!ok) flash('❌ 请允许弹出窗口后重试');
  };

  const flash = (msg: string, ms = 2800) => {
    setStatus(msg);
    window.clearTimeout((flash as any)._t);
    (flash as any)._t = window.setTimeout(() => setStatus(null), ms);
  };

  // Step 1 → 2
  const startEntries = (n: number) => {
    const c = Math.max(1, Math.min(20, n));
    setCount(c);
    setEntries(Array.from({ length: c }, (_, i) => entries[i] || ''));
    setStep('entries');
  };

  // Step 2 → 3: identify each entry against the local song "database".
  const identify = () => {
    let found = 0;
    const next: AutoSong[] = entries.map((raw) => {
      const trimmed = raw.trim();
      const parsed = parseEntryLine(trimmed);
      const hit = searchLibrary(trimmed) || (parsed.title ? searchLibrary(parsed.title) : null);
      if (hit && hit.score >= 60) {
        found++;
        const s = hit.song;
        return {
          id: uid(), raw, title: s.title, englishTitle: s.englishTitle || '',
          producer: s.producer || parsed.producer, lyrics: s.lyrics, englishLyrics: s.englishLyrics || '',
          // Reuse the background saved with this song last time; else derive one.
          bg: s.bg || deriveBackground(s.title, s.lyrics), matched: true,
        };
      }
      return {
        id: uid(), raw, title: parsed.title, englishTitle: '', producer: parsed.producer,
        lyrics: '', englishLyrics: '', bg: deriveBackground(parsed.title, trimmed), matched: false,
      };
    }).filter((s) => s.raw.trim());

    if (!next.length) { flash('❌ 请至少填写一首'); return; }
    setSongs(next);
    setStep('confirm');
    flash(found ? `✅ 从歌库找到 ${found} 首，其余请手动补全` : 'ℹ️ 歌库暂无匹配，请手动填写歌词');
  };

  const patch = (id: string, p: Partial<AutoSong>) => setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));

  const autoStructure = (id: string) => {
    const s = songs.find((x) => x.id === id);
    if (!s) return;
    patch(id, { lyrics: detectChorus(s.lyrics) });
    flash('🎼 已自动标记主歌/副歌');
  };

  const reRollBg = (id: string) => {
    const s = songs.find((x) => x.id === id);
    if (!s) return;
    patch(id, { bg: { id: `ai-${Date.now()}`, label: 'AI 背景', url: pollinationsBg(s.title || 'worship sacred light'), isAiResult: true } });
  };

  const pickPresetBg = (id: string, bg: BgOption) => patch(id, { bg });

  // Step 3 → export
  const doExport = async () => {
    const valid = songs.filter((s) => s.title.trim() || s.lyrics.trim());
    if (!valid.length) { flash('❌ 没有可导出的歌曲'); return; }
    const missing = valid.filter((s) => !s.lyrics.trim());
    if (missing.length && !window.confirm(`有 ${missing.length} 首还没有歌词，仍然导出吗？（这些只会有封面页）`)) return;

    setBusy(true);
    flash('⏳ 正在生成 PPT…', 60000);
    try {
      const settings: DeckSettings = {
        ...AUTO_SETTINGS,
        selectedBg: unifyBg ? valid[0].bg : BACKGROUND_OPTIONS[0],
        slideSize,
        showSongTitle: withTitle,
        unifyBackground: unifyBg,
      };
      const songInputs: SongInput[] = valid.map((s) => ({
        id: s.id, title: s.title, englishTitle: s.englishTitle,
        lyrics: s.lyrics, englishLyrics: s.englishLyrics, customBg: s.bg,
      }));
      const res = merge
        ? await exportMerged(songInputs, settings, deckName)
        : await exportZip(songInputs, settings, deckName);
      // Grow the local "database" — including each song's background image.
      valid.forEach((s) => saveToLibrary({ title: s.title, englishTitle: s.englishTitle, producer: s.producer, lyrics: s.lyrics, englishLyrics: s.englishLyrics, bg: s.bg }));
      flash(res.bgEmbedFailed
        ? '⚠️ 部分背景图无法加载，已用纯色代替（文件已导出）'
        : merge ? '✅ 已下载合并 PPT' : `✅ 已打包下载 ${res.fileCount} 个 PPT（ZIP）`, 4500);
    } catch (e) {
      console.error('Auto export failed', e);
      flash('❌ 生成失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setStep('count'); setSongs([]); };

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#F4F1EE]/85 backdrop-blur-xl border-b border-[#E5E0DA]/70">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10 h-20 flex items-center justify-between gap-4">
          {modeToggle}
          <div className="flex items-center gap-3">
            {(step === 'confirm' || step === 'export') && songs.length > 0 && (
              <button onClick={handleLyricSheet} className="h-11 px-4 rounded-2xl bg-white border border-[#E5E0DA]/60 text-[11px] font-black uppercase tracking-widest hover:border-emerald-400 transition-all shadow-sm flex items-center gap-2" title="打印歌词单">
                <span className="material-symbols-outlined text-base">print</span>
                <span className="hidden sm:inline">歌词单</span>
              </button>
            )}
            <div className="flex items-center gap-2">
              {['count', 'entries', 'confirm', 'export'].map((s, i) => (
                <div key={s} className={`flex items-center gap-2 ${i < 3 ? '' : ''}`}>
                  <div className={`w-7 h-7 rounded-full text-[11px] font-black flex items-center justify-center transition-all ${step === s ? 'bg-emerald-600 text-white' : ['count', 'entries', 'confirm', 'export'].indexOf(step) > i ? 'bg-emerald-100 text-emerald-600' : 'bg-[#E5E0DA] text-outline/40'}`}>{i + 1}</div>
                  {i < 3 && <div className="w-5 h-px bg-[#E5E0DA]" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-5 lg:px-10 py-10">
        {/* STEP 1 — how many songs */}
        {step === 'count' && (
          <div className="flex flex-col items-center text-center py-16 sm:py-24">
            <span className="material-symbols-outlined text-emerald-500 text-5xl mb-6">auto_awesome</span>
            <h1 className="font-serif font-black text-4xl sm:text-5xl tracking-tight text-[#2C2C2C] mb-4">这次要做几首歌？</h1>
            <p className="text-outline/50 font-medium mb-12 max-w-md">输入数量,接下来逐首粘贴歌名 / 一句歌词 / 制作人,系统自动识别并配好背景。</p>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} onClick={() => setCount(n)} className={`w-16 h-16 rounded-2xl text-2xl font-serif font-black transition-all ${count === n ? 'bg-emerald-600 text-white scale-110 shadow-lg' : 'bg-white border border-[#E5E0DA]/60 text-[#2C2C2C] hover:border-emerald-400'}`}>{n}</button>
              ))}
              <div className="flex items-center gap-2 bg-white border border-[#E5E0DA]/60 rounded-2xl px-3 h-16">
                <span className="text-[10px] font-bold text-outline/40 uppercase">其他</span>
                <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} className="w-14 text-xl font-serif font-black text-center bg-transparent outline-none" />
              </div>
            </div>
            <button onClick={() => startEntries(count)} className="h-14 px-10 rounded-2xl bg-black text-white text-sm font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl flex items-center gap-2">
              开始 <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        )}

        {/* STEP 2 — paste entries */}
        {step === 'entries' && (
          <div className="max-w-2xl mx-auto">
            <h2 className="font-serif font-black text-3xl text-[#2C2C2C] mb-2 text-center">粘贴 {count} 首歌</h2>
            <p className="text-outline/50 font-medium mb-2 text-center text-sm">每格写一句就行:歌名、一句歌词、或「歌名 / 制作人」。系统会去你的歌库里找。</p>
            <p className="text-emerald-600/70 font-bold mb-10 text-center text-[11px] uppercase tracking-wider">歌库已有 {libStats.total} 首 · {libStats.withLyrics} 首带歌词</p>
            <div className="space-y-3">
              {entries.map((v, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center gap-3 bg-white rounded-2xl border border-[#E5E0DA]/60 px-4 py-3 shadow-sm focus-within:border-emerald-500 transition-all">
                    <span className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 text-xs font-black flex items-center justify-center shrink-0">{i + 1}</span>
                    <input
                      value={v}
                      onChange={(e) => setEntries((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                      onFocus={() => setFocusedEntry(i)}
                      onBlur={() => setTimeout(() => setFocusedEntry(null), 200)}
                      placeholder="例如:奇异恩典 / 约翰牛顿,或随便一句歌词…"
                      className="flex-1 bg-transparent outline-none text-sm font-semibold"
                      autoFocus={i === 0}
                    />
                  </div>
                  {focusedEntry === i && entryResults.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-2xl border border-[#E5E0DA]/70 shadow-xl max-h-52 overflow-y-auto no-scrollbar">
                      {entryResults.map((r: LibrarySong) => (
                        <button
                          key={r.id}
                          onMouseDown={(e) => { e.preventDefault(); setEntries((p) => p.map((x, j) => (j === i ? r.title : x))); setFocusedEntry(null); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-emerald-50 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl"
                        >
                          <span className="material-symbols-outlined text-emerald-500 text-[18px]">music_note</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold text-[#2C2C2C] truncate">{r.title || '未命名'}</span>
                            {r.englishTitle && <span className="block text-[11px] text-outline/40 font-medium truncate">{r.englishTitle}</span>}
                          </span>
                          {!(r.lyrics || '').trim() && <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">无词</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-10">
              <button onClick={() => setStep('count')} className="text-outline/50 hover:text-[#2C2C2C] text-xs font-black uppercase tracking-wider flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">arrow_back</span>返回</button>
              <button onClick={identify} className="h-13 px-8 py-4 rounded-2xl bg-black text-white text-sm font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl flex items-center gap-2"><span className="material-symbols-outlined">search</span>识别并下一步</button>
            </div>
          </div>
        )}

        {/* STEP 3 — confirm & edit */}
        {step === 'confirm' && (
          <div>
            <div className="text-center mb-8">
              <h2 className="font-serif font-black text-3xl text-[#2C2C2C] mb-2">确认歌曲</h2>
              <p className="text-outline/50 font-medium text-sm">检查歌词、自动分主歌副歌、确认背景。没找到的请补上歌词。</p>
            </div>
            <div className="space-y-5">
              {songs.map((s, i) => <ConfirmCard key={s.id} index={i} song={s} onPatch={patch} onStructure={autoStructure} onReRoll={reRollBg} onPickPreset={pickPresetBg} />)}
            </div>
            <div className="flex items-center justify-between mt-10">
              <button onClick={() => setStep('entries')} className="text-outline/50 hover:text-[#2C2C2C] text-xs font-black uppercase tracking-wider flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">arrow_back</span>返回</button>
              <button onClick={() => setStep('export')} className="h-13 px-8 py-4 rounded-2xl bg-black text-white text-sm font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl flex items-center gap-2">下一步:导出 <span className="material-symbols-outlined">arrow_forward</span></button>
            </div>
          </div>
        )}

        {/* STEP 4 — export options */}
        {step === 'export' && (
          <div className="max-w-xl mx-auto">
            <div className="text-center mb-10">
              <span className="material-symbols-outlined text-emerald-500 text-4xl mb-3">download_done</span>
              <h2 className="font-serif font-black text-3xl text-[#2C2C2C] mb-2">导出设置</h2>
              <p className="text-outline/50 font-medium text-sm">共 {songs.filter((s) => s.title || s.lyrics).length} 首。选择导出方式后一键生成。</p>
            </div>

            <div className="bg-white rounded-3xl border border-[#E5E0DA]/50 p-6 shadow-sm space-y-6">
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-outline/50">文件名</span>
                <input value={deckName} onChange={(e) => setDeckName(e.target.value)} className="w-full bg-[#F9F7F5] rounded-xl px-4 py-3 text-sm font-bold outline-none border border-[#E5E0DA]/60 focus:border-emerald-500" />
              </div>

              <OptionRow label="歌名封面页" desc="每首歌开头是否加一页大标题">
                <Seg options={[{ v: true, t: '要歌名' }, { v: false, t: '不要' }]} value={withTitle} onChange={setWithTitle} />
              </OptionRow>

              <OptionRow label="合并 / 分开" desc="拼成一个 PPT,还是每首一个打包成 ZIP">
                <Seg options={[{ v: true, t: '合并一个' }, { v: false, t: 'ZIP 分开' }]} value={merge} onChange={setMerge} />
              </OptionRow>

              <OptionRow label="背景" desc="每首用各自的背景,还是全套统一">
                <Seg options={[{ v: false, t: '各自背景' }, { v: true, t: '统一背景' }]} value={unifyBg} onChange={setUnifyBg} />
              </OptionRow>

              <OptionRow label="尺寸" desc="宽屏 16:9 (1920×1080) 或标准 4:3">
                <div className="flex bg-[#F9F7F5] rounded-xl p-1 shrink-0">
                  {(['16:9', '4:3'] as const).map((v) => (
                    <button key={v} onClick={() => setSlideSize(v)} className={`px-3.5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${slideSize === v ? 'bg-emerald-600 text-white shadow' : 'text-outline/50 hover:text-[#2C2C2C]'}`}>{v}</button>
                  ))}
                </div>
              </OptionRow>
            </div>

            <button onClick={doExport} disabled={busy} className="w-full mt-8 h-16 rounded-2xl bg-emerald-600 text-white text-base font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 disabled:opacity-50">
              <span className={`material-symbols-outlined text-2xl ${busy ? 'animate-spin' : ''}`}>{busy ? 'progress_activity' : 'rocket_launch'}</span>
              {busy ? '生成中…' : merge ? '生成并下载 PPT' : '生成并下载 ZIP'}
            </button>

            <div className="flex items-center justify-between mt-6">
              <button onClick={() => setStep('confirm')} className="text-outline/50 hover:text-[#2C2C2C] text-xs font-black uppercase tracking-wider flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">arrow_back</span>返回修改</button>
              <button onClick={reset} className="text-outline/50 hover:text-[#2C2C2C] text-xs font-black uppercase tracking-wider flex items-center gap-1"><span className="material-symbols-outlined text-[18px]">restart_alt</span>重新开始</button>
            </div>
          </div>
        )}
      </main>

      {status && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-black text-white px-8 py-4 rounded-full font-black text-xs tracking-wider shadow-2xl flex items-center gap-3"><span className="material-symbols-outlined text-emerald-400 text-lg">offline_pin</span>{status}</div>
      )}
    </div>
  );
}

function ConfirmCard({ index, song, onPatch, onStructure, onReRoll, onPickPreset }: {
  index: number; song: AutoSong;
  onPatch: (id: string, p: Partial<AutoSong>) => void;
  onStructure: (id: string) => void;
  onReRoll: (id: string) => void;
  onPickPreset: (id: string, bg: BgOption) => void;
}) {
  const [bgOpen, setBgOpen] = useState(false);
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const preview = useMemo(() => {
    const exp = expandSongSections(song.lyrics || '', song.englishLyrics || '');
    const pages = paginateLyrics(exp.lyrics, exp.english, 2);
    const pc = resolveSlideColors(song.bg, '#FFFFFF', '#A7F3D0');
    const slides: { type: 'cover' | 'lyric'; title?: string; sub?: string; lines?: { cn: string; en: string }[] }[] = [
      { type: 'cover', title: song.title, sub: song.englishTitle },
    ];
    pages.forEach((lines) => slides.push({ type: 'lyric', lines }));
    return { slides, pc, count: pages.length };
  }, [song.lyrics, song.englishLyrics, song.bg, song.title, song.englishTitle]);
  const slideCount = preview.count;
  // Preview font size in container-query units, mirroring the .pptx scaling.
  const cqw = (pt: number) => `${(pt / 7.2).toFixed(2)}cqw`;
  const shadow = previewShadow('medium');

  const bgStyle: React.CSSProperties = song.bg?.url
    ? { backgroundImage: `url(${song.bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: `#${song.bg?.color || '064E3B'}` };

  return (
    <div className="bg-white rounded-3xl border border-[#E5E0DA]/50 p-5 shadow-sm">
      <div className="flex items-start gap-4">
        {/* bg thumbnail */}
        <div className="shrink-0 space-y-2">
          <div className="w-32 h-20 rounded-xl overflow-hidden relative border border-[#E5E0DA]/60" style={bgStyle}>
            {song.bg?.url && <img src={song.bg.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="bg" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-[9px] font-black uppercase tracking-wider">{slideCount} 页歌词</div>
          </div>
          <div className="flex gap-1">
            <button onClick={() => onReRoll(song.id)} title="AI 重新生成背景" className="flex-1 h-7 rounded-lg bg-black text-white text-[9px] font-black uppercase flex items-center justify-center gap-0.5 hover:bg-emerald-600"><span className="material-symbols-outlined text-[13px]">refresh</span>换图</button>
            <button onClick={() => setBgOpen((v) => !v)} title="选预设背景" className="w-7 h-7 rounded-lg bg-[#F9F7F5] hover:bg-[#E5E0DA] flex items-center justify-center"><span className="material-symbols-outlined text-[14px]">palette</span></button>
          </div>
          {bgOpen && (
            <div className="grid grid-cols-3 gap-1 w-32">
              {BACKGROUND_OPTIONS.map((bg) => (
                <button key={bg.id} title={bg.label} onClick={() => { onPickPreset(song.id, bg); setBgOpen(false); }} className="aspect-video rounded-md overflow-hidden border border-[#E5E0DA]/60" style={bg.url ? { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover' } : { backgroundColor: `#${bg.color}` }} />
              ))}
            </div>
          )}
        </div>

        {/* fields */}
        <div className="flex-1 min-w-0 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-black flex items-center justify-center shrink-0">{index + 1}</span>
            <input value={song.title} onChange={(e) => onPatch(song.id, { title: e.target.value })} placeholder="歌名" className="flex-1 text-base font-serif font-black bg-transparent outline-none border-b border-transparent focus:border-emerald-400 min-w-0" />
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${song.matched ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{song.matched ? '✓ 歌库找到' : '✍ 需补歌词'}</span>
          </div>
          <input value={song.englishTitle} onChange={(e) => onPatch(song.id, { englishTitle: e.target.value })} placeholder="英文名 / 副标题(可选)" className="w-full text-xs font-semibold text-outline/60 bg-[#F9F7F5] rounded-lg px-3 py-2 outline-none" />
          <textarea value={song.lyrics} onChange={(e) => onPatch(song.id, { lyrics: e.target.value })} rows={song.matched ? 4 : 5} placeholder={song.matched ? '' : '歌库没找到这首,请把歌词粘贴到这里(每行一句,空行换页)'} className="w-full text-sm font-semibold bg-[#F9F7F5] rounded-xl px-3 py-2.5 outline-none leading-relaxed resize-none focus:bg-white border border-transparent focus:border-emerald-400" />
          <textarea value={song.englishLyrics} onChange={(e) => onPatch(song.id, { englishLyrics: e.target.value })} rows={2} placeholder="翻译 / 对照歌词(可选,按行对应)" className="w-full text-xs font-medium text-outline/70 bg-[#F9F7F5] rounded-xl px-3 py-2 outline-none leading-relaxed resize-none" />
          <div className="flex items-center gap-2">
            <button onClick={() => onStructure(song.id)} className="h-8 px-3 rounded-lg bg-[#F9F7F5] hover:bg-emerald-50 hover:text-emerald-600 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all"><span className="material-symbols-outlined text-[14px]">music_note</span>自动分主歌副歌</button>
            <span className="text-[10px] text-outline/30 font-medium">用 [副歌] 标记重复段,只写一次自动展开</span>
          </div>
        </div>
      </div>

      {/* Live slide preview (same look as 手动 mode) */}
      <div className="mt-4 pt-4 border-t border-[#E5E0DA]/50">
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="material-symbols-outlined text-emerald-500 text-[16px]">slideshow</span>
          <span className="text-[10px] font-black uppercase tracking-wider text-outline/50">实时预览 · {preview.slides.length} 页</span>
        </div>
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {preview.slides.map((sl, idx) => (
            <div key={idx} className="relative shrink-0 w-44 aspect-video rounded-lg overflow-hidden flex items-center justify-center text-center p-3 cursor-pointer group/thumb" style={{ ...bgStyle, containerType: 'inline-size' }} onClick={() => setZoomIdx(idx)} title="点击放大 / 编辑">
              {song.bg?.url && <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/40" />}
              <div className="relative z-10 w-full space-y-0.5">
                {sl.type === 'cover' ? (
                  <>
                    <h3 className="font-serif font-black leading-tight" style={{ fontSize: cqw(48), color: preview.pc.lc, textShadow: shadow }}>{sl.title || '未命名'}</h3>
                    {sl.sub && <p className="font-medium" style={{ fontSize: cqw(22), color: preview.pc.tc, textShadow: shadow }}>{sl.sub}</p>}
                  </>
                ) : (
                  (sl.lines || []).map((ln, j) => (
                    <div key={j}>
                      {ln.cn && <p className="font-serif font-black leading-snug" style={{ fontSize: cqw(48), color: preview.pc.lc, textShadow: shadow }}>{ln.cn}</p>}
                      {ln.en && <p className="italic leading-snug" style={{ fontSize: cqw(24), color: preview.pc.tc, textShadow: shadow }}>{ln.en}</p>}
                    </div>
                  ))
                )}
              </div>
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/0 group-hover/thumb:bg-black/30 transition-all">
                <span className="material-symbols-outlined text-white text-2xl opacity-0 group-hover/thumb:opacity-100 transition-all">zoom_in</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {zoomIdx !== null && (
        <PreviewModal
          slides={preview.slides}
          bg={song.bg}
          pc={preview.pc}
          start={zoomIdx}
          lyric={song.lyrics}
          english={song.englishLyrics}
          lyricFontSize={48}
          translationFontSize={24}
          shadow={shadow}
          onLyric={(v) => onPatch(song.id, { lyrics: v })}
          onEnglish={(v) => onPatch(song.id, { englishLyrics: v })}
          onClose={() => setZoomIdx(null)}
        />
      )}
    </div>
  );
}

function OptionRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-black text-[#2C2C2C]">{label}</div>
        <div className="text-[11px] text-outline/40 font-medium">{desc}</div>
      </div>
      {children}
    </div>
  );
}

function Seg<T extends boolean>({ options, value, onChange }: { options: { v: T; t: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex bg-[#F9F7F5] rounded-xl p-1 shrink-0">
      {options.map((o) => (
        <button key={o.t} onClick={() => onChange(o.v)} className={`px-3.5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${value === o.v ? 'bg-emerald-600 text-white shadow' : 'text-outline/50 hover:text-[#2C2C2C]'}`}>{o.t}</button>
      ))}
    </div>
  );
}
