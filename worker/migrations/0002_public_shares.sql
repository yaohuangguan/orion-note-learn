PRAGMA foreign_keys = ON;

CREATE TABLE public_shares (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  title TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  chunk_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, note_id)
);

CREATE INDEX public_shares_user_id_idx ON public_shares(user_id);
CREATE INDEX public_shares_updated_at_idx ON public_shares(updated_at);

CREATE TABLE public_share_chunks (
  share_id TEXT NOT NULL REFERENCES public_shares(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (share_id, chunk_index)
);
