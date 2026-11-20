const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function visitorIdFrom(request, body = {}) {
  const header = clean(request.headers.get('X-Visitor-Id'), 80);
  return header || clean(body.visitor_id, 80) || '';
}

async function getStats(env, posts, visitorId = '') {
  if (!env.DB) return { stats: {} };
  const uniquePosts = [...new Set(posts.map(p => clean(p, 80)).filter(Boolean))];
  if (!uniquePosts.length) return { stats: {} };

  const placeholders = uniquePosts.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT post_slug, views, likes FROM post_stats WHERE post_slug IN (${placeholders})`
  ).bind(...uniquePosts).all();

  const liked = new Set();
  if (visitorId) {
    const { results: likeRows } = await env.DB.prepare(
      `SELECT post_slug FROM post_likes WHERE visitor_id = ? AND post_slug IN (${placeholders})`
    ).bind(visitorId, ...uniquePosts).all();
    likeRows.forEach(row => liked.add(row.post_slug));
  }

  const stats = {};
  uniquePosts.forEach(post => {
    stats[post] = { views: 0, likes: 0, liked: liked.has(post) };
  });
  results.forEach(row => {
    stats[row.post_slug] = {
      views: Number(row.views || 0),
      likes: Number(row.likes || 0),
      liked: liked.has(row.post_slug),
    };
  });
  return { stats };
}

async function stats(request, env) {
  if (!env.DB) return json({ error: '统计数据库尚未配置。' }, 503);
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const posts = url.searchParams.getAll('posts');
    const visitorId = clean(url.searchParams.get('visitor_id'), 80);
    return json(await getStats(env, posts, visitorId));
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: '请求格式不正确。' }, 400); }
    const post = clean(body.post, 80);
    const action = clean(body.action, 20);
    const visitorId = visitorIdFrom(request, body);
    if (!post || !visitorId) return json({ error: '缺少必要参数。' }, 400);

    await env.DB.prepare(
      `INSERT INTO post_stats (post_slug, views, likes) VALUES (?, 0, 0)
       ON CONFLICT(post_slug) DO NOTHING`
    ).bind(post).run();

    if (action === 'view') {
      const viewDate = new Date().toISOString().slice(0, 10);
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO post_views (post_slug, visitor_id, view_date) VALUES (?, ?, ?)`
      ).bind(post, visitorId, viewDate).run();
      if (result.meta?.changes) {
        await env.DB.prepare(`UPDATE post_stats SET views = views + 1 WHERE post_slug = ?`).bind(post).run();
      }
    } else if (action === 'like') {
      const wantLike = Boolean(body.like);
      if (wantLike) {
        const result = await env.DB.prepare(
          `INSERT OR IGNORE INTO post_likes (post_slug, visitor_id) VALUES (?, ?)`
        ).bind(post, visitorId).run();
        if (result.meta?.changes) {
          await env.DB.prepare(`UPDATE post_stats SET likes = likes + 1 WHERE post_slug = ?`).bind(post).run();
        }
      } else {
        const result = await env.DB.prepare(
          `DELETE FROM post_likes WHERE post_slug = ? AND visitor_id = ?`
        ).bind(post, visitorId).run();
        if (result.meta?.changes) {
          await env.DB.prepare(`UPDATE post_stats SET likes = MAX(0, likes - 1) WHERE post_slug = ?`).bind(post).run();
        }
      }
    } else {
      return json({ error: '未知统计操作。' }, 400);
    }

    return json((await getStats(env, [post], visitorId)).stats[post]);
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

async function comments(request, env) {
  if (!env.DB) return json({ error: '评论数据库尚未配置。' }, 503);
  const url = new URL(request.url);
  const post = clean(url.searchParams.get('post'), 80);
  if (!post) return json({ error: '缺少文章标识。' }, 400);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.name, c.text, c.created_at, c.parent_id,
              (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes
       FROM comments c
       WHERE c.post_slug = ? AND c.status = 1
       ORDER BY c.id DESC
       LIMIT 100`
    ).bind(post).all();
    return json({ comments: results });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: '请求格式不正确。' }, 400); }
    const name = clean(body.name, 20) || '匿名';
    const text = clean(body.text, 300);
    const parentId = Number(body.parent_id || 0) || null;
    if (!text) return json({ error: '留言不能为空。' }, 400);

    if (parentId) {
      const parent = await env.DB.prepare(
        `SELECT id FROM comments WHERE id = ? AND post_slug = ? AND status = 1`
      ).bind(parentId, post).first();
      if (!parent) return json({ error: '回复对象不存在。' }, 400);
    }

    await env.DB.prepare(
      `INSERT INTO comments (name, text, post_slug, status, parent_id) VALUES (?, ?, ?, 1, ?)`
    ).bind(name, text, post, parentId).run();

    const { results } = await env.DB.prepare(
      `SELECT c.id, c.name, c.text, c.created_at, c.parent_id,
              (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) AS likes
       FROM comments c
       WHERE c.post_slug = ? AND c.status = 1
       ORDER BY c.id DESC
       LIMIT 100`
    ).bind(post).all();
    return json({ ok: true, comments: results }, 201);
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

async function commentLike(request, env) {
  if (!env.DB) return json({ error: '评论数据库尚未配置。' }, 503);
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式不正确。' }, 400); }
  const commentId = Number(body.comment_id || 0);
  const visitorId = visitorIdFrom(request, body);
  const like = Boolean(body.like);
  if (!commentId || !visitorId) return json({ error: '缺少必要参数。' }, 400);

  const comment = await env.DB.prepare(`SELECT id FROM comments WHERE id = ? AND status = 1`).bind(commentId).first();
  if (!comment) return json({ error: '评论不存在。' }, 404);

  let changed = 0;
  if (like) {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO comment_likes (comment_id, visitor_id) VALUES (?, ?)`
    ).bind(commentId, visitorId).run();
    changed = result.meta?.changes || 0;
  } else {
    const result = await env.DB.prepare(
      `DELETE FROM comment_likes WHERE comment_id = ? AND visitor_id = ?`
    ).bind(commentId, visitorId).run();
    changed = result.meta?.changes || 0;
  }

  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS likes FROM comment_likes WHERE comment_id = ?`
  ).bind(commentId).first();
  return json({ likes: Number(row?.likes || 0), liked: like, changed });
}

async function annotations(request, env) {
  if (!env.DB) return json({ error: '批注数据库尚未配置。' }, 503);
  const url = new URL(request.url);
  const post = clean(url.searchParams.get('post'), 80);
  if (!post) return json({ error: '缺少文章标识。' }, 400);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT a.id, a.selected_text, a.start_offset, a.end_offset, a.name, a.created_at,
              (SELECT COUNT(*) FROM annotation_thoughts t WHERE t.annotation_id = a.id AND t.status = 1) AS thought_count
       FROM annotations a
       WHERE a.post_slug = ? AND a.status = 1
       ORDER BY a.start_offset ASC, a.id ASC`
    ).bind(post).all();

    const ids = results.map(x => x.id);
    let thoughts = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const { results: rows } = await env.DB.prepare(
        `SELECT id, annotation_id, name, text, created_at
         FROM annotation_thoughts
         WHERE annotation_id IN (${placeholders}) AND status = 1
         ORDER BY id ASC`
      ).bind(...ids).all();
      thoughts = rows;
    }
    return json({ annotations: results, thoughts });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: '请求格式不正确。' }, 400); }
    const selectedText = clean(body.selected_text, 500);
    const name = clean(body.name, 20) || '匿名';
    const thought = clean(body.thought, 500);
    const start = Number(body.start_offset);
    const end = Number(body.end_offset);
    if (!selectedText || !thought || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
      return json({ error: '批注内容不完整。' }, 400);
    }

    const result = await env.DB.prepare(
      `INSERT INTO annotations (post_slug, selected_text, start_offset, end_offset, name, status)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).bind(post, selectedText, start, end, name).run();
    const id = result.meta?.last_row_id;
    await env.DB.prepare(
      `INSERT INTO annotation_thoughts (annotation_id, name, text, status) VALUES (?, ?, ?, 1)`
    ).bind(id, name, thought).run();
    return json({ ok: true, id }, 201);
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

async function annotationThoughts(request, env) {
  if (!env.DB) return json({ error: '批注数据库尚未配置。' }, 503);
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get('annotation_id') || 0);
    if (!id) return json({ error: '缺少批注标识。' }, 400);
    const { results } = await env.DB.prepare(
      `SELECT id, annotation_id, name, text, created_at
       FROM annotation_thoughts WHERE annotation_id = ? AND status = 1 ORDER BY id ASC`
    ).bind(id).all();
    return json({ thoughts: results });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: '请求格式不正确。' }, 400); }
    const annotationId = Number(body.annotation_id || 0);
    const name = clean(body.name, 20) || '匿名';
    const text = clean(body.text, 500);
    if (!annotationId || !text) return json({ error: '想法不能为空。' }, 400);
    const annotation = await env.DB.prepare(`SELECT id FROM annotations WHERE id = ? AND status = 1`).bind(annotationId).first();
    if (!annotation) return json({ error: '批注不存在。' }, 404);
    await env.DB.prepare(
      `INSERT INTO annotation_thoughts (annotation_id, name, text, status) VALUES (?, ?, ?, 1)`
    ).bind(annotationId, name, text).run();
    return json({ ok: true }, 201);
  }
  return json({ error: 'Method Not Allowed' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/stats') return await stats(request, env);
      if (url.pathname === '/api/comments') return await comments(request, env);
      if (url.pathname === '/api/comments/like') return await commentLike(request, env);
      if (url.pathname === '/api/annotations') return await annotations(request, env);
      if (url.pathname === '/api/annotation-thoughts') return await annotationThoughts(request, env);
    } catch (error) {
      console.error(error);
      return json({ error: '服务器暂时无法处理请求。' }, 500);
    }
    return env.ASSETS.fetch(request);
  },
};
