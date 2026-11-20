# 文章图片与附件

## 1. 正文插图

文章正文仍然使用 `.md`。把图片放到：

`public/uploads/articles/你的文章slug/`

例如：

`public/uploads/articles/silence/cover.jpg`

然后在 Markdown 中直接写：

```md
![图片说明](/uploads/articles/silence/cover.jpg)
```

也可以使用普通 Markdown 链接：

```md
[查看图片](/uploads/articles/silence/cover.jpg)
```

图片最终会随 Astro 静态站点一起部署，不需要 D1。

## 2. PDF / HTML / ZIP 等下载文件

把文件放进：

`public/downloads/`

例如：

`public/downloads/我的文章附录.pdf`

然后在文章 Markdown 顶部 frontmatter 增加：

```yaml
attachments:
  - name: 文章附录 PDF
    path: /downloads/我的文章附录.pdf
    description: PDF 版全文
  - name: 交互式 HTML 版本
    path: /downloads/我的文章.html
    description: 浏览器打开的 HTML 版本
```

文章正文下方会自动出现“附件 / 下载”区域。

附件名称可以直接点击在线打开；右侧“下载 ↓”按钮用于保存到本地。Worker 同时会对 `/downloads/` 路径增加 `Content-Disposition: attachment`，因此右侧下载会按附件下载处理。

## 3. 重要：Markdown 文件名与 slug

文章文件继续放在：

`src/content/articles/`

例如：

`src/content/articles/silence.md`

附件文件不放在 `src/content/articles/`，而是放在 `public/downloads/`。

这样可以避免 Astro 内容集合把 PDF、HTML 等非 Markdown 文件当成文章数据，同时也让所有静态附件可以直接通过网站地址访问。
