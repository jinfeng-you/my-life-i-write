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
    if (ink) {
      root.removeAttribute('data-theme');
      localStorage.removeItem('mlw.theme');
    } else {
      root.setAttribute('data-theme', 'ink');
      localStorage.setItem('mlw.theme', 'ink');
    }
    syncTheme();
  });

  fsBtn?.addEventListener('click', () => {
    const large = root.getAttribute('data-fs') === 'lg';
    if (large) {
      root.removeAttribute('data-fs');
      localStorage.removeItem('mlw.fs');
    } else {
      root.setAttribute('data-fs', 'lg');
      localStorage.setItem('mlw.fs', 'lg');
    }
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

  // 文章分类筛选
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

  // 简单的本地阅读量/点赞状态。它不会向服务器发送数据。
  const statRoot = document.querySelector('[data-stat-key]');
  if (statRoot) {
    const key = statRoot.dataset.statKey;
    const viewsKey = `mlw.views.${key}`;
    const likesKey = `mlw.likes.${key}`;
    const views = Number(localStorage.getItem(viewsKey) || 0) + 1;
    localStorage.setItem(viewsKey, String(views));
    statRoot.querySelector('[data-views]')?.replaceChildren(String(views));

    const liked = localStorage.getItem(likesKey) === '1';
    const likeBtn = statRoot.querySelector('[data-like]');
    const likesEl = statRoot.querySelector('[data-likes]');
    if (likeBtn) likeBtn.classList.toggle('is-liked', liked);
    if (likesEl) likesEl.textContent = liked ? '1' : '0';
    likeBtn?.addEventListener('click', () => {
      const next = localStorage.getItem(likesKey) !== '1';
      localStorage.setItem(likesKey, next ? '1' : '0');
      likeBtn.classList.toggle('is-liked', next);
      likeBtn.setAttribute('aria-pressed', String(next));
      if (likesEl) likesEl.textContent = next ? '1' : '0';
    });
  }

  // 关于页留言：通过 Worker API + Cloudflare D1 保存，所有访问者共享同一份留言。
  const form = document.querySelector('[data-msg-form]');
  const list = document.querySelector('[data-msgs]');
  const listEmpty = document.querySelector('[data-msgs-empty]');
  const hint = document.querySelector('[data-msg-hint]');
  if (form && list) {
    const endpoint = '/api/comments?post=about';

    const escapeDate = (value) => {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('zh-CN');
    };

    const render = (msgs) => {
      list.replaceChildren();
      msgs.forEach(item => {
        const li = document.createElement('li');
        li.className = 'msg';
        const name = document.createElement('strong');
        name.className = 'msgs__name';
        name.textContent = item.name || '匿名';
        const text = document.createElement('p');
        text.className = 'msgs__text';
        text.textContent = item.text || '';
        const date = document.createElement('time');
        date.className = 'msgs__time';
        date.textContent = escapeDate(item.created_at);
        li.append(name, text, date);
        list.append(li);
      });
      if (listEmpty) listEmpty.hidden = msgs.length !== 0;
    };

    const load = async () => {
      try {
        const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('load failed');
        const data = await response.json();
        render(Array.isArray(data.comments) ? data.comments : []);
      } catch {
        if (hint) hint.textContent = '留言暂时无法加载，请稍后再试。';
      }
    };

    load();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const name = String(fd.get('name') || '').trim();
      const text = String(fd.get('text') || '').trim();
      if (!text) {
        if (hint) hint.textContent = '请先写一点想说的话。';
        return;
      }

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
      } finally {
        if (button) button.disabled = false;
      }
    });
  }

  syncTheme();
  syncFs();
})();
