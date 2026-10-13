import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Send,
  Calendar,
  Sparkles,
  Image as ImageIcon,
  Video,
  Film,
  FileText,
  Music,
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
  Radio,
  Eye,
  Link2,
  Upload,
  Paperclip
} from 'lucide-react';

export type ComposerContentType = 'text' | 'photo' | 'video' | 'animation' | 'document';

export type PostButtonStyle = 'primary' | 'success' | 'danger';

export interface ComposerButton {
  id: string;
  text: string;
  url: string;
  style?: PostButtonStyle;
}

export type MediaAttachmentType = 'image' | 'video' | 'gif' | 'audio' | 'document';

export interface MediaLinkItem {
  id: string;
  type: MediaAttachmentType;
  url: string;
}

export interface UploadedMediaItemState {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  contentType: ComposerContentType;
  localPreviewUrl: string;
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

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('roxie_session_id') : null;
  const headers: Record<string, string> = { ...extraHeaders };
  if (token) {
    headers['x-session-id'] = token;
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export function isValidHttpUrl(url: string): boolean {
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

export function updateComposerButton(
  grid: ComposerButton[][],
  rowIndex: number,
  btnIndex: number,
  field: 'text' | 'url' | 'style',
  val: any
): ComposerButton[][] {
  const next = grid.map(r => [...r]);
  if (next[rowIndex] && next[rowIndex][btnIndex]) {
    next[rowIndex][btnIndex] = {
      ...next[rowIndex][btnIndex],
      [field]: field === 'style' ? (val || undefined) : (typeof val === 'string' ? val : (val ?? ''))
    };
  }
  return next;
}

export function validateButtonGrid(buttonGrid: ComposerButton[][]): string[] {
  const errors: string[] = [];
  buttonGrid.forEach((row, rIdx) => {
    row.forEach((btn, bIdx) => {
      const btnText = (btn.text || '').trim();
      const btnUrl = (btn.url || '').trim();
      if (!btnText) {
        errors.push(`Row ${rIdx + 1}, Button ${bIdx + 1}: Button text cannot be empty.`);
      }
      if (!isValidHttpUrl(btnUrl)) {
        errors.push(`Row ${rIdx + 1}, Button ${bIdx + 1} (${btnText || 'Untitled'}): Invalid URL. Must start with http:// or https://`);
      }
    });
  });
  return errors;
}

export function formatComposerButtons(buttonGrid: ComposerButton[][]): Array<Array<{ text: string; url: string; style?: PostButtonStyle }>> {
  return buttonGrid
    .map(row =>
      row
        .filter(b => (b.text || '').trim() && isValidHttpUrl((b.url || '').trim()))
        .map(b => {
          const btnObj: { text: string; url: string; style?: PostButtonStyle } = {
            text: (b.text || '').trim(),
            url: (() => {
              try {
                return new URL((b.url || '').trim()).href;
              } catch {
                return (b.url || '').trim();
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
}

export function validateMediaReference(ref?: string): { valid: boolean; error?: string } {
  if (!ref || typeof ref !== 'string') {
    return { valid: false, error: 'Media URL is required.' };
  }
  const trimmed = ref.trim();
  if (!trimmed) {
    return { valid: false, error: 'Media URL cannot be empty.' };
  }
  if (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('local_preview_')
  ) {
    return {
      valid: false,
      error: 'Local browser file URLs cannot be delivered directly. Please upload via Upload File or provide a public HTTP/HTTPS URL.'
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
      error: 'Invalid media link or Telegram file_id format.'
    };
  }
  return { valid: true };
}

// Safe Image Preview Component with fallback on load error or CORS restriction
const SafeImagePreview: React.FC<{ url: string; alt?: string; className?: string }> = ({ url, alt = 'Media preview', className }) => {
  const [loadError, setLoadError] = useState<boolean>(false);

  useEffect(() => {
    setLoadError(false);
  }, [url]);

  if (loadError) {
    return (
      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
        <span className="text-[11px] leading-tight">
          Image preview unavailable or restricted by remote server headers. Telegram will download directly from this link upon broadcast.
        </span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onError={() => setLoadError(true)}
      className={className || "max-h-48 max-w-full rounded-lg object-contain bg-black/30 border border-stone-800"}
      loading="lazy"
    />
  );
};

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

  // Filter Active Groups
  const activeGroups = useMemo(() => {
    return groups.filter(g => !g.botLeft && !g.unavailable);
  }, [groups]);

  // Destination State
  const initialChatId = lockedDestination?.chatId !== undefined
    ? lockedDestination.chatId
    : (selectedChatId && selectedChatId !== 'all' ? selectedChatId : (activeGroups[0]?.chatId || 'all'));
  const [targetChatId, setTargetChatId] = useState<number | string>(initialChatId);

  // Sync targetChatId when props change
  useEffect(() => {
    if (lockedDestination?.chatId !== undefined) {
      setTargetChatId(lockedDestination.chatId);
    } else if (selectedChatId && selectedChatId !== 'all') {
      setTargetChatId(selectedChatId);
    }
  }, [lockedDestination?.chatId, selectedChatId]);

  // Selected Group resolution
  const selectedGroup = useMemo(() => {
    if (targetChatId === 'all') return null;
    return groups.find(g => String(g.chatId) === String(targetChatId));
  }, [groups, targetChatId]);

  // Post Content State
  const [text, setText] = useState<string>('');

  // Media Attachment Mode: 'url' | 'upload'
  const [mediaAttachmentTab, setMediaAttachmentTab] = useState<'url' | 'upload'>('url');

  // URL-based Media Links State
  const [mediaLinks, setMediaLinks] = useState<MediaLinkItem[]>([]);
  const [activeMediaInputType, setActiveMediaInputType] = useState<MediaAttachmentType | null>(null);
  const [newMediaUrl, setNewMediaUrl] = useState<string>('');
  const [newMediaUrlError, setNewMediaUrlError] = useState<string | null>(null);

  // Local File Upload State
  const [uploadedMedia, setUploadedMedia] = useState<UploadedMediaItemState | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Delivery Options
  const [pinAfterSend, setPinAfterSend] = useState<boolean>(false);
  const [replyToLatest, setReplyToLatest] = useState<boolean>(false);
  const [protectContent, setProtectContent] = useState<boolean>(false);

  // 2D Button Grid State
  const [buttonGrid, setButtonGrid] = useState<ComposerButton[][]>([]);

  // Preview Theme
  const [previewTheme, setPreviewTheme] = useState<'default' | 'dark' | 'light' | 'midnight' | 'emerald'>('default');

  // Modals & Action States
  const [showSendModal, setShowSendModal] = useState<boolean>(false);
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

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

  // Submitting status & notification
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    details?: string;
  } | null>(null);

  // Primary URL media item
  const primaryMedia = mediaLinks[0] || null;

  // Effective Content Type calculation
  const contentType: ComposerContentType = useMemo(() => {
    if (uploadedMedia) {
      return uploadedMedia.contentType;
    }
    if (!primaryMedia) return 'text';
    switch (primaryMedia.type) {
      case 'image':
        return 'photo';
      case 'video':
        return 'video';
      case 'gif':
        return 'animation';
      case 'audio':
        return 'document'; // Audio delivered as document on existing Telegram backend
      case 'document':
        return 'document';
      default:
        return 'text';
    }
  }, [uploadedMedia, primaryMedia]);

  // Character Limit calculation
  const maxChars = contentType === 'text' ? 4096 : 1024;
  const isOverCharLimit = text.length > maxChars;

  // Media link URL add handler
  const handleAddMediaLink = () => {
    if (!activeMediaInputType) return;
    const trimmed = newMediaUrl.trim();
    if (!trimmed) {
      setNewMediaUrlError('Please enter a URL link.');
      return;
    }

    if (!isValidHttpUrl(trimmed)) {
      setNewMediaUrlError('Invalid URL format. Links must begin with http:// or https:// (e.g. https://example.com/media.jpg).');
      return;
    }

    // Auto-detect GIF URL if not already selected
    let effectiveType = activeMediaInputType;
    if (trimmed.toLowerCase().endsWith('.gif') || trimmed.toLowerCase().includes('.gif?')) {
      effectiveType = 'gif';
    }

    const newItem: MediaLinkItem = {
      id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: effectiveType,
      url: trimmed
    };

    setMediaLinks(prev => [...prev, newItem]);
    setNewMediaUrl('');
    setNewMediaUrlError(null);
    setActiveMediaInputType(null);
  };

  const handleRemoveMediaLink = (id: string) => {
    setMediaLinks(prev => prev.filter(item => item.id !== id));
  };

  // Local File Upload Handler
  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isGif = file.type === 'image/gif' || lowerName.endsWith('.gif');
    const isVideo = file.type.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.mkv') || lowerName.endsWith('.webm');
    const isPhoto = file.type.startsWith('image/') && !isGif;

    let targetUploadType: 'photo' | 'video' | 'animation' | 'document' = 'document';
    if (isGif) {
      targetUploadType = 'animation';
    } else if (isPhoto) {
      targetUploadType = 'photo';
    } else if (isVideo) {
      targetUploadType = 'video';
    } else {
      targetUploadType = 'document';
    }

    const localUrl = URL.createObjectURL(file);
    setUploadStatus('uploading');
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/dashboard/posts/upload-media?type=${targetUploadType}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders(),
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload local media file to server.');
      }

      setUploadedMedia({
        id: data.mediaUploadId,
        filename: data.filename || file.name,
        size: data.size || file.size,
        mimeType: data.mimeType || file.type,
        contentType: targetUploadType,
        localPreviewUrl: localUrl
      });
      setUploadStatus('uploaded');
      setUploadError(null);
    } catch (err: any) {
      setUploadStatus('error');
      setUploadError(err.message || 'File upload failed. Please try again.');
    }
  };

  const handleClearUploadedMedia = () => {
    if (uploadedMedia?.localPreviewUrl) {
      try {
        URL.revokeObjectURL(uploadedMedia.localPreviewUrl);
      } catch {}
    }
    setUploadedMedia(null);
    setUploadStatus('idle');
    setUploadError(null);
  };

  // Validation Checks
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!targetChatId) {
      errors.push('Please select a target destination scope.');
    }
    if (contentType === 'text' && !text.trim()) {
      errors.push('Message text is required for text-only posts.');
    }
    if (uploadStatus === 'uploading') {
      errors.push('Local file is currently uploading. Please wait for upload to complete.');
    }
    if (mediaLinks.length > 0 && !uploadedMedia) {
      const mediaVal = validateMediaReference(primaryMedia?.url);
      if (!mediaVal.valid) {
        errors.push(mediaVal.error || 'Please provide a valid media URL.');
      }
    }
    if (isOverCharLimit) {
      errors.push(`Text length exceeds maximum allowed (${text.length}/${maxChars} characters).`);
    }
    const btnErrors = validateButtonGrid(buttonGrid);
    errors.push(...btnErrors);
    return errors;
  }, [targetChatId, contentType, text, uploadStatus, mediaLinks, uploadedMedia, primaryMedia, isOverCharLimit, maxChars, buttonGrid]);

  const isFormValid = validationErrors.length === 0;

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
    setButtonGrid(prev => updateComposerButton(prev, rowIndex, btnIndex, field, val));
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

  // Reset Composer
  const handleResetComposer = () => {
    setText('');
    setMediaLinks([]);
    handleClearUploadedMedia();
    setActiveMediaInputType(null);
    setNewMediaUrl('');
    setNewMediaUrlError(null);
    setButtonGrid([]);
    setPinAfterSend(false);
    setReplyToLatest(false);
    setProtectContent(false);
    setShowClearModal(false);
    setNotification(null);
  };

  const isDirty = Boolean(text.trim() || mediaLinks.length > 0 || uploadedMedia || buttonGrid.length > 0);

  // Build Post Payload for Existing Backend
  const buildPostPayload = useCallback(() => {
    const formattedButtons = formatComposerButtons(buttonGrid);

    // If local file uploaded, use mediaUploadId
    if (uploadedMedia) {
      return {
        contentType: uploadedMedia.contentType,
        text: text.trim() || undefined,
        mediaUploadId: uploadedMedia.id,
        mediaFileId: `upload:${uploadedMedia.id}`,
        buttons: formattedButtons.length > 0 ? formattedButtons : undefined,
        pinAfterSend,
        replyToLatest,
        protectContent
      };
    }

    const mediaUrl = primaryMedia?.url?.trim() || undefined;

    return {
      contentType,
      text: text.trim() || undefined,
      mediaFileId: contentType !== 'text' ? mediaUrl : undefined,
      buttons: formattedButtons.length > 0 ? formattedButtons : undefined,
      pinAfterSend,
      replyToLatest,
      protectContent
    };
  }, [uploadedMedia, contentType, text, primaryMedia, buttonGrid, pinAfterSend, replyToLatest, protectContent]);

  // Send Broadcast Action
  const handleConfirmSendBroadcast = async () => {
    if (!isFormValid || isSubmitting) return;
    setIsSubmitting(true);
    setNotification(null);

    try {
      const payload = buildPostPayload();

      // Case A: Broadcast across all active groups
      if (targetChatId === 'all') {
        const targetGroups = activeGroups;
        if (targetGroups.length === 0) {
          throw new Error('No active connected groups available for broadcast.');
        }

        // If text-only post, use existing multi-group /api/dashboard/broadcast
        if (contentType === 'text') {
          const broadcastId = `bcast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const res = await fetch('/api/dashboard/broadcast', {
            method: 'POST',
            credentials: 'same-origin',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              broadcastId,
              groupIds: targetGroups.map(g => g.chatId),
              message: text.trim()
            })
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || 'Multi-group broadcast request failed.');
          }

          setShowSendModal(false);
          setNotification({
            type: 'success',
            title: 'Broadcast Complete!',
            message: `Delivered text broadcast to ${data.sent || targetGroups.length} of ${data.total || targetGroups.length} connected groups.`,
            details: data.failed > 0 ? `${data.failed} group(s) encountered delivery errors.` : undefined
          });
        } else {
          // If rich media post, sequentially dispatch to each active group using existing /api/dashboard/posts/send
          let successCount = 0;
          let failCount = 0;

          for (const g of targetGroups) {
            try {
              const res = await fetch('/api/dashboard/posts/send', {
                method: 'POST',
                credentials: 'same-origin',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                  chatId: g.chatId,
                  payload
                })
              });
              const data = await res.json();
              if (res.ok && data.success) {
                successCount++;
              } else {
                failCount++;
              }
            } catch {
              failCount++;
            }
          }

          setShowSendModal(false);
          setNotification({
            type: successCount > 0 ? 'success' : 'error',
            title: successCount > 0 ? 'Media Broadcast Complete!' : 'Broadcast Failed',
            message: `Delivered ${contentType.toUpperCase()} broadcast to ${successCount} group(s).${failCount > 0 ? ` (${failCount} failed)` : ''}`
          });
        }
      } else {
        // Case B: Single Group or Private Chat destination
        const res = await fetch('/api/dashboard/posts/send', {
          method: 'POST',
          credentials: 'same-origin',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            chatId: Number(targetChatId),
            payload
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to dispatch broadcast post to Telegram.');
        }

        setShowSendModal(false);
        const targetLabel = lockedDestination?.title || selectedGroup?.chatTitle || `Chat ${targetChatId}`;
        setNotification({
          type: 'success',
          title: 'Broadcast Sent Successfully!',
          message: `Your ${contentType.toUpperCase()} post was delivered to ${targetLabel}.`,
          details: data.result?.messageId ? `Telegram Message ID: #${data.result.messageId}` : undefined
        });
      }

      if (onRefresh) onRefresh();
    } catch (err: any) {
      setNotification({
        type: 'error',
        title: 'Broadcast Delivery Failed',
        message: err.message || 'An error occurred while communicating with Telegram.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Schedule Broadcast Action
  const handleConfirmSchedule = async () => {
    if (!isFormValid || !computedScheduleTime || !computedScheduleTime.isFuture || isSubmitting) return;

    if (uploadedMedia) {
      setNotification({
        type: 'error',
        title: 'Local Media Cannot Be Scheduled',
        message: 'Local media uploads are stored in transient server memory and can only be transmitted immediately via Send Broadcast. To schedule a broadcast for later, please use a direct HTTPS URL.'
      });
      return;
    }

    setIsSubmitting(true);
    setNotification(null);

    try {
      const payload = buildPostPayload();
      const sendTargetChatId = targetChatId === 'all' ? (activeGroups[0]?.chatId || 0) : Number(targetChatId);

      const res = await fetch('/api/dashboard/posts/schedule', {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          chatId: sendTargetChatId,
          payload,
          nextRun: computedScheduleTime.isoString,
          name: `Broadcast: ${text.slice(0, 30) || contentType.toUpperCase()}`
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to schedule post.');
      }

      setShowScheduleModal(false);
      setNotification({
        type: 'success',
        title: 'Post Scheduled Successfully!',
        message: `Your post is queued for automatic transmission on ${computedScheduleTime.formatted}.`
      });

      if (onRefresh) onRefresh();
    } catch (err: any) {
      setNotification({
        type: 'error',
        title: 'Scheduling Failed',
        message: err.message || 'An error occurred while registering scheduled post.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold flex items-center gap-2 text-stone-100">
              <Radio className="w-5 h-5 text-blue-500" />
              Broadcast Post Composer
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Unified Composer
            </span>
          </div>
          <p className={`text-xs ${themeMutedText} mt-1`}>
            Compose and broadcast text announcements, photos, videos, animations, audio, and documents across Telegram groups.
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
            onClick={() => setShowScheduleModal(true)}
            disabled={!isFormValid || isSubmitting}
            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <Calendar className="w-4 h-4" />
            Schedule...
          </button>

          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="lg:hidden px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border border-stone-700"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>

          <button
            type="button"
            onClick={() => setShowSendModal(true)}
            disabled={!isFormValid || isSubmitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 shadow-sm"
          >
            <Send className="w-4 h-4" />
            Send Broadcast
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
            type="button"
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
          
          {/* Section 1: Broadcast Destination Scope */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center justify-between">
              <span>1. Broadcast Destination</span>
              {targetChatId !== 'all' && (
                <span className="text-[11px] font-normal text-blue-400 font-mono">
                  Target ID: {lockedDestination?.chatId ?? selectedGroup?.chatId ?? targetChatId}
                </span>
              )}
            </label>

            {lockedDestination ? (
              <div className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium border ${themeBorder} ${themeInnerCardBg} flex items-center justify-between`}>
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
                onChange={e => setTargetChatId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium border ${themeInputBg} outline-none`}
              >
                <option value="all">
                  📢 [ All Connected Groups ] ({activeGroups.length} active)
                </option>
                {activeGroups.map(g => (
                  <option key={g.chatId} value={g.chatId}>
                    👥 {g.chatTitle || g.title || `Group ${g.chatId}`} ({g.chatId})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Section 2: Post Content / Caption */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300">
                {!uploadedMedia && mediaLinks.length === 0 ? '2. Message Text (HTML Supported)' : '2. Caption (Optional)'}
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
              rows={!uploadedMedia && mediaLinks.length === 0 ? 5 : 3}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={
                !uploadedMedia && mediaLinks.length === 0
                  ? 'Enter broadcast message here... Supports HTML formatting (<b>bold</b>, <i>italic</i>, <code>code</code>, etc.)'
                  : 'Add an optional caption for your media broadcast post...'
              }
              className={`w-full p-3.5 rounded-xl text-xs border ${themeInputBg} outline-none resize-y font-sans`}
            />
          </div>

          {/* Section 3: Media Attachments (URL Links & Local File Upload) */}
          <div className="space-y-3.5 p-4 rounded-xl border border-stone-800 bg-stone-950/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                <span>3. Media Attachments</span>
              </label>

              {/* Input Mode Selector: By URL vs Upload File */}
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-stone-900 border border-stone-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setMediaAttachmentTab('url')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 ${
                    mediaAttachmentTab === 'url'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Link2 className="w-3 h-3" />
                  Media URL
                </button>
                <button
                  type="button"
                  onClick={() => setMediaAttachmentTab('upload')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 ${
                    mediaAttachmentTab === 'upload'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <Upload className="w-3 h-3" />
                  Upload File
                </button>
              </div>
            </div>

            {/* TAB 1: Media URLs */}
            {mediaAttachmentTab === 'url' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                <div className="text-[11px] text-stone-400 flex items-center justify-between">
                  <span>Add direct media links for Telegram delivery:</span>
                  <span className="text-[10px] text-stone-500">HTTP / HTTPS URLs</span>
                </div>

                {/* Media Type Selector Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { type: 'image' as const, label: 'Image', icon: ImageIcon },
                    { type: 'video' as const, label: 'Video', icon: Video },
                    { type: 'gif' as const, label: 'GIF', icon: Film },
                    { type: 'audio' as const, label: 'Audio', icon: Music },
                    { type: 'document' as const, label: 'Document', icon: FileText }
                  ].map(item => {
                    const Icon = item.icon;
                    const isCurrentActive = activeMediaInputType === item.type;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          if (activeMediaInputType === item.type) {
                            setActiveMediaInputType(null);
                            setNewMediaUrlError(null);
                          } else {
                            setActiveMediaInputType(item.type);
                            setNewMediaUrl('');
                            setNewMediaUrlError(null);
                          }
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                          isCurrentActive
                            ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm'
                            : `${themeInnerCardBg} ${themeBorder} ${themeMutedText} hover:text-stone-200 hover:border-stone-700`
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>+ {item.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Revealed URL Input for Selected Media Type */}
                {activeMediaInputType && (
                  <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-semibold text-stone-200">
                      <span className="flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-blue-400" />
                        Enter {activeMediaInputType.toUpperCase()} URL:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMediaInputType(null);
                          setNewMediaUrl('');
                          setNewMediaUrlError(null);
                        }}
                        className="text-[11px] text-stone-400 hover:text-stone-200"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="url"
                          value={newMediaUrl}
                          onChange={e => {
                            setNewMediaUrl(e.target.value);
                            if (newMediaUrlError) setNewMediaUrlError(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddMediaLink();
                            }
                          }}
                          placeholder={
                            activeMediaInputType === 'image'
                              ? 'https://example.com/image.jpg'
                              : activeMediaInputType === 'video'
                              ? 'https://example.com/video.mp4'
                              : activeMediaInputType === 'gif'
                              ? 'https://example.com/animation.gif'
                              : activeMediaInputType === 'audio'
                              ? 'https://example.com/audio.mp3'
                              : 'https://example.com/document.pdf'
                          }
                          className={`w-full px-3 py-2 rounded-xl text-xs border ${themeInputBg} outline-none font-mono`}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleAddMediaLink}
                        disabled={!newMediaUrl.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Link
                      </button>
                    </div>

                    {newMediaUrlError && (
                      <p className="text-[11px] text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {newMediaUrlError}
                      </p>
                    )}

                    <p className="text-[10px] text-stone-400">
                      {activeMediaInputType === 'audio'
                        ? '🎵 Note: Audio URLs are dispatched via Telegram document delivery by existing bot backend.'
                        : 'Provide a direct public HTTP or HTTPS media link accessible to Telegram servers.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Local File Upload */}
            {mediaAttachmentTab === 'upload' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                <div className={`p-4 rounded-xl border ${uploadedMedia ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-stone-800 bg-stone-900/40'} space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-blue-400" />
                      Select Local File:
                    </span>
                    <span className="text-[10px] text-stone-400">
                      Photo (10MB) • GIF (15MB) • Video/Doc (50MB)
                    </span>
                  </div>

                  {!uploadedMedia && uploadStatus !== 'uploading' && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        id="broadcast-local-file-input"
                        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/x-matroska,audio/mpeg,audio/wav,audio/ogg,application/pdf,application/zip,text/plain,*/*"
                        onChange={handleLocalFileSelect}
                        className="text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer text-stone-400"
                      />
                      <p className="text-[11px] text-stone-400">
                        ⚡ Local media uploaded to Roxie is delivered directly to Telegram via immediate broadcast.
                      </p>
                    </div>
                  )}

                  {uploadStatus === 'uploading' && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>Uploading file to Roxie media store...</span>
                    </div>
                  )}

                  {uploadedMedia && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="font-semibold truncate">{uploadedMedia.filename}</span>
                          <span className="text-[11px] opacity-80 shrink-0 font-mono">
                            ({(uploadedMedia.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Ready ({uploadedMedia.contentType.toUpperCase()})
                          </span>
                          <button
                            type="button"
                            onClick={handleClearUploadedMedia}
                            className="text-red-400 hover:text-red-300 p-1"
                            title="Remove uploaded file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-stone-400">
                        File stored in Roxie server memory. Will be transmitted with your broadcast.
                      </p>
                    </div>
                  )}

                  {uploadStatus === 'error' && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <p>{uploadError || 'File upload failed. Please try a different file.'}</p>
                      </div>
                      <div>
                        <input
                          type="file"
                          accept="image/*,video/*,audio/*,.pdf,.zip,*/*"
                          onChange={handleLocalFileSelect}
                          className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-semibold file:bg-stone-800 file:text-stone-300 hover:file:bg-stone-700 cursor-pointer text-stone-400"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Attached Media Items List (Both URL Links & Uploaded File) */}
            <div className="space-y-2 pt-1 border-t border-stone-800/80">
              <div className="flex items-center justify-between text-xs text-stone-400">
                <span className="font-semibold text-stone-300">
                  Active Attachments ({uploadedMedia ? 1 : mediaLinks.length})
                </span>
                {(uploadedMedia || mediaLinks.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMediaLinks([]);
                      handleClearUploadedMedia();
                    }}
                    className="text-[11px] text-red-400 hover:underline"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {!uploadedMedia && mediaLinks.length === 0 ? (
                <div className={`p-3.5 rounded-xl border ${themeBorder} ${themeInnerCardBg} text-center space-y-1`}>
                  <p className="text-xs text-stone-400">No media attached (Text-only broadcast).</p>
                  <p className="text-[11px] text-stone-500">
                    Use the controls above to attach a media URL or upload a local file.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {/* Uploaded Local File Item */}
                  {uploadedMedia && (
                    <div className={`p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                            LOCAL UPLOAD • {uploadedMedia.contentType.toUpperCase()}
                          </span>
                          <span className="text-xs font-mono text-stone-200 truncate">
                            {uploadedMedia.filename} ({(uploadedMedia.size / (1024 * 1024)).toFixed(2)} MB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearUploadedMedia}
                          className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 shrink-0 p-1 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>

                      {/* Preview for uploaded file */}
                      {uploadedMedia.contentType === 'photo' && (
                        <div className="pt-1">
                          <img
                            src={uploadedMedia.localPreviewUrl}
                            alt="Uploaded preview"
                            className="max-h-48 max-w-full rounded-lg object-contain bg-black/30 border border-stone-800"
                          />
                        </div>
                      )}
                      {uploadedMedia.contentType === 'animation' && (
                        <div className="pt-1">
                          <img
                            src={uploadedMedia.localPreviewUrl}
                            alt="Uploaded GIF"
                            className="max-h-48 max-w-full rounded-lg object-contain bg-black/30 border border-stone-800"
                          />
                        </div>
                      )}
                      {uploadedMedia.contentType === 'video' && (
                        <div className="pt-1">
                          <video
                            src={uploadedMedia.localPreviewUrl}
                            controls
                            className="max-h-48 max-w-full rounded-lg bg-black/40 border border-stone-800"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* URL Media Items */}
                  {!uploadedMedia && mediaLinks.map((item, index) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border ${themeBorder} ${themeInnerCardBg} space-y-2`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                              item.type === 'image'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : item.type === 'video'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : item.type === 'gif'
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : item.type === 'audio'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                            }`}
                          >
                            {index === 0 ? `Primary: ${item.type}` : item.type}
                          </span>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-stone-300 hover:text-blue-400 truncate flex items-center gap-1"
                            title={item.url}
                          >
                            <span className="truncate">{item.url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                          </a>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveMediaLink(item.id)}
                          className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 shrink-0 p-1 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Remove media link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>

                      {/* Preview for item */}
                      {item.type === 'image' && (
                        <div className="pt-1">
                          <SafeImagePreview url={item.url} />
                        </div>
                      )}

                      {item.type === 'gif' && (
                        <div className="pt-1">
                          {item.url.toLowerCase().endsWith('.gif') ? (
                            <SafeImagePreview url={item.url} />
                          ) : (
                            <div className="p-2 rounded bg-black/20 text-[11px] text-stone-400 flex items-center gap-2">
                              <Film className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                              <span>GIF Animation link configured for Telegram delivery.</span>
                            </div>
                          )}
                        </div>
                      )}

                      {item.type === 'video' && (
                        <div className="p-2 rounded bg-black/20 text-[11px] text-stone-400 flex items-center gap-2">
                          <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>Video link configured for Telegram video player delivery.</span>
                        </div>
                      )}

                      {item.type === 'audio' && (
                        <div className="p-2 rounded bg-black/20 text-[11px] text-stone-400 flex items-center gap-2">
                          <Music className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Audio link configured for Telegram document/audio delivery.</span>
                        </div>
                      )}

                      {item.type === 'document' && (
                        <div className="p-2 rounded bg-black/20 text-[11px] text-stone-400 flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>Document/File link configured for Telegram document delivery.</span>
                        </div>
                      )}
                    </div>
                  ))}

                  {!uploadedMedia && mediaLinks.length > 1 && (
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-start gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <span>
                        Note: Telegram PostSender delivers the primary attachment (<strong>{mediaLinks[0].type.toUpperCase()}</strong>) with this broadcast. Multi-item albums require backend <code>sendMediaGroup</code> support.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Delivery Options */}
          <div className="pt-1 flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-stone-300 select-none">
              <input
                type="checkbox"
                checked={pinAfterSend}
                onChange={e => setPinAfterSend(e.target.checked)}
                className="rounded bg-stone-950 border-stone-700 text-blue-600 focus:ring-0 w-4 h-4 cursor-pointer"
              />
              <Pin className="w-3.5 h-3.5 text-amber-400" />
              <span>Pin post after broadcast</span>
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
              <span>Protect content (restrict forwarding)</span>
            </label>
          </div>

          {/* Section 5: Inline URL Buttons Builder */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <span>4. Inline URL Buttons</span>
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
                              value={btn.text ?? ''}
                              onChange={e => handleUpdateButton(rIdx, bIdx, 'text', e.target.value)}
                              placeholder="Button Text"
                              maxLength={64}
                              className={`sm:w-1/3 px-2.5 py-1.5 rounded-lg text-xs border ${themeInputBg} outline-none`}
                            />

                            <div className="flex-1 relative flex items-center">
                              <input
                                type="url"
                                value={btn.url ?? ''}
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

          {/* Validation Warnings */}
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
                title="Simulate Telegram client theme"
              >
                <option value="default">Default Slate</option>
                <option value="dark">Dark Obsidian</option>
                <option value="light">Classic Light</option>
                <option value="midnight">Midnight Navy</option>
                <option value="emerald">Forest Emerald</option>
              </select>
            </div>
          </div>

          {/* Telegram Bubble Container */}
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
                    {targetChatId === 'all'
                      ? '📢 All Connected Groups'
                      : (selectedGroup?.chatTitle || selectedGroup?.title || `Chat ${targetChatId}`)}
                  </p>
                  <p className="text-[10px] text-stone-400 font-mono">
                    @{botUsername}
                  </p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold uppercase">
                {contentType}
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

                {/* Media Preview: Uploaded local media preview */}
                {uploadedMedia && (
                  <div className="rounded-xl overflow-hidden bg-black/40 border border-stone-700/50 flex items-center justify-center min-h-[140px] max-h-[260px] relative">
                    {uploadedMedia.contentType === 'photo' || uploadedMedia.contentType === 'animation' ? (
                      <img
                        src={uploadedMedia.localPreviewUrl}
                        alt="Local media preview"
                        className="w-full h-full object-cover max-h-[260px]"
                      />
                    ) : uploadedMedia.contentType === 'video' ? (
                      <video
                        src={uploadedMedia.localPreviewUrl}
                        controls
                        className="w-full max-h-[260px]"
                      />
                    ) : uploadedMedia.mimeType.startsWith('audio/') ? (
                      <div className="text-center p-6 space-y-2 text-stone-300">
                        <Music className="w-10 h-10 mx-auto text-amber-400" />
                        <p className="text-xs font-semibold">{uploadedMedia.filename}</p>
                        <p className="text-[10px] text-stone-400 font-mono">
                          Local Audio Upload ({(uploadedMedia.size / (1024 * 1024)).toFixed(2)} MB)
                        </p>
                      </div>
                    ) : (
                      <div className="text-center p-6 space-y-2 text-stone-300">
                        <FileText className="w-10 h-10 mx-auto text-indigo-400" />
                        <p className="text-xs font-semibold">{uploadedMedia.filename}</p>
                        <p className="text-[10px] text-stone-400 font-mono">
                          Local Document Upload ({(uploadedMedia.size / (1024 * 1024)).toFixed(2)} MB)
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Media Preview: URL media preview */}
                {!uploadedMedia && primaryMedia && (
                  <div className="rounded-xl overflow-hidden bg-black/40 border border-stone-700/50 flex items-center justify-center min-h-[140px] max-h-[260px] relative">
                    {primaryMedia.type === 'image' || (primaryMedia.type === 'gif' && primaryMedia.url.toLowerCase().endsWith('.gif')) ? (
                      <SafeImagePreview
                        url={primaryMedia.url}
                        className="w-full h-full object-cover max-h-[260px]"
                      />
                    ) : primaryMedia.type === 'video' ? (
                      <div className="text-center p-6 space-y-2 text-stone-300">
                        <Video className="w-10 h-10 mx-auto text-blue-400" />
                        <p className="text-xs font-semibold">Video Media Link</p>
                        <p className="text-[10px] text-stone-400 font-mono truncate max-w-[220px]">
                          {primaryMedia.url}
                        </p>
                      </div>
                    ) : primaryMedia.type === 'audio' ? (
                      <div className="text-center p-6 space-y-2 text-stone-300">
                        <Music className="w-10 h-10 mx-auto text-amber-400" />
                        <p className="text-xs font-semibold">Audio Media Link</p>
                        <p className="text-[10px] text-stone-400 font-mono truncate max-w-[220px]">
                          {primaryMedia.url}
                        </p>
                      </div>
                    ) : primaryMedia.type === 'gif' ? (
                      <div className="text-center p-6 space-y-2 text-stone-300">
                        <Film className="w-10 h-10 mx-auto text-purple-400" />
                        <p className="text-xs font-semibold">GIF Animation Link</p>
                        <p className="text-[10px] text-stone-400 font-mono truncate max-w-[220px]">
                          {primaryMedia.url}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center p-6 space-y-2 text-stone-300">
                        <FileText className="w-10 h-10 mx-auto text-indigo-400" />
                        <p className="text-xs font-semibold">Document / File Link</p>
                        <p className="text-[10px] text-stone-400 font-mono truncate max-w-[220px]">
                          {primaryMedia.url}
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

          <div className="p-3 rounded-xl bg-stone-900/60 border border-stone-800 text-[11px] text-stone-400 flex items-start gap-2">
            <Shield className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
            <p>
              <strong className="text-stone-300">Telegram Bot Delivery:</strong> Media files can be delivered via public HTTP/HTTPS links or direct local file upload to Roxie. Supports text-only, media-only, and media with caption broadcasts.
            </p>
          </div>
        </div>
      </div>

      {/* MODAL 1: Send Broadcast Confirmation */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`${themeCardBg} border rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl`}>
            <div>
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <Radio className="w-5 h-5 text-blue-400" />
                Confirm Broadcast Delivery
              </h3>
              <p className={`text-xs ${themeMutedText} mt-1`}>
                This post will be transmitted directly to Telegram via Roxie's PostSender engine.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${themeBorder} ${themeInnerCardBg} text-xs space-y-2 font-mono`}>
              <div className="flex justify-between">
                <span className="text-stone-400">Destination:</span>
                <span className="text-stone-200 font-bold truncate max-w-[200px]">
                  {targetChatId === 'all'
                    ? `All Groups (${activeGroups.length} connected)`
                    : (selectedGroup?.chatTitle || targetChatId)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Content Type:</span>
                <span className="text-blue-400 uppercase font-bold">{contentType}</span>
              </div>
              {uploadedMedia && (
                <div className="flex justify-between text-emerald-400">
                  <span>Local File:</span>
                  <span className="truncate max-w-[200px]">{uploadedMedia.filename}</span>
                </div>
              )}
              {!uploadedMedia && primaryMedia && (
                <div className="flex justify-between">
                  <span className="text-stone-400">Media Link:</span>
                  <span className="text-stone-200 truncate max-w-[200px]">{primaryMedia.url}</span>
                </div>
              )}
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
                onClick={handleConfirmSendBroadcast}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Confirm & Transmit Broadcast
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
                Schedule Broadcast
              </h3>
              <p className={`text-xs ${themeMutedText} mt-1`}>
                Set the delivery date and time for automatic dispatch via Roxie's scheduler.
              </p>
            </div>

            {/* Local Media Warning in Schedule Modal */}
            {uploadedMedia && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Local File Upload Cannot Be Scheduled</p>
                  <p className="mt-0.5 text-[11px] opacity-90">
                    Local media uploads are stored in transient server memory and can only be transmitted immediately via Send Broadcast. To schedule a broadcast for later, please use a direct HTTPS URL.
                  </p>
                </div>
              </div>
            )}

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
                disabled={!computedScheduleTime || !computedScheduleTime.isFuture || isSubmitting || Boolean(uploadedMedia)}
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
                Are you sure you want to clear your draft text, media attachments, and button grid?
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
