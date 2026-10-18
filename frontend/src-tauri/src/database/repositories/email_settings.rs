use crate::database::models::EmailSettings;
use chrono::Utc;
use sqlx::{Error as SqlxError, SqlitePool};
use tracing::info;

pub struct EmailSettingsRepository;

impl EmailSettingsRepository {
    pub async fn get(pool: &SqlitePool) -> Result<Option<EmailSettings>, SqlxError> {
        let settings = sqlx::query_as::<_, EmailSettings>(
            "SELECT id, provider, smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls, from_name, from_email, resend_api_key, created_at, updated_at
             FROM email_settings
             WHERE id = 'default'
             LIMIT 1",
        )
        .fetch_optional(pool)
        .await?;

        Ok(settings)
    }

    pub async fn save(
        pool: &SqlitePool,
        provider: &str,
        smtp_host: Option<&str>,
        smtp_port: Option<i64>,
        smtp_username: Option<&str>,
        smtp_password: Option<&str>,
        smtp_use_tls: Option<i64>,
        from_name: Option<&str>,
        from_email: Option<&str>,
        resend_api_key: Option<&str>,
    ) -> Result<EmailSettings, SqlxError> {
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            r#"
            INSERT INTO email_settings (id, provider, smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls, from_name, from_email, resend_api_key, created_at, updated_at)
            VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                smtp_host = excluded.smtp_host,
                smtp_port = excluded.smtp_port,
                smtp_username = excluded.smtp_username,
                smtp_password = COALESCE(excluded.smtp_password, email_settings.smtp_password),
                smtp_use_tls = excluded.smtp_use_tls,
                from_name = excluded.from_name,
                from_email = excluded.from_email,
                resend_api_key = COALESCE(excluded.resend_api_key, email_settings.resend_api_key),
                updated_at = excluded.updated_at
            "#,
        )
        .bind(provider)
        .bind(smtp_host)
        .bind(smtp_port.unwrap_or(587))
        .bind(smtp_username)
        .bind(smtp_password)
        .bind(smtp_use_tls.unwrap_or(1))
        .bind(from_name)
        .bind(from_email)
        .bind(resend_api_key)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;

        info!("Saved email settings (provider: {})", provider);

        let settings = sqlx::query_as::<_, EmailSettings>(
            "SELECT id, provider, smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls, from_name, from_email, resend_api_key, created_at, updated_at
             FROM email_settings
             WHERE id = 'default'",
        )
        .fetch_one(pool)
        .await?;

        Ok(settings)
    }
}
