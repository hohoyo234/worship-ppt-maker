import React, { useState } from 'react';
import { toPinyin, type BgOption } from '../lib/pptGenerator';
import type { SlideColors } from '../lib/pptTheme';

export type PreviewSlide = { type: 'cover' | 'lyric'; title?: string; sub?: string; lines?: { cn: string; en: string }[] };

const bgStyle = (bg?: BgOption | null): React.CSSProperties =>
  bg?.url ? { backgroundImage: `url(${bg.url})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { backgroundColor: `#${bg?.color || '064E3B'}` };

// One slide rendered with container-query font sizes so it scales with its box
// and matches the .pptx. Fill a relatively-positioned, sized parent.
export function SlideView({ slide, bg, pc, lyricFontSize, translationFontSize, shadow, enablePinyin = false }: {
  slide: PreviewSlide; bg?: BgOption | null; pc: SlideColors;
  lyricFontSize: number; translationFontSize: number; shadow: string; enablePinyin?: boolean;
}) {
  const cqw = (pt: number) => `${(pt / 7.2).toFixed(2)}cqw`;
  return (
    <div className="absolute inset-0 flex items-center justify-center text-center p-[5%]" style={{ ...bgStyle(bg), containerType: 'inline-size' }}>
      {bg?.url && <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/40" />}
      <div className="relative z-10 w-full flex flex-col" style={{ gap: '1.5cqw' }}>
        {slide.type === 'cover' ? (
          <>
            <h2 className="font-serif font-black leading-tight" style={{ fontSize: cqw(48), color: pc.lc, textShadow: shadow }}>{slide.title || '未命名'}</h2>
            {slide.sub && <p className="font-medium" style={{ fontSize: cqw(24), color: pc.tc, textShadow: shadow }}>{slide.sub}</p>}
          </>
        ) : (
          (slide.lines || []).map((ln, j) => (
            <div key={j}>
              {enablePinyin && toPinyin(ln.cn) && <p style={{ fontSize: cqw(lyricFontSize * 0.45), color: pc.lc, textShadow: shadow }}>{toPinyin(ln.cn)}</p>}
              {ln.cn && <p className="font-serif font-black leading-snug" style={{ fontSize: cqw(lyricFontSize), color: pc.lc, textShadow: shadow }}>{ln.cn}</p>}
              {ln.en && <p className="italic leading-snug" style={{ fontSize: cqw(translationFontSize), color: pc.tc, textShadow: shadow }}>{ln.en}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Click-to-enlarge modal: big slide with prev/next + edit the song's lyrics live.
export function PreviewModal({ slides, bg, pc, start, lyric, english, lyricFontSize, translationFontSize, shadow, enablePinyin, onLyric, onEnglish, onClose }: {
  slides: PreviewSlide[]; bg?: BgOption | null; pc: SlideColors; start: number;
  lyric: string; english: string; lyricFontSize: number; translationFontSize: number; shadow: string; enablePinyin?: boolean;
  onLyric: (v: string) => void; onEnglish: (v: string) => void; onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const idx = Math.min(i, Math.max(0, slides.length - 1));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 grid md:grid-cols-[1.5fr_1fr] gap-5">
        <div>
          <div className="relative aspect-video rounded-xl overflow-hidden">
            {slides[idx] && <SlideView slide={slides[idx]} bg={bg} pc={pc} lyricFontSize={lyricFontSize} translationFontSize={translationFontSize} shadow={shadow} enablePinyin={enablePinyin} />}
          </div>
          <div className="flex items-center justify-between mt-3">
            <button onClick={() => setI(Math.max(0, idx - 1))} disabled={idx === 0} className="h-9 px-4 rounded-xl bg-[#F9F7F5] text-[11px] font-black uppercase tracking-wider disabled:opacity-40 hover:bg-[#E5E0DA]">上一页</button>
            <span className="text-[11px] font-black text-outline/50 tabular-nums">{idx + 1} / {slides.length}</span>
            <button onClick={() => setI(Math.min(slides.length - 1, idx + 1))} disabled={idx >= slides.length - 1} className="h-9 px-4 rounded-xl bg-[#F9F7F5] text-[11px] font-black uppercase tracking-wider disabled:opacity-40 hover:bg-[#E5E0DA]">下一页</button>
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="font-serif font-black text-xl text-[#2C2C2C]">编辑歌词</h3>
          <label className="block space-y-1.5"><span className="text-[10px] font-bold uppercase tracking-wider text-outline/40 px-1">歌词（每行一句，空行 = 换页）</span>
            <textarea value={lyric} onChange={(e) => onLyric(e.target.value)} rows={9} className="w-full bg-[#F9F7F5] border border-[#E5E0DA]/60 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500 resize-none leading-relaxed" />
          </label>
          <label className="block space-y-1.5"><span className="text-[10px] font-bold uppercase tracking-wider text-outline/40 px-1">翻译 / 对照歌词（可选）</span>
            <textarea value={english} onChange={(e) => onEnglish(e.target.value)} rows={5} className="w-full bg-[#F9F7F5] border border-[#E5E0DA]/60 rounded-xl px-3 py-2 text-sm font-medium outline-none focus:border-emerald-500 resize-none leading-relaxed" />
          </label>
          <button onClick={onClose} className="w-full py-3 rounded-2xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-500">完成</button>
        </div>
      </div>
    </div>
  );
}
