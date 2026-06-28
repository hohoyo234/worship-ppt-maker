import type { SeedSong } from './songLibrary';
import { SOP_SONGS } from './sopSongs';

// The song library is the complete 讚美之泉 (Stream of Praise) catalog — 707 songs
// imported from the official SOP song & lyrics list (sop.org). Each entry carries
// Traditional + Simplified Chinese + English titles and lyrics, plus 作曲/作詞/歌手/
// 出版/調性 metadata. Regenerate `sopSongs.ts` from the source PDF rather than
// editing it by hand.

// Bump when the catalog changes so existing users get the new songs (additive).
export const SEED_VERSION = 2;

// Bump to force a one-time full replacement of the user's library with the
// catalog below (see replaceLibrary in songLibrary.ts).
export const REPLACE_VERSION = 1;

export const SEED_SONGS: SeedSong[] = SOP_SONGS;
