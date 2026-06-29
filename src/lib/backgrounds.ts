import type { BgOption } from './pptGenerator';

// Solid-color + remote preset backgrounds (the set the original app shipped).
const PRESET_BACKGROUNDS: BgOption[] = [
  { id: 'emerald', label: '森林深绿', color: '064E3B', url: null },
  { id: 'light', label: '圣洁光芒', url: 'https://images.unsplash.com/photo-1510531704581-5b2870972060?auto=format&fit=crop&q=80&w=2560' },
  { id: 'peace', label: '宁静时刻', url: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?auto=format&fit=crop&q=80&w=2560' },
  { id: 'cross', label: '福音之光', url: 'https://images.unsplash.com/photo-1445053023192-8d45cb66099d?auto=format&fit=crop&q=80&w=2560' },
  { id: 'mountain', label: '群山呼唤', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=2560' },
  { id: 'ocean', label: '圣灵如水', url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&q=80&w=2560' },
  { id: 'midnight', label: '午夜星空', color: '0F172A', url: null },
  { id: 'plum', label: '深紫祷告', color: '3B0764', url: null },
];

// Local worship backgrounds bundled from src/assets/backgrounds. Vite hashes each
// file and returns a base-path-correct URL, so they preview and embed into the
// .pptx the same way remote presets do.
const localModules = import.meta.glob('../assets/backgrounds/*.{jpeg,jpg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// Turn "Sunrise_horizon_soft_peach_grey_202606291045.jpeg" → "Sunrise horizon soft peach grey".
const prettyLabel = (path: string): string => {
  const file = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  return file.replace(/_?\d{8,}.*$/, '').replace(/_+/g, ' ').trim() || '背景';
};

const LOCAL_BACKGROUNDS: BgOption[] = Object.entries(localModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => ({
    id: 'bg-' + path.split('/').pop()!.replace(/\.[^.]+$/, ''),
    label: prettyLabel(path),
    url,
  }));

export const BACKGROUND_OPTIONS: BgOption[] = [...PRESET_BACKGROUNDS, ...LOCAL_BACKGROUNDS];

// Build a free AI background URL (Pollinations — no API key required).
export function pollinationsBg(prompt: string, seed = Math.floor(Math.random() * 1e6)): string {
  const style =
    'Professional 8k photography, hyper-realistic, sharp focus, high-end Christian worship background, majestic soft volumetric lighting, cinematic atmosphere, clean elegant composition, deep rich colors, 16:9 aspect ratio';
  const enc = encodeURIComponent(`${prompt}, ${style}`);
  return `https://image.pollinations.ai/prompt/${enc}?width=1920&height=1080&nologo=true&enhance=true&seed=${seed}`;
}
