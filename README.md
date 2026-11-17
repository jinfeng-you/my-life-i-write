# my life I write

这是把原来的单文件网站重构成 Astro 后的第一版。视觉设计与主要内容沿用原网站，内容已经从页面代码中分离到 Markdown。

## 目录

- `src/content/articles/`：文章，一篇文章一个 `.md` 文件
- `src/content/novels/`：小说作品信息与前言
- `src/content/chapters/`：小说章节，一章一个 `.md` 文件
- `src/components/`：网站公共组件
- `src/layouts/`：页面公共布局
- `src/pages/`：URL 页面
- `public/images/`：图片
- `src/styles/site.css`：原网站视觉样式

## 本地运行

需要 Node.js 22.12+（Astro 6 官方要求）。在项目根目录执行：

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址。

生产构建：

```bash
npm run build
npm run preview
```

## 如何增加文章

在 `src/content/articles/` 新建一个 Markdown 文件：

```markdown
---
title: "文章标题"
category: "想说的话"
date: "2026-11-20"
excerpt: "列表页摘要"
draft: false
---

正文第一段。

正文第二段。
```

## 如何增加小说章节

例如《分裂》第二章：

`src/content/chapters/split--chapter-2.md`

frontmatter 中保持：

```yaml
novel: "split"
order: 2
title: "第二章 · 颠沛流离"
draft: false
```

## 注意

`astro.config.mjs` 里的 `site` 目前是 `https://example.com`，正式购买域名后需要改成你的真实域名。

留言目前仍然使用浏览器 `localStorage`，因此只保存在访问者自己的设备上；它不是云端留言系统。
