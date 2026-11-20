-- 0002_stats_annotations_replies.sql

CREATE TABLE IF NOT EXISTS post_stats (
  post_slug TEXT PRIMARY KEY,
  views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS post_views (
  post_slug TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  view_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_slug, visitor_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_post_views_post
ON post_views(post_slug, view_date);

CREATE TABLE IF NOT EXISTS post_likes (
  post_slug TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_slug, visitor_id)
);

ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id);
CREATE INDEX IF NOT EXISTS idx_comments_post_parent
ON comments(post_slug, parent_id, id);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id INTEGER NOT NULL REFERENCES comments(id),
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS annotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_slug TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '匿名',
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_annotations_post
ON annotations(post_slug, status, start_offset, id);

CREATE TABLE IF NOT EXISTS annotation_thoughts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id INTEGER NOT NULL REFERENCES annotations(id),
  name TEXT NOT NULL DEFAULT '匿名',
  text TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_annotation_thoughts_annotation
ON annotation_thoughts(annotation_id, status, id);
