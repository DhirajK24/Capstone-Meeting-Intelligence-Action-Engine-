'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Mail,
  CheckCircle2,
  Users,
  Plus,
  Trash2,
  Eye,
  Loader2,
  Settings,
  Sparkles,
  UserCheck,
  Filter,
} from 'lucide-react';
import { Speaker, speakerDisplayName } from '@/types/speaker';
import { EmailSettings, MeetingEmailPayload, PersonalizedRecipientPayload } from '@/types/email';

interface TaskState {
  id: string;
  text: string;
  assignee: string;
  approved: boolean;
}

interface RecipientState {
  email: string;
  name: string;
  selected: boolean;
}

interface SpeakerDirectoryEntry {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
}

interface SendTasksModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  meetingDate: string;
  initialTasks: string[];
  keyPoints?: string[];
  summaryText?: string;
  speakers?: Speaker[];
  markdownContent?: string;
  onOpenSettings?: () => void;
}

// Parses meeting sections (Summary, Key Decisions, Discussion Highlights) from markdown text
interface ParsedMeetingContext {
  summary: string;
  keyDecisions: string[];
  discussionHighlights: string[];
}

function parseMeetingSections(markdownText?: string): ParsedMeetingContext {
  const result: ParsedMeetingContext = {
    summary: '',
    keyDecisions: [],
    discussionHighlights: [],
  };

  if (!markdownText) return result;

  const lines = markdownText.split('\n');
  type Section = 'none' | 'summary' | 'decisions' | 'highlights' | 'tasks' | 'other';
  let currentSection: Section = 'none';
  const summaryLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (currentSection === 'summary' && summaryLines.length > 0) {
        summaryLines.push('');
      }
      continue;
    }

    const lower = trimmed.toLowerCase();

    // Summary header
    if (
      lower.startsWith('# summary') ||
      lower.startsWith('## summary') ||
      lower.startsWith('### summary') ||
      lower.startsWith('**summary') ||
      lower === 'summary' ||
      lower.startsWith('summary:')
    ) {
      currentSection = 'summary';
      const after = trimmed.replace(/^(?:#{1,6}\s+|\*\*)?summary[:\*\*\s]*/i, '').trim();
      if (after) {
        summaryLines.push(after);
      }
      continue;
    }

    // Key Decisions header
    if (
      lower.includes('key decision') ||
      lower.includes('key takeaway') ||
      lower.includes('key points')
    ) {
      currentSection = 'decisions';
      continue;
    }

    // Discussion Highlights header
    if (
      lower.includes('discussion highlight') ||
      lower.includes('discussion') ||
      lower.includes('topics discussed')
    ) {
      currentSection = 'highlights';
      continue;
    }

    // Action items / Table header
    if (
      lower.includes('action item') ||
      lower.includes('next step') ||
      trimmed.startsWith('|')
    ) {
      currentSection = 'tasks';
      continue;
    }

    // Generic markdown header (stop current section)
    if (trimmed.startsWith('#') || (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length < 50)) {
      currentSection = 'other';
      continue;
    }

    // Accumulate according to section
    if (currentSection === 'summary') {
      summaryLines.push(trimmed);
    } else if (currentSection === 'decisions') {
      const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
      if (bulletMatch) {
        result.keyDecisions.push(bulletMatch[1].trim());
      } else if (result.keyDecisions.length > 0 && !trimmed.startsWith('|')) {
        result.keyDecisions[result.keyDecisions.length - 1] += ' ' + trimmed;
      } else if (!trimmed.startsWith('|')) {
        result.keyDecisions.push(trimmed);
      }
    } else if (currentSection === 'highlights') {
      const bulletMatch = trimmed.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
      if (bulletMatch) {
        result.discussionHighlights.push(bulletMatch[1].trim());
      } else if (result.discussionHighlights.length > 0 && !trimmed.startsWith('|')) {
        result.discussionHighlights[result.discussionHighlights.length - 1] += ' ' + trimmed;
      } else if (!trimmed.startsWith('|')) {
        result.discussionHighlights.push(trimmed);
      }
    }
  }

  result.summary = summaryLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return result;
}

// Parses tasks and owners from markdown tables and arrays
function parseTasks(initialTasks: string[], markdownText?: string): TaskState[] {
  const result: TaskState[] = [];
  const seen = new Set<string>();

  // 1. Parse markdown tables (e.g. Topic | Action Item | Owner | Due)
  if (markdownText) {
    const lines = markdownText.split('\n');
    let inTable = false;
    let actionItemIdx = -1;
    let ownerIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());

        const lowerCells = cells.map((c) => c.toLowerCase());
        const hasActionCol = lowerCells.some((c) => c.includes('action') || c.includes('task'));
        const hasOwnerCol = lowerCells.some((c) => c.includes('owner') || c.includes('assign') || c.includes('who'));

        if (hasActionCol) {
          inTable = true;
          actionItemIdx = lowerCells.findIndex((c) => c.includes('action') || c.includes('task'));
          ownerIdx = lowerCells.findIndex((c) => c.includes('owner') || c.includes('assign') || c.includes('who'));
          continue;
        }

        // Skip divider row
        if (cells.every((c) => /^[-:\s]+$/.test(c))) {
          continue;
        }

        // Data row
        if (inTable && actionItemIdx !== -1 && cells[actionItemIdx]) {
          const rawText = cells[actionItemIdx].replace(/^["']|["']$/g, '').trim();
          const rawOwner = ownerIdx !== -1 && cells[ownerIdx] ? cells[ownerIdx].trim() : '';

          if (rawText && !seen.has(rawText.toLowerCase())) {
            seen.add(rawText.toLowerCase());
            const validOwner =
              rawOwner &&
              !['unassigned', 'not specified', 'n/a', '-', 'none'].includes(rawOwner.toLowerCase())
                ? rawOwner
                : '';

            result.push({
              id: `parsed-tbl-${result.length}-${Date.now()}`,
              text: rawText,
              assignee: validOwner,
              approved: true,
            });
          }
        }
      } else {
        inTable = false;
      }
    }
  }

  // 2. Also incorporate initialTasks
  for (const t of initialTasks) {
    const trimmed = t.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;

    let assignee = '';
    let cleanText = trimmed;

    const atMatch = trimmed.match(/@([a-zA-Z0-9_\s]+)/);
    if (atMatch) {
      assignee = atMatch[1].trim();
    } else {
      const colonMatch = trimmed.match(/^([A-Za-z\s]{2,20}):\s*(.+)$/);
      if (colonMatch) {
        assignee = colonMatch[1].trim();
        cleanText = colonMatch[2].trim();
      }
    }

    seen.add(trimmed.toLowerCase());
    result.push({
      id: `init-task-${result.length}-${Date.now()}`,
      text: cleanText,
      assignee,
      approved: true,
    });
  }

  return result;
}

function matchesAssignee(assignee: string, recipientName: string, recipientEmail: string): boolean {
  if (!assignee) return false;
  const a = assignee.toLowerCase().trim();
  const n = recipientName.toLowerCase().trim();
  const e = recipientEmail.toLowerCase().trim();
  return a === n || a === e || n.includes(a) || a.includes(n);
}

export function SendTasksModal({
  open,
  onOpenChange,
  meetingTitle,
  meetingDate,
  initialTasks,
  keyPoints = [],
  summaryText = '',
  speakers = [],
  markdownContent,
  onOpenSettings,
}: SendTasksModalProps) {
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const [recipients, setRecipients] = useState<RecipientState[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [parsedSummary, setParsedSummary] = useState('');
  const [parsedKeyPoints, setParsedKeyPoints] = useState<string[]>([]);
  const [parsedHighlights, setParsedHighlights] = useState<string[]>([]);
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeKeyPoints, setIncludeKeyPoints] = useState(true);
  const [includeHighlights, setIncludeHighlights] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [individualTasksOnly, setIndividualTasksOnly] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewRecipientEmail, setPreviewRecipientEmail] = useState<string>('all');
  const [sending, setSending] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);

  // Initialize tasks and recipients when modal opens
  useEffect(() => {
    if (!open) return;

    // Parse tasks with owners from table or list
    const parsed = parseTasks(initialTasks, markdownContent || summaryText);
    setTasks(parsed);

    // Parse meeting sections (Summary, Key Decisions, Discussion Highlights)
    const sections = parseMeetingSections(markdownContent);
    const activeSummary = sections.summary || summaryText || '';
    const activeKeyPoints = sections.keyDecisions.length > 0 ? sections.keyDecisions : keyPoints;
    const activeHighlights = sections.discussionHighlights;

    setParsedSummary(activeSummary);
    setParsedKeyPoints(activeKeyPoints);
    setParsedHighlights(activeHighlights);

    // Initialize recipients from meeting speakers
    const rMap = new Map<string, RecipientState>();

    speakers.forEach((s) => {
      const name = speakerDisplayName(s);
      if (s.email && s.email.trim()) {
        const cleanEmail = s.email.trim();
        rMap.set(cleanEmail.toLowerCase(), {
          name,
          email: cleanEmail,
          selected: true,
        });
      }
    });

    // Also fetch directory to enrich recipients and match names
    invoke<SpeakerDirectoryEntry[]>('get_speaker_directory')
      .then((dirList) => {
        dirList.forEach((entry) => {
          if (entry.email && entry.email.trim()) {
            const clean = entry.email.trim();
            if (!rMap.has(clean.toLowerCase())) {
              // If an owner was assigned in tasks matching this directory entry name, select them
              const hasTask = parsed.some((t) => matchesAssignee(t.assignee, entry.name, clean));
              rMap.set(clean.toLowerCase(), {
                name: entry.name,
                email: clean,
                selected: hasTask,
              });
            }
          }
        });
        setRecipients(Array.from(rMap.values()));
      })
      .catch(() => {
        setRecipients(Array.from(rMap.values()));
      });

    // Check email settings
    invoke<EmailSettings | null>('get_email_settings')
      .then((settings) => {
        setEmailConfigured(
          !!settings && (!!settings.smtp_host || !!settings.resend_api_key || settings.provider === 'mailto')
        );
      })
      .catch(() => setEmailConfigured(false));
  }, [open, initialTasks, markdownContent, summaryText, speakers]);

  const handleToggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, approved: !t.approved } : t))
    );
  };

  const handleUpdateTaskText = (id: string, text: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text } : t))
    );
  };

  const handleUpdateAssignee = (id: string, assignee: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, assignee } : t))
    );
  };

  const handleAddTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        id: `task-new-${Date.now()}`,
        text: 'New action item',
        assignee: '',
        approved: true,
      },
    ]);
  };

  const handleDeleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddRecipient = () => {
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (recipients.some((r) => r.email.toLowerCase() === trimmed.toLowerCase())) {
      toast.info('Email is already in the recipient list');
      return;
    }
    setRecipients((prev) => [
      ...prev,
      { email: trimmed, name: trimmed.split('@')[0], selected: true },
    ]);
    setNewEmail('');
  };

  const handleToggleRecipient = (email: string) => {
    setRecipients((prev) =>
      prev.map((r) => (r.email === email ? { ...r, selected: !r.selected } : r))
    );
  };

  const approvedTasks = useMemo(() => tasks.filter((t) => t.approved), [tasks]);
  const selectedRecipients = useMemo(() => recipients.filter((r) => r.selected), [recipients]);

  const handleSend = async () => {
    if (selectedRecipients.length === 0) {
      toast.error('Please select or add at least one recipient email.');
      return;
    }

    // Build personalized recipients if individual task filtering is on
    const personalized_recipients: PersonalizedRecipientPayload[] = selectedRecipients.map((r) => {
      const assigned = approvedTasks.filter((t) =>
        matchesAssignee(t.assignee, r.name, r.email)
      );
      return {
        recipient_email: r.email,
        recipient_name: r.name,
        assigned_tasks: assigned.map((t) => ({
          text: t.text,
          assignee: t.assignee || null,
          approved: t.approved,
        })),
      };
    });

    const payload: MeetingEmailPayload = {
      meeting_title: meetingTitle,
      meeting_date: meetingDate,
      recipients: selectedRecipients.map((r) => r.email),
      tasks: approvedTasks.map((t) => ({
        text: t.text,
        assignee: t.assignee || null,
        approved: t.approved,
      })),
      key_points: parsedKeyPoints,
      discussion_highlights: parsedHighlights,
      summary_text: parsedSummary || null,
      include_tasks: includeTasks,
      include_key_points: includeKeyPoints,
      include_highlights: includeHighlights,
      include_summary: includeSummary,
      individual_tasks_only: individualTasksOnly,
      personalized_recipients: individualTasksOnly ? personalized_recipients : undefined,
    };

    setSending(true);
    try {
      const msg = await invoke<string>('send_meeting_tasks_email', { payload });
      toast.success(msg || `Action items & summary sent to ${selectedRecipients.length} employee(s)!`);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to send email:', err);
      toast.error('Failed to send email', {
        description: String(err),
        duration: 8000,
      });
    } finally {
      setSending(false);
    }
  };

  // Preview filtering for selected recipient
  const activePreviewRecipient = selectedRecipients.find((r) => r.email === previewRecipientEmail);
  const previewTasks = useMemo(() => {
    if (!individualTasksOnly || previewRecipientEmail === 'all' || !activePreviewRecipient) {
      return approvedTasks;
    }
    return approvedTasks.filter((t) =>
      matchesAssignee(t.assignee, activePreviewRecipient.name, activePreviewRecipient.email)
    );
  }, [individualTasksOnly, previewRecipientEmail, activePreviewRecipient, approvedTasks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[660px] bg-background border border-border text-foreground shadow-2xl sm:rounded-2xl max-h-[88vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Send Meeting Action Items & Summary
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {individualTasksOnly
                    ? 'Each employee receives the full summary and only their individual assigned tasks.'
                    : 'Send all approved action items and full summary to all recipients.'}
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewMode(!previewMode)}
              className="gap-1.5 text-xs h-8"
            >
              <Eye className="w-3.5 h-3.5" />
              {previewMode ? 'Edit Mode' : 'Preview'}
            </Button>
          </div>

          {emailConfigured === false && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-800">
              <span>⚠️ Email setup required (Settings → Email Setup).</span>
              {onOpenSettings && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenSettings();
                  }}
                  className="h-7 text-xs bg-white text-amber-900 border-amber-300 gap-1"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Configure Email
                </Button>
              )}
            </div>
          )}
        </DialogHeader>

        {/* Modal Body */}
        <div className="p-6 pt-4 overflow-y-auto flex-1 custom-scrollbar space-y-5">
          {previewMode ? (
            /* Live Email Preview */
            <div className="space-y-3">
              {individualTasksOnly && selectedRecipients.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap p-2 bg-muted/40 rounded-xl text-xs">
                  <span className="text-[11px] font-semibold text-muted-foreground">Preview email for:</span>
                  <button
                    type="button"
                    onClick={() => setPreviewRecipientEmail('all')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      previewRecipientEmail === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-card hover:bg-muted text-foreground border border-border'
                    }`}
                  >
                    All Tasks ({approvedTasks.length})
                  </button>
                  {selectedRecipients.map((r) => {
                    const count = approvedTasks.filter((t) =>
                      matchesAssignee(t.assignee, r.name, r.email)
                    ).length;
                    return (
                      <button
                        key={r.email}
                        type="button"
                        onClick={() => setPreviewRecipientEmail(r.email)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                          previewRecipientEmail === r.email
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-card hover:bg-muted text-foreground border border-border'
                        }`}
                      >
                        {r.name} ({count} task{count !== 1 ? 's' : ''})
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 space-y-4 shadow-xs">
                <div className="border-b border-slate-200 pb-3">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
                    MIA Meeting Report
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">{meetingTitle}</h3>
                  <p className="text-xs text-slate-500">Date: {meetingDate}</p>
                </div>

                {individualTasksOnly && activePreviewRecipient && (
                  <p className="text-xs text-slate-600">
                    Hello <strong>{activePreviewRecipient.name}</strong>, here is your meeting summary and personal action items:
                  </p>
                )}

                {/* 1. Action Items */}
                {includeTasks && (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg">
                    <h4 className="font-semibold text-sm text-slate-900 mb-2 flex items-center justify-between">
                      <span>🎯 {individualTasksOnly && activePreviewRecipient ? 'Your Assigned Action Items' : 'Approved Action Items'} ({previewTasks.length})</span>
                    </h4>
                    {previewTasks.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">
                        ℹ️ No individual action items assigned to {activePreviewRecipient?.name || 'this recipient'}.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 text-xs text-slate-700 pl-4 list-disc">
                        {previewTasks.map((t) => (
                          <li key={t.id}>
                            <strong>{t.text}</strong>
                            {t.assignee && (
                              <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                                @{t.assignee}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* 2. Executive Summary */}
                {includeSummary && parsedSummary && (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg">
                    <h4 className="font-semibold text-sm text-slate-900 mb-2">
                      📝 Executive Summary
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {parsedSummary}
                    </p>
                  </div>
                )}

                {/* 3. Key Decisions */}
                {includeKeyPoints && parsedKeyPoints.length > 0 && (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg">
                    <h4 className="font-semibold text-sm text-slate-900 mb-2">
                      💡 Key Decisions
                    </h4>
                    <ul className="space-y-1 text-xs text-slate-700 pl-4 list-disc">
                      {parsedKeyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 4. Discussion Highlights */}
                {includeHighlights && parsedHighlights.length > 0 && (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg">
                    <h4 className="font-semibold text-sm text-slate-900 mb-2">
                      🔍 Discussion Highlights
                    </h4>
                    <ul className="space-y-1 text-xs text-slate-700 pl-4 list-disc">
                      {parsedHighlights.map((hl, i) => (
                        <li key={i}>{hl}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Edit / Review Mode */
            <>
              {/* Individual Task Filtering Toggle */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-blue-950">
                      Individual Task Delivery (Recommended)
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Each employee receives the full summary, but only the specific action items assigned to them.
                  </p>
                </div>
                <Checkbox
                  checked={individualTasksOnly}
                  onCheckedChange={(c: boolean) => setIndividualTasksOnly(c)}
                />
              </div>

              {/* Recipients Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Recipients ({selectedRecipients.length} selected)
                  </label>
                </div>

                <div className="space-y-1.5">
                  {recipients.map((r) => {
                    const taskCount = approvedTasks.filter((t) =>
                      matchesAssignee(t.assignee, r.name, r.email)
                    ).length;
                    return (
                      <div
                        key={r.email}
                        onClick={() => handleToggleRecipient(r.email)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          r.selected
                            ? 'bg-blue-50/60 border-blue-200 text-foreground'
                            : 'bg-card border-border/70 text-muted-foreground opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Checkbox checked={r.selected} />
                          <div>
                            <span className="font-semibold text-foreground">{r.name}</span>
                            <span className="ml-2 text-muted-foreground font-mono text-[11px]">
                              {r.email}
                            </span>
                          </div>
                        </div>

                        {individualTasksOnly && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              taskCount > 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {taskCount} task{taskCount !== 1 ? 's' : ''} assigned
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Custom Email */}
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    placeholder="Add employee email (e.g. employee@company.com)..."
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddRecipient();
                    }}
                    className="h-8 text-xs bg-background"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddRecipient}
                    className="h-8 text-xs gap-1 flex-shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Task Approval Section */}
              <div className="space-y-2.5 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    Review & Assign Tasks ({approvedTasks.length}/{tasks.length})
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleAddTask}
                    className="h-6 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Task
                  </Button>
                </div>

                <div className="space-y-2 max-h-[230px] overflow-y-auto pr-1 custom-scrollbar">
                  {tasks.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                      No action items detected in this meeting. Click "Add Task" to create one.
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-2.5 rounded-xl border text-xs transition-all space-y-2 ${
                          task.approved
                            ? 'bg-card border-border/80 shadow-xs'
                            : 'bg-muted/40 border-border/40 opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={task.approved}
                            onCheckedChange={() => handleToggleTask(task.id)}
                          />
                          <Input
                            value={task.text}
                            onChange={(e) => handleUpdateTaskText(task.id, e.target.value)}
                            className="h-7 text-xs bg-transparent border-none p-0 focus-visible:ring-0 font-medium flex-1"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.id)}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>

                        {/* Assignee Selection */}
                        <div className="flex items-center gap-2 pl-6">
                          <span className="text-[11px] text-muted-foreground">Assignee:</span>
                          <select
                            value={task.assignee}
                            onChange={(e) => handleUpdateAssignee(task.id, e.target.value)}
                            className="h-6 text-[11px] bg-background border border-input rounded-md px-2 text-foreground font-medium"
                          >
                            <option value="">Unassigned</option>
                            {recipients.map((r) => (
                              <option key={r.email} value={r.name}>
                                {r.name} ({r.email})
                              </option>
                            ))}
                            {/* If task has an owner not yet in recipient list, show it */}
                            {task.assignee && !recipients.some((r) => matchesAssignee(task.assignee, r.name, r.email)) && (
                              <option value={task.assignee}>
                                {task.assignee} (Mentioned in summary)
                              </option>
                            )}
                          </select>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Email Content Options */}
              <div className="pt-2 border-t border-border/60">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                  Include in Report
                </label>
                <div className="flex flex-wrap gap-4 text-xs text-foreground">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={includeTasks}
                      onCheckedChange={(c: boolean) => setIncludeTasks(c)}
                    />
                    <span>Action Items ({approvedTasks.length})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={includeSummary}
                      onCheckedChange={(c: boolean) => setIncludeSummary(c)}
                    />
                    <span>Executive Summary</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={includeKeyPoints}
                      onCheckedChange={(c: boolean) => setIncludeKeyPoints(c)}
                    />
                    <span>Key Decisions ({parsedKeyPoints.length})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={includeHighlights}
                      onCheckedChange={(c: boolean) => setIncludeHighlights(c)}
                    />
                    <span>Discussion Highlights ({parsedHighlights.length})</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border/60 flex items-center justify-between bg-muted/20">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || selectedRecipients.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-xs"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mail className="w-4 h-4" />
            )}
            {sending
              ? 'Sending Emails...'
              : `Send to ${selectedRecipients.length} Employee${selectedRecipients.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
