use crate::database::models::EmailSettings;
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use serde::{Deserialize, Serialize};
use tracing::{error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    pub text: String,
    pub assignee: Option<String>,
    pub approved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalizedRecipient {
    pub recipient_email: String,
    pub recipient_name: String,
    pub assigned_tasks: Vec<TaskItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingEmailPayload {
    pub meeting_title: String,
    pub meeting_date: String,
    pub recipients: Vec<String>,
    pub tasks: Vec<TaskItem>,
    pub key_points: Vec<String>,
    pub discussion_highlights: Option<Vec<String>>,
    pub summary_text: Option<String>,
    pub include_tasks: bool,
    pub include_key_points: bool,
    pub include_highlights: Option<bool>,
    pub include_summary: bool,
    pub individual_tasks_only: Option<bool>,
    pub personalized_recipients: Option<Vec<PersonalizedRecipient>>,
}

pub struct EmailService;

impl EmailService {
    /// Generates a clean, modern, responsive HTML email template
    pub fn build_html_email(payload: &MeetingEmailPayload) -> String {
        let mut tasks_html = String::new();
        if payload.include_tasks && !payload.tasks.is_empty() {
            tasks_html.push_str(r#"
            <div style="margin-top: 24px; padding: 20px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                    📋 Approved Action Items & Tasks
                </h3>
                <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.6;">
            "#);

            for task in &payload.tasks {
                if task.approved {
                    let assignee_badge = if let Some(assignee) = &task.assignee {
                        format!(
                            r#" <span style="display: inline-block; background-color: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin-left: 6px;">@{}</span>"#,
                            assignee
                        )
                    } else {
                        String::new()
                    };
                    tasks_html.push_str(&format!(
                        r#"<li style="margin-bottom: 8px;"><strong>{}</strong>{}</li>"#,
                        task.text, assignee_badge
                    ));
                }
            }
            tasks_html.push_str("</ul></div>");
        }

        let mut summary_html = String::new();
        if payload.include_summary {
            if let Some(summary) = &payload.summary_text {
                if !summary.trim().is_empty() {
                    let formatted_text = summary.replace('\n', "<br>");
                    summary_html.push_str(&format!(
                        r#"
                        <div style="margin-top: 20px; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                                📝 Executive Summary
                            </h3>
                            <div style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6;">{}</div>
                        </div>
                        "#,
                        formatted_text
                    ));
                }
            }
        }

        let mut key_points_html = String::new();
        if payload.include_key_points && !payload.key_points.is_empty() {
            key_points_html.push_str(r#"
            <div style="margin-top: 20px; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                    💡 Key Decisions
                </h3>
                <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.6;">
            "#);
            for point in &payload.key_points {
                key_points_html.push_str(&format!(
                    r#"<li style="margin-bottom: 8px;">{}</li>"#,
                    point
                ));
            }
            key_points_html.push_str("</ul></div>");
        }

        let mut highlights_html = String::new();
        if payload.include_highlights.unwrap_or(true) {
            if let Some(highlights) = &payload.discussion_highlights {
                if !highlights.is_empty() {
                    highlights_html.push_str(r#"
                    <div style="margin-top: 20px; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                            🔍 Discussion Highlights
                        </h3>
                        <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.6;">
                    "#);
                    for item in highlights {
                        highlights_html.push_str(&format!(
                            r#"<li style="margin-bottom: 8px;">{}</li>"#,
                            item
                        ));
                    }
                    highlights_html.push_str("</ul></div>");
                }
            }
        }

        format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meeting Report: {title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
        <!-- Header -->
        <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #2563eb; margin-right: 8px;"></span>
                <span style="font-size: 12px; font-weight: 700; color: #2563eb; letter-spacing: 0.05em; text-transform: uppercase;">MIA Meeting Report</span>
            </div>
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 8px 0 4px 0;">{title}</h1>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Date: {date}</p>
        </div>

        <!-- Content Blocks -->
        {tasks_html}
        {summary_html}
        {key_points_html}
        {highlights_html}

        <!-- Footer -->
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">Generated and sent automatically via <strong>MIA</strong> (Meeting Intelligence & Action Engine).</p>
            <p style="margin: 4px 0 0 0;">All audio & transcription data processed locally on device.</p>
        </div>
    </div>
</body>
</html>"#,
            title = payload.meeting_title,
            date = payload.meeting_date,
            tasks_html = tasks_html,
            summary_html = summary_html,
            key_points_html = key_points_html,
            highlights_html = highlights_html
        )
    }

    /// Generates an individualized HTML email containing all meeting summary/decisions, but ONLY tasks assigned to this recipient
    pub fn build_personalized_html_email(
        payload: &MeetingEmailPayload,
        recipient_name: &str,
        assigned_tasks: &[TaskItem],
    ) -> String {
        let mut tasks_html = String::new();
        if payload.include_tasks {
            if !assigned_tasks.is_empty() {
                tasks_html.push_str(r#"
                <div style="margin-top: 24px; padding: 20px; background-color: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0;">
                    <h3 style="margin-top: 0; color: #166534; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                        🎯 Your Assigned Action Items
                    </h3>
                    <ul style="margin: 0; padding-left: 20px; color: #1e293b; line-height: 1.6;">
                "#);

                for task in assigned_tasks {
                    if task.approved {
                        tasks_html.push_str(&format!(
                            r#"<li style="margin-bottom: 8px;"><strong>{}</strong></li>"#,
                            task.text
                        ));
                    }
                }
                tasks_html.push_str("</ul></div>");
            } else {
                tasks_html.push_str(r#"
                <div style="margin-top: 24px; padding: 16px 20px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">
                    ℹ️ No individual action items were assigned to you in this meeting.
                </div>
                "#);
            }
        }

        let mut summary_html = String::new();
        if payload.include_summary {
            if let Some(summary) = &payload.summary_text {
                if !summary.trim().is_empty() {
                    let formatted_text = summary.replace('\n', "<br>");
                    summary_html.push_str(&format!(
                        r#"
                        <div style="margin-top: 20px; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                                📝 Executive Summary
                            </h3>
                            <div style="margin: 0; color: #334155; font-size: 14px; line-height: 1.6;">{}</div>
                        </div>
                        "#,
                        formatted_text
                    ));
                }
            }
        }

        let mut key_points_html = String::new();
        if payload.include_key_points && !payload.key_points.is_empty() {
            key_points_html.push_str(r#"
            <div style="margin-top: 20px; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                    💡 Key Decisions
                </h3>
                <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.6;">
            "#);
            for point in &payload.key_points {
                key_points_html.push_str(&format!(
                    r#"<li style="margin-bottom: 8px;">{}</li>"#,
                    point
                ));
            }
            key_points_html.push_str("</ul></div>");
        }

        let mut highlights_html = String::new();
        if payload.include_highlights.unwrap_or(true) {
            if let Some(highlights) = &payload.discussion_highlights {
                if !highlights.is_empty() {
                    highlights_html.push_str(r#"
                    <div style="margin-top: 20px; padding: 20px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <h3 style="margin-top: 0; color: #0f172a; font-size: 16px; font-weight: 600; display: flex; align-items: center;">
                            🔍 Discussion Highlights
                        </h3>
                        <ul style="margin: 0; padding-left: 20px; color: #334155; line-height: 1.6;">
                    "#);
                    for item in highlights {
                        highlights_html.push_str(&format!(
                            r#"<li style="margin-bottom: 8px;">{}</li>"#,
                            item
                        ));
                    }
                    highlights_html.push_str("</ul></div>");
                }
            }
        }

        format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meeting Report: {title}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
        <!-- Header -->
        <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #2563eb; margin-right: 8px;"></span>
                <span style="font-size: 12px; font-weight: 700; color: #2563eb; letter-spacing: 0.05em; text-transform: uppercase;">MIA Meeting Report</span>
            </div>
            <h1 style="color: #0f172a; font-size: 22px; font-weight: 700; margin: 8px 0 4px 0;">{title}</h1>
            <p style="color: #64748b; font-size: 13px; margin: 0;">Date: {date}</p>
        </div>

        <div style="font-size: 14px; color: #334155; margin-bottom: 8px;">
            Hello <strong>{name}</strong>, here is your meeting summary and personal action items:
        </div>

        <!-- Content Blocks -->
        {tasks_html}
        {summary_html}
        {key_points_html}
        {highlights_html}

        <!-- Footer -->
        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px;">
            <p style="margin: 0;">Generated and sent automatically via <strong>MIA</strong> (Meeting Intelligence & Action Engine).</p>
            <p style="margin: 4px 0 0 0;">All audio & transcription data processed locally on device.</p>
        </div>
    </div>
</body>
</html>"#,
            title = payload.meeting_title,
            date = payload.meeting_date,
            name = recipient_name,
            tasks_html = tasks_html,
            summary_html = summary_html,
            key_points_html = key_points_html,
            highlights_html = highlights_html
        )
    }

    /// Dispatches email using configured SMTP settings (Gmail, Outlook, custom)
    pub async fn send_via_smtp(
        settings: &EmailSettings,
        recipients: &[String],
        subject: &str,
        html_body: &str,
    ) -> Result<(), String> {
        let host = settings
            .smtp_host
            .as_deref()
            .ok_or("SMTP Host is missing. Please configure in Settings -> Email Setup.")?;
        let username = settings
            .smtp_username
            .as_deref()
            .ok_or("SMTP Username / Email is missing. Please configure in Settings -> Email Setup.")?;
        let password = settings
            .smtp_password
            .as_deref()
            .ok_or("SMTP Password / App Password is missing. Please configure in Settings -> Email Setup.")?;

        let from_email = match settings.from_email.as_deref() {
            Some(f) if f.contains('@') && f.contains('.') => f.trim(),
            _ => username.trim(),
        };
        let from_name = settings
            .from_name
            .as_deref()
            .unwrap_or("MIA Meeting Notes");

        let from_header = format!("{} <{}>", from_name, from_email);
        let port = settings.smtp_port.unwrap_or(587) as u16;

        let clean_username = username.trim().to_string();
        // Google displays App Passwords as 4 groups of 4 letters separated by spaces.
        // Strip spaces so authentication works seamlessly whether copied with or without spaces.
        let clean_password = if host.contains("gmail") {
            password.replace(' ', "")
        } else {
            password.to_string()
        };

        let creds = Credentials::new(clean_username, clean_password);

        let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
            .map_err(|e| format!("Invalid SMTP host: {}", e))?
            .port(port)
            .credentials(creds)
            .build();

        for to_email in recipients {
            let email_to = to_email.trim();
            if email_to.is_empty() {
                continue;
            }

            let email = Message::builder()
                .from(from_header.parse().map_err(|e| format!("Invalid from address: {}", e))?)
                .to(email_to.parse().map_err(|e| format!("Invalid recipient address '{}': {}", email_to, e))?)
                .subject(subject)
                .header(ContentType::TEXT_HTML)
                .body(html_body.to_string())
                .map_err(|e| format!("Failed to build email: {}", e))?;

            mailer
                .send(email)
                .await
                .map_err(|e| format!("Failed to send email to {}: {}", email_to, e))?;

            info!("Successfully sent meeting email to {}", email_to);
        }

        Ok(())
    }

    /// Dispatches email using Resend Free API
    pub async fn send_via_resend(
        api_key: &str,
        from_email: &str,
        from_name: &str,
        recipients: &[String],
        subject: &str,
        html_body: &str,
    ) -> Result<(), String> {
        let client = reqwest::Client::new();
        let from_formatted = if from_name.is_empty() {
            from_email.to_string()
        } else {
            format!("{} <{}>", from_name, from_email)
        };

        for to_email in recipients {
            let email_to = to_email.trim();
            if email_to.is_empty() {
                continue;
            }

            let payload = serde_json::json!({
                "from": from_formatted,
                "to": [email_to],
                "subject": subject,
                "html": html_body
            });

            let response = client
                .post("https://api.resend.com/emails")
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Resend API request failed: {}", e))?;

            if !response.status().is_success() {
                let err_text = response.text().await.unwrap_or_default();
                error!("Resend API error for {}: {}", email_to, err_text);
                return Err(format!("Resend error: {}", err_text));
            }

            info!("Successfully sent Resend email to {}", email_to);
        }

        Ok(())
    }
}
