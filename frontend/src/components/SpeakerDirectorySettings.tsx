'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Mail,
  Mic,
  PlayCircle,
  Loader2,
  Check,
  X,
  Search,
} from 'lucide-react';
import { SpeakerDirectoryEntry } from '@/types/speaker';

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
];

export function SpeakerDirectorySettings() {
  const [speakers, setSpeakers] = useState<SpeakerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Form states for Add / Edit
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSpeakers();
  }, []);

  const loadSpeakers = async () => {
    setLoading(true);
    try {
      const data = await invoke<SpeakerDirectoryEntry[]>('get_speaker_directory');
      setSpeakers(data);
    } catch (err) {
      console.error('Failed to load speaker directory:', err);
      toast.error('Failed to load team directory');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSpeaker = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      await invoke('save_speaker_to_directory', {
        id: editingId || null,
        name: trimmedName,
        email: email.trim() || null,
        role: role.trim() || null,
        voiceSamplePath: null,
      });

      toast.success(editingId ? 'Speaker updated!' : 'Speaker added to directory!');
      resetForm();
      await loadSpeakers();
    } catch (err) {
      console.error('Failed to save speaker:', err);
      toast.error('Failed to save speaker', { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSpeaker = async (id: string, speakerName: string) => {
    if (!confirm(`Are you sure you want to delete ${speakerName} from the directory?`)) {
      return;
    }

    try {
      await invoke('delete_speaker_from_directory', { id });
      setSpeakers((prev) => prev.filter((s) => s.id !== id));
      toast.success(`${speakerName} removed from directory`);
    } catch (err) {
      console.error('Failed to delete speaker:', err);
      toast.error('Failed to delete speaker');
    }
  };

  const startEdit = (speaker: SpeakerDirectoryEntry) => {
    setEditingId(speaker.id);
    setName(speaker.name);
    setEmail(speaker.email || '');
    setRole(speaker.role || '');
    setShowAddForm(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setEmail('');
    setRole('');
    setShowAddForm(false);
  };

  const filteredSpeakers = speakers.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.role && s.role.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Speakers & Team Directory
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Save company employees, emails, and voice samples for quick identification and 1-click email task dispatch.
          </p>
        </div>

        {!showAddForm && (
          <Button
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Team Member
          </Button>
        )}
      </div>

      {/* Add / Edit Form Card */}
      {showAddForm && (
        <div className="p-4 bg-card border border-border/80 rounded-xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
            <h4 className="font-semibold text-sm text-foreground">
              {editingId ? 'Edit Team Member' : 'New Team Member'}
            </h4>
            <Button variant="ghost" size="sm" onClick={resetForm} className="h-6 w-6 p-0">
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Full Name *
              </label>
              <Input
                placeholder="e.g. Raj Patel"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Email Address
              </label>
              <Input
                placeholder="raj@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Role / Title
              </label>
              <Input
                placeholder="e.g. Product Lead"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={resetForm} className="h-8 text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSpeaker}
              disabled={saving}
              className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {editingId ? 'Save Changes' : 'Add to Directory'}
            </Button>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
        <Input
          placeholder="Search team members by name, email, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-xs bg-card border-border/80"
        />
      </div>

      {/* Directory List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-sm">Loading team directory...</span>
          </div>
        ) : filteredSpeakers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl border-border/70 text-muted-foreground space-y-2">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Users className="w-5 h-5 text-muted-foreground/60" />
            </div>
            <p className="text-sm font-medium text-foreground">No team members found</p>
            <p className="text-xs text-muted-foreground text-center">
              Add your colleagues here so MIA can automatically fill their emails and dispatch tasks.
            </p>
          </div>
        ) : (
          filteredSpeakers.map((speaker, idx) => (
            <div
              key={speaker.id}
              className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/70 hover:border-border hover:bg-muted/20 transition-all shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-full ${
                    AVATAR_COLORS[idx % AVATAR_COLORS.length]
                  } flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-xs`}
                >
                  {speaker.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">{speaker.name}</span>
                    {speaker.role && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        {speaker.role}
                      </span>
                    )}
                  </div>
                  {speaker.email ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Mail className="w-3 h-3" />
                      <span>{speaker.email}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/60 italic">No email saved</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startEdit(speaker)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  title="Edit speaker"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteSpeaker(speaker.id, speaker.name)}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                  title="Delete speaker"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
