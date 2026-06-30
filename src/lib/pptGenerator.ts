// ── Standalone worship .pptx generator ────────────────────────────────────────
// Faithful port of the generation engine from the original GraceFlow app, with
// all Supabase / auth / church code removed. Given a list of songs and the deck
// settings, it builds a PowerPoint at the chosen slide size that matches the
// on-screen preview and returns it as a Blob.

import { pinyin } from 'pinyin-pro';
import {
  resolveSlideColors,
  paginateLyrics,
  expandSongSections,
  pptShadow,
  type ShadowLevel,
} from './pptTheme';

// Hanyu Pinyin (tone marks) for a Chinese line. Non-Chinese text is kept as-is.
export const toPinyin = (s: string): string => {
  try {
    return pinyin(s || '', { toneType: 'symbol' });
  } catch {
    return '';
  }
};

export interface BgOption {
  id: string;
  label?: string;
  url?: string | null;
  color?: string | null;
  isAi?: boolean;
  isAiResult?: boolean;
}

export interface SongInput {
  id: string;
  title: string;
  /** Simplified-Chinese variants (primary title/lyrics hold Traditional). */
  titleSc?: string;
  lyricsSc?: string;
  englishTitle?: string;
  lyrics: string;
  englishLyrics?: string;
  customBg?: BgOption | null;
  lyricColor?: string;
  translationColor?: string;
  lyricFontSize?: number;
  translationFontSize?: number;
  linesPerSlide?: number;
  shadow?: boolean;
}

export type SlideSize = '16:9' | '4:3';

// Standard PowerPoint page sizes (inches). 16:9 = 1920×1080, 4:3 = 1024×768.
export const SLIDE_LAYOUTS: Record<SlideSize, { w: number; h: number }> = {
  '16:9': { w: 13.333, h: 7.5 },
  '4:3': { w: 10, h: 7.5 },
};

export interface DeckSettings {
  selectedBg: BgOption;
  slideSize: SlideSize;
  linesPerSlide: number;
  lyricColor: string;
  translationColor: string;
  lyricFontSize: number;
  translationFontSize: number;
  enableShadow: boolean;
  shadowLevel: ShadowLevel;
  enablePinyin: boolean;
  showSongTitle: boolean;
  unifyFontSize: boolean;
  unifyBackground: boolean;
}

export interface GenerateResult {
  blob: Blob;
  bgEmbedFailed: boolean;
}

// Pre-fetch an external image URL as base64 (for reliable .pptx embedding).
async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url || url.startsWith('data:')) return url || null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Failed to fetch image as base64:', url, e);
    return null;
  }
}

export async function generateDeck(songsToExport: SongInput[], s: DeckSettings): Promise<GenerateResult> {
  const { default: pptxgen } = await import('pptxgenjs');
  const pres = new pptxgen();

  // Use a real custom page size so PowerPoint/Keynote report the standard
  // dimensions (16:9 = 13.333×7.5", 4:3 = 10×7.5") instead of pptxgenjs' 10×5.625.
  const layout = SLIDE_LAYOUTS[s.slideSize] || SLIDE_LAYOUTS['16:9'];
  const W = layout.w;
  const H = layout.h;
  pres.defineLayout({ name: 'CUSTOM', width: W, height: H });
  pres.layout = 'CUSTOM';

  // The slide design was authored in a 10×5.625 coordinate space; scale every
  // position/size/font to the chosen page so the look is identical, just bigger.
  const SX = W / 10; // horizontal scale (x, widths, fonts)
  const SY = H / 5.625; // vertical scale (y, heights)

  let bgEmbedFailed = false;

  // Pre-fetch all background images as base64 to ensure they embed properly.
  const bgUrlCache = new Map<string, string>();
  const urlsToFetch = new Set<string>();
  songsToExport.forEach((song) => {
    const bg = s.unifyBackground ? s.selectedBg : song.customBg || s.selectedBg;
    if (bg?.url && !bg.url.startsWith('data:')) urlsToFetch.add(bg.url);
  });
  await Promise.all(
    Array.from(urlsToFetch).map(async (url) => {
      const b64 = await fetchImageAsBase64(url);
      if (b64) bgUrlCache.set(url, b64);
    }),
  );

  const titleFont = 'Microsoft YaHei';
  const bodyFont = 'Microsoft YaHei';

  const generateSongSlides = (song: SongInput, isMultiple: boolean) => {
    const activeBg = s.unifyBackground ? s.selectedBg : song.customBg || s.selectedBg;
    const userLc = song.lyricColor || s.lyricColor;
    const userTc = song.translationColor || s.translationColor;
    const colors = resolveSlideColors(activeBg, userLc, userTc);
    const lc = colors.lc.replace('#', '');
    const tc = colors.tc.replace('#', '');
    const lps = song.linesPerSlide || s.linesPerSlide;
    const baseLfs = s.unifyFontSize ? s.lyricFontSize : song.lyricFontSize || s.lyricFontSize;
    const baseTfs = s.unifyFontSize ? s.translationFontSize : song.translationFontSize || s.translationFontSize;
    const shadowOn = song.shadow !== undefined ? song.shadow : s.enableShadow;
    const textShadow = shadowOn ? pptShadow(s.shadowLevel) : undefined;

    // Sets the slide background. Image backgrounds use a full-bleed "cover"
    // image (crops to fill, never distorts — fixes the squished look at any
    // aspect ratio); solid colours use the slide background.
    const setSlideBg = (slide: any) => {
      let drewImage = false;
      if (activeBg?.url) {
        const data = bgUrlCache.get(activeBg.url) || (activeBg.url.startsWith('data:') ? activeBg.url : null);
        if (data) {
          slide.background = { color: activeBg?.color || '000000' };
          slide.addImage({ data, x: 0, y: 0, w: W, h: H, sizing: { type: 'cover', w: W, h: H } });
          drewImage = true;
        } else {
          // Couldn't embed (CORS / timeout). Fall back to a solid colour.
          bgEmbedFailed = true;
          slide.background = { color: activeBg?.color || '064E3B' };
        }
      } else {
        slide.background = { color: activeBg?.color || '064E3B' };
      }
      if (drewImage && colors.overlay) {
        slide.addShape(pres.ShapeType.rect, {
          x: 0, y: 0, w: W, h: H,
          fill: { color: '000000', transparency: 55 }, line: { type: 'none' },
        });
      }
    };

    // Title (cover) slide(s).
    if (s.showSongTitle) {
      if (isMultiple) {
        const headerSlide = pres.addSlide();
        setSlideBg(headerSlide);
        headerSlide.addText('SONG', { x: 0, y: 1.0 * SY, w: '100%', align: 'center', fontFace: bodyFont, fontSize: 14 * SX, color: 'A7F3D0', bold: true, charSpacing: 10 });
        headerSlide.addText(song.title, { x: 0, y: 2.2 * SY, w: '100%', h: 1.5 * SY, align: 'center', fontFace: titleFont, fontSize: 64 * SX, color: 'FFFFFF', bold: true, shadow: textShadow });
        headerSlide.addShape(pres.ShapeType.rect, { x: (W - 1.5 * SX) / 2, y: 4.2 * SY, w: 1.5 * SX, h: 0.05 * SY, fill: { color: 'A7F3D0' } });
      }
      const slide = pres.addSlide();
      setSlideBg(slide);
      if (isMultiple) {
        slide.addText('WORSHIP SONG', { x: 0, y: 0.8 * SY, w: '100%', align: 'center', fontFace: bodyFont, fontSize: 12 * SX, color: 'A7F3D0', bold: true, charSpacing: 15 });
      }
      slide.addText(song.title, { x: 0, y: 1.5 * SY, w: '100%', h: 2 * SY, align: 'center', fontFace: titleFont, fontSize: 48 * SX, color: lc, bold: true, shadow: textShadow });
      slide.addText(song.englishTitle || '', { x: 0, y: 3.5 * SY, w: '100%', h: 1 * SY, align: 'center', fontFace: bodyFont, fontSize: 24 * SX, color: tc, shadow: textShadow });
    }

    // Expand repeated [副歌]/[主歌] sections, then paginate.
    const exp = expandSongSections(song.lyrics || '', song.englishLyrics || '');
    const slidesContent = paginateLyrics(exp.lyrics, exp.english, lps);
    const transRatio = baseLfs > 0 ? baseTfs / baseLfs : 0.5;
    const lineH = 0.8 * SY;
    const transH = 0.8 * SY;
    const pinyinH = s.enablePinyin ? 0.4 * SY : 0;

    slidesContent.forEach((slideLines) => {
      const lyricPt = Math.max(12, Math.min(72, baseLfs)) * SX;
      const transPt = Math.max(10, Math.min(48, Math.round(baseLfs * transRatio))) * SX;
      const pinyinPt = Math.max(10, Math.round(Math.max(12, Math.min(72, baseLfs)) * 0.45)) * SX;
      const lSlide = pres.addSlide();
      setSlideBg(lSlide);
      const blockH = slideLines.reduce((h, l) => h + pinyinH + lineH + (l.en ? transH : 0), 0);
      let currentY = Math.max(0.3 * SY, (H - blockH) / 2);
      slideLines.forEach(({ cn, en }) => {
        if (s.enablePinyin) {
          const py = toPinyin(cn);
          if (py) lSlide.addText(py, { x: 0, y: currentY, w: '100%', h: pinyinH, align: 'center', fontFace: bodyFont, fontSize: pinyinPt, color: lc, shadow: textShadow });
          currentY += pinyinH;
        }
        lSlide.addText(cn, { x: 0, y: currentY, w: '100%', h: lineH, align: 'center', fontFace: titleFont, fontSize: lyricPt, color: lc, bold: true, shadow: textShadow });
        currentY += lineH;
        if (en) {
          lSlide.addText(en, { x: 0, y: currentY, w: '100%', h: 0.6 * SY, align: 'center', fontFace: bodyFont, fontSize: transPt, color: tc, italic: true, shadow: textShadow });
          currentY += transH;
        }
      });
    });
  };

  const isMultiple = songsToExport.length > 1;
  songsToExport.forEach((song) => generateSongSlides(song, isMultiple));

  const blob = (await pres.write({ outputType: 'blob' })) as Blob;
  return { blob, bgEmbedFailed };
}

// Trigger a browser download of a generated deck Blob.
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pptx') ? fileName : `${fileName}.pptx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
