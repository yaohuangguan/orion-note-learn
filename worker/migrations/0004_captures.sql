CREATE TABLE captures (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'article', 'selection')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  content_format TEXT CHECK (content_format IS NULL OR content_format IN ('text', 'markdown', 'html')),
  content TEXT,
  selection TEXT,
  excerpt TEXT,
  author TEXT,
  site_name TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  captured_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX captures_user_created_idx ON captures(user_id, created_at DESC);
CREATE INDEX captures_user_url_idx ON captures(user_id, url);
