CREATE TABLE ai_limits (
  key TEXT PRIMARY KEY,
  window_started INTEGER NOT NULL,
  request_count INTEGER NOT NULL
);

CREATE INDEX ai_limits_window_idx ON ai_limits(window_started);
