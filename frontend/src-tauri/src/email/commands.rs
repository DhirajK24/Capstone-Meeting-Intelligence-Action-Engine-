use crate::database::models::{EmailSettings, SpeakerDirectoryEntry};
use crate::database::repositories::email_settings::EmailSettingsRepository;
use crate::database::repositories::speaker::SpeakerRepository;
use crate::database::repositories::speaker_directory::SpeakerDirectoryRepository;
use crate::email::service::{EmailService, MeetingEmailPayload};
use crate::state::AppState;
use tauri::{AppHandle, Manager};


#[tauri::command]
pub async fn get_email_settings(app: AppHandle) -> Result<Option<EmailSettings>, String> {
    let state = app.state::<AppState>();
    let pool = state.db_manager.pool();

    EmailSettingsRepository::get(pool)
        .await
        .map_err(|e| format!("Failed to get email settings: {}", e))
}

#[tauri::command]
pub async fn save_email_settings(
    app: AppHandle,
    provider: String,
    smtp_host: Option<String>,
    smtp_port: Option<i64>,
    smtp_username: Option<String>,
    smtp_password: Option<String>,
    smtp_use_tls: Option<i64>,
    from_name: Option<String>,
    from_email: Option<String>,
    resend_api_key: Option<String>,
) -> Result<EmailSettings, String> {
    let state = app.state::<AppState>();
    let pool = state.db_manager.pool();

    EmailSettingsRepository::save(
        pool,
        &provider,
        smtp_host.as_deref(),
        smtp_port,
        smtp_username.as_deref(),
        smtp_password.as_deref(),
        smtp_use_tls,
        from_name.as_deref(),
        from_email.as_deref(),
        resend_api_key.as_deref(),
    )
    .await
    .map_err(|e| format!("Failed to save email settings: {}", e))
}

#[tauri::command]
pub async fn send_test_email(app: AppHandle, test_to_email: String) -> Result<String, String> {
    let state = app.state::<AppState>();
    let pool = state.db_manager.pool();

    let settings = EmailSettingsRepository::get(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or("No email settings configured. Please enter your email credentials first.")?;

    let subject = "MIA Test Email - Setup Successful";
    let html = r#"
    <div style="font-family: sans-serif; padding: 24px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; max-width: 500px;">
        <h2 style="color: #2563eb; margin-top: 0;">🎉 MIA Email Connection Successful!</h2>
        <p style="color: #334155; line-height: 1.5;">Your email configuration is working properly. You can now send meeting action items, tasks, and summaries to your team in one click.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;">
        <p style="color: #94a3b8; font-size: 12px; margin: 0;">Sent via MIA (Meeting Intelligence & Action Engine)</p>
    </div>
    "#;

    match settings.provider.as_str() {
        "resend" => {
            let api_key = settings.resend_api_key.as_deref().ok_or("Missing Resend API key")?;
            let from_email = settings.from_email.as_deref().unwrap_or("onboarding@resend.dev");
            let from_name = settings.from_name.as_deref().unwrap_or("MIA");
            EmailService::send_via_resend(api_key, from_email, from_name, &[test_to_email], subject, html).await?;
        }
        _ => {
            EmailService::send_via_smtp(&settings, &[test_to_email], subject, html).await?;
        }
    }

    Ok("Test email sent successfully!".to_string())
}

#[tauri::command]
pub async fn send_meeting_tasks_email(
    app: AppHandle,
    payload: MeetingEmailPayload,
) -> Result<String, String> {
    if payload.recipients.is_empty() {
        return Err("No recipients specified. Please select at least one recipient.".to_string());
    }

    let state = app.state::<AppState>();
    let pool = state.db_manager.pool();

    let settings = EmailSettingsRepository::get(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or("Email is not configured yet. Please configure your email in Settings -> Email Setup.")?;

    // Check if individual task personalization is requested
    if payload.individual_tasks_only.unwrap_or(false) {
        if let Some(bundles) = &payload.personalized_recipients {
            if !bundles.is_empty() {
                for bundle in bundles {
                    let personalized_html = EmailService::build_personalized_html_email(
                        &payload,
                        &bundle.recipient_name,
                        &bundle.assigned_tasks,
                    );
                    let subject = format!("Action Items & Summary: {}", payload.meeting_title);
                    let recips = vec![bundle.recipient_email.clone()];

                    match settings.provider.as_str() {
                        "resend" => {
                            let api_key = settings.resend_api_key.as_deref().ok_or("Missing Resend API key")?;
                            let from_email = settings.from_email.as_deref().unwrap_or("onboarding@resend.dev");
                            let from_name = settings.from_name.as_deref().unwrap_or("MIA Meetings");
                            EmailService::send_via_resend(api_key, from_email, from_name, &recips, &subject, &personalized_html).await?;
                        }
                        _ => {
                            EmailService::send_via_smtp(&settings, &recips, &subject, &personalized_html).await?;
                        }
                    }
                }

                return Ok(format!(
                    "Successfully sent individual task emails to {} team member(s)",
                    bundles.len()
                ));
            }
        }
    }

    let subject = format!("Action Items & Summary: {}", payload.meeting_title);
    let html = EmailService::build_html_email(&payload);

    match settings.provider.as_str() {
        "resend" => {
            let api_key = settings.resend_api_key.as_deref().ok_or("Missing Resend API key")?;
            let from_email = settings.from_email.as_deref().unwrap_or("onboarding@resend.dev");
            let from_name = settings.from_name.as_deref().unwrap_or("MIA Meetings");
            EmailService::send_via_resend(api_key, from_email, from_name, &payload.recipients, &subject, &html).await?;
        }
        _ => {
            EmailService::send_via_smtp(&settings, &payload.recipients, &subject, &html).await?;
        }
    }

    Ok(format!("Successfully sent email to {} recipient(s)", payload.recipients.len()))
}

#[tauri::command]
pub async fn get_speaker_directory(app: AppHandle) -> Result<Vec<SpeakerDirectoryEntry>, String> {
    let state = app.state::<AppState>();
    let pool = state.db_manager.pool();

    SpeakerDirectoryRepository::get_all(pool)
        .await
        .map_err(|e| format!("Failed to get speaker directory: {}", e))
}

#[tauri::command]
pub async fn save_speaker_to_directory(
    app: AppHandle,
    id: Option<String>,
    name: String,
    email: Option<String>,
    role: Option<String>,
    voice_sample_path: Option<String>,
) -> Result<SpeakerDirectoryEntry, String> {
    let state = app.state::<AppState>();
    let pool = state.db_manager.pool();

    SpeakerDirectoryRepository::save(
        pool,
        id.as_deref(),
        &name,
        email.as_deref(),
        role.as_deref(),
        voice_sample_path.as_deref(),
    )
    .await
    .map_err(|e| format!("Failed to save speaker: {}", e))
}

#[tauri::command]
pub async fn delete_speaker_from_directory(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let pool = state.db_manager.pool();

    SpeakerDirectoryRepository::delete(pool, &id)
        .await
        .map_err(|e| format!("Failed to delete speaker: {}", e))
}

#[tauri::command]
pub async fn update_meeting_speaker_email(
    app: AppHandle,
    meeting_id: String,
    internal_label: String,
    custom_name: String,
    email: Option<String>,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let pool = state.db_manager.pool();

    SpeakerRepository::update_speaker_details(
        pool,
        &meeting_id,
        &internal_label,
        &custom_name,
        email.as_deref(),
    )
    .await
    .map_err(|e| format!("Failed to update speaker details: {}", e))
}

