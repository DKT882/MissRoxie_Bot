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
  Radio
} from 'lucide-react';

interface GroupItem {
  chatId?: number | string;
  id?: number | string;
  chatTitle?: string;
  title?: string;
  name?: string;
  memberCount?: number;
}

interface MentionAllComposerProps {
  groups: GroupItem[];
  selectedChatId?: number | null;
  theme?: 'dark' | 'light';
  onRefresh?: () => void;
}

export type MentionContentType = 'text' | 'photo' | 'video' | 'animation' | 'document';

interface OperationStatus {
  active: boolean;
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

  const [contentType, setContentType] = useState<MentionContentType>('text');
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

  // Sync if selectedChatId changes externally or groups load asynchronously
  useEffect(() => {
    if (selectedChatId && Number(selectedChatId) < 0) {
      setTargetGroupId(Number(selectedChatId));
    } else if (targetGroupId === '' && groups && groups.length > 0) {
      const firstGroup = groups.find(g => Number(g.chatId || g.id) < 0);
      if (firstGroup) {
        setTargetGroupId(Number(firstGroup.chatId || firstGroup.id));
      }
    }
  }, [selectedChatId, groups]);

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

  // Handle local file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/dashboard/posts/upload-media?type=${contentType}`, {
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
  const maxChars = contentType === 'text' ? 3500 : 600;
  const currentChars = announcementText.length;
  const isOverLimit = currentChars > maxChars;

  // Validation
  const isTargetGroupValid = typeof targetGroupId === 'number' && targetGroupId < 0;
  const isMediaConfigured =
    contentType === 'text' ||
    (mediaSource === 'upload' ? Boolean(mediaUploadId) : Boolean(mediaFileId.trim()));
  const isOperationActive = Boolean(opStatus?.active);

  const canStart =
    isTargetGroupValid &&
    !isOperationActive &&
    !isOverLimit &&
    isMediaConfigured &&
    !isSubmitting &&
    (contentType !== 'text' || announcementText.trim().length > 0);

  // Start Mention All
  const handleStartMentionAll = async () => {
    if (!canStart || typeof targetGroupId !== 'number') return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload: any = {
        chatId: targetGroupId,
        contentType,
        text: announcementText.trim()
      };

      if (contentType !== 'text') {
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
              {isSubmitting ? 'Starting...' : 'Start Mention All'}
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

      {/* Target Group Selector (Explicit Requirement) */}
      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-2`}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-purple-400" />
            Target Telegram Group <span className="text-rose-500">*</span>
          </label>
          <span className={`text-[11px] ${themeMutedText}`}>
            Explicit group selection required
          </span>
        </div>

        {groupOptions.length === 0 ? (
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

      {/* Content Type Selector */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-stone-200">Content Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { id: 'text', label: 'Text Only', icon: FileText },
            { id: 'photo', label: 'Photo', icon: Image },
            { id: 'video', label: 'Video', icon: Video },
            { id: 'animation', label: 'GIF / Animation', icon: Film },
            { id: 'document', label: 'Document', icon: Sparkles }
          ].map((type) => {
            const Icon = type.icon;
            const isSelected = contentType === type.id;
            return (
              <button
                key={type.id}
                type="button"
                disabled={isOperationActive}
                onClick={() => {
                  setContentType(type.id as MentionContentType);
                  clearAttachment();
                }}
                className={`p-3 rounded-xl border text-xs font-medium flex flex-col items-center justify-center gap-1.5 transition-colors ${
                  isSelected
                    ? 'bg-purple-600/15 border-purple-500 text-purple-300 shadow-sm'
                    : `${themeInnerCardBg} ${themeBorder} text-stone-400 hover:text-stone-200`
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-purple-400' : 'text-stone-400'}`} />
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Media Attachment Configuration (When not Text-Only) */}
      {contentType !== 'text' && (
        <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-purple-400" />
              Media Attachment ({contentType.toUpperCase()}) <span className="text-rose-500">*</span>
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
                  contentType === 'photo'
                    ? 'image/*'
                    : contentType === 'video'
                    ? 'video/*'
                    : contentType === 'animation'
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
                    {isUploading ? 'Uploading to server...' : `Click to browse and upload ${contentType}`}
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
                placeholder={`Enter Telegram file_id or public direct HTTPS URL for ${contentType}...`}
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
          <label className="text-xs font-semibold text-stone-200">
            {contentType === 'text' ? 'Announcement Message' : 'Media Caption'}
            {contentType === 'text' && <span className="text-rose-500"> *</span>}
          </label>
          <span
            className={`text-[11px] font-mono ${
              isOverLimit ? 'text-rose-400 font-bold' : themeMutedText
            }`}
          >
            {currentChars} / {maxChars} characters
            {contentType !== 'text' && ' (Telegram caption limit)'}
          </span>
        </div>

        <textarea
          rows={4}
          disabled={isOperationActive}
          value={announcementText}
          onChange={(e) => setAnnouncementText(e.target.value)}
          placeholder={
            contentType === 'text'
              ? 'Enter your announcement text here. 10 member mentions will be appended as interactive emojis to each message batch...'
              : 'Enter an optional announcement caption. 10 member mentions will be appended to each media batch...'
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
