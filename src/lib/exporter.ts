// ── Export orchestration: one merged deck, or per-song files zipped ──────────
import { generateDeck, downloadBlob, type SongInput, type DeckSettings } from './pptGenerator';

const today = () => new Date().toISOString().split('T')[0];

const safeName = (s: string) =>
  (s || 'song').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'song';

export interface ExportResult {
  bgEmbedFailed: boolean;
  fileCount: number;
}

// Merge every song into a single .pptx and download it.
export async function exportMerged(
  songs: SongInput[],
  settings: DeckSettings,
  deckName: string,
): Promise<ExportResult> {
  const { blob, bgEmbedFailed } = await generateDeck(songs, settings);
  downloadBlob(blob, `Worship_${safeName(deckName)}_${today()}.pptx`);
  return { bgEmbedFailed, fileCount: 1 };
}

// Generate one .pptx per song and download them together as a single .zip.
export async function exportZip(
  songs: SongInput[],
  settings: DeckSettings,
  zipName: string,
): Promise<ExportResult> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let bgEmbedFailed = false;
  const used = new Set<string>();

  for (const song of songs) {
    const { blob, bgEmbedFailed: failed } = await generateDeck([song], settings);
    bgEmbedFailed = bgEmbedFailed || failed;
    let name = safeName(song.title || 'song');
    let n = name;
    let i = 2;
    while (used.has(n)) n = `${name}_${i++}`;
    used.add(n);
    zip.file(`${n}.pptx`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Worship_${safeName(zipName)}_${today()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { bgEmbedFailed, fileCount: songs.length };
}
