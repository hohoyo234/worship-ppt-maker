import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadLibrary, updateById, deleteFromLibrary, addBlankSong,
  exportLibraryJSON, importLibraryJSON, onLibraryChange, type LibrarySong,
} from '../lib/songLibrary';

type Filter = 'all' | 'lyrics' | 'titleOnly';

// Filler words people use when they only half-remember a song ("那个好像有个…什么
// 什么的爱…"). We drop these and keep the meaningful fragments, then require every
// fragment to appear somewhere in the song — so vague, gap-filled queries still hit.
const FILLER = [
  '什么什么', '什麼什麼', '什么', '甚麼', '什麼', '那个', '那個', '这个', '這個', '哪个', '哪個',
  '好像', '有一个', '有一個', '有个', '有個', '一首', '那首', '这首', '這首', '就是', '然后', '然後',
  '记得', '記得', '嗯', '额', '呃', '啊', 'xxx', 'xx', '***', '。。。', '...',
];

// Particles that vague speech glues onto a remembered fragment ("低谷的", "去吧").
// Stripped from each token's ends so the core fragment still matches.
const stripParticles = (t: string) => t.replace(/^[的了地得着啊呀呢吗嘛吧哦噢]+|[的了地得着啊呀呢吗嘛吧哦噢]+$/g, '');

function searchTokens(q: string): string[] {
  let s = (q || '').toLowerCase();
  for (const f of FILLER) s = s.split(f).join(' ');
  s = s.replace(/[\s,，。.、!！?？:：;；…·\-—_/()（）"'’]+/g, ' ');
  return s.split(' ').map((t) => stripParticles(t.trim())).filter(Boolean);
}

function songSearchText(s: LibrarySong): string {
  return [s.title, s.titleSc, s.englishTitle, s.producer, s.composer, s.lyricist, s.publication, s.key, s.lyrics, s.lyricsSc, s.englishLyrics]
    .filter(Boolean).join('\n').toLowerCase();
}

// 0 = no match. Higher = better. Requires ALL tokens present; weights title hits and
// a contiguous (gap-free) match highest so exact-ish queries float to the top.
function fuzzyScore(s: LibrarySong, tokens: string[], joined: string): number {
  if (!tokens.length) return 1;
  const text = songSearchText(s);
  const titleText = [s.title, s.titleSc, s.englishTitle].filter(Boolean).join(' ').toLowerCase();
  const titleSquished = titleText.replace(/\s+/g, '');
  if (joined && titleSquished.includes(joined)) return 1000;
  let score = 0;
  for (const t of tokens) {
    if (!text.includes(t)) return 0;
    score += titleText.includes(t) ? 12 : 3;
  }
  if (joined && text.replace(/\s+/g, '').includes(joined)) score += 25;
  return score;
}

export default function LibraryMode({ modeToggle }: { modeToggle: React.ReactNode }) {
  const [songs, setSongs] = useState<LibrarySong[]>(() => loadLibrary());
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [lang, setLang] = useState<'tc' | 'sc'>(() => (localStorage.getItem('lib_lang') as 'tc' | 'sc') || 'tc');
  const [editing, setEditing] = useState<LibrarySong | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const setLanguage = (l: 'tc' | 'sc') => { setLang(l); try { localStorage.setItem('lib_lang', l); } catch {} };
  // 繁/简 display helpers — primary fields hold Traditional, *Sc hold Simplified.
  const dTitle = (s: LibrarySong) => (lang === 'sc' ? s.titleSc || s.title : s.title) || '未命名';
  const dLyrics = (s: LibrarySong) => (lang === 'sc' ? s.lyricsSc || s.lyrics : s.lyrics) || '';

  const refresh = () => setSongs(loadLibrary());

  // Re-read when a background cloud sync updates the local cache.
  useEffect(() => onLibraryChange(refresh), []);
  const flash = (m: string, ms = 2400) => { setStatus(m); window.clearTimeout((flash as any)._t); (flash as any)._t = window.setTimeout(() => setStatus(null), ms); };

  const filtered = useMemo(() => {
    const base = songs.filter((s) => {
      const hasLyrics = !!((s.lyrics || s.lyricsSc || '').trim());
      if (filter === 'lyrics' && !hasLyrics) return false;
      if (filter === 'titleOnly' && hasLyrics) return false;
      return true;
    });
    const tokens = searchTokens(q);
    if (!tokens.length) return base;
    const joined = tokens.join('');
    return base
      .map((s) => ({ s, score: fuzzyScore(s, tokens, joined) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.s);
  }, [songs, q, filter]);

  const stats = useMemo(() => ({ total: songs.length, withLyrics: songs.filter((s) => (s.lyrics || '').trim()).length }), [songs]);

  const saveEdit = () => {
    if (!editing) return;
    if (!editing.title.trim()) { flash('❌ 歌名不能为空'); return; }
    updateById(editing.id, {
      title: editing.title, titleSc: editing.titleSc, englishTitle: editing.englishTitle,
      composer: editing.composer, lyricist: editing.lyricist, singer: editing.singer,
      publication: editing.publication, key: editing.key,
      lyrics: editing.lyrics, lyricsSc: editing.lyricsSc, englishLyrics: editing.englishLyrics,
    });
    setEditing(null); refresh(); flash('✅ 已保存');
  };

  const del = (s: LibrarySong) => {
    if (!window.confirm(`删除《${dTitle(s)}》?`)) return;
    deleteFromLibrary(s.id); refresh(); flash('🗑️ 已删除');
  };

  const addNew = () => { const s = addBlankSong(); refresh(); setEditing(s); };

  const doExport = () => {
    const blob = new Blob([exportLibraryJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `歌库备份_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash('✅ 歌库已导出');
  };

  const doImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { const r = importLibraryJSON(reader.result as string); refresh(); flash(`✅ 导入完成:新增 ${r.added}、更新 ${r.updated}`); }
      catch (err: any) { flash('❌ 导入失败:' + (err?.message || '格式错误')); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-[#F4F1EE]/85 backdrop-blur-xl border-b border-[#E5E0DA]/70">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10 h-20 flex items-center justify-between gap-4">
          {modeToggle}
          <div className="flex items-center gap-2">
            <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={doImport} />
            <button onClick={() => importRef.current?.click()} className="h-11 px-4 rounded-xl bg-white border border-[#E5E0DA]/60 text-[10px] font-black uppercase tracking-wider hover:border-emerald-400 flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">upload</span>导入</button>
            <button onClick={doExport} className="h-11 px-4 rounded-xl bg-white border border-[#E5E0DA]/60 text-[10px] font-black uppercase tracking-wider hover:border-emerald-400 flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">download</span>备份</button>
            <button onClick={addNew} className="h-11 px-5 rounded-xl bg-black text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 flex items-center gap-1.5 shadow-lg"><span className="material-symbols-outlined text-[16px]">add</span>新增</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-5 lg:px-10 py-8">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <h2 className="font-serif font-black text-3xl text-[#2C2C2C]">我的歌库</h2>
            <p className="text-outline/50 font-medium text-sm mt-1">共 {stats.total} 首 · {stats.withLyrics} 首带歌词。用过的歌会自动存进来。</p>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-2xl border border-[#E5E0DA]/60 px-4 h-12 shadow-sm w-full sm:w-72">
            <span className="material-symbols-outlined text-outline/30 text-[18px]">search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜歌名 / 歌词片段（记不全也行）" className="flex-1 bg-transparent outline-none text-sm font-semibold" />
          </div>
        </div>

        <div className="flex gap-2 mb-5 flex-wrap items-center">
          {([['all', '全部'], ['lyrics', '有歌词'], ['titleOnly', '仅歌名']] as const).map(([v, t]) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-4 h-9 rounded-full text-[11px] font-black uppercase tracking-wider transition-all ${filter === v ? 'bg-emerald-600 text-white shadow' : 'bg-white border border-[#E5E0DA]/60 text-outline/50 hover:text-[#2C2C2C]'}`}>{t}</button>
          ))}
          <div className="ml-auto flex bg-white rounded-full p-1 border border-[#E5E0DA]/60 shadow-sm">
            {([['tc', '繁體'], ['sc', '简体']] as const).map(([v, t]) => (
              <button key={v} onClick={() => setLanguage(v)} className={`px-3.5 h-7 rounded-full text-[11px] font-black tracking-wider transition-all ${lang === v ? 'bg-[#2C2C2C] text-white shadow' : 'text-outline/50 hover:text-[#2C2C2C]'}`}>{t}</button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-[#E5E0DA]/50 shadow-sm divide-y divide-[#E5E0DA]/40 overflow-hidden">
          {filtered.length === 0 && <div className="py-20 text-center text-outline/40 font-bold text-sm">没有匹配的歌曲</div>}
          {filtered.map((s, i) => {
            const hasLyrics = !!dLyrics(s).trim();
            const credit = s.composer || s.producer;
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 sm:px-6 py-3.5 hover:bg-[#F9F7F5] transition-colors group">
                <span className="text-[10px] font-black text-outline/25 w-7 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-serif font-black text-[#2C2C2C] truncate">{dTitle(s)}</span>
                    {s.englishTitle && <span className="text-[11px] text-outline/40 font-medium truncate hidden sm:inline">{s.englishTitle}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {credit && <span className="text-[10px] text-outline/40 font-bold truncate max-w-[260px]">{credit}</span>}
                    {s.key && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 shrink-0">{s.key}</span>}
                    <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${hasLyrics ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{hasLyrics ? '有歌词' : '仅歌名'}</span>
                  </div>
                </div>
                <button onClick={() => setEditing(s)} className="w-8 h-8 rounded-lg hover:bg-emerald-50 text-outline/40 hover:text-emerald-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                <button onClick={() => del(s)} className="w-8 h-8 rounded-lg hover:bg-red-50 text-outline/40 hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><span className="material-symbols-outlined text-[18px]">delete</span></button>
              </div>
            );
          })}
        </div>
      </main>

      {/* Edit drawer */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => setEditing(null)} />
          <div className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto no-scrollbar">
            <h3 className="font-serif font-black text-2xl text-[#2C2C2C] mb-5">编辑歌曲</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <L label="曲名 Title（繁體）"><input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="li" /></L>
              <L label="曲名（简体）"><input value={editing.titleSc || ''} onChange={(e) => setEditing({ ...editing, titleSc: e.target.value })} className="li" /></L>
            </div>
            <div className="mb-3"><L label="英文名 English Title"><input value={editing.englishTitle || ''} onChange={(e) => setEditing({ ...editing, englishTitle: e.target.value })} className="li" /></L></div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <L label="作曲 Composer"><input value={editing.composer || ''} onChange={(e) => setEditing({ ...editing, composer: e.target.value })} className="li" /></L>
              <L label="作詞 Lyricist"><input value={editing.lyricist || ''} onChange={(e) => setEditing({ ...editing, lyricist: e.target.value })} className="li" /></L>
            </div>
            <div className="grid grid-cols-[1fr_1fr_90px] gap-3 mb-3">
              <L label="歌手 Singer"><input value={editing.singer || ''} onChange={(e) => setEditing({ ...editing, singer: e.target.value })} className="li" /></L>
              <L label="出版 Publication"><input value={editing.publication || ''} onChange={(e) => setEditing({ ...editing, publication: e.target.value })} className="li" /></L>
              <L label="調性 Key"><input value={editing.key || ''} onChange={(e) => setEditing({ ...editing, key: e.target.value })} className="li" /></L>
            </div>
            <div className="mt-3"><L label="歌詞 Lyrics（繁體 · 每行一句,空行换页)"><textarea value={editing.lyrics} onChange={(e) => setEditing({ ...editing, lyrics: e.target.value })} rows={8} className="li resize-none leading-relaxed" /></L></div>
            <div className="mt-3"><L label="歌词（简体）"><textarea value={editing.lyricsSc || ''} onChange={(e) => setEditing({ ...editing, lyricsSc: e.target.value })} rows={6} className="li resize-none leading-relaxed" /></L></div>
            <div className="mt-3"><L label="英文歌词 / 对照(可选)"><textarea value={editing.englishLyrics || ''} onChange={(e) => setEditing({ ...editing, englishLyrics: e.target.value })} rows={5} className="li resize-none leading-relaxed" /></L></div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="flex-1 py-3.5 rounded-2xl bg-[#F9F7F5] text-outline/50 text-[11px] font-black uppercase tracking-widest hover:bg-[#E5E0DA]">取消</button>
              <button onClick={saveEdit} className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-500 shadow-lg">保存</button>
            </div>
          </div>
        </div>
      )}

      {status && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-black text-white px-8 py-4 rounded-full font-black text-xs tracking-wider shadow-2xl flex items-center gap-3"><span className="material-symbols-outlined text-emerald-400 text-lg">offline_pin</span>{status}</div>}

      <style>{`.li{width:100%;background:#F9F7F5;border:1px solid rgba(229,224,218,0.6);border-radius:0.85rem;padding:0.6rem 0.85rem;font-size:0.85rem;font-weight:600;outline:none}.li:focus{border-color:#10b981;background:#fff}`}</style>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-[10px] font-bold uppercase tracking-wider text-outline/40 px-1">{label}</span>{children}</label>;
}
