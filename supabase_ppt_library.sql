-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  敬拜 PPT 制作器 — 云端共享歌库表                                            ║
-- ║  在你现有的 MCR Supabase 项目里运行(SQL Editor 粘贴执行即可)。            ║
-- ║  与 MCR 现有的表互不干扰,只是多加一张表。                                  ║
-- ║  访问模式:免登录共享(anon 角色可读写)。                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.ppt_song_library (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  english_title  text default '',
  producer       text default '',
  lyrics         text default '',
  english_lyrics text default '',
  bg             jsonb,                 -- 背景(含 AI 生成图 URL),跟着歌存
  updated_at     timestamptz default now()
);

-- 同名歌曲只存一份(按小写歌名去重),客户端按歌名合并。
create unique index if not exists ppt_song_library_title_uniq
  on public.ppt_song_library (lower(title));

-- 开启行级安全 + 免登录读写策略
alter table public.ppt_song_library enable row level security;

drop policy if exists "ppt_lib_read"   on public.ppt_song_library;
drop policy if exists "ppt_lib_insert" on public.ppt_song_library;
drop policy if exists "ppt_lib_update" on public.ppt_song_library;
drop policy if exists "ppt_lib_delete" on public.ppt_song_library;

create policy "ppt_lib_read"   on public.ppt_song_library for select using (true);
create policy "ppt_lib_insert" on public.ppt_song_library for insert with check (true);
create policy "ppt_lib_update" on public.ppt_song_library for update using (true) with check (true);
create policy "ppt_lib_delete" on public.ppt_song_library for delete using (true);

-- 确保匿名角色有表权限
grant select, insert, update, delete on public.ppt_song_library to anon, authenticated;
