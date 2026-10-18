'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Mail,
  CheckCircle2,
  Lock,
  ExternalLink,
  Loader2,
  Send,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import { EmailSettings } from '@/types/email';

export function EmailSettingsModal() {
  const [provider, setProvider] = useState<'smtp' | 'resend' | 'mailto'>('smtp');
  const [smtpPreset, setSmtpPreset] = useState<'gmail' | 'outlook' | 'custom'>('gmail');
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [fromName, setFromName] = useState('MIA Meeting Intelligence');
  const [fromEmail, setFromEmail] = useState('');
  const [resendApiKey, setResendApiKey] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const settings = await invoke<EmailSettings | null>('get_email_settings');
      if (settings) {
        setProvider(settings.provider || 'smtp');
        setSmtpHost(settings.smtp_host || 'smtp.gmail.com');
        setSmtpPort(settings.smtp_port ? Number(settings.smtp_port) : 587);
        setSmtpUsername(settings.smtp_username || '');
        setSmtpPassword(settings.smtp_password || '');
        setFromName(settings.from_name || 'MIA Meeting Intelligence');

        // Sanitize from_email: if corrupted (like 'd'), fall back to username
        const rawFrom = settings.from_email || '';
        const validFrom = (rawFrom.includes('@') && rawFrom.includes('.')) ? rawFrom : (settings.smtp_username || '');
        setFromEmail(validFrom);

        setResendApiKey(settings.resend_api_key || '');

        if (settings.smtp_host?.includes('gmail')) {
          setSmtpPreset('gmail');
        } else if (settings.smtp_host?.includes('outlook')) {
          setSmtpPreset('outlook');
        } else {
          setSmtpPreset('custom');
        }
      }
    } catch (err) {
      console.error('Failed to load email settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePresetChange = (preset: 'gmail' | 'outlook' | 'custom') => {
    setSmtpPreset(preset);
    if (preset === 'gmail') {
      setSmtpHost('smtp.gmail.com');
      setSmtpPort(587);
    } else if (preset === 'outlook') {
      setSmtpHost('smtp-mail.outlook.com');
      setSmtpPort(587);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanUsername = smtpUsername.trim();
      const cleanFromEmail = (fromEmail.includes('@') && fromEmail.includes('.'))
        ? fromEmail.trim()
        : (cleanUsername || null);

      await invoke('save_email_settings', {
        provider,
        smtpHost: smtpHost.trim() || null,
        smtpPort: Number(smtpPort) || 587,
        smtpUsername: cleanUsername || null,
        smtpPassword: (smtpPreset === 'gmail' ? smtpPassword.replace(/\s+/g, '') : smtpPassword.trim()) || null,
        smtpUseTls: 1,
        fromName: fromName.trim() || null,
        fromEmail: cleanFromEmail,
        resendApiKey: resendApiKey.trim() || null,
      });

      // Update local state so UI shows the cleaned fromEmail
      if (cleanFromEmail) {
        setFromEmail(cleanFromEmail);
      }

      toast.success('Email settings saved successfully!');
    } catch (err) {
      console.error('Failed to save email settings:', err);
      toast.error('Failed to save settings', { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    const to = testEmailAddress.trim() || smtpUsername.trim() || fromEmail.trim();
    if (!to || !to.includes('@')) {
      toast.error('Please enter a valid email address to send the test email to.');
      return;
    }

    // Auto save first before testing
    await handleSave();

    setTesting(true);
    try {
      const msg = await invoke<string>('send_test_email', { testToEmail: to });
      toast.success(msg || 'Test email sent successfully! Please check your inbox.');
    } catch (err) {
      console.error('Test email failed:', err);
      toast.error('Test email failed', {
        description: String(err),
        duration: 8000,
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span className="text-sm">Loading email configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          Email & Automation Setup
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure how MIA delivers meeting summaries and approved action items to your employees.
        </p>
      </div>

      {/* Provider Selector Tabs */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-muted/80 rounded-xl">
        <button
          type="button"
          onClick={() => setProvider('smtp')}
          className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
            provider === 'smtp'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Gmail / SMTP (Free)
        </button>
        <button
          type="button"
          onClick={() => setProvider('resend')}
          className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
            provider === 'resend'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Resend API (Free Tier)
        </button>
        <button
          type="button"
          onClick={() => setProvider('mailto')}
          className={`py-2 px-3 text-xs font-semibold rounded-lg transition-all ${
            provider === 'mailto'
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Default Mail App (mailto)
        </button>
      </div>

      {/* Provider: SMTP / Gmail */}
      {provider === 'smtp' && (
        <div className="space-y-4">
          {/* Preset Buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Provider:</span>
            <button
              type="button"
              onClick={() => handlePresetChange('gmail')}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                smtpPreset === 'gmail'
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-card border-border hover:bg-muted text-foreground'
              }`}
            >
              Gmail (Free App Password)
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('outlook')}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                smtpPreset === 'outlook'
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-card border-border hover:bg-muted text-foreground'
              }`}
            >
              Outlook / Office 365
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('custom')}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                smtpPreset === 'custom'
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-card border-border hover:bg-muted text-foreground'
              }`}
            >
              Custom SMTP
            </button>
          </div>

          {/* Gmail Helper Card */}
          {smtpPreset === 'gmail' && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-1 font-semibold">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>How to get a free Google App Password (30 seconds):</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  100% Free • No Credit Card
                </span>
              </div>
              <ol className="list-decimal pl-5 space-y-1 text-blue-800">
                <li>Go to your Google Account at <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline font-semibold inline-flex items-center gap-0.5">myaccount.google.com/apppasswords <ExternalLink className="w-3 h-3" /></a></li>
                <li>Make sure 2-Step Verification is ON, then enter app name <strong>"MIA"</strong> and click Create.</li>
                <li>Copy the <strong>16-character password</strong> (e.g. <code>abcd efgh ijkl mnop</code>) and paste it below.</li>
              </ol>
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Your Email Address (Username) *
              </label>
              <Input
                placeholder="yourname@gmail.com"
                value={smtpUsername}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!fromEmail || fromEmail === smtpUsername || !fromEmail.includes('@')) {
                    setFromEmail(val);
                  }
                  setSmtpUsername(val);
                }}
                className="h-9 text-xs bg-card"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                App Password / Password *
              </label>
              <Input
                type="password"
                placeholder="16-character Google App Password"
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                className="h-9 text-xs bg-card"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                SMTP Server Host
              </label>
              <Input
                placeholder="smtp.gmail.com"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="h-9 text-xs bg-card"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Port
              </label>
              <Input
                type="number"
                placeholder="587"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value))}
                className="h-9 text-xs bg-card"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Sender Name
              </label>
              <Input
                placeholder="e.g. John Doe (Host)"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                className="h-9 text-xs bg-card"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Reply-To / From Email
              </label>
              <Input
                placeholder="yourname@gmail.com"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                className="h-9 text-xs bg-card"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Defaults to your username. Leave as your Gmail address.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Provider: Resend */}
      {provider === 'resend' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-1">
            <span className="font-semibold">Resend Free Tier:</span>
            <p>Provides 3,000 free emails/month (100/day). Get your free API key at <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline font-semibold inline-flex items-center gap-0.5">resend.com <ExternalLink className="w-3 h-3" /></a></p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Resend API Key *
              </label>
              <Input
                type="password"
                placeholder="re_123456789..."
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                className="h-9 text-xs bg-card font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Sender Name
                </label>
                <Input
                  placeholder="MIA Meetings"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="h-9 text-xs bg-card"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  From Email
                </label>
                <Input
                  placeholder="onboarding@resend.dev (or verified domain)"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="h-9 text-xs bg-card"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Provider: mailto */}
      {provider === 'mailto' && (
        <div className="p-4 bg-muted/40 border border-border/80 rounded-xl space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Zero Configuration Required</p>
          <p>
            When you click "Send Tasks", MIA will automatically format the meeting notes, approved action items, and recipients, then launch your default desktop email application (Outlook, Apple Mail, Thunderbird, or Windows Mail).
          </p>
        </div>
      )}

      {/* Save & Test Connection Bar */}
      <div className="pt-6 border-t border-border/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {provider !== 'mailto' && (
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Input
              placeholder="recipient@example.com"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              className="h-9 text-xs bg-card flex-1 min-w-[200px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestEmail}
              disabled={testing}
              className="h-9 text-xs gap-1.5 shrink-0"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {testing ? 'Sending...' : 'Send Test'}
            </Button>
          </div>
        )}

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs shrink-0 self-end md:self-auto"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Save Email Settings
        </Button>
      </div>
    </div>
  );
}
