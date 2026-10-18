-- Speaker Directory and Email Settings

CREATE TABLE IF NOT EXISTS speaker_directory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT,
    voice_sample_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Add email column to meeting_speakers if not already present
-- In SQLite, we can alter table safely
ALTER TABLE meeting_speakers ADD COLUMN email TEXT;

CREATE TABLE IF NOT EXISTS email_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    provider TEXT NOT NULL DEFAULT 'smtp', -- 'smtp' | 'resend' | 'mailto'
    smtp_host TEXT,
    smtp_port INTEGER DEFAULT 587,
    smtp_username TEXT,
    smtp_password TEXT,
    smtp_use_tls INTEGER DEFAULT 1,
    from_name TEXT,
    from_email TEXT,
    resend_api_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
