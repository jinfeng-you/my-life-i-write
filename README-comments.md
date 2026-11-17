# 评论系统维护说明

本站评论使用 Cloudflare D1 + Worker API，不再使用浏览器 localStorage。

## 首次配置 D1

1. 在项目根目录运行：
   `npx wrangler d1 create my-life-i-write-comments`
2. 把命令输出的 `database_id` 填入 `wrangler.jsonc` 的 `database_id`。
3. 初始化数据库：
   `npx wrangler d1 execute my-life-i-write-comments --remote --file migrations/0001_comments.sql`
4. `npm run build`
5. `npx wrangler deploy`

## 本地开发数据库

可以用：
`npx wrangler d1 execute my-life-i-write-comments --local --file migrations/0001_comments.sql`

## 说明

当前版本把留言直接写入数据库并公开展示。正式长期运行前建议再加 Cloudflare Turnstile、提交频率限制和后台审核机制。
