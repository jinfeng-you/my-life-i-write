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

async function comments(request, env) {
  if (!env.DB) {
    return json({ error: '评论数据库尚未配置。' }, 503);
  }

  const url = new URL(request.url);
  const post = clean(url.searchParams.get('post'), 80);
  if (!post) return json({ error: '缺少文章标识。' }, 400);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, name, text, created_at
       FROM comments
       WHERE post_slug = ? AND status = 1
       ORDER BY id DESC
       LIMIT 100`
    ).bind(post).all();
    return json({ comments: results });
  }

  if (request.method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: '请求格式不正确。' }, 400);
    }

    const name = clean(body.name, 20) || '匿名';
    const text = clean(body.text, 300);
    if (!text) return json({ error: '留言不能为空。' }, 400);

    await env.DB.prepare(
      `INSERT INTO comments (name, text, post_slug, status)
       VALUES (?, ?, ?, 1)`
    ).bind(name, text, post).run();

    const { results } = await env.DB.prepare(
      `SELECT id, name, text, created_at
       FROM comments
       WHERE post_slug = ? AND status = 1
       ORDER BY id DESC
       LIMIT 100`
    ).bind(post).all();

    return json({ ok: true, comments: results }, 201);
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/comments') {
      try {
        return await comments(request, env);
      } catch (error) {
        console.error(error);
        return json({ error: '服务器暂时无法处理留言。' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
