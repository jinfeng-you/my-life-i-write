(() => {
  const root = document.documentElement;
  const themeBtn = document.querySelector('[data-theme-toggle]');
  const fsBtn = document.querySelector('[data-fs-toggle]');
  const year = document.querySelector('[data-year]');
  const progress = document.querySelector('.progress__bar');

  if (year) year.textContent = String(new Date().getFullYear());

  function syncTheme() {
    const ink = root.getAttribute('data-theme') === 'ink';
    if (themeBtn) {
      themeBtn.setAttribute('aria-pressed', String(ink));
      const label = themeBtn.querySelector('.theme__label');
      if (label) label.textContent = ink ? '日' : '夜';
    }
  }

  function syncFs() {
    const large = root.getAttribute('data-fs') === 'lg';
    if (fsBtn) {
      fsBtn.setAttribute('aria-pressed', String(large));
      fsBtn.setAttribute('aria-label', large ? '切换到标准字号' : '切换到大字号');
      const label = fsBtn.querySelector('[data-fs-label]');
      if (label) label.textContent = large ? '大' : '标准';
    }
  }

  themeBtn?.addEventListener('click', () => {
    const ink = root.getAttribute('data-theme') === 'ink';
    if (ink) { root.removeAttribute('data-theme'); localStorage.removeItem('mlw.theme'); }
    else { root.setAttribute('data-theme', 'ink'); localStorage.setItem('mlw.theme', 'ink'); }
    syncTheme();
  });

  fsBtn?.addEventListener('click', () => {
    const large = root.getAttribute('data-fs') === 'lg';
    if (large) { root.removeAttribute('data-fs'); localStorage.removeItem('mlw.fs'); }
    else { root.setAttribute('data-fs', 'lg'); localStorage.setItem('mlw.fs', 'lg'); }
    syncFs();
  });

  function updateProgress() {
    if (!progress) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    progress.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
  }
  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  const filters = document.querySelectorAll('[data-filter]');
  const entries = document.querySelectorAll('[data-entry-category]');
  const empty = document.querySelector('[data-entries-empty]');
  filters.forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.filter;
      filters.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
      let visible = 0;
      entries.forEach(entry => {
        const show = category === 'all' || entry.dataset.entryCategory === category;
        entry.hidden = !show;
        if (show) visible++;
      });
      if (empty) empty.hidden = visible !== 0;
    });
  });

  // ---------- 公共统计：阅读量 + 点赞 ----------
  function getVisitorId() {
    const key = 'mlw.visitorId';
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }

  const visitorId = getVisitorId();
  const statNodes = [...document.querySelectorAll('[data-view-key], [data-stat-key]')];
  const statKeys = [...new Set(statNodes.map(el => el.dataset.viewKey || el.dataset.statKey).filter(Boolean))];

  function applyStat(key, stat) {
    document.querySelectorAll(`[data-view-key="${CSS.escape(key)}"]`).forEach(el => {
      el.textContent = `${Number(stat.views || 0)} 阅读`;
    });
    document.querySelectorAll(`[data-stat-key="${CSS.escape(key)}"]`).forEach(el => {
      const views = el.querySelector('[data-views]');
      const likes = el.querySelector('[data-likes]');
      const likeBtn = el.querySelector('[data-like]');
      if (views) views.textContent = String(Number(stat.views || 0));
      if (likes) likes.textContent = String(Number(stat.likes || 0));
      if (likeBtn) {
        likeBtn.classList.toggle('is-liked', Boolean(stat.liked));
        likeBtn.setAttribute('aria-pressed', String(Boolean(stat.liked)));
      }
    });
  }

  async function loadStats() {
    if (!statKeys.length) return;
    const params = new URLSearchParams();
    statKeys.forEach(key => params.append('posts', key));
    params.set('visitor_id', visitorId);
    try {
      const response = await fetch(`/api/stats?${params.toString()}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('stats load failed');
      const data = await response.json();
      Object.entries(data.stats || {}).forEach(([key, stat]) => applyStat(key, stat));
    } catch {
      // 统计失败不影响文章阅读。
    }
  }

  async function recordView(statRoot) {
    const key = statRoot?.dataset.statKey;
    if (!key) return;
    try {
      const response = await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ post: key, action: 'view', visitor_id: visitorId }),
      });
      if (!response.ok) return;
      const stat = await response.json();
      applyStat(key, stat);
    } catch {
      // 静默失败。
    }
  }

  loadStats();
  const statRoot = document.querySelector('[data-stat-key]');
  if (statRoot) recordView(statRoot);

  const articleStat = statRoot;
  articleStat?.querySelector('[data-like]')?.addEventListener('click', async () => {
    const key = articleStat.dataset.statKey;
    const button = articleStat.querySelector('[data-like]');
    if (!key || !button || button.disabled) return;
    const next = button.getAttribute('aria-pressed') !== 'true';
    button.disabled = true;
    try {
      const response = await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ post: key, action: 'like', like: next, visitor_id: visitorId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'like failed');
      applyStat(key, data);
      button.classList.add('is-bump');
      setTimeout(() => button.classList.remove('is-bump'), 220);
    } catch {
      // 静默失败。
    } finally {
      button.disabled = false;
    }
  });

  // ---------- 关于页留言：公共留言 + 点赞 + 一级回复 ----------
  const form = document.querySelector('[data-msg-form]');
  const list = document.querySelector('[data-msgs]');
  const listEmpty = document.querySelector('[data-msgs-empty]');
  const hint = document.querySelector('[data-msg-hint]');

  if (form && list) {
    const endpoint = '/api/comments?post=about';
    let comments = [];

    const formatDate = value => {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value || '') : d.toLocaleDateString('zh-CN');
    };

    const postLike = async (commentId, next) => {
      const response = await fetch('/api/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ comment_id: commentId, like: next, visitor_id: visitorId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'like failed');
      return data;
    };

    const render = msgs => {
      comments = Array.isArray(msgs) ? msgs : [];
      list.replaceChildren();
      const roots = comments.filter(item => !item.parent_id);
      const replies = new Map();
      comments.filter(item => item.parent_id).forEach(item => {
        if (!replies.has(item.parent_id)) replies.set(item.parent_id, []);
        replies.get(item.parent_id).push(item);
      });

      const makeComment = (item, isReply = false) => {
        const li = document.createElement('li');
        li.className = isReply ? 'msg msg--reply' : 'msg';
        const top = document.createElement('div');
        top.className = 'msgs__top';
        const name = document.createElement('strong');
        name.className = 'msgs__name';
        name.textContent = item.name || '匿名';
        const date = document.createElement('time');
        date.className = 'msgs__time';
        date.textContent = formatDate(item.created_at);
        top.append(name, date);
        const text = document.createElement('p');
        text.className = 'msgs__text';
        text.textContent = item.text || '';
        const actions = document.createElement('div');
        actions.className = 'msg-actions';

        const likeBtn = document.createElement('button');
        likeBtn.type = 'button';
        likeBtn.className = 'msg-action';
        likeBtn.textContent = `喜欢 ${Number(item.likes || 0)}`;
        likeBtn.dataset.commentLike = String(item.id);
        actions.append(likeBtn);

        if (!isReply) {
          const replyBtn = document.createElement('button');
          replyBtn.type = 'button';
          replyBtn.className = 'msg-action';
          replyBtn.textContent = '回复';
          replyBtn.addEventListener('click', () => showReplyForm(li, item.id));
          actions.append(replyBtn);
        }

        likeBtn.addEventListener('click', async () => {
          likeBtn.disabled = true;
          try {
            const next = !likeBtn.classList.contains('is-liked');
            const result = await postLike(item.id, next);
            likeBtn.classList.toggle('is-liked', Boolean(result.liked));
            likeBtn.textContent = `喜欢 ${Number(result.likes || 0)}`;
          } catch {
            if (hint) hint.textContent = '点赞失败，请稍后再试。';
          } finally { likeBtn.disabled = false; }
        });

        li.append(top, text, actions);
        return li;
      };

      const showReplies = (parent, items) => {
        if (!items?.length) return;
        const wrap = document.createElement('ol');
        wrap.className = 'msgs__replies';
        items.slice().sort((a, b) => Number(a.id) - Number(b.id)).forEach(item => wrap.append(makeComment(item, true)));
        parent.append(wrap);
      };

      roots.forEach(item => {
        const li = makeComment(item);
        showReplies(li, replies.get(item.id));
        list.append(li);
      });
      if (listEmpty) listEmpty.hidden = roots.length !== 0;
    };

    const showReplyForm = (host, parentId) => {
      host.querySelector('.reply-form')?.remove();
      const replyForm = document.createElement('form');
      replyForm.className = 'reply-form';
      replyForm.innerHTML = `
        <input name="name" maxlength="20" placeholder="名字（可选）" type="text" />
        <textarea name="text" maxlength="300" rows="3" placeholder="写下回复"></textarea>
        <div><button class="btn" type="submit">回复</button><button class="msg-action" type="button" data-cancel>取消</button></div>
      `;
      replyForm.querySelector('[data-cancel]').addEventListener('click', () => replyForm.remove());
      replyForm.addEventListener('submit', async event => {
        event.preventDefault();
        const fd = new FormData(replyForm);
        const text = String(fd.get('text') || '').trim();
        if (!text) return;
        const button = replyForm.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const response = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ name: String(fd.get('name') || '').trim(), text, parent_id: parentId }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'reply failed');
          render(data.comments || []);
        } catch (error) {
          if (hint) hint.textContent = error.message || '回复失败，请稍后再试。';
          button.disabled = false;
        }
      });
      host.append(replyForm);
      replyForm.querySelector('textarea')?.focus();
    };

    const load = async () => {
      try {
        const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('load failed');
        const data = await response.json();
        render(data.comments || []);
      } catch {
        if (hint) hint.textContent = '留言暂时无法加载，请稍后再试。';
      }
    };
    load();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get('name') || '').trim();
      const text = String(fd.get('text') || '').trim();
      if (!text) { if (hint) hint.textContent = '请先写一点想说的话。'; return; }
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      if (hint) hint.textContent = '正在留下……';
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ name, text }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'submit failed');
        form.reset();
        if (hint) hint.textContent = '已经留下。现在所有访问者都可以看到这条留言。';
        render(data.comments || []);
      } catch (error) {
        if (hint) hint.textContent = error.message || '留言失败，请稍后再试。';
      } finally { if (button) button.disabled = false; }
    });
  }

  // ---------- 正文批注：私人划线 + 公共想法 ----------
  const articleBody = document.querySelector('[data-annotation-post]');
  if (articleBody) {
    const post = articleBody.dataset.annotationPost;
    const privateKey = `mlw.highlights.${post}`;
    let privateHighlights = JSON.parse(localStorage.getItem(privateKey) || '[]');
    let publicAnnotations = [];
    let publicThoughts = [];
    const annotationsPanel = document.querySelector('[data-annotations-panel]');
    const annotationsList = document.querySelector('[data-annotations-list]');

    const savePrivate = () => localStorage.setItem(privateKey, JSON.stringify(privateHighlights.slice(-80)));
    const textLength = () => getTextNodes().reduce((n, node) => n + node.nodeValue.length, 0);

    function getTextNodes() {
      const nodes = [];
      const walker = document.createTreeWalker(articleBody, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest('.annotation-marker, .annotation-bubble')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let node;
      while ((node = walker.nextNode())) nodes.push(node);
      return nodes;
    }

    function rangeOffsets(range) {
      const nodes = getTextNodes();
      let start = 0, end = 0;
      let foundStart = false, foundEnd = false;
      for (const node of nodes) {
        if (!foundStart && (node === range.startContainer || node.contains?.(range.startContainer))) {
          start += range.startContainer === node ? range.startOffset : 0;
          foundStart = true;
        }
        if (!foundEnd && (node === range.endContainer || node.contains?.(range.endContainer))) {
          end += range.endContainer === node ? range.endOffset : 0;
          foundEnd = true;
        }
        if (!foundStart) start += node.nodeValue.length;
        if (!foundEnd) end += node.nodeValue.length;
      }
      if (!foundStart || !foundEnd) return null;
      return { start, end };
    }

    function makeRange(start, end) {
      if (start < 0 || end <= start) return null;
      const nodes = getTextNodes();
      let cursor = 0;
      let startNode, endNode, startOffset = 0, endOffset = 0;
      for (const node of nodes) {
        const next = cursor + node.nodeValue.length;
        if (!startNode && start >= cursor && start <= next) { startNode = node; startOffset = start - cursor; }
        if (!endNode && end >= cursor && end <= next) { endNode = node; endOffset = end - cursor; break; }
        cursor = next;
      }
      if (!startNode || !endNode) return null;
      const range = document.createRange();
      try { range.setStart(startNode, startOffset); range.setEnd(endNode, endOffset); return range; } catch { return null; }
    }

    function wrapRange(range, className) {
      if (!range || range.collapsed) return null;
      const span = document.createElement('span');
      span.className = className;
      try {
        const frag = range.extractContents();
        span.append(frag);
        range.insertNode(span);
        return span;
      } catch { return null; }
    }

    function applyPrivateHighlights() {
      privateHighlights.slice().sort((a, b) => b.end - a.end).forEach(item => {
        const range = makeRange(Number(item.start), Number(item.end));
        if (range) wrapRange(range, 'reader-highlight');
      });
    }

    function thoughtFor(id) {
      return publicThoughts.filter(t => Number(t.annotation_id) === Number(id));
    }

    function renderPublicAnnotations() {
      publicAnnotations.slice().sort((a, b) => Number(b.start_offset) - Number(a.start_offset)).forEach(item => {
        const range = makeRange(Number(item.start_offset), Number(item.end_offset));
        if (!range) return;
        const span = wrapRange(range, 'annotation-highlight');
        if (!span) return;
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'annotation-marker';
        marker.textContent = String(Number(item.thought_count || thoughtFor(item.id).length || 0));
        marker.setAttribute('aria-label', `查看 ${marker.textContent} 条读者想法`);
        marker.dataset.annotationId = String(item.id);
        marker.addEventListener('click', () => openAnnotation(item.id));
        span.insertAdjacentElement('afterend', marker);
      });
    }

    function renderThoughts(id) {
      const item = publicAnnotations.find(a => Number(a.id) === Number(id));
      const thoughts = thoughtFor(id);
      annotationsList.replaceChildren();
      if (item) {
        const quote = document.createElement('blockquote');
        quote.className = 'annotations__quote';
        quote.textContent = `“${item.selected_text}”`;
        annotationsList.append(quote);
      }
      thoughts.forEach(thought => {
        const div = document.createElement('article');
        div.className = 'thought';
        const head = document.createElement('div');
        head.className = 'thought__head';
        const name = document.createElement('strong');
        name.textContent = thought.name || '匿名';
        const date = document.createElement('time');
        date.textContent = new Date(thought.created_at).toLocaleDateString('zh-CN');
        head.append(name, date);
        const p = document.createElement('p');
        p.textContent = thought.text || '';
        div.append(head, p);
        annotationsList.append(div);
      });

      const form = document.createElement('form');
      form.className = 'thought-form';
      form.innerHTML = `
        <input name="name" maxlength="20" placeholder="名字（可选）" type="text" />
        <textarea name="text" maxlength="500" rows="3" placeholder="也写下你的想法"></textarea>
        <button class="btn" type="submit">留下想法</button>
      `;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const fd = new FormData(form);
        const text = String(fd.get('text') || '').trim();
        if (!text) return;
        const button = form.querySelector('button');
        button.disabled = true;
        try {
          const response = await fetch('/api/annotation-thoughts', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ annotation_id: id, name: String(fd.get('name') || '').trim(), text }),
          });
          if (!response.ok) throw new Error('thought failed');
          const refreshed = await fetch(`/api/annotations?post=${encodeURIComponent(post)}`);
          const data = await refreshed.json();
          publicAnnotations = data.annotations || [];
          publicThoughts = data.thoughts || [];
          renderThoughts(id);
        } catch {
          button.disabled = false;
        }
      });
      annotationsList.append(form);
      annotationsPanel.hidden = false;
    }

    function openAnnotation(id) {
      renderThoughts(id);
      annotationsPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    document.querySelector('[data-annotations-close]')?.addEventListener('click', () => { annotationsPanel.hidden = true; });

    function showSelectionBubble(range) {
      document.querySelector('.annotation-bubble')?.remove();
      const bubble = document.createElement('div');
      bubble.className = 'annotation-bubble';
      const lineBtn = document.createElement('button');
      lineBtn.type = 'button'; lineBtn.textContent = '划线';
      const thoughtBtn = document.createElement('button');
      thoughtBtn.type = 'button'; thoughtBtn.textContent = '写下想法';
      bubble.append(lineBtn, thoughtBtn);
      document.body.append(bubble);
      const rect = range.getBoundingClientRect();
      bubble.style.left = `${Math.max(12, rect.left + rect.width / 2 - bubble.offsetWidth / 2 + window.scrollX)}px`;
      bubble.style.top = `${Math.max(12, rect.top - 44 + window.scrollY)}px`;

      lineBtn.addEventListener('click', () => {
        const offsets = rangeOffsets(range);
        if (!offsets) return;
        privateHighlights.push({ ...offsets, text: range.toString().slice(0, 500) });
        savePrivate();
        location.reload();
      });

      thoughtBtn.addEventListener('click', async () => {
        const offsets = rangeOffsets(range);
        if (!offsets) return;
        const selectedText = range.toString().trim().slice(0, 500);
        const name = window.prompt('名字（可留空，默认为匿名）') || '匿名';
        const thought = window.prompt('写下你对这句话的想法：');
        if (!thought?.trim()) return;
        try {
          const response = await fetch('/api/annotations', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ post, selected_text: selectedText, start_offset: offsets.start, end_offset: offsets.end, name: name.trim(), thought: thought.trim() }),
          });
          if (!response.ok) throw new Error('annotation failed');
          location.reload();
        } catch {
          window.alert('暂时无法保存这条想法，请稍后再试。');
        }
      });
    }

    articleBody.addEventListener('mouseup', () => {
      setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
        const range = selection.getRangeAt(0);
        if (!articleBody.contains(range.commonAncestorContainer)) return;
        showSelectionBubble(range.cloneRange());
      }, 0);
    });

    applyPrivateHighlights();

    (async () => {
      try {
        const response = await fetch(`/api/annotations?post=${encodeURIComponent(post)}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('annotations failed');
        const data = await response.json();
        publicAnnotations = data.annotations || [];
        publicThoughts = data.thoughts || [];
        renderPublicAnnotations();
      } catch {
        // 公共批注加载失败时，私人划线仍然保留。
      }
    })();
  }

  syncTheme();
  syncFs();
})();
