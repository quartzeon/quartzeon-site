-- Quartz Eon site database (Cloudflare D1)

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL DEFAULT '',
  tags         TEXT NOT NULL DEFAULT '',
  cover_key    TEXT NOT NULL DEFAULT '',
  carousel_key TEXT NOT NULL DEFAULT '',
  in_carousel  INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS software (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  version      TEXT NOT NULL DEFAULT '',
  platform     TEXT NOT NULL DEFAULT '',
  icon_key     TEXT NOT NULL DEFAULT '',
  file_key     TEXT NOT NULL DEFAULT '',
  file_name    TEXT NOT NULL DEFAULT '',
  file_size    INTEGER NOT NULL DEFAULT 0,
  external_url TEXT NOT NULL DEFAULT '',
  downloads    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id   TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  carousel_key TEXT NOT NULL DEFAULT '',
  in_carousel  INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
