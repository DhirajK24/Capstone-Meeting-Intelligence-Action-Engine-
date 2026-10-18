export interface EmailSettings {
  id: string;
  provider: 'smtp' | 'resend' | 'mailto';
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_username?: string | null;
  smtp_password?: string | null;
  smtp_use_tls?: number | null;
  from_name?: string | null;
  from_email?: string | null;
  resend_api_key?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaskItem {
  text: string;
  assignee?: string | null;
  approved: boolean;
}

export interface PersonalizedRecipientPayload {
  recipient_email: string;
  recipient_name: string;
  assigned_tasks: TaskItem[];
}

export interface MeetingEmailPayload {
  meeting_title: string;
  meeting_date: string;
  recipients: string[];
  tasks: TaskItem[];
  key_points: string[];
  discussion_highlights?: string[];
  summary_text?: string | null;
  include_tasks: boolean;
  include_key_points: boolean;
  include_highlights?: boolean;
  include_summary: boolean;
  individual_tasks_only?: boolean;
  personalized_recipients?: PersonalizedRecipientPayload[];
}
