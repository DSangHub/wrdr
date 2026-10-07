CREATE TABLE users (
  device_id   TEXT PRIMARY KEY,
  plan        TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'yearly'
  clicks_used INT  NOT NULL DEFAULT 0,
  reset_at    TIMESTAMPTZ NOT NULL,
  paid_at     TIMESTAMPTZ,
  stripe_customer_id TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE click_log (
  id          BIGSERIAL PRIMARY KEY,
  device_id   TEXT NOT NULL,
  word1       TEXT,
  word2       TEXT,
  dest_key    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON click_log (device_id, created_at DESC);
