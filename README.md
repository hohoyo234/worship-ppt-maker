# 敬拜 PPT 制作器 · Worship PPT Maker

一个**完全独立、零后端、纯本地**的敬拜歌词 PPT 生成网站。从原 GraceFlow 教会管理系统中抽离出「PPT 制作」功能，去掉了登录、Supabase 云同步和教会上下文，所有数据只存在浏览器 `localStorage`，可作为纯静态网站部署到任意托管平台。

## 功能

- 多首歌组成歌单，逐首输入中文歌词 + 对照翻译
- 背景：内置预设、上传本地图片、AI 生成（Pollinations，无需 API key）
- 排版：每页行数、歌词/翻译字号、封面页开关、拼音开关
- 文字：歌词/翻译颜色、阴影开关与强度（淡/中/浓）
- 用 `[副歌]` 标记段落，重复段落只写一次自动展开
- 实时预览 16:9 幻灯片
- 一键生成并下载 `.pptx`（pptxgenjs，下载文件与预览一致）

数据自动保存在本地，刷新不丢失。

## 开发

```bash
cd ppt-maker
npm install
npm run dev        # http://localhost:3100
```

## 构建 / 部署

```bash
npm run build      # 产物在 dist/，纯静态，可直接部署
npm run preview
```

## 技术栈

React 19 · Vite 6 · Tailwind v4 · pptxgenjs · pinyin-pro

核心生成引擎在 `src/lib/pptGenerator.ts`，排版/分页/配色逻辑在 `src/lib/pptTheme.ts`（与原项目共享，保证导出效果一致）。
