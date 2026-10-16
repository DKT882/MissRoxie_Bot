import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users,
  Send,
  Square,
  Image,
  Video,
  FileText,
  Film,
  Upload,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Sparkles,
  Shield,
  X,
  Radio,
  Lock,
  Layers
} from 'lucide-react';

export interface GroupItem {
  chatId?: number | string;
  id?: number | string;
  chatTitle?: string;
  title?: string;
  name?: string;
  memberCount?: number;
}

export interface MentionAllComposerProps {
  groups: GroupItem[];
  selectedChatId?: number | null;
  lockToSelectedGroup?: boolean;
  theme?: 'dark' | 'light';
  onRefresh?: () => void;
}

export type MentionContentType = 'text' | 'photo' | 'video' | 'animation' | 'document';

export type MentionContentFormat =
  | 'text'
  | 'photo'
  | 'video'
  | 'animation'
  | 'document'
  | 'text_photo'
  | 'text_video'
  | 'text_animation'
  | 'text_document';

export interface FormatConfig {
  id: MentionContentFormat;
  label: string;
  category: 'text' | 'media' | 'combo';
  categoryLabel: string;
  baseType: MentionContentType;
  requiresMedia: boolean;
  requiresText: boolean;
  maxTextLen: number;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

export const FORMAT_CONFIGS: Record<MentionContentFormat, FormatConfig> = {
  text: {
    id: 'text',
    label: 'Text',
    category: 'text',
    categoryLabel: 'Text Only',
    baseType: 'text',
    requiresMedia: false,
    requiresText: false,
    maxTextLen: 3500,
    icon: FileText,
    description: 'Standard text announcement or mention-only broadcast'
  },
  photo: {
    id: 'photo',
    label: 'Photo',
    category: 'media',
    categoryLabel: 'Media Only',
    baseType: 'photo',
    requiresMedia: true,
    requiresText: false,
    maxTextLen: 700,
    icon: Image,
    description: 'Photo broadcast with optional caption'
  },
  video: {
    id: 'video',
    label: 'Video',
    category: 'media',
    categoryLabel: 'Media Only',
    baseType: 'video',
    requiresMedia: true,
    requiresText: false,
    maxTextLen: 700,
    icon: Video,
    description: 'Video broadcast with optional caption'
  },
  animation: {
    id: 'animation',
    label: 'GIF / Animation',
    category: 'media',
    categoryLabel: 'Media Only',
    baseType: 'animation',
    requiresMedia: true,
    requiresText: false,
    maxTextLen: 700,
    icon: Film,
    description: 'GIF broadcast with optional caption'
  },
  document: {
    id: 'document',
    label: 'Document / File',
    category: 'media',
    categoryLabel: 'Media Only',
    baseType: 'document',
    requiresMedia: true,
    requiresText: false,
    maxTextLen: 700,
    icon: Sparkles,
    description: 'File broadcast with optional caption'
  },
  text_photo: {
    id: 'text_photo',
    label: 'Text + Photo',
    category: 'combo',
    categoryLabel: 'Combined',
    baseType: 'photo',
    requiresMedia: true,
    requiresText: false,
    maxTextLen: 700,
    icon: Image,
    description: 'Photo broadcast with optional announcement text'
  },
  text_video: {
    id: 'text_video',
    label: 'Text + Video',
    category: 'combo',
    categoryLabel: 'Combined',
    baseType: 'video',
    requiresMedia: true,
    requiresText: false,
    maxTextLen: 700,
    icon: Video,
    description: 'Video broadcast with optional announcement text'
  },
  text_animation: {
    id: 'text_animation',
    label: 'Text + GIF',
    category: 'combo',
    categoryLabel: 'Combined',
    baseType: 'animation',
    requiresMedia: true,
    requiresText: false,
    maxTextLen: 700,
    icon: Film,
    description: 'GIF broadcast with optional announcement text'
  },
  text_document: {
    id: 'text_document',
    label: 'Text + Document',
    category: 'combo',
    categoryLabel: 'Combined',
    baseType: 'document',
    requiresMedia: true,
    requiresText: false,
    maxTextLen: 700,
    icon: Sparkles,
    description: 'Document broadcast with optional announcement text'
  }
};

export interface MtprotoHealthState {
  isConfigured: boolean;
  mode: string;
  status: string;
  isConnected: boolean;
  canOperate: boolean;
  error?: string;
  errorCode?: string;
  actionRequired?: string;
  authenticatedUser?: {
    id: string;
    username?: string;
    firstName?: string;
    isBot: boolean;
  };
}

interface OperationStatus {
  active: boolean;
  mtprotoHealth?: MtprotoHealthState;
  operation?: {
    operationId: string;
    chatId: number;
    source: 'command' | 'dashboard';
    contentType: string;
    totalBatches: number;
    sentBatches: number;
    mentionsCount: number;
    isCancelled: boolean;
    status: string;
    startedAt: number;
    actorDisplayName?: string;
  };
  lastOperation?: {
    operationId: string;
    chatId: number;
    chatTitle?: string;
    source: 'command' | 'dashboard';
    contentType: string;
    totalBatches: number;
    sentBatches: number;
    mentionsCount: number;
    status: 'completed' | 'cancelled' | 'failed';
    startedAt: number;
    endedAt: number;
    actorDisplayName?: string;
    cancelledBy?: { displayName?: string; username?: string };
    error?: string;
  };
}

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('roxie_session_id') : null;
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers['x-session-id'] = token;
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const MentionAllComposer: React.FC<MentionAllComposerProps> = ({
  groups,
  selectedChatId,
  lockToSelectedGroup = false,
  theme = 'dark',
  onRefresh
}) => {
  const [targetGroupId, setTargetGroupId] = useState<number | ''>(() => {
    if (selectedChatId && Number(selectedChatId) < 0) {
      return Number(selectedChatId);
    }
    const firstGroup = groups.find(g => Number(g.chatId || g.id) < 0);
    return firstGroup ? Number(firstGroup.chatId || firstGroup.id) : '';
  });

  const [format, setFormat] = useState<MentionContentFormat>('text');
  const [announcementText, setAnnouncementText] = useState('');
  const [mediaSource, setMediaSource] = useState<'upload' | 'url'>('upload');
  const [mediaFileId, setMediaFileId] = useState('');
  const [mediaUploadId, setMediaUploadId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const [opStatus, setOpStatus] = useState<OperationStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Theme tokens
  const isDark = theme === 'dark';
  const themeCardBg = isDark ? 'bg-stone-900 border-stone-800' : 'bg-white border-stone-200';
  const themeInnerCardBg = isDark ? 'bg-stone-950/60' : 'bg-stone-50';
  const themeBorder = isDark ? 'border-stone-800' : 'border-stone-200';
  const themeMutedText = isDark ? 'text-stone-400' : 'text-stone-500';

  // Filter valid group chats (negative chatId)
  const groupOptions = useMemo(() => {
    return groups
      .map(g => ({
        chatId: Number(g.chatId || g.id),
        title: g.chatTitle || g.title || g.name || `Group ${g.chatId || g.id}`,
        memberCount: g.memberCount
      }))
      .filter(g => !isNaN(g.chatId) && g.chatId < 0);
  }, [groups]);

  // Current locked/selected group information
  const currentSelectedGroup = useMemo(() => {
    if (!targetGroupId) return null;
    return groupOptions.find(g => g.chatId === Number(targetGroupId)) || null;
  }, [groupOptions, targetGroupId]);

  // Sync if selectedChatId changes externally or groups load asynchronously
  useEffect(() => {
    if (lockToSelectedGroup && selectedChatId && Number(selectedChatId) < 0) {
      setTargetGroupId(Number(selectedChatId));
    } else if (selectedChatId && Number(selectedChatId) < 0 && targetGroupId === '') {
      setTargetGroupId(Number(selectedChatId));
    } else if (targetGroupId === '' && groups && groups.length > 0) {
      const firstGroup = groups.find(g => Number(g.chatId || g.id) < 0);
      if (firstGroup) {
        setTargetGroupId(Number(firstGroup.chatId || firstGroup.id));
      }
    }
  }, [selectedChatId, lockToSelectedGroup, groups]);

  // Fetch status of active operation for targetGroupId
  const fetchStatus = async (chatId: number) => {
    if (!chatId || chatId >= 0) return;
    try {
      const res = await fetch(`/api/dashboard/mention-all/status/${chatId}`, {
        headers: getAuthHeaders(),
        credentials: 'same-origin'
      });
      if (res.ok) {
        const data: OperationStatus = await res.json();
        setOpStatus(data);
        return data;
      } else if (res.status === 401 || res.status === 403) {
        setFeedback({
          type: 'error',
          text: 'Operator session required or expired. Please ensure you are logged in as an administrator.'
        });
      }
    } catch (err) {
      console.error('Failed to poll mention-all status:', err);
    }
    return null;
  };

  // Poll status when an operation is active
  useEffect(() => {
    if (!targetGroupId || typeof targetGroupId !== 'number') {
      setOpStatus(null);
      return;
    }

    fetchStatus(targetGroupId);

    // Set up polling interval
    pollTimerRef.current = setInterval(async () => {
      const current = await fetchStatus(targetGroupId);
      if (current?.active) {
        setIsPolling(true);
      } else {
        setIsPolling(false);
      }
    }, 2000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [targetGroupId]);

  const currentConfig = FORMAT_CONFIGS[format];

  // Handle local file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('file', file);

    const baseType = currentConfig.baseType;
    try {
      const res = await fetch(`/api/dashboard/posts/upload-media?type=${baseType}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders(),
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload media file.');
      }

      setMediaUploadId(data.mediaId);
      setUploadedFileName(file.name);
      setFeedback({ type: 'success', text: `Uploaded ${file.name} successfully.` });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'File upload failed.' });
      setMediaUploadId(null);
      setUploadedFileName(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearAttachment = () => {
    setMediaUploadId(null);
    setUploadedFileName(null);
    setMediaFileId('');
  };

  // Character limits
  const maxChars = currentConfig.maxTextLen;
  const currentChars = announcementText.length;
  const isOverLimit = currentChars > maxChars;

  // Validation
  const isTargetGroupValid = typeof targetGroupId === 'number' && targetGroupId < 0;
  const hasMedia = mediaSource === 'upload' ? Boolean(mediaUploadId) : Boolean(mediaFileId.trim());
  const isMediaValid = !currentConfig.requiresMedia || hasMedia;
  const hasText = announcementText.trim().length > 0;
  const isTextValid = !currentConfig.requiresText || hasText;
  const isOperationActive = Boolean(opStatus?.active);
  const isMtprotoRevoked = opStatus?.mtprotoHealth?.status === 'AUTH_KEY_UNREGISTERED' || opStatus?.mtprotoHealth?.status === 'AUTH_REVOKED';

  const canStart =
    isTargetGroupValid &&
    !isOperationActive &&
    !isOverLimit &&
    isMediaValid &&
    isTextValid &&
    !isMtprotoRevoked &&
    !isSubmitting;

  // Start Mention All
  const handleStartMentionAll = async () => {
    if (!canStart || typeof targetGroupId !== 'number') return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const baseContentType = currentConfig.baseType;
      const payload: any = {
        chatId: targetGroupId,
        contentType: baseContentType,
        text: announcementText.trim()
      };

      if (currentConfig.requiresMedia) {
        if (mediaSource === 'upload' && mediaUploadId) {
          payload.mediaUploadId = mediaUploadId;
        } else if (mediaFileId.trim()) {
          payload.mediaFileId = mediaFileId.trim();
        }
      }

      const res = await fetch('/api/dashboard/mention-all/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start Mention All broadcast.');
      }

      setFeedback({
        type: 'success',
        text: 'Mention All announcement started successfully! Progress is tracked below.'
      });
      fetchStatus(targetGroupId);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to start broadcast.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Stop Mention All
  const handleStopMentionAll = async () => {
    if (!isTargetGroupValid || typeof targetGroupId !== 'number' || !isOperationActive) return;

    setIsStopping(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/dashboard/mention-all/stop', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ chatId: targetGroupId })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to stop broadcast.');
      }

      setFeedback({
        type: 'info',
        text: data.message || 'Mention All broadcast stopped.'
      });
      fetchStatus(targetGroupId);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to stop broadcast.' });
    } finally {
      setIsStopping(false);
    }
  };

  const activeOp = opStatus?.operation;
  const lastOp = opStatus?.lastOperation;

  // Calculate progress
  const progressPct = activeOp && activeOp.totalBatches > 0
    ? Math.min(100, Math.round((activeOp.sentBatches / activeOp.totalBatches) * 100))
    : 0;

  return (
    <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6 shadow-sm`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold flex items-center gap-2 text-stone-100">
              <Users className="w-5 h-5 text-purple-500" />
              Mention All (@all) Composer
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
              Admin Only
            </span>
          </div>
          <p className={`text-xs ${themeMutedText} mt-1`}>
            Send an authoritative announcement to all group members via MTProto member enumeration in 10-member emoji batches.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isOperationActive ? (
            <button
              type="button"
              onClick={handleStopMentionAll}
              disabled={isStopping || activeOp?.isCancelled}
              className="flex-1 sm:flex-initial px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm min-h-[40px]"
            >
              <Square className="w-4 h-4 fill-current" />
              {isStopping || activeOp?.isCancelled ? 'Stopping...' : 'Stop Mention All'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartMentionAll}
              disabled={!canStart || isSubmitting}
              className="flex-1 sm:flex-initial px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm min-h-[40px]"
            >
              <Send className="w-4 h-4" />
              {isSubmitting
                ? 'Starting...'
                : isMtprotoRevoked
                ? 'MTProto Session Revoked'
                : 'Start Mention All'}
            </button>
          )}

          <button
            type="button"
            onClick={() => targetGroupId && fetchStatus(Number(targetGroupId))}
            className={`p-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-stone-300 min-h-[40px]`}
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${isPolling ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* MTProto Session Revocation Alert */}
      {isMtprotoRevoked && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
          <div className="flex items-center gap-2 font-bold text-rose-200">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>Telegram MTProto Session Invalid or Revoked (401: AUTH_KEY_UNREGISTERED)</span>
          </div>
          <p className="text-xs leading-relaxed text-stone-300">
            The configured MTProto session was invalidated or terminated by Telegram. Mention All cannot enumerate group members until a fresh session string is configured.
          </p>
          <div className="bg-black/40 p-3 rounded-lg text-xs font-mono text-stone-200 space-y-1 border border-rose-500/20">
            <div className="text-rose-400 font-semibold font-sans">Action Required to Restore Service:</div>
            <div>1. In terminal, run: <code className="text-pink-300 bg-black/40 px-1 py-0.5 rounded">npx tsx scripts/generateMtprotoSession.ts</code></div>
            <div>2. Authenticate with your Telegram account and copy the newly generated session string.</div>
            <div>3. Update <code className="text-pink-300 bg-black/40 px-1 py-0.5 rounded">TELEGRAM_MT_PROTO_SESSION</code> in your hosting/Render environment variables.</div>
          </div>
        </div>
      )}

      {/* Notification Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : feedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-stone-400 hover:text-stone-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Target Group Selector or Locked Group Badge */}
      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-2`}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-purple-400" />
            Target Telegram Group <span className="text-rose-500">*</span>
          </label>
          <span className={`text-[11px] ${themeMutedText}`}>
            {lockToSelectedGroup ? 'Group locked to current view' : 'Explicit group selection required'}
          </span>
        </div>

        {lockToSelectedGroup ? (
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-600/20 text-purple-300">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-stone-100 flex items-center gap-2">
                  <span>{currentSelectedGroup?.title || `Group ${targetGroupId}`}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-600/25 text-purple-300 border border-purple-500/30">
                    Locked to this Group
                  </span>
                </div>
                <div className={`text-[11px] ${themeMutedText} font-mono mt-0.5`}>
                  Chat ID: {targetGroupId} {currentSelectedGroup?.memberCount ? `• ${currentSelectedGroup.memberCount} members` : ''}
                </div>
              </div>
            </div>
            <span className="text-[11px] text-purple-300/80 font-medium hidden sm:inline">
              Mismatch Protected
            </span>
          </div>
        ) : groupOptions.length === 0 ? (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>No connected Telegram groups detected. Roxie must be added as an administrator to at least one group.</span>
            </div>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 rounded-lg text-xs font-semibold shrink-0"
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <>
            <select
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value ? Number(e.target.value) : '')}
              disabled={isOperationActive}
              className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-2.5 text-xs focus:outline-none focus:border-purple-500 font-sans text-stone-200`}
            >
              <option value="">-- Select Target Telegram Group --</option>
              {groupOptions.map((g) => (
                <option key={g.chatId} value={g.chatId}>
                  {g.title} ({g.chatId}){g.memberCount ? ` • ${g.memberCount} members` : ''}
                </option>
              ))}
            </select>
            {!isTargetGroupValid && (
              <p className="text-[11px] text-amber-400 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3.5 h-3.5" /> Please select a connected group before starting Mention All.
              </p>
            )}
          </>
        )}
      </div>

      {/* Active Operation Status Bar (Live or Idle) */}
      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isOperationActive
                  ? activeOp?.isCancelled
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-emerald-400 animate-pulse'
                  : 'bg-stone-500'
              }`}
            />
            <span className="text-xs font-bold text-stone-200">
              {isOperationActive
                ? activeOp?.isCancelled
                  ? 'Broadcast Stopping...'
                  : 'Broadcast In Progress'
                : 'Broadcast Idle'}
            </span>
            {activeOp && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-800 text-stone-300 border border-stone-700">
                Source: {activeOp.source === 'command' ? 'Telegram /all' : 'Dashboard'}
              </span>
            )}
          </div>

          {activeOp && (
            <span className="text-xs text-stone-300 font-mono">
              Batches: {activeOp.sentBatches} / {activeOp.totalBatches} ({progressPct}%) • {activeOp.mentionsCount} members
            </span>
          )}
        </div>

        {/* Live Progress Bar */}
        {isOperationActive && (
          <div className="w-full space-y-1.5">
            <div className="w-full h-2.5 bg-stone-800 rounded-full overflow-hidden border border-stone-700">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  activeOp?.isCancelled ? 'bg-amber-500' : 'bg-purple-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-stone-400">
              <span>Initiated by: {activeOp?.actorDisplayName || 'Admin'}</span>
              <span>Pacing: 20s between batches</span>
            </div>
          </div>
        )}

        {/* Last Operation Summary */}
        {!isOperationActive && lastOp && (
          <div className="text-[11px] text-stone-400 border-t border-stone-800/60 pt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="text-stone-300 font-medium">Last Run:</span>
            <span className={`capitalize font-semibold ${
              lastOp.status === 'completed' ? 'text-emerald-400' : lastOp.status === 'cancelled' ? 'text-amber-400' : 'text-rose-400'
            }`}>
              {lastOp.status}
            </span>
            <span>Batches: {lastOp.sentBatches} / {lastOp.totalBatches}</span>
            <span>Mentions: {lastOp.mentionsCount}</span>
            <span>By: {lastOp.actorDisplayName || 'Admin'}</span>
            {lastOp.cancelledBy && <span>(Stopped by: {lastOp.cancelledBy.displayName || 'Admin'})</span>}
          </div>
        )}
      </div>

      {/* Content Format Selector (9 Formats Supported) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-purple-400" />
            Announcement Format <span className="text-rose-500">*</span>
          </label>
          <span className={`text-[11px] ${themeMutedText}`}>
            9 supported content format options
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {Object.values(FORMAT_CONFIGS).map((cfg) => {
            const Icon = cfg.icon;
            const isSelected = format === cfg.id;
            return (
              <button
                key={cfg.id}
                type="button"
                disabled={isOperationActive}
                onClick={() => {
                  setFormat(cfg.id);
                  if (!cfg.requiresMedia && cfg.category === 'text') {
                    clearAttachment();
                  }
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'bg-purple-600/15 border-purple-500 text-purple-200 shadow-sm ring-1 ring-purple-500/40'
                    : `${themeInnerCardBg} ${themeBorder} text-stone-400 hover:text-stone-200 hover:border-stone-700`
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-purple-400' : 'text-stone-400'}`} />
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                      cfg.category === 'text'
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        : cfg.category === 'combo'
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {cfg.categoryLabel}
                  </span>
                </div>
                <div>
                  <div className="text-xs font-bold text-stone-200">{cfg.label}</div>
                  <div className={`text-[10px] ${themeMutedText} line-clamp-1`}>{cfg.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Media Attachment Configuration (When Format Requires Media) */}
      {currentConfig.requiresMedia && (
        <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-purple-400" />
              {currentConfig.label} Attachment <span className="text-rose-500">*</span>
            </label>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={isOperationActive}
                onClick={() => setMediaSource('upload')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  mediaSource === 'upload' ? 'bg-purple-600 text-white' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Local Upload
              </button>
              <button
                type="button"
                disabled={isOperationActive}
                onClick={() => setMediaSource('url')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  mediaSource === 'url' ? 'bg-purple-600 text-white' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Telegram File ID / URL
              </button>
            </div>
          </div>

          {mediaSource === 'upload' ? (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                disabled={isOperationActive || isUploading}
                onChange={handleFileUpload}
                accept={
                  currentConfig.baseType === 'photo'
                    ? 'image/*'
                    : currentConfig.baseType === 'video'
                    ? 'video/*'
                    : currentConfig.baseType === 'animation'
                    ? 'image/gif,video/mp4'
                    : '*/*'
                }
                className="hidden"
                id="mention-all-file-upload"
              />

              {uploadedFileName ? (
                <div className="flex items-center justify-between p-3 rounded-xl border border-purple-500/30 bg-purple-500/10 text-xs text-purple-200">
                  <span className="truncate">Attached: {uploadedFileName}</span>
                  <button
                    type="button"
                    disabled={isOperationActive}
                    onClick={clearAttachment}
                    className="text-stone-400 hover:text-rose-400 ml-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="mention-all-file-upload"
                  className={`border border-dashed ${themeBorder} hover:border-purple-500/50 rounded-xl p-4 text-center cursor-pointer flex flex-col items-center justify-center gap-1.5 transition-colors ${
                    isUploading ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  <Upload className="w-5 h-5 text-stone-400" />
                  <span className="text-xs text-stone-300">
                    {isUploading ? 'Uploading to server...' : `Click to browse and upload ${currentConfig.label}`}
                  </span>
                  <span className={`text-[10px] ${themeMutedText}`}>
                    Media is cached after the first batch and sent to all member groups without re-uploading.
                  </span>
                </label>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <input
                type="text"
                disabled={isOperationActive}
                placeholder={`Enter Telegram file_id or public direct HTTPS URL for ${currentConfig.label}...`}
                value={mediaFileId}
                onChange={(e) => setMediaFileId(e.target.value)}
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-purple-500 font-mono`}
              />
              <p className={`text-[10px] ${themeMutedText}`}>
                Direct Telegram file_ids or public image/video links supported.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Announcement Text / Caption Field */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-purple-400" />
            {currentConfig.category === 'text'
              ? 'Announcement Message'
              : currentConfig.category === 'combo'
              ? 'Announcement Text & Caption'
              : 'Announcement Caption'}
            {currentConfig.requiresText ? (
              <span className="text-rose-500"> * (Required)</span>
            ) : (
              <span className={`text-[11px] font-normal ${themeMutedText}`}> (Optional)</span>
            )}
          </label>
          <span
            className={`text-[11px] font-mono ${
              isOverLimit ? 'text-rose-400 font-bold' : themeMutedText
            }`}
          >
            {currentChars} / {maxChars} characters
            {currentConfig.requiresMedia && ' (Safe caption headroom)'}
          </span>
        </div>

        <textarea
          rows={currentConfig.category === 'text' ? 5 : 3}
          disabled={isOperationActive}
          value={announcementText}
          onChange={(e) => setAnnouncementText(e.target.value)}
          placeholder={
            currentConfig.category === 'text'
              ? 'Enter optional announcement text, or leave blank to mention all members directly with clickable emojis in 10-user batches...'
              : currentConfig.category === 'combo'
              ? 'Enter optional announcement text, or leave blank to deliver media with clickable member mentions directly...'
              : 'Enter an optional announcement caption, or leave blank to deliver media with clickable member mentions directly...'
          }
          className={`w-full ${themeInnerCardBg} border ${
            isOverLimit ? 'border-rose-500' : themeBorder
          } rounded-xl p-3 text-xs focus:outline-none focus:border-purple-500 font-sans text-stone-200 resize-y`}
        />
        {isOverLimit && (
          <p className="text-[11px] text-rose-400 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" /> Character limit exceeded. Shorten text to leave room for Telegram member mention hyperlinks.
          </p>
        )}
      </div>

      {/* Footer Info Box */}
      <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-[11px] text-purple-300 flex items-start gap-2.5">
        <Radio className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-purple-200">Safe Member Mention Engine</p>
          <p className="text-stone-400 leading-relaxed">
            Mention All groups members into 10-user emoji mentions per message with built-in 20-second pacing and Telegram 429 flood-wait protection. In-flight operations can be cancelled at any time either via the <b>Stop Mention All</b> button above or by typing <code>/stopall</code> in the Telegram group.
          </p>
        </div>
      </div>
    </div>
  );
};
