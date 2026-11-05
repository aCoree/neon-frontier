// Datenbankschema (PostgreSQL). Migrationen sind versioniert und laufen beim Start idempotent.
export const MIGRATIONS = [
  { v: 1, name: 'accounts', sql: `
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      username_lower TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('OWNER','ADMIN','MODERATOR','PLAYER')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login TIMESTAMPTZ,
      username_changed_at TIMESTAMPTZ,
      banned_until TIMESTAMPTZ,
      ban_permanent BOOLEAN NOT NULL DEFAULT FALSE,
      ban_reason TEXT
    );
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
      level INT NOT NULL DEFAULT 1,
      kills INT NOT NULL DEFAULT 0, deaths INT NOT NULL DEFAULT 0, headshots INT NOT NULL DEFAULT 0,
      matches INT NOT NULL DEFAULT 0, wins INT NOT NULL DEFAULT 0,
      rank_points INT NOT NULL DEFAULT 0 CHECK (rank_points >= 0),
      best_rank_points INT NOT NULL DEFAULT 0,
      currency BIGINT NOT NULL DEFAULT 0 CHECK (currency >= 0)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      user_agent TEXT
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS users_username_prefix_idx ON users(username_lower text_pattern_ops);
  ` },
  { v: 2, name: 'moderation', sql: `
    CREATE TABLE IF NOT EXISTS match_results (
      match_id TEXT NOT NULL, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      xp INT NOT NULL, rank_delta INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (match_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id BIGSERIAL PRIMARY KEY, reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reported_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason TEXT NOT NULL, match_id TEXT,
      status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), handled_by BIGINT, handled_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);
    CREATE TABLE IF NOT EXISTS mutes (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, muted_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, muted_id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY, actor_id BIGINT, actor_name TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS suspicious_events (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT, name TEXT, kind TEXT NOT NULL, detail TEXT, match_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS suspicious_time_idx ON suspicious_events(created_at DESC);
    CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, value BOOLEAN NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS seasons (id INT PRIMARY KEY, name TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ);
    INSERT INTO seasons (id, name, starts_at) VALUES (1, 'Season 1', now()) ON CONFLICT DO NOTHING;
  ` },
  { v: 3, name: 'inventory', sql: `
    CREATE TABLE IF NOT EXISTS inventory (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, item_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'level', acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, item_id)
    );
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS equipped_skin TEXT NOT NULL DEFAULT 'vanguard';
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS equipped_wskin TEXT NOT NULL DEFAULT 'default';
    CREATE TABLE IF NOT EXISTS daily_rewards (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, last_claim DATE, streak INT NOT NULL DEFAULT 0
    );
  ` },
  { v: 4, name: 'friends', sql: `
    CREATE TABLE IF NOT EXISTS friendships (
      requester BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, addressee BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (requester, addressee), CHECK (requester <> addressee)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx ON friendships (LEAST(requester, addressee), GREATEST(requester, addressee));
    CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee)
  ` },
];
