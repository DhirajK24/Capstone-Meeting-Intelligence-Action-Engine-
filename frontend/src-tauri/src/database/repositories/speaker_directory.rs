use crate::database::models::SpeakerDirectoryEntry;
use chrono::Utc;
use sqlx::{Error as SqlxError, SqlitePool};
use tracing::info;
use uuid::Uuid;

pub struct SpeakerDirectoryRepository;

impl SpeakerDirectoryRepository {
    pub async fn get_all(pool: &SqlitePool) -> Result<Vec<SpeakerDirectoryEntry>, SqlxError> {
        let entries = sqlx::query_as::<_, SpeakerDirectoryEntry>(
            "SELECT id, name, email, role, voice_sample_path, created_at, updated_at
             FROM speaker_directory
             ORDER BY name ASC",
        )
        .fetch_all(pool)
        .await?;

        Ok(entries)
    }

    pub async fn save(
        pool: &SqlitePool,
        id: Option<&str>,
        name: &str,
        email: Option<&str>,
        role: Option<&str>,
        voice_sample_path: Option<&str>,
    ) -> Result<SpeakerDirectoryEntry, SqlxError> {
        let now = Utc::now().to_rfc3339();
        let speaker_id = id
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("speaker-dir-{}", Uuid::new_v4()));

        sqlx::query(
            r#"
            INSERT INTO speaker_directory (id, name, email, role, voice_sample_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                email = excluded.email,
                role = excluded.role,
                voice_sample_path = COALESCE(excluded.voice_sample_path, speaker_directory.voice_sample_path),
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&speaker_id)
        .bind(name)
        .bind(email)
        .bind(role)
        .bind(voice_sample_path)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;

        info!("Saved speaker directory entry: {} ({})", name, speaker_id);

        let entry = sqlx::query_as::<_, SpeakerDirectoryEntry>(
            "SELECT id, name, email, role, voice_sample_path, created_at, updated_at
             FROM speaker_directory WHERE id = ?",
        )
        .bind(&speaker_id)
        .fetch_one(pool)
        .await?;

        Ok(entry)
    }

    pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), SqlxError> {
        sqlx::query("DELETE FROM speaker_directory WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;

        info!("Deleted speaker directory entry: {}", id);
        Ok(())
    }
}
