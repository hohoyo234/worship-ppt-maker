// ── Cloud sync (shared song library, no login) ───────────────────────────────
// Reuses the existing MCR Supabase project — just a separate `ppt_song_library`
// table. The anon key below is public by design (security is enforced by the
// table's RLS policies). Everything is wrapped so the app keeps working offline
// if the network/cloud is unavailable.

import { createClient } from '@supabase/supabase-js';
import type { LibrarySong } from './songLibrary';

const SUPABASE_URL = 'https://tgnngqjgaiunmamigvjp.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnbm5ncWpnYWl1bm1hbWlndmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDEyNzIsImV4cCI6MjA5MzQxNzI3Mn0.QnnftPXFRfv4GHYdW7_SItN9ZnjsgvsIKhgHXGn5wWU';

const TABLE = 'ppt_song_library';

export const cloudEnabled = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

type Row = {
  id?: string;
  title: string;
  english_title?: string;
  producer?: string;
  lyrics?: string;
  english_lyrics?: string;
  bg?: any;
  updated_at?: string;
};

const toRow = (s: LibrarySong): Row => ({
  title: s.title,
  english_title: s.englishTitle || '',
  producer: s.producer || '',
  lyrics: s.lyrics || '',
  english_lyrics: s.englishLyrics || '',
  bg: s.bg ?? null,
  updated_at: new Date().toISOString(),
});

const fromRow = (r: Row): LibrarySong => ({
  id: r.id || crypto.randomUUID(),
  title: r.title,
  englishTitle: r.english_title || '',
  producer: r.producer || '',
  lyrics: r.lyrics || '',
  englishLyrics: r.english_lyrics || '',
  bg: r.bg ?? null,
  updatedAt: r.updated_at ? Date.parse(r.updated_at) || 0 : 0,
});

// Read the whole shared library.
export async function cloudFetchAll(): Promise<LibrarySong[]> {
  const { data, error } = await sb.from(TABLE).select('*').limit(2000);
  if (error) throw error;
  return (data || []).map(fromRow);
}

// Upsert a single song, keyed by title (case-insensitive via the table's index).
export async function cloudUpsert(song: LibrarySong): Promise<void> {
  if (!song.title?.trim()) return;
  const { data: existing } = await sb.from(TABLE).select('id').eq('title', song.title).maybeSingle();
  if (existing?.id) {
    await sb.from(TABLE).update(toRow(song)).eq('id', existing.id);
  } else {
    const { error } = await sb.from(TABLE).insert(toRow(song));
    // Ignore unique-violation races (another device inserted the same title).
    if (error && error.code !== '23505') throw error;
  }
}

// Insert many new songs (used for first-time population). De-dupes by title so a
// single duplicate can't abort the whole batch; falls back to per-row if a chunk
// still conflicts with rows already in the cloud.
export async function cloudBulkInsert(songs: LibrarySong[]): Promise<void> {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const s of songs) {
    const t = (s.title || '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(toRow(s));
  }
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb.from(TABLE).insert(chunk);
    if (error) {
      // A conflict with existing cloud rows aborts the whole statement — retry
      // row by row so the non-conflicting ones still land.
      for (const r of chunk) await sb.from(TABLE).insert(r);
    }
  }
}

// Delete by title.
export async function cloudDelete(title: string): Promise<void> {
  if (!title?.trim()) return;
  await sb.from(TABLE).delete().eq('title', title);
}
