// ── Free, heuristic "smart" helpers (no AI / no API) ─────────────────────────
// • detectChorus: find a repeated stanza and mark it as [副歌] so the generator
//   expands it automatically (chorus typed once, shown at every repeat).
// • deriveBackground: pick a fitting background from the lyrics' keywords,
//   falling back to a free Pollinations image themed on the song title.

import type { BgOption } from './pptGenerator';
import { BACKGROUND_OPTIONS, pollinationsBg } from './backgrounds';

const blockKey = (lines: string[]) => lines.map((l) => l.trim()).join('\n').toLowerCase();

// Insert [副歌] markers around the most-repeated multi-line stanza. Works when
// the lyrics are separated into stanzas by blank lines. No repetition → returned
// unchanged (so the user can still hand-mark sections).
export function detectChorus(lyrics: string): string {
  const text = (lyrics || '').replace(/\r/g, '').trim();
  if (!text || /\[[^\]]+\]/.test(text)) return lyrics; // already has markers

  const stanzas = text.split(/\n[ \t]*\n/).map((s) => s.split('\n').filter((l) => l.trim()));
  if (stanzas.length < 3) return lyrics; // not enough structure to be confident

  // Count identical stanzas (2+ lines each).
  const counts = new Map<string, number>();
  for (const st of stanzas) {
    if (st.length < 2) continue;
    const k = blockKey(st);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let chorusKey = '';
  let max = 1;
  for (const [k, c] of counts) if (c > max) { max = c; chorusKey = k; }
  if (!chorusKey || max < 2) return lyrics; // no stanza repeats

  // Rebuild: first occurrence gets a "[副歌]" header; later repeats become a
  // lone "[副歌]" reference line (expandSongSections fills them back in).
  const out: string[] = [];
  let seen = false;
  for (const st of stanzas) {
    if (blockKey(st) === chorusKey) {
      if (!seen) {
        out.push('[副歌]');
        out.push(...st);
        seen = true;
      } else {
        out.push('[副歌]');
      }
    } else {
      out.push(...st);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

// Keyword → preset background, so a song about light/water/mountains gets a
// fitting photo for free. Unmatched songs get a Pollinations image themed on
// the title (still free, no key).
const KEYWORD_BG: { words: string[]; id: string }[] = [
  { words: ['光', '荣耀', '荣光', 'light', 'glory', 'shine'], id: 'light' },
  { words: ['水', '江河', '海', '活水', 'river', 'water', 'sea', 'flow'], id: 'ocean' },
  { words: ['山', '高山', '群山', 'mountain', 'hill'], id: 'mountain' },
  { words: ['十字架', '宝血', '救赎', 'cross', 'blood', 'calvary'], id: 'cross' },
  { words: ['夜', '星', '安静', '默想', 'night', 'star', 'still', 'quiet'], id: 'midnight' },
  { words: ['平安', '安息', '同在', 'peace', 'rest', 'presence'], id: 'peace' },
];

export function deriveBackground(title: string, lyrics: string): BgOption {
  const hay = `${title}\n${lyrics}`.toLowerCase();
  for (const { words, id } of KEYWORD_BG) {
    if (words.some((w) => hay.includes(w.toLowerCase()))) {
      const bg = BACKGROUND_OPTIONS.find((b) => b.id === id);
      if (bg) return bg;
    }
  }
  // Fallback: AI-themed image from the title (free, no key).
  const theme = title?.trim() || 'sacred holy light, ethereal worship';
  return { id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: `AI: ${theme.slice(0, 8)}`, url: pollinationsBg(theme), isAiResult: true };
}

// Best-effort: parse a "歌名 / 制作人" or "Artist - Title" style line.
export function parseEntryLine(raw: string): { title: string; producer: string; lyricHint: string } {
  const s = (raw || '').trim();
  // "Artist - Title" (common English format)
  const dash = s.split(/\s+[-–—]\s+/);
  if (dash.length === 2 && dash[0].length < 40 && dash[1].length < 60) {
    return { title: dash[1].trim(), producer: dash[0].trim(), lyricHint: s };
  }
  // "歌名 / 制作人" or "歌名，制作人"
  const slash = s.split(/\s*[\/、，,]\s*/);
  if (slash.length >= 2 && slash[0].length < 40) {
    return { title: slash[0].trim(), producer: slash[1].trim(), lyricHint: s };
  }
  return { title: s.length < 40 ? s : '', producer: '', lyricHint: s };
}
