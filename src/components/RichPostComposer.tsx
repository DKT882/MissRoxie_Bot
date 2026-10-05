import React, { useState, useMemo, useCallback } from 'react';
import {
  Send,
  Calendar,
  Sparkles,
  Image,
  Video,
  Film,
  FileText,
  Type,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Pin,
  Reply,
  Shield,
  X,
  RotateCcw,
  Check,
  Clock,
  Upload
} from 'lucide-react';

export type ComposerContentType = 'text' | 'photo' | 'video' | 'animation' | 'document';

export type PostButtonStyle = 'primary' | 'success' | 'danger';

export interface ComposerButton {
  id: string;
  text: string;
  url: string;
  style?: PostButtonStyle;
}

export interface RichPostComposerProps {
  groups: Array<{
    chatId: number;
    chatTitle?: string;
    title?: string;
    memberCount?: number;
    botLeft?: boolean;
    unavailable?: boolean;
  }>;
  selectedChatId?: number | 'all';
  lockedDestination?: {
    type: 'group' | 'private';
    chatId: number;
    title?: string;
  };
  theme?: 'dark' | 'light';
  onRefresh?: () => void;
  botUsername?: string;
}

function isValidHttpUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname?.toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return false;
    }
    if (!hostname.includes('.')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function validateMediaReference(ref?: string, hasUploadedMedia?: boolean): { valid: boolean; error?: string } {
  if (hasUploadedMedia) {
    return { valid: true };
  }
  if (!ref || typeof ref !== 'string') {
    return { valid: false, error: 'Media reference (uploaded file, Telegram file_id, or HTTPS URL) is required.' };
  }
  const trimmed = ref.trim();
  if (!trimmed) {
    return { valid: false, error: 'Media reference cannot be empty.' };
  }
  if (trimmed.startsWith('upl_') || trimmed.startsWith('upload:')) {
    return { valid: true };
  }
  if (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('local_preview_')
  ) {
    return {
      valid: false,
      error: 'Local browser file preview has not been uploaded to backend yet. Please choose a local file using the upload button or enter a valid Telegram file_id or https:// URL.'
    };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (!isValidHttpUrl(trimmed)) {
      return {
        valid: false,
        error: 'Invalid media URL. Must be a valid public http:// or https:// address (e.g. https://example.com/image.jpg).'
      };
    }
    return { valid: true };
  }
  if (trimmed.length < 5 || trimmed.includes(' ') || trimmed.includes('\\')) {
    return {
      valid: false,
      error: 'Invalid Telegram file_id format.'
    };
  }
  return { valid: true };
}

export const RichPostComposer: React.FC<RichPostComposerProps> = ({
  groups,
  selectedChatId,
  lockedDestination,
  theme = 'dark',
  onRefresh,
  botUsername = 'MissRoxie_Bot'
}) => {
  const isDark = theme === 'dark';
  const themeCardBg = isDark ? 'bg-stone-900/90 border-stone-800' : 'bg-white border-stone-200';
  const themeInnerCardBg = isDark ? 'bg-stone-950/60 border-stone-800/80' : 'bg-stone-50 border-stone-200';
  const themeBorder = isDark ? 'border-stone-800' : 'border-stone-200';
  const themeMutedText = isDark ? 'text-stone-400' : 'text-stone-500';
  const themeInputBg = isDark
    ? 'bg-stone-950 border-stone-800 text-stone-100 placeholder:text-stone-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
    : 'bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  // Form State
  const initialChatId = lockedDestination?.chatId !== undefined
    ? lockedDestination.chatId
    : (selectedChatId && selectedChatId !== 'all' ? selectedChatId : (groups[0]?.chatId || ''));
  const [targetChatId, setTargetChatId] = useState<number | string>(initialChatId);

  // Keep targetChatId in sync if lockedDestination changes
  React.useEffect(() => {
    if (lockedDestination?.chatId !== undefined) {
      setTargetChatId(lockedDestination.chatId);
    }
  }, [lockedDestination?.chatId]);
  const [contentType, setContentType] = useState<ComposerContentType>('text');
  const [text, setText] = useState<string>('');
  const [mediaFileId, setMediaFileId] = useState<string>('');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string>('');
  const [pinAfterSend, setPinAfterSend] = useState<boolean>(false);
  const [replyToLatest, setReplyToLatest] = useState<boolean>(false);
  const [protectContent, setProtectContent] = useState<boolean>(false);

  // Local Media Upload State
  const [uploadedMediaId, setUploadedMediaId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // 2D Button Grid State: rows of buttons
  const [buttonGrid, setButtonGrid] = useState<ComposerButton[][]>([]);

  // UI Preview-Only Theme Selector (Client theme preview simulation)
  const [previewTheme, setPreviewTheme] = useState<'default' | 'dark' | 'light' | 'midnight' | 'emerald'>('default');

  // Dialog & Action States
  const [showSendModal, setShowSendModal] = useState<boolean>(false);
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [showClearModal, setShowClearModal] = useState<boolean>(false);

  // Scheduling State
  const defaultScheduleDate = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    return d.toISOString().split('T')[0];
  }, []);

  const defaultScheduleTime = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 30);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }, []);

  const [scheduleDate, setScheduleDate] = useState<string>(defaultScheduleDate);
  const [scheduleTime, setScheduleTime] = useState<string>(defaultScheduleTime);

  // Status & Notification
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    details?: string;
  } | null>(null);

  // Filter Active Groups
  const activeGroups = useMemo(() => {
    return groups.filter(g => !g.botLeft && !g.unavailable);
  }, [groups]);

  const selectedGroup = useMemo(() => {
    return groups.find(g => String(g.chatId) === String(targetChatId));
  }, [groups, targetChatId]);

  // Character limit calculation
  const maxChars = contentType === 'text' ? 4096 : 1024;
  const isOverCharLimit = text.length > maxChars;

  // Local File Upload Handler
  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    if (isGif && contentType !== 'animation') {
      setContentType('animation');
    }

    // Set immediate local visual preview
    const localUrl = URL.createObjectURL(file);
    setMediaPreviewUrl(localUrl);
    setUploadStatus('uploading');
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const targetType = isGif ? 'animation' : contentType;
      const res = await fetch(`/api/dashboard/posts/upload-media?type=${targetType}`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload local media file.');
      }

      setUploadedMediaId(data.mediaUploadId);
      setUploadedFileName(data.filename || file.name);
      setUploadedFileSize(data.size || file.size);
      setUploadStatus('uploaded');
      setUploadError(null);
    } catch (err: any) {
      setUploadStatus('error');
      setUploadError(err.message || 'File upload failed. Please try again.');
    }
  };

  const handleClearUploadedFile = () => {
    setUploadedMediaId(null);
    setUploadedFileName(null);
    setUploadedFileSize(null);
    setUploadStatus('idle');
    setUploadError(null);
    setMediaPreviewUrl('');
  };

  // Validation Checks
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!targetChatId) {
      errors.push('Please select a target chat destination.');
    }
    if (contentType === 'text' && !text.trim()) {
      errors.push('Message text is required for text posts.');
    }
    if (contentType !== 'text') {
      if (uploadStatus === 'uploading') {
        errors.push('Media file is currently uploading. Please wait.');
      } else {
        const mediaVal = validateMediaReference(mediaFileId, Boolean(uploadedMediaId));
        if (!mediaVal.valid) {
          errors.push(mediaVal.error || `Media file_id, URL, or local upload is required for ${contentType} posts.`);
        }
      }
    }
    if (isOverCharLimit) {
      errors.push(`Content exceeds maximum allowed length (${text.length}/${maxChars} chars).`);
    }
    // Button validation
    buttonGrid.forEach((row, rIdx) => {
      row.forEach((btn, bIdx) => {
        if (!btn.text.trim()) {
          errors.push(`Row ${rIdx + 1}, Button ${bIdx + 1}: Button text cannot be empty.`);
        }
        if (!isValidHttpUrl(btn.url)) {
          errors.push(`Row ${rIdx + 1}, Button ${bIdx + 1} (${btn.text || 'Untitled'}): Invalid URL. Must start with http:// or https://`);
        }
      });
    });
    return errors;
  }, [targetChatId, contentType, text, mediaFileId, uploadedMediaId, uploadStatus, isOverCharLimit, maxChars, buttonGrid]);

  const isFormValid = validationErrors.length === 0;

  const isLocalMediaActive = useMemo(() => {
    if (contentType === 'text') return false;
    return Boolean(
      uploadedMediaId ||
      (mediaFileId && (
        mediaFileId.startsWith('upl_') ||
        mediaFileId.startsWith('upload:') ||
        mediaFileId.startsWith('blob:') ||
        mediaFileId.startsWith('data:') ||
        mediaFileId.startsWith('local_preview_')
      ))
    );
  }, [contentType, uploadedMediaId, mediaFileId]);

  // Scheduled date computation
  const computedScheduleTime = useMemo(() => {
    try {
      if (!scheduleDate || !scheduleTime) return null;
      const [year, month, day] = scheduleDate.split('-').map(Number);
      const [hour, minute] = scheduleTime.split(':').map(Number);
      const targetDate = new Date(year, month - 1, day, hour, minute, 0);
      if (isNaN(targetDate.getTime())) return null;
      const isFuture = targetDate.getTime() > Date.now();
      return {
        targetDate,
        isoString: targetDate.toISOString(),
        formatted: targetDate.toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }),
        isFuture,
        diffMinutes: Math.round((targetDate.getTime() - Date.now()) / 60000)
      };
    } catch {
      return null;
    }
  }, [scheduleDate, scheduleTime]);

  // Button Grid Helpers
  const handleAddButton = useCallback((rowIndex: number) => {
    setButtonGrid(prev => {
      const next = prev.map(r => [...r]);
      const newBtn: ComposerButton = {
        id: `btn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: 'Link Button',
        url: 'https://'
      };
      if (next[rowIndex]) {
        next[rowIndex].push(newBtn);
      } else {
        next.push([newBtn]);
      }
      return next;
    });
  }, []);

  const handleAddNewRow = useCallback(() => {
    setButtonGrid(prev => [
      ...prev,
      [
        {
          id: `btn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          text: 'New Button',
          url: 'https://'
        }
      ]
    ]);
  }, []);

  const handleUpdateButton = useCallback((rowIndex: number, btnIndex: number, field: 'text' | 'url' | 'style', val: any) => {
    setButtonGrid(prev => {
      const next = prev.map(r => [...r]);
      if (next[rowIndex] && next[rowIndex][btnIndex]) {
        next[rowIndex][btnIndex] = {
          ...next[rowIndex][btnIndex],
          [field]: val || undefined
        };
      }
      return next;
    });
  }, []);

  const handleRemoveButton = useCallback((rowIndex: number, btnIndex: number) => {
    setButtonGrid(prev => {
      const next = prev.map(r => [...r]);
      if (next[rowIndex]) {
        next[rowIndex].splice(btnIndex, 1);
        if (next[rowIndex].length === 0) {
          next.splice(rowIndex, 1);
        }
      }
      return next;
    });
  }, []);

  const handleClearAllButtons = useCallback(() => {
    setButtonGrid([]);
  }, []);

  // Format payload for backend submission
  const buildPostPayload = useCallback(() => {
    const formattedButtons = buttonGrid
      .map(row =>
        row
          .filter(b => b.text.trim() && isValidHttpUrl(b.url))
          .map(b => {
            const btnObj: { text: string; url: string; style?: PostButtonStyle } = {
              text: b.text.trim(),
              url: (() => {
                try {
                  return new URL(b.url.trim()).href;
                } catch {
                  return b.url.trim();
                }
              })()
            };
            if (b.style) {
              btnObj.style = b.style;
            }
            return btnObj;
          })
      )
      .filter(row => row.length > 0);

    const mediaId = uploadedMediaId ? `upload:${uploadedMediaId}` : (mediaFileId.trim() || undefined);

    let effectiveContentType = contentType;
    if (uploadedFileName && (uploadedFileName.toLowerCase().endsWith('.gif') || uploadedFileName.toLowerCase().includes('.gif'))) {
      effectiveContentType = 'animation';
    } else if (mediaFileId && (mediaFileId.toLowerCase().endsWith('.gif') || mediaFileId.toLowerCase().includes('.gif'))) {
      effectiveContentType = 'animation';
    }

    return {
      contentType: effectiveContentType,
      text: text.trim() || undefined,
      mediaFileId: effectiveContentType !== 'text' ? mediaId : undefined,
      mediaUploadId: effectiveContentType !== 'text' ? (uploadedMediaId || undefined) : undefined,
      buttons: formattedButtons.length > 0 ? formattedButtons : undefined,
      pinAfterSend,
      replyToLatest,
      protectContent
    };
  }, [contentType, text, mediaFileId, uploadedMediaId, uploadedFileName, buttonGrid, pinAfterSend, replyToLatest, protectContent]);

  // Send Now Handler
  const handleConfirmSendNow = async () => {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);
    setNotification(null);

    try {
      const payload = buildPostPayload();
      const res = await fetch('/api/dashboard/posts/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatId: Number(targetChatId),
          payload
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch rich post to Telegram.');
      }

      setShowSendModal(false);
      const targetLabel = lockedDestination?.title || selectedGroup?.chatTitle || `Chat ${targetChatId}`;
      setNotification({
        type: 'success',
        title: 'Post Sent Successfully!',
        message: `Your ${contentType.toUpperCase()} post was delivered to ${targetLabel}.`,
        details: data.result?.messageId ? `Telegram Message ID: #${data.result.messageId}` : undefined
      });

      if (onRefresh) onRefresh();
    } catch (err: any) {
      setNotification({
        type: 'error',
        title: 'Delivery Failed',
        message: err.message || 'An error occurred while communicating with Telegram.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Schedule Dialog Handler
  const handleOpenScheduleModal = () => {
    if (isLocalMediaActive) {
      setNotification({
        type: 'error',
        title: 'Local Media Cannot Be Scheduled',
        message: 'Local media cannot be scheduled on the current hosting setup. Use a Telegram file_id or public HTTPS media URL for scheduled posts.'
      });
      return;
    }
    setShowScheduleModal(true);
  };

  // Schedule Handler
  const handleConfirmSchedule = async () => {
    if (!isFormValid || !computedScheduleTime || !computedScheduleTime.isFuture || isSubmitting) return;

    if (isLocalMediaActive) {
      setNotification({
        type: 'error',
        title: 'Scheduling Not Supported for Local Media',
        message: 'Local media cannot be scheduled on the current hosting setup. Use a Telegram file_id or public HTTPS media URL for scheduled posts.'
      });
      setShowScheduleModal(false);
      return;
    }

    setIsSubmitting(true);
    setNotification(null);

    try {
      const payload = buildPostPayload();
      const res = await fetch('/api/dashboard/posts/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatId: Number(targetChatId),
          payload,
          nextRun: computedScheduleTime.isoString,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create schedule record.');
      }

      setShowScheduleModal(false);
      const targetLabel = lockedDestination?.title || selectedGroup?.chatTitle || `Chat ${targetChatId}`;
      setNotification({
        type: 'success',
        title: 'Post Scheduled Successfully!',
        message: `Scheduled for ${computedScheduleTime.formatted} to ${targetLabel}.`,
        details: data.schedule?.id ? `Schedule ID: [${data.schedule.id}]` : undefined
      });

      if (onRefresh) onRefresh();
    } catch (err: any) {
      setNotification({
        type: 'error',
        title: 'Scheduling Failed',
        message: err.message || 'An error occurred while saving the schedule.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Clear / Reset Handler
  const handleResetComposer = () => {
    setText('');
    setMediaFileId('');
    setMediaPreviewUrl('');
    handleClearUploadedFile();
    setButtonGrid([]);
    setPinAfterSend(false);
    setReplyToLatest(false);
    setProtectContent(false);
    setShowClearModal(false);
    setNotification(null);
  };

  const isDirty = Boolean(text.trim() || mediaFileId.trim() || uploadedMediaId || buttonGrid.length > 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold flex items-center gap-2 text-stone-100">
              <Sparkles className="w-6 h-6 text-amber-400" />
              Rich Post Composer
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Unified PostSender
            </span>
          </div>
          <p className={`text-xs ${themeMutedText} mt-1`}>
            Visually compose rich Telegram broadcasts, photos, media captions, and 2D interactive inline buttons.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (isDirty ? setShowClearModal(true) : handleResetComposer())}
            className={`px-3 py-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 text-stone-300`}
            title="Reset composer fields"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
            Clear
          </button>

          <button
            type="button"
            onClick={handleOpenScheduleModal}
            disabled={!isFormValid || isSubmitting}
            className={`px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm`}
          >
            <Calendar className="w-4 h-4" />
            Schedule...
          </button>

          <button
            type="button"
            onClick={() => setShowSendModal(true)}
            disabled={!isFormValid || isSubmitting}
            className={`px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm`}
          >
            <Send className="w-4 h-4" />
            Send Now
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between gap-3 text-xs transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{notification.title}</p>
              <p className="mt-0.5 opacity-90">{notification.message}</p>
              {notification.details && (
                <p className="font-mono text-[11px] mt-1 text-stone-400">{notification.details}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors text-stone-400 hover:text-stone-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Composer Form (7 cols) */}
        <div className={`lg:col-span-7 ${themeCardBg} border rounded-2xl p-6 space-y-6 shadow-sm`}>
          {/* Section 1: Target Destination */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center justify-between">
              <span>1. Target Destination</span>
              {(lockedDestination?.chatId !== undefined || selectedGroup) && (
                <span className="text-[11px] font-normal text-blue-400 font-mono">
                  Chat ID: {lockedDestination?.chatId ?? selectedGroup?.chatId}
                </span>
              )}
            </label>
            {lockedDestination ? (
              <div className={`w-full px-3 py-2.5 rounded-xl text-xs font-medium border ${themeBorder} ${themeInnerCardBg} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{lockedDestination.type === 'private' ? '👤' : '👥'}</span>
                  <span className="font-semibold text-stone-200">
                    {lockedDestination.title || (lockedDestination.type === 'private' ? `Private Chat (${lockedDestination.chatId})` : `Group (${lockedDestination.chatId})`)}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Locked Destination
                </span>
              </div>
            ) : (
              <select
                value={targetChatId}
                onChange={e => setTargetChatId(e.target.value)}
                className={`w-full px-3 py-2.5 rounded-xl text-xs font-medium border ${themeInputBg} outline-none`}
              >
                <option value="" disabled>
                  -- Select Target Group --
                </option>
                {activeGroups.map(g => (
                  <option key={g.chatId} value={g.chatId}>
                    👥 {g.chatTitle || g.title || `Group ${g.chatId}`} ({g.chatId})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Section 2: Content Type */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
              2. Content Type
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { type: 'text' as const, label: 'Text', icon: Type },
                { type: 'photo' as const, label: 'Photo', icon: Image },
                { type: 'video' as const, label: 'Video', icon: Video },
                { type: 'animation' as const, label: 'GIF', icon: Film },
                { type: 'document' as const, label: 'Document', icon: FileText }
              ].map(item => {
                const Icon = item.icon;
                const isSelected = contentType === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setContentType(item.type)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm'
                        : `${themeInnerCardBg} ${themeBorder} ${themeMutedText} hover:text-stone-200 hover:border-stone-700`
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Media Input (if not text) */}
          {contentType !== 'text' && (
            <div className="space-y-4 p-4 rounded-xl border border-stone-800 bg-stone-950/40">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-blue-400" />
                  <span>3. Media ({contentType.toUpperCase()})</span>
                </label>
                <span className="text-[10px] text-stone-400">
                  {contentType === 'photo' && 'Max 10 MB (JPEG, PNG, WEBP)'}
                  {contentType === 'video' && 'Max 50 MB (MP4, MOV, MKV)'}
                  {contentType === 'animation' && 'Max 15 MB (GIF, MP4)'}
                  {contentType === 'document' && 'Max 50 MB (All safe documents)'}
                </span>
              </div>

              {/* Local File Upload Box */}
              <div className={`p-3.5 rounded-xl border ${uploadedMediaId ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-stone-800 bg-stone-900/40'} space-y-2.5`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-blue-400" />
                    Upload from Computer:
                  </span>
                  {uploadedMediaId && (
                    <button
                      type="button"
                      onClick={handleClearUploadedFile}
                      className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove File
                    </button>
                  )}
                </div>

                {uploadStatus === 'idle' && !uploadedMediaId && (
                  <div>
                    <input
                      type="file"
                      id="local-media-file-input"
                      accept={
                        contentType === 'photo'
                          ? 'image/jpeg,image/png,image/webp,image/*'
                          : contentType === 'video'
                          ? 'video/mp4,video/quicktime,video/x-matroska,video/*'
                          : contentType === 'animation'
                          ? 'image/gif,video/mp4'
                          : '*/*'
                      }
                      onChange={handleLocalFileSelect}
                      className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer text-stone-400"
                    />
                  </div>
                )}

                {uploadStatus === 'uploading' && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>Uploading file to Roxie media store...</span>
                  </div>
                )}

                {uploadStatus === 'uploaded' && uploadedMediaId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="font-semibold truncate">{uploadedFileName || 'Uploaded File'}</span>
                        {uploadedFileSize && (
                          <span className="text-[11px] opacity-80 shrink-0 font-mono">
                            ({(uploadedFileSize / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                        Ready for Send Now
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-400 px-1">
                      ⚡ Local media is delivered immediately via <strong>Send Now</strong>. To schedule a post for later, use a Telegram file_id or public HTTPS URL.
                    </p>
                  </div>
                )}

                {uploadStatus === 'error' && (
                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p>{uploadError || 'Upload failed. Please try a different file.'}</p>
                    </div>
                    <div className="pt-1">
                      <input
                        type="file"
                        accept={
                          contentType === 'photo'
                            ? 'image/*'
                            : contentType === 'video'
                            ? 'video/*'
                            : contentType === 'animation'
                            ? 'image/gif,video/mp4'
                            : '*/*'
                        }
                        onChange={handleLocalFileSelect}
                        className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-stone-800 file:text-stone-300 hover:file:bg-stone-700 cursor-pointer text-stone-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Manual URL or file_id alternative */}
              {!uploadedMediaId && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span>Or enter Telegram file_id / Public HTTPS URL:</span>
                  </div>
                  <input
                    type="text"
                    value={mediaFileId}
                    onChange={e => {
                      setMediaFileId(e.target.value);
                      if (isValidHttpUrl(e.target.value)) {
                        setMediaPreviewUrl(e.target.value);
                      }
                    }}
                    placeholder={`Paste Telegram ${contentType} file_id or https://... address`}
                    className={`w-full px-3 py-2 rounded-xl text-xs border ${themeInputBg} outline-none font-mono`}
                  />
                </div>
              )}
            </div>
          )}

          {/* Section 4: Text / Caption */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                {contentType === 'text' ? '3. Message Text (HTML Supported)' : '4. Caption (Optional)'}
              </label>
              <span
                className={`text-[11px] font-mono ${
                  isOverCharLimit ? 'text-red-400 font-bold' : themeMutedText
                }`}
              >
                {text.length} / {maxChars} chars
              </span>
            </div>

            <textarea
              rows={contentType === 'text' ? 6 : 4}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={
                contentType === 'text'
                  ? 'Write your message here... Supports HTML formatting (<b>bold</b>, <i>italic</i>, <code>code</code>, etc.)'
                  : 'Add an optional caption for your media post...'
              }
              className={`w-full p-3 rounded-xl text-xs border ${themeInputBg} outline-none resize-y font-sans`}
            />

            {/* Delivery Options */}
            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-stone-300 select-none">
                <input
                  type="checkbox"
                  checked={pinAfterSend}
                  onChange={e => setPinAfterSend(e.target.checked)}
                  className="rounded bg-stone-950 border-stone-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <Pin className="w-3.5 h-3.5 text-amber-400" />
                <span>Pin after send</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-stone-300 select-none">
                <input
                  type="checkbox"
                  checked={replyToLatest}
                  onChange={e => setReplyToLatest(e.target.checked)}
                  className="rounded bg-stone-950 border-stone-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <Reply className="w-3.5 h-3.5 text-blue-400" />
                <span>Reply to latest message</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-stone-300 select-none">
                <input
                  type="checkbox"
                  checked={protectContent}
                  onChange={e => setProtectContent(e.target.checked)}
                  className="rounded bg-stone-950 border-stone-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Protect content (Forwarding restriction)</span>
              </label>
            </div>
          </div>

          {/* Section 5: Interactive Inline Button Grid Builder */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <span>{contentType === 'text' ? '4. Inline URL Buttons' : '5. Inline URL Buttons'}</span>
                <span className="text-[10px] font-normal text-stone-400">
                  ({buttonGrid.reduce((sum, r) => sum + r.length, 0)} total)
                </span>
              </label>

              <div className="flex items-center gap-2">
                {buttonGrid.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllButtons}
                    className="text-[11px] text-red-400 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear Buttons
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddNewRow}
                  className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors border border-stone-700"
                >
                  <Plus className="w-3 h-3" />
                  New Row
                </button>
              </div>
            </div>

            {buttonGrid.length === 0 ? (
              <div className={`p-4 rounded-xl border ${themeBorder} ${themeInnerCardBg} text-center space-y-2`}>
                <p className="text-xs text-stone-400">No inline URL buttons attached yet.</p>
                <button
                  type="button"
                  onClick={handleAddNewRow}
                  className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add First Button Row
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {buttonGrid.map((row, rIdx) => (
                  <div
                    key={`row_${rIdx}`}
                    className={`p-3 rounded-xl border ${themeBorder} ${themeInnerCardBg} space-y-2`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-stone-400 border-b border-stone-800 pb-1.5">
                      <span className="font-semibold">Row {rIdx + 1} ({row.length} button{row.length > 1 ? 's' : ''})</span>
                      <button
                        type="button"
                        onClick={() => handleAddButton(rIdx)}
                        className="text-blue-400 hover:underline font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Button to Row
                      </button>
                    </div>

                    <div className="space-y-2">
                      {row.map((btn, bIdx) => {
                        const isUrlValid = isValidHttpUrl(btn.url);
                        return (
                          <div
                            key={btn.id}
                            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-stone-950/60 p-2 rounded-lg border border-stone-800/80"
                          >
                            <input
                              type="text"
                              value={btn.text}
                              onChange={e => handleUpdateButton(rIdx, bIdx, 'text', e.target.value)}
                              placeholder="Button Text"
                              maxLength={64}
                              className={`sm:w-1/3 px-2.5 py-1.5 rounded-lg text-xs border ${themeInputBg} outline-none`}
                            />

                            <div className="flex-1 relative flex items-center">
                              <input
                                type="url"
                                value={btn.url}
                                onChange={e => handleUpdateButton(rIdx, bIdx, 'url', e.target.value)}
                                placeholder="https://example.com"
                                className={`w-full px-2.5 py-1.5 rounded-lg text-xs border ${themeInputBg} outline-none pr-7 font-mono`}
                              />
                              {isUrlValid ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400 absolute right-2" />
                              ) : (
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 absolute right-2" />
                              )}
                            </div>

                            <select
                              value={btn.style || ''}
                              onChange={e => handleUpdateButton(rIdx, bIdx, 'style', e.target.value)}
                              className={`sm:w-28 px-2 py-1.5 rounded-lg text-xs border ${themeInputBg} outline-none font-medium`}
                              title="Telegram Button Style"
                            >
                              <option value="">Default</option>
                              <option value="primary">Primary 🔵</option>
                              <option value="success">Success 🟢</option>
                              <option value="danger">Danger 🔴</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => handleRemoveButton(rIdx, bIdx)}
                              className="p-1.5 hover:bg-red-500/20 text-stone-400 hover:text-red-400 rounded-lg transition-colors shrink-0"
                              title="Delete button"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Validation Warnings if any */}
          {validationErrors.length > 0 && isDirty && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Please address the following before sending:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90 pl-1">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Live Telegram Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
              <span>Live Telegram Preview</span>
            </h3>
            <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
              <span className="hidden sm:inline">Theme:</span>
              <select
                value={previewTheme}
                onChange={e => setPreviewTheme(e.target.value as any)}
                className="bg-stone-900 border border-stone-700 text-stone-300 rounded px-1.5 py-0.5 text-[10px] outline-none"
                title="UI Preview Only: Simulate how buttons & posts look in different Telegram client themes."
              >
                <option value="default">Default Slate</option>
                <option value="dark">Dark Obsidian</option>
                <option value="light">Classic Light</option>
                <option value="midnight">Midnight Navy</option>
                <option value="emerald">Forest Emerald</option>
              </select>
            </div>
          </div>

          {/* Telegram Phone / Chat Bubble Container */}
          <div
            className={`rounded-2xl border ${themeBorder} overflow-hidden shadow-lg ${
              previewTheme === 'light'
                ? 'bg-[#e2e8f0]'
                : previewTheme === 'dark'
                ? 'bg-[#09090b]'
                : previewTheme === 'midnight'
                ? 'bg-[#030712]'
                : previewTheme === 'emerald'
                ? 'bg-[#022c22]'
                : isDark
                ? 'bg-[#0f172a]'
                : 'bg-[#e2e8f0]'
            }`}
          >
            {/* Telegram Header */}
            <div className="px-4 py-3 bg-[#1e293b] border-b border-stone-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center font-bold text-xs">
                  R
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">
                    {selectedGroup?.chatTitle || selectedGroup?.title || 'Selected Chat'}
                  </p>
                  <p className="text-[10px] text-stone-400 font-mono">
                    @{botUsername}
                  </p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold">
                {contentType.toUpperCase()}
              </span>
            </div>

            {/* Bubble Canvas */}
            <div className="p-4 space-y-3">
              <div
                className={`max-w-[92%] rounded-2xl p-3.5 space-y-2.5 shadow-md ${
                  previewTheme === 'light'
                    ? 'bg-white text-stone-900 border border-stone-200'
                    : previewTheme === 'dark'
                    ? 'bg-[#18181b] text-stone-100 border border-stone-800'
                    : previewTheme === 'midnight'
                    ? 'bg-[#111827] text-stone-100 border border-stone-800'
                    : previewTheme === 'emerald'
                    ? 'bg-[#064e3b] text-emerald-50 border border-emerald-800'
                    : isDark
                    ? 'bg-[#1e293b] text-stone-100'
                    : 'bg-white text-stone-900'
                }`}
              >
                {/* Reply Indicator if enabled */}
                {replyToLatest && (
                  <div className="border-l-2 border-blue-500 pl-2 py-0.5 text-[10px] text-stone-400 bg-blue-500/5 rounded-r">
                    <p className="font-semibold text-blue-400">Replying to latest message</p>
                    <p className="truncate">Sample context...</p>
                  </div>
                )}

                {/* Media Preview if attached */}
                {contentType !== 'text' && (
                  <div className="rounded-xl overflow-hidden bg-black/40 border border-stone-700/50 flex items-center justify-center min-h-[140px] max-h-[260px] relative">
                    {mediaPreviewUrl ? (
                      contentType === 'photo' || contentType === 'animation' ? (
                        <img
                          src={mediaPreviewUrl}
                          alt="Media preview"
                          className="w-full h-full object-cover max-h-[260px]"
                        />
                      ) : (
                        <video
                          src={mediaPreviewUrl}
                          controls
                          className="w-full max-h-[260px]"
                        />
                      )
                    ) : (
                      <div className="text-center p-4 space-y-1 text-stone-400">
                        {contentType === 'photo' && <Image className="w-8 h-8 mx-auto text-stone-500" />}
                        {contentType === 'video' && <Video className="w-8 h-8 mx-auto text-stone-500" />}
                        {contentType === 'animation' && <Film className="w-8 h-8 mx-auto text-stone-500" />}
                        {contentType === 'document' && <FileText className="w-8 h-8 mx-auto text-stone-500" />}
                        <p className="text-xs font-semibold capitalize">{contentType} Post</p>
                        <p className="text-[10px] text-stone-500 font-mono truncate max-w-[200px]">
                          {mediaFileId || 'No media specified'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Text / Caption Content */}
                {text.trim() ? (
                  <div
                    className="text-xs leading-relaxed whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }}
                  />
                ) : (
                  <p className="text-xs italic text-stone-500">
                    {contentType === 'text' ? '(Empty message content)' : '(No caption provided)'}
                  </p>
                )}

                {/* Timestamp & Pin Badge */}
                <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] text-stone-400">
                  {pinAfterSend && (
                    <span className="flex items-center gap-0.5 text-amber-400">
                      <Pin className="w-3 h-3" /> Pinned
                    </span>
                  )}
                  <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              {/* Inline Buttons Grid Preview */}
              {buttonGrid.length > 0 && (
                <div className="space-y-1.5 max-w-[92%]">
                  {buttonGrid.map((row, rIdx) => (
                    <div key={`prev_row_${rIdx}`} className="flex items-center gap-1.5">
                      {row.map(btn => {
                        let styleClass = isDark
                          ? 'bg-[#27354a] text-blue-300 border border-blue-500/20'
                          : 'bg-white text-blue-600 border border-blue-200';
                        if (btn.style === 'primary') {
                          styleClass = isDark
                            ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                            : 'bg-blue-100 text-blue-800 border border-blue-300';
                        } else if (btn.style === 'success') {
                          styleClass = isDark
                            ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300';
                        } else if (btn.style === 'danger') {
                          styleClass = isDark
                            ? 'bg-red-600/30 text-red-300 border border-red-500/50'
                            : 'bg-red-100 text-red-800 border border-red-300';
                        }

                        return (
                          <a
                            key={btn.id}
                            href={isValidHttpUrl(btn.url) ? btn.url : undefined}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => {
                              if (!isValidHttpUrl(btn.url)) e.preventDefault();
                            }}
                            className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium text-center truncate flex items-center justify-center gap-1.5 shadow-sm transition-opacity hover:opacity-90 ${styleClass}`}
                          >
                            <span className="truncate">{btn.text || 'Untitled Button'}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                          </a>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Telegram Theme & Styling Disclaimer */}
          <div className="p-3 rounded-xl bg-stone-900/60 border border-stone-800 text-[11px] text-stone-400 flex items-start gap-2">
            <Shield className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
            <p>
              <strong className="text-stone-300">Telegram Bot API Button Styles:</strong> Buttons support official Telegram styles (Primary, Success, Danger). Per-message bubble/background colors are not provided by the Telegram Bot API and are rendered per client theme.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL 1: Send Now Confirmation */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`${themeCardBg} border rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl`}>
            <div>
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-400" />
                Confirm Immediate Delivery
              </h3>
              <p className={`text-xs ${themeMutedText} mt-1`}>
                This post will be transmitted directly to Telegram via Roxie's PostSender engine.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${themeBorder} ${themeInnerCardBg} text-xs space-y-2 font-mono`}>
              <div className="flex justify-between">
                <span className="text-stone-400">Target Chat:</span>
                <span className="text-stone-200 font-bold truncate max-w-[200px]">
                  {selectedGroup?.chatTitle || targetChatId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Content Type:</span>
                <span className="text-blue-400 uppercase font-bold">{contentType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Buttons:</span>
                <span className="text-stone-200">
                  {buttonGrid.reduce((sum, r) => sum + r.length, 0)} in {buttonGrid.length} row(s)
                </span>
              </div>
              {pinAfterSend && (
                <div className="flex justify-between text-amber-400">
                  <span>Pin Post:</span>
                  <span>Yes</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSendModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSendNow}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Confirm Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Schedule Post Dialog */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`${themeCardBg} border rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl`}>
            <div>
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-400" />
                Schedule Post
              </h3>
              <p className={`text-xs ${themeMutedText} mt-1`}>
                Set the delivery date and time for automatic dispatch via Roxie's scheduler.
              </p>
            </div>

            {/* Date & Time Pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-300">Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border ${themeInputBg} outline-none`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-stone-300">Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border ${themeInputBg} outline-none`}
                />
              </div>
            </div>

            {/* Time Interpretation Card */}
            {computedScheduleTime && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                  computedScheduleTime.isFuture
                    ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}
              >
                <p className="font-bold flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  Scheduled For: {computedScheduleTime.formatted}
                </p>
                <p className="text-[11px] font-mono opacity-80">
                  Canonical UTC: {computedScheduleTime.isoString}
                </p>
                {!computedScheduleTime.isFuture && (
                  <p className="font-bold text-red-400 text-[11px] pt-1">
                    ⚠️ Selected time is in the past. Please choose a future time.
                  </p>
                )}
              </div>
            )}

            {/* Local Media Warning in Schedule Modal */}
            {isLocalMediaActive && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Local Media Cannot Be Scheduled</p>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    Local media cannot be scheduled on the current hosting setup. Use a Telegram file_id or public HTTPS media URL for scheduled posts.
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSchedule}
                disabled={!computedScheduleTime || !computedScheduleTime.isFuture || isSubmitting || isLocalMediaActive}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Clear Confirmation */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`${themeCardBg} border rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl`}>
            <div>
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                Reset Composer?
              </h3>
              <p className={`text-xs ${themeMutedText} mt-1`}>
                Are you sure you want to clear your draft text, media reference, and button grid?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleResetComposer}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
