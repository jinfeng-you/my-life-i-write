# my life I write：互动功能升级说明

本次升级把“阅读量、文章点赞、公共批注/想法、留言点赞/回复”从浏览器本地状态改为 Cloudflare D1 公共数据；私人划线仍只保存在当前浏览器。

## 新增功能

- **公共阅读量**：同一访客同一天对同一文章只计一次；文章列表读取 D1 中的累计阅读量。
- **公共文章点赞**：同一匿名访客对同一文章可以点赞/取消点赞，所有访问者共享总数。
- **私人划线**：选中文字 →「划线」，只保存到当前设备/浏览器的 localStorage。
- **公共批注**：选中文字 →「写下想法」，保存选中文字位置和第一条想法；正文旁显示小圆标，点击可查看全部想法。
- **留言点赞**：留言区可以点赞/取消点赞，不要求登录。
- **留言回复**：留言可以进行一级回复，只需要昵称和文字。

## 替换文件

请从压缩包根目录进入 `src/`，按以下路径直接覆盖：

1. `src/worker.js`
2. `src/scripts/site.js`
3. `src/components/ArticleEntry.astro`
4. `src/pages/writing/[id].astro`
5. `src/pages/about.astro`
6. `src/styles/site.css`

新增：

7. `migrations/0002_stats_annotations_replies.sql`
8. `README-interactions.md`

## 数据库迁移

不要重复执行 `0001_comments.sql`。

本次新增的 D1 迁移是：

```powershell
npx wrangler d1 migrations apply my-life-i-write-comments --local
```

本地确认无误后，再执行：

```powershell
npx wrangler d1 migrations apply my-life-i-write-comments --remote
```

生产环境必须先应用 `0002`，再让新的 Worker 上线，否则 `/api/stats`、批注和留言点赞/回复会访问不存在的表。

## 本地测试

```powershell
npm run build
npx wrangler dev
```

重点检查：

1. 打开文章详情页，阅读量会从 D1 返回；刷新同一天不会重复增加。
2. 文章列表的“X 阅读”不再固定为 0。
3. 点文章爱心后，换浏览器/无痕窗口查看，总点赞数会同步。
4. 选中文字，选择“划线”，刷新后当前设备仍存在；换设备则不存在。
5. 选中文字，选择“写下想法”，提交后正文旁出现数字标记；点击标记可以看到想法。
6. 关于页留言可以点赞、回复；刷新后数据仍然存在。

## 数据结构

- `post_stats`：文章公共阅读量/点赞总数。
- `post_views`：按访客 + 文章 + 日期去重的阅读记录。
- `post_likes`：文章点赞记录。
- `comments.parent_id`：留言回复关系。
- `comment_likes`：留言点赞记录。
- `annotations`：正文选区及其字符偏移。
- `annotation_thoughts`：批注下面的公共想法。

匿名访客通过浏览器生成随机 `visitorId`。它不是登录身份，只用于防止同一浏览器重复计数/重复点赞；清除网站数据或换设备后会被视为新的访客。
