-- Book club scheduler storage (Cloudflare D1). One row per member per club.
-- Apply: npx wrangler d1 execute bookclub --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS members (
  club       TEXT    NOT NULL,
  key        TEXT    NOT NULL,           -- lowercased, trimmed name: the login id
  name       TEXT    NOT NULL,           -- name as the member typed it
  pin_hash   TEXT    NOT NULL,           -- sha-256(salt + pin), hex
  salt       TEXT    NOT NULL,
  color      INTEGER NOT NULL,           -- palette index, fixed at creation
  slots      TEXT    NOT NULL,           -- JSON array of "day-hour" strings, day 0 = Mon
  cadence    INTEGER,                    -- most often they can meet: every 2, 3 or 4 weeks
  hours      REAL,                       -- reading hours per week
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (club, key)
);
