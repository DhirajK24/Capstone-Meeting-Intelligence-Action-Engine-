'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Speaker, speakerDisplayName, SpeakerDirectoryEntry } from '@/types/speaker';
import {
  Users,
  Pencil,
  Check,
  X,
  PlayCircle,
  RefreshCw,
  GitMerge,
  Loader2,
  Mic,
  Mail,
} from 'lucide-react';

interface SpeakerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  onSpeakersUpdated?: (speakers: Speaker[]) => void;
}

const SPEAKER_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
  'bg-lime-500',
];

function getSpeakerColor(index: number): string {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

export function SpeakerModal({
  open,
  onOpenChange,
  meetingId,
  onSpeakersUpdated,
}: SpeakerModalProps) {
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [directorySpeakers, setDirectorySpeakers] = useState<SpeakerDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [numSpeakers, setNumSpeakers] = useState<string>('auto');
  const [playingLabel, setPlayingLabel] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saveToDirectory, setSaveToDirectory] = useState(true);
  const [mergeA, setMergeA] = useState<string>('');
  const [mergeB, setMergeB] = useState<string>('');
  const [merging, setMerging] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  // Load speakers and directory on open
  useEffect(() => {
    if (!open || !meetingId) return;
    fetchSpeakers();
    fetchDirectory();
  }, [open, meetingId]);

  // Listen for diarization-complete events
  useEffect(() => {
    if (!open) return;
    const unlisten = listen<string>('speakers-updated', (event) => {
      if (event.payload === meetingId) {
        fetchSpeakers();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [open, meetingId]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingLabel && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingLabel]);

  const fetchDirectory = async () => {
    try {
      const data = await invoke<SpeakerDirectoryEntry[]>('get_speaker_directory');
      setDirectorySpeakers(data);
    } catch (err) {
      console.error('Failed to fetch directory:', err);
    }
  };

  const fetchSpeakers = useCallback(async () => {
    if (!meetingId) return;
    setLoading(true);
    try {
      const result = await invoke<Speaker[]>('get_speakers', { meetingId });
      setSpeakers(result);
      onSpeakersUpdated?.(result);
      if (result.length > 0 && !mergeA) {
        setMergeA(result[0].internal_label);
        setMergeB(result[result.length > 1 ? 1 : 0].internal_label);
      }
    } catch (err) {
      console.error('Failed to fetch speakers:', err);
    } finally {
      setLoading(false);
    }
  }, [meetingId, onSpeakersUpdated, mergeA]);

  const handleRerun = async () => {
    setRerunning(true);
    try {
      const parsedCount =
        numSpeakers === 'auto' ? null : parseInt(numSpeakers, 10);
      const result = await invoke<Speaker[]>('re_run_diarization', {
        meetingId,
        numSpeakers: parsedCount,
      });
      setSpeakers(result);
      onSpeakersUpdated?.(result);
    } catch (err) {
      console.error('Diarization failed:', err);
      toast.error('Diarization failed', {
        description: err as string,
        duration: 10000,
      });
    } finally {
      setRerunning(false);
    }
  };

  const startEdit = (speaker: Speaker) => {
    setEditingLabel(speaker.internal_label);
    setEditValue(speaker.custom_name || speaker.internal_label);
    setEditEmail(speaker.email || '');
    setSaveToDirectory(true);
  };

  const cancelEdit = () => {
    setEditingLabel(null);
    setEditValue('');
    setEditEmail('');
  };

  const handleSelectFromDirectory = (dirSpeaker: SpeakerDirectoryEntry) => {
    setEditValue(dirSpeaker.name);
    if (dirSpeaker.email) {
      setEditEmail(dirSpeaker.email);
    }
  };

  const commitEdit = async (speaker: Speaker) => {
    const newName = editValue.trim() || speaker.custom_name || speaker.internal_label;
    const newEmail = editEmail.trim() || null;
    const nameChanged = newName !== (speaker.custom_name || speaker.internal_label);
    const emailChanged = newEmail !== (speaker.email || null);
    if (!nameChanged && !emailChanged && !saveToDirectory) {
      cancelEdit();
      return;
    }
    try {
      await invoke('update_meeting_speaker_email', {
        meetingId,
        internalLabel: speaker.internal_label,
        customName: newName,
        email: newEmail,
      });

      // Optionally save to global speaker directory
      if (saveToDirectory && newName) {
        await invoke('save_speaker_to_directory', {
          id: null,
          name: newName,
          email: newEmail,
          role: null,
          voiceSamplePath: null,
        });
        fetchDirectory();
      }

      const updated = speakers.map((s) =>
        s.internal_label === speaker.internal_label
          ? { ...s, custom_name: newName, email: newEmail }
          : s
      );
      setSpeakers(updated);
      onSpeakersUpdated?.(updated);
      toast.success(`Saved ${newName} (${newEmail || 'no email'})`);
    } catch (err) {
      console.error('Failed to update speaker:', err);
      toast.error('Failed to update speaker');
    } finally {
      cancelEdit();
    }
  };

  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handlePlaySample = async (speaker: Speaker) => {
    if (playingLabel === speaker.internal_label) {
      return;
    }
    setPlayingLabel(speaker.internal_label);
    try {
      const wavBytes = await invoke<number[]>('play_speaker_sample', {
        meetingId,
        internalLabel: speaker.internal_label,
      });

      const buffer = new Uint8Array(wavBytes).buffer;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const decoded = await ctx.decodeAudioData(buffer);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination);

      if (activeSourceRef.current) {
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      }
      activeSourceRef.current = source;

      source.start();
      source.onended = () => {
        if (activeSourceRef.current === source) {
          setPlayingLabel(null);
          activeSourceRef.current = null;
        }
      };
    } catch (err) {
      console.error('Failed to play sample:', err);
      setPlayingLabel(null);
    }
  };

  const handleMerge = async () => {
    if (!mergeA || !mergeB || mergeA === mergeB) return;
    setMerging(true);
    try {
      const result = await invoke<Speaker[]>('merge_speakers', {
        meetingId,
        labelA: mergeA,
        labelB: mergeB,
      });
      setSpeakers(result);
      onSpeakersUpdated?.(result);
      setMergeA(result[0]?.internal_label ?? '');
      setMergeB(result[result.length > 1 ? 1 : 0]?.internal_label ?? '');
    } catch (err) {
      console.error('Failed to merge speakers:', err);
    } finally {
      setMerging(false);
    }
  };

  const noneFound = !loading && speakers.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-background border border-border text-foreground shadow-2xl sm:rounded-2xl">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Users className="w-5 h-5 text-blue-600" />
            Speaker Identification
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground text-left">
            Detect, label, and assign emails to participants across meeting audio.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="identify" className="mt-1">
          <TabsList className="grid grid-cols-2 w-full bg-muted/80 p-1 text-muted-foreground rounded-lg">
            <TabsTrigger
              value="identify"
              className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-md font-medium text-xs sm:text-sm transition-all"
            >
              Identify
            </TabsTrigger>
            <TabsTrigger
              value="merge"
              className="data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm rounded-md font-medium text-xs sm:text-sm transition-all"
            >
              Merge
            </TabsTrigger>
          </TabsList>

          {/* ──── Identify Tab ──── */}
          <TabsContent value="identify" className="mt-3.5 space-y-4">
            {/* Controls Row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                  Participants:
                </span>
                <Select value={numSpeakers} onValueChange={setNumSpeakers}>
                  <SelectTrigger className="w-28 h-8 bg-background border-input text-foreground text-sm shadow-xs focus:ring-1 focus:ring-ring">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground shadow-md">
                    <SelectItem value="auto">Auto</SelectItem>
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleRerun}
                disabled={rerunning}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-xs transition-colors"
              >
                {rerunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {rerunning ? 'Running…' : 'Re-run'}
              </Button>
            </div>

            {/* Speaker List */}
            <div className="min-h-[160px] max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-36 text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span className="text-sm">Loading speakers…</span>
                </div>
              ) : noneFound ? (
                <div className="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground/60">
                    <Mic className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No speakers identified yet.</p>
                  <p className="text-xs text-muted-foreground">Click Re-run to start speaker diarization.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {speakers.map((speaker, idx) => (
                    <div
                      key={speaker.internal_label}
                      className="p-3 rounded-xl bg-card border border-border/70 hover:border-border hover:bg-muted/20 transition-all shadow-xs space-y-2"
                    >
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div
                          className={`w-9 h-9 rounded-full ${getSpeakerColor(idx)} flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-xs`}
                        >
                          {speakerDisplayName(speaker).charAt(0).toUpperCase()}
                        </div>

                        {/* Name / Edit */}
                        <div className="flex-1 min-w-0">
                          {editingLabel === speaker.internal_label ? (
                            <div className="space-y-2">
                              {/* Directory Picker Suggestion */}
                              {directorySpeakers.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] text-muted-foreground font-medium">Pick saved:</span>
                                  {directorySpeakers.slice(0, 4).map((ds) => (
                                    <button
                                      key={ds.id}
                                      type="button"
                                      onClick={() => handleSelectFromDirectory(ds)}
                                      className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                                    >
                                      {ds.name}
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  ref={editInputRef}
                                  placeholder="Full Name"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="h-8 text-xs bg-background"
                                />
                                <Input
                                  placeholder="Email address"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                  className="h-8 text-xs bg-background"
                                />
                              </div>

                              <div className="flex items-center justify-between pt-1">
                                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                  <Checkbox
                                    checked={saveToDirectory}
                                    onCheckedChange={(c) => setSaveToDirectory(!!c)}
                                  />
                                  <span>Save to Team Directory</span>
                                </label>

                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={cancelEdit}
                                    className="h-7 text-xs px-2"
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => commitEdit(speaker)}
                                    className="h-7 text-xs px-2.5 bg-blue-600 hover:bg-blue-700 text-white gap-1"
                                  >
                                    <Check className="w-3 h-3" />
                                    Save
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-sm text-foreground truncate">
                                  {speakerDisplayName(speaker)}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground">
                                    {speaker.segment_count} segment{speaker.segment_count !== 1 ? 's' : ''}
                                  </span>
                                  {speaker.email ? (
                                    <span className="text-[11px] text-blue-600 flex items-center gap-1">
                                      <Mail className="w-3 h-3" />
                                      {speaker.email}
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => startEdit(speaker)}
                                      className="text-[11px] text-muted-foreground/70 hover:text-blue-600 flex items-center gap-0.5 underline"
                                    >
                                      + Add email
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => startEdit(speaker)}
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  title="Edit name & email"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handlePlaySample(speaker)}
                                  disabled={playingLabel === speaker.internal_label}
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                                  title="Listen to sample"
                                >
                                  {playingLabel === speaker.internal_label ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                                  ) : (
                                    <PlayCircle className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-3 border-t border-border/60">
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="border-input hover:bg-muted text-foreground"
              >
                Done
              </Button>
            </div>
          </TabsContent>

          {/* ──── Merge Tab ──── */}
          <TabsContent value="merge" className="mt-3.5 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select two speakers that are the same person. All segments from Speaker B
              will be merged into Speaker A.
            </p>

            {speakers.length < 2 ? (
              <div className="flex items-center justify-center h-28 text-muted-foreground text-sm rounded-xl border border-dashed border-border/70 bg-muted/20">
                At least 2 speakers needed to merge.
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border/70 shadow-xs">
                <Select value={mergeA} onValueChange={setMergeA}>
                  <SelectTrigger className="flex-1 bg-background border-input text-foreground text-sm shadow-xs">
                    <SelectValue placeholder="Speaker A" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground shadow-md">
                    {speakers.map((s) => (
                      <SelectItem key={s.internal_label} value={s.internal_label}>
                        {speakerDisplayName(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="p-2 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  <GitMerge className="w-4 h-4" />
                </div>

                <Select value={mergeB} onValueChange={setMergeB}>
                  <SelectTrigger className="flex-1 bg-background border-input text-foreground text-sm shadow-xs">
                    <SelectValue placeholder="Speaker B" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground shadow-md">
                    {speakers.map((s) => (
                      <SelectItem
                        key={s.internal_label}
                        value={s.internal_label}
                        disabled={s.internal_label === mergeA}
                      >
                        {speakerDisplayName(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-border/60">
              <Button
                onClick={() => onOpenChange(false)}
                variant="outline"
                className="border-input hover:bg-muted text-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleMerge}
                disabled={merging || speakers.length < 2 || mergeA === mergeB}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 shadow-xs transition-colors"
              >
                {merging ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <GitMerge className="w-3.5 h-3.5" />
                )}
                {merging ? 'Merging…' : 'Merge Speakers'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
