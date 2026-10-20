import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Paperclip,
  Users,
  MessageSquare,
  Search
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

export type CompositionType = 'image' | 'video' | 'gif' | 'audio' | 'document';

export interface CompositionOptionConfig {
  type: CompositionType;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  urlPlaceholder: string;
  acceptFiles: string;
  fileHint: string;
  backendContentType: ComposerContentType;
  description: string;
}

export const COMPOSITION_OPTIONS: CompositionOptionConfig[] = [
  {
    type: 'image',
    label: 'Text + Image',
    shortLabel: 'Image',
    icon: ImageIcon,
    urlPlaceholder: 'https://example.com/image.jpg',
    acceptFiles: 'image/jpeg,image/png,image/webp',
    fileHint: 'JPEG, PNG, WEBP (Max 10MB)',
    backendContentType: 'photo',
    description: 'Photo broadcast with mandatory caption text.'
  },
  {
    type: 'video',
    label: 'Text + Video',
    shortLabel: 'Video',
    icon: Video,
    urlPlaceholder: 'https://example.com/video.mp4',
    acceptFiles: 'video/mp4,video/quicktime,video/x-matroska,video/webm',
    fileHint: 'MP4, MOV, MKV, WEBM (Max 50MB)',
    backendContentType: 'video',
    description: 'Video broadcast with mandatory caption text.'
  },
  {
    type: 'gif',
    label: 'Text + GIF',
    shortLabel: 'GIF',
    icon: Film,
    urlPlaceholder: 'https://example.com/animation.gif',
    acceptFiles: 'image/gif',
    fileHint: 'GIF animation (Max 15MB)',
    backendContentType: 'animation',
    description: 'Looping GIF animation broadcast with mandatory caption text.'
  },
  {
    type: 'audio',
    label: 'Text + Audio',
    shortLabel: 'Audio',
    icon: Music,
    urlPlaceholder: 'https://example.com/audio.mp3',
    acceptFiles: 'audio/mpeg,audio/wav,audio/ogg,audio/m4a,audio/flac',
    fileHint: 'MP3, WAV, OGG, M4A, FLAC (Max 50MB)',
    backendContentType: 'document',
    description: 'Audio document broadcast with mandatory caption text.'
  },
  {
    type: 'document',
    label: 'Text + Document',
    shortLabel: 'Document',
    icon: FileText,
    urlPlaceholder: 'https://example.com/document.pdf',
    acceptFiles: 'application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,*/*',
    fileHint: 'PDF, DOCX, ZIP, TXT, etc. (Max 50MB)',
    backendContentType: 'document',
    description: 'Document / file broadcast with mandatory caption text.'
  }
];

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

export interface PrivateChatRecipient {
  chatId: number | string;
  userId: number;
  username?: string;
  name?: string;
  messageCount?: number;
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
  privateChats?: PrivateChatRecipient[];
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
  privateChats: privateChatsProp,
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

  // Local fallback for privateChats if not supplied or empty
  const [localPrivateChats, setLocalPrivateChats] = useState<PrivateChatRecipient[]>([]);

  useEffect(() => {
    if (!privateChatsProp || privateChatsProp.length === 0) {
      fetch('/api/dashboard/private-chats', {
        headers: getAuthHeaders(),
        credentials: 'same-origin'
      })
        .then(res => (res.ok ? res.json() : []))
        .then(data => {
          if (Array.isArray(data)) {
            setLocalPrivateChats(data);
          }
        })
        .catch(() => {});
    }
  }, [privateChatsProp]);

  const effectivePrivateChats = useMemo(() => {
    return privateChatsProp && privateChatsProp.length > 0 ? privateChatsProp : localPrivateChats;
  }, [privateChatsProp, localPrivateChats]);

  // Recipient Type Dropdown State: 'groups' | 'private_chats' | 'both'
  const [recipientType, setRecipientType] = useState<'groups' | 'private_chats' | 'both' | 'private_recipients'>('groups');

  // Search filter query
  const [recipientSearchQuery, setRecipientSearchQuery] = useState<string>('');

  // Selected Group IDs State (Persistent Set across dropdown switches; initialized empty to prevent accidental broadcasts)
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(() => {
    if (lockedDestination?.type === 'group') {
      return new Set([lockedDestination.chatId]);
    }
    return new Set<number>();
  });

  // Selected Private Chat IDs State (Persistent Set across dropdown switches; initialized empty to prevent accidental broadcasts)
  const [selectedPrivateChatIds, setSelectedPrivateChatIds] = useState<Set<number | string>>(() => {
    if (lockedDestination?.type === 'private') {
      return new Set([lockedDestination.chatId]);
    }
    return new Set<number | string>();
  });

  // Tracks recipient chatIds successfully delivered in this session for the current message
  const [deliveredRecipientIds, setDeliveredRecipientIds] = useState<Set<number>>(new Set());
  // Explicit confirmation if user intentionally retries already delivered recipients
  const [confirmDuplicateRetry, setConfirmDuplicateRetry] = useState<boolean>(false);

  // Sync initial selection strictly when lockedDestination changes
  useEffect(() => {
    if (lockedDestination) {
      if (lockedDestination.type === 'group') {
        setSelectedGroupIds(new Set([lockedDestination.chatId]));
        setSelectedPrivateChatIds(new Set());
      } else {
        setSelectedPrivateChatIds(new Set([lockedDestination.chatId]));
        setSelectedGroupIds(new Set());
      }
    }
  }, [lockedDestination]);

  // Filter visible groups based on search
  const visibleGroups = useMemo(() => {
    const q = recipientSearchQuery.trim().toLowerCase();
    return activeGroups.filter(g => {
      if (!q) return true;
      const title = (g.chatTitle || g.title || '').toLowerCase();
      const id = String(g.chatId);
      return title.includes(q) || id.includes(q);
    });
  }, [activeGroups, recipientSearchQuery]);

  // Filter visible private chats based on search
  const visiblePrivateChats = useMemo(() => {
    const q = recipientSearchQuery.trim().toLowerCase();
    return effectivePrivateChats.filter(p => {
      if (!q) return true;
      const name = (p.name || '').toLowerCase();
      const uname = (p.username || '').toLowerCase();
      const id = String(p.chatId ?? p.userId);
      return name.includes(q) || uname.includes(q) || id.includes(q);
    });
  }, [effectivePrivateChats, recipientSearchQuery]);

  // Mode helpers
  // Post Library and Private Recipients Registry states
  const [showPostPickerModal, setShowPostPickerModal] = useState<boolean>(false);
  const [savedPostsList, setSavedPostsList] = useState<any[]>([]);
  const [postPickerSearch, setPostPickerSearch] = useState<string>('');
  const [postPickerLoading, setPostPickerLoading] = useState<boolean>(false);
  const [showSaveToLibraryModal, setShowSaveToLibraryModal] = useState<boolean>(false);
  const [saveToLibTitle, setSaveToLibTitle] = useState<string>('');
  const [isSavingToLib, setIsSavingToLib] = useState<boolean>(false);
  const [registryRecipients, setRegistryRecipients] = useState<any[]>([]);

  // Load registry recipients when private_recipients mode is selected
  useEffect(() => {
    if (recipientType === 'private_recipients') {
      fetch('/api/dashboard/private-recipients?status=active', {
        headers: getAuthHeaders(),
        credentials: 'same-origin'
      })
        .then(res => res.ok ? res.json() : { recipients: [] })
        .then(data => {
          if (Array.isArray(data.recipients)) {
            setRegistryRecipients(data.recipients);
          }
        })
        .catch(() => {});
    }
  }, [recipientType]);

  const isGroupsMode = recipientType === 'groups';
  const isPrivateMode = recipientType === 'private_chats';
  const isBothMode = recipientType === 'both';
  const isRegistryMode = recipientType === 'private_recipients';

  // Visible selected count in current mode
  const visibleSelectedCount = useMemo(() => {
    let count = 0;
    if (isGroupsMode || isBothMode) {
      visibleGroups.forEach(g => {
        if (selectedGroupIds.has(g.chatId)) count++;
      });
    }
    if (isPrivateMode || isBothMode) {
      visiblePrivateChats.forEach(p => {
        if (selectedPrivateChatIds.has(p.chatId)) count++;
      });
    }
    return count;
  }, [isGroupsMode, isPrivateMode, isBothMode, visibleGroups, visiblePrivateChats, selectedGroupIds, selectedPrivateChatIds]);

  const totalVisibleCount = useMemo(() => {
    let count = 0;
    if (isGroupsMode || isBothMode) count += visibleGroups.length;
    if (isPrivateMode || isBothMode) count += visiblePrivateChats.length;
    return count;
  }, [isGroupsMode, isPrivateMode, isBothMode, visibleGroups.length, visiblePrivateChats.length]);

  const isAllVisibleSelected = totalVisibleCount > 0 && visibleSelectedCount === totalVisibleCount;
  const isPartiallySelected = visibleSelectedCount > 0 && visibleSelectedCount < totalVisibleCount;

  // Ref for indeterminate checkbox
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isPartiallySelected;
    }
  }, [isPartiallySelected]);

  // Toggle select all visible
  const handleToggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      // Deselect all visible in current mode
      if (isGroupsMode || isBothMode) {
        setSelectedGroupIds(prev => {
          const next = new Set(prev);
          visibleGroups.forEach(g => next.delete(g.chatId));
          return next;
        });
      }
      if (isPrivateMode || isBothMode) {
        setSelectedPrivateChatIds(prev => {
          const next = new Set(prev);
          visiblePrivateChats.forEach(p => next.delete(p.chatId));
          return next;
        });
      }
    } else {
      // Select all visible in current mode
      if (isGroupsMode || isBothMode) {
        setSelectedGroupIds(prev => {
          const next = new Set(prev);
          visibleGroups.forEach(g => next.add(g.chatId));
          return next;
        });
      }
      if (isPrivateMode || isBothMode) {
        setSelectedPrivateChatIds(prev => {
          const next = new Set(prev);
          visiblePrivateChats.forEach(p => next.add(p.chatId));
          return next;
        });
      }
    }
  };

  const handleToggleGroup = (chatId: number) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  };

  const handleTogglePrivateChat = (chatId: number | string) => {
    setSelectedPrivateChatIds(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  };

  // Active broadcast target recipients strictly scoped to current recipientType (or lockedDestination)
  const activeTargets = useMemo(() => {
    if (lockedDestination) {
      return [{
        chatId: Number(lockedDestination.chatId),
        title: lockedDestination.title || `${lockedDestination.type === 'private' ? 'Private Chat' : 'Group'} (${lockedDestination.chatId})`,
        type: lockedDestination.type
      }];
    }
    const targets: Array<{ chatId: number; title: string; type: 'group' | 'private' }> = [];
    if (recipientType === 'groups' || recipientType === 'both') {
      const targetGroups = activeGroups.filter(g => selectedGroupIds.has(g.chatId));
      targets.push(...targetGroups.map(g => ({
        chatId: g.chatId,
        title: g.chatTitle || g.title || `Group ${g.chatId}`,
        type: 'group' as const
      })));
    }
    if (recipientType === 'private_chats' || recipientType === 'both') {
      const targetPrivate = effectivePrivateChats.filter(p => selectedPrivateChatIds.has(p.chatId));
      targets.push(...targetPrivate.map(p => ({
        chatId: Number(p.chatId ?? p.userId),
        title: p.name || (p.username ? `@${p.username}` : `User ${p.chatId}`),
        type: 'private' as const
      })));
    }
    return targets;
  }, [lockedDestination, recipientType, activeGroups, selectedGroupIds, effectivePrivateChats, selectedPrivateChatIds]);

  // Total selected count strictly based on active targets in current mode
  const totalSelectedRecipients = activeTargets.length;

  const selectedSummaryText = useMemo(() => {
    if (lockedDestination) {
      return lockedDestination.title || `${lockedDestination.type === 'private' ? 'Private Chat' : 'Group'} (${lockedDestination.chatId})`;
    }
    if (activeTargets.length === 0) return '0 recipients selected';
    const gCount = activeTargets.filter(t => t.type === 'group').length;
    const pCount = activeTargets.filter(t => t.type === 'private').length;
    if (gCount > 0 && pCount > 0) {
      return `${activeTargets.length} selected (${gCount} group${gCount > 1 ? 's' : ''}, ${pCount} private)`;
    }
    if (gCount > 0) {
      return `${gCount} group${gCount > 1 ? 's' : ''} selected`;
    }
    return `${pCount} private chat${pCount > 1 ? 's' : ''} selected`;
  }, [lockedDestination, activeTargets]);

  // Sending progress state
  const [sendingProgress, setSendingProgress] = useState<{
    current: number;
    total: number;
    targetName: string;
  } | null>(null);

  // Destination State (legacy targetChatId kept for compatibility)
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

  // Selected Single-Media Composition Type (Default: 'image' -> Text + Image)
  const [selectedCompositionType, setSelectedCompositionType] = useState<CompositionType>('image');
  const [pendingSwitchType, setPendingSwitchType] = useState<CompositionType | null>(null);

  // Active composition option config
  const activeOption = useMemo(() => {
    return COMPOSITION_OPTIONS.find(o => o.type === selectedCompositionType) || COMPOSITION_OPTIONS[0];
  }, [selectedCompositionType]);

  // Media Attachment Mode: 'url' | 'upload'
  const [mediaAttachmentTab, setMediaAttachmentTab] = useState<'url' | 'upload'>('url');

  // URL-based Media Link State (Enforcing strictly 1 item)
  const [mediaLinks, setMediaLinks] = useState<MediaLinkItem[]>([]);
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

  // Primary URL media item & active attachment existence
  const primaryMedia = mediaLinks[0] || null;
  const hasActiveAttachment = Boolean(uploadedMedia || primaryMedia);

  // Effective Content Type calculation: maps to Telegram backend types
  const contentType: ComposerContentType = useMemo(() => {
    if (uploadedMedia) {
      return uploadedMedia.contentType;
    }
    return activeOption.backendContentType;
  }, [uploadedMedia, activeOption]);

  // Character Limit calculation: Telegram caption limit is strictly 1024 characters for all media posts
  const maxChars = 1024;
  const isOverCharLimit = text.length > maxChars;

  // Reset session delivery records when core message content or media changes
  useEffect(() => {
    setDeliveredRecipientIds(new Set());
    setConfirmDuplicateRetry(false);
  }, [text, primaryMedia?.url, uploadedMedia?.id, contentType]);

  // Clear uploaded local media
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

  // Media link URL add handler: replaces existing attachment to enforce single media
  const handleAddMediaLink = () => {
    const trimmed = newMediaUrl.trim();
    if (!trimmed) {
      setNewMediaUrlError('Please enter a valid media URL.');
      return;
    }

    if (!isValidHttpUrl(trimmed)) {
      setNewMediaUrlError('Invalid URL format. Links must begin with http:// or https:// (e.g. https://example.com/media.jpg).');
      return;
    }

    // Auto-detect GIF URL if gif extension is detected
    let effectiveType = selectedCompositionType;
    if (trimmed.toLowerCase().endsWith('.gif') || trimmed.toLowerCase().includes('.gif?')) {
      effectiveType = 'gif';
      if (selectedCompositionType !== 'gif') {
        setSelectedCompositionType('gif');
      }
    }

    const newItem: MediaLinkItem = {
      id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: effectiveType,
      url: trimmed
    };

    // Strictly enforce single media attachment
    handleClearUploadedMedia();
    setMediaLinks([newItem]);
    setNewMediaUrl('');
    setNewMediaUrlError(null);
  };

  const handleRemoveMediaLink = (id?: string) => {
    setMediaLinks([]);
  };

  // Local File Upload Handler: replaces existing attachment to enforce single media
  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear any existing URL link: single media only
    setMediaLinks([]);

    let targetUploadType: 'photo' | 'video' | 'animation' | 'document' = 'document';
    if (selectedCompositionType === 'image') {
      targetUploadType = 'photo';
    } else if (selectedCompositionType === 'video') {
      targetUploadType = 'video';
    } else if (selectedCompositionType === 'gif') {
      targetUploadType = 'animation';
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

  // Composition Type Selection & Replacement Confirmation
  const handleSelectCompositionType = (targetType: CompositionType) => {
    if (targetType === selectedCompositionType) return;
    if (hasActiveAttachment) {
      // Prompt user before replacing currently attached media
      setPendingSwitchType(targetType);
    } else {
      setSelectedCompositionType(targetType);
      setNewMediaUrl('');
      setNewMediaUrlError(null);
    }
  };

  const handleConfirmTypeSwitch = () => {
    if (!pendingSwitchType) return;
    handleClearUploadedMedia();
    setMediaLinks([]);
    setNewMediaUrl('');
    setNewMediaUrlError(null);
    setSelectedCompositionType(pendingSwitchType);
    setPendingSwitchType(null);
  };

  // Validation Checks: enforces mandatory text + mandatory single media
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!lockedDestination && totalSelectedRecipients === 0) {
      errors.push('Please select at least one recipient (group or private chat) from the recipients panel.');
    }
    // Mandatory text validation
    if (!text.trim()) {
      errors.push('Message text / caption is required.');
    }
    // Mandatory single media attachment validation
    if (!uploadedMedia && mediaLinks.length === 0) {
      errors.push(`A media attachment (${activeOption.shortLabel}) is required for ${activeOption.label} broadcasts.`);
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
      errors.push(`Caption text exceeds Telegram limit of ${maxChars} characters (${text.length}/${maxChars}).`);
    }
    const btnErrors = validateButtonGrid(buttonGrid);
    errors.push(...btnErrors);
    return errors;
  }, [lockedDestination, totalSelectedRecipients, text, uploadedMedia, mediaLinks, activeOption, uploadStatus, primaryMedia, isOverCharLimit, maxChars, buttonGrid]);

  const isFormValid = validationErrors.length === 0;

  // Track recipients in active selection that were already delivered in this session
  const alreadyDeliveredSelected = useMemo(() => {
    return activeTargets.filter(t => deliveredRecipientIds.has(t.chatId));
  }, [activeTargets, deliveredRecipientIds]);
  const hasAlreadyDelivered = alreadyDeliveredSelected.length > 0;

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
    setNewMediaUrl('');
    setNewMediaUrlError(null);
    setButtonGrid([]);
    setPinAfterSend(false);
    setReplyToLatest(false);
    setProtectContent(false);
    setShowClearModal(false);
    setNotification(null);
    setDeliveredRecipientIds(new Set());
    setConfirmDuplicateRetry(false);
    setSelectedCompositionType('image');
    setPendingSwitchType(null);
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

      // Case A: Locked destination
      if (lockedDestination) {
        const res = await fetch('/api/dashboard/posts/send', {
          method: 'POST',
          credentials: 'same-origin',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            chatId: Number(lockedDestination.chatId),
            payload
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to dispatch broadcast post to Telegram.');
        }

        setShowSendModal(false);
        setConfirmDuplicateRetry(false);
        setDeliveredRecipientIds(prev => new Set(prev).add(Number(lockedDestination.chatId)));
        const targetLabel = lockedDestination.title || `Chat ${lockedDestination.chatId}`;
        setNotification({
          type: 'success',
          title: 'Broadcast Sent Successfully!',
          message: `Your ${contentType.toUpperCase()} post was delivered to ${targetLabel}.`,
          details: data.result?.messageId ? `Telegram Message ID: #${data.result.messageId}` : undefined
        });
      } else {
        // Case B: Multi-recipient dispatch strictly scoped to activeTargets
        const targets = activeTargets;

        if (targets.length === 0) {
          throw new Error('No recipients selected for broadcast.');
        }

        let successCount = 0;
        let failCount = 0;
        const newlyDeliveredIds: number[] = [];
        const successfulTargets: Array<{ chatId: number; title: string; type: 'group' | 'private' }> = [];
        const failedTargets: Array<{ chatId: number; title: string; type: 'group' | 'private'; error: string }> = [];

        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          setSendingProgress({
            current: i + 1,
            total: targets.length,
            targetName: target.title
          });

          try {
            const res = await fetch('/api/dashboard/posts/send', {
              method: 'POST',
              credentials: 'same-origin',
              headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({
                chatId: target.chatId,
                payload
              })
            });

            const data = await res.json();
            if (res.ok && data.success) {
              successCount++;
              newlyDeliveredIds.push(target.chatId);
              successfulTargets.push(target);
            } else {
              failCount++;
              failedTargets.push({ ...target, error: data.error || 'delivery error' });
            }
          } catch (err: any) {
            failCount++;
            failedTargets.push({ ...target, error: err.message || 'network error' });
          }
        }

        if (newlyDeliveredIds.length > 0) {
          setDeliveredRecipientIds(prev => {
            const next = new Set(prev);
            newlyDeliveredIds.forEach(id => next.add(id));
            return next;
          });
        }

        setShowSendModal(false);
        setSendingProgress(null);
        setConfirmDuplicateRetry(false);

        if (successCount > 0 && failCount === 0) {
          const groupCount = targets.filter(t => t.type === 'group').length;
          const privateCount = targets.filter(t => t.type === 'private').length;
          setNotification({
            type: 'success',
            title: 'Broadcast Complete!',
            message: `Delivered ${contentType.toUpperCase()} broadcast to all ${successCount} recipient(s) (${groupCount} groups, ${privateCount} private).`
          });
        } else if (successCount > 0 && failCount > 0) {
          // Partial delivery: Safely deselect successfully delivered recipients so ONLY failed targets remain selected for retry!
          setSelectedGroupIds(prev => {
            const next = new Set(prev);
            successfulTargets.filter(t => t.type === 'group').forEach(t => next.delete(t.chatId));
            return next;
          });
          setSelectedPrivateChatIds(prev => {
            const next = new Set(prev);
            successfulTargets.filter(t => t.type === 'private').forEach(t => next.delete(t.chatId));
            return next;
          });

          const failedSummary = failedTargets.map(t => `${t.title} (${t.error})`).join('; ');
          setNotification({
            type: 'error',
            title: 'Broadcast Partially Delivered — Safe Retry Ready',
            message: `Delivered to ${successCount} of ${targets.length} recipient(s). ${failCount} recipient(s) failed.`,
            details: `Successfully delivered recipients were automatically deselected to prevent duplicate messages. Only the ${failCount} failed recipient(s) remain selected. Click "Send Broadcast" to retry failed recipients only: ${failedSummary}`
          });
        } else {
          const failedSummary = failedTargets.slice(0, 3).map(t => `${t.title}: ${t.error}`).join('; ');
          throw new Error(`Broadcast failed for all ${targets.length} recipient(s). ${failedSummary}`);
        }
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
      setSendingProgress(null);
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

      if (lockedDestination) {
        const res = await fetch('/api/dashboard/posts/schedule', {
          method: 'POST',
          credentials: 'same-origin',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            chatId: Number(lockedDestination.chatId),
            payload,
            nextRun: computedScheduleTime.isoString,
            name: `Broadcast: ${text.slice(0, 30) || contentType.toUpperCase()}`
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to schedule post.');
        }
      } else {
        const targetChatIds = activeTargets.map(t => t.chatId);
        if (targetChatIds.length === 0) {
          throw new Error('Please select at least one recipient to schedule.');
        }
        for (const cId of targetChatIds) {
          await fetch('/api/dashboard/posts/schedule', {
            method: 'POST',
            credentials: 'same-origin',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              chatId: cId,
              payload,
              nextRun: computedScheduleTime.isoString,
              name: `Broadcast: ${text.slice(0, 30) || contentType.toUpperCase()}`
            })
          });
        }
      }

      setShowScheduleModal(false);
      setNotification({
        type: 'success',
        title: 'Post Scheduled Successfully!',
        message: `Your post is queued for automatic transmission on ${computedScheduleTime.formatted} across ${activeTargets.length} recipient(s).`
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

  const renderTelegramBubble = () => (
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
            <p className="text-xs font-bold leading-tight truncate max-w-[180px] sm:max-w-xs">
              {lockedDestination
                ? (lockedDestination.title || `Chat ${lockedDestination.chatId}`)
                : selectedSummaryText}
            </p>
            <p className="text-[10px] text-stone-400 font-mono">
              @{botUsername}
            </p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-semibold uppercase">
          {activeOption.label}
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

          {/* Placeholder when no media is attached */}
          {!uploadedMedia && !primaryMedia && (
            <div className="rounded-xl p-4 bg-stone-900/60 border border-dashed border-stone-700/80 text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-xs text-stone-300 font-semibold">
                <activeOption.icon className="w-4 h-4 text-blue-400" />
                <span>Waiting for {activeOption.shortLabel} attachment...</span>
              </div>
              <p className="text-[10px] text-stone-500">
                Attach a media URL or upload a local file in the composer
              </p>
            </div>
          )}

          {/* Text / Caption Content */}
          {text.trim() ? (
            <div
              className="text-xs leading-relaxed whitespace-pre-wrap break-words"
              dangerouslySetInnerHTML={{ __html: text.replace(/\n/g, '<br/>') }}
            />
          ) : (
            <p className="text-xs italic text-amber-400/80">
              (Message text is required)
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
  );

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
            Compose and broadcast rich posts across Telegram groups and private chats using Text + Single Media models (Image, Video, GIF, Audio, Document).
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => (isDirty ? setShowClearModal(true) : handleResetComposer())}
            className={`flex-1 sm:flex-initial px-3 py-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 text-stone-300 min-h-[40px]`}
            title="Reset composer fields"
          >
            <RotateCcw className="w-3.5 h-3.5 text-stone-400" />
            Clear
          </button>

          <button
            type="button"
            onClick={() => setShowScheduleModal(true)}
            disabled={!isFormValid || isSubmitting}
            className="flex-1 sm:flex-initial px-3.5 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm min-h-[40px]"
          >
            <Calendar className="w-4 h-4" />
            Schedule...
          </button>

          <button
            type="button"
            onClick={() => setShowPreviewModal(true)}
            className="flex-1 sm:flex-initial px-3.5 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-stone-700 min-h-[40px]"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>

          <button
            type="button"
            onClick={() => setShowSendModal(true)}
            disabled={!isFormValid || isSubmitting}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm min-h-[40px]"
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
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* LEFT COLUMN: Composer Form (approx 70-80% width) */}
        <div className="flex-1 w-full min-w-0 space-y-6">
          <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6 shadow-sm`}>
            {/* Destination Scope Indicator */}
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
              <div className={`p-3 rounded-xl border ${themeBorder} ${themeInnerCardBg} flex items-center justify-between text-xs`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-stone-300 font-semibold truncate">
                    Broadcast Target: <span className="text-stone-100 font-bold">{selectedSummaryText}</span>
                  </span>
                </div>
                <span className="hidden sm:inline-block text-[11px] text-stone-400 font-medium shrink-0">
                  Manage via recipients panel 👉
                </span>
              </div>
            )}

          {/* Section 2: Post Content / Caption (Mandatory) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-blue-400" />
                <span>2. Message Text (Mandatory)</span>
              </label>
              <span
                className={`text-[11px] font-mono ${
                  isOverCharLimit ? 'text-red-400 font-bold' : themeMutedText
                }`}
              >
                {text.length} / {maxChars} chars (Caption Limit)
              </span>
            </div>

            <textarea
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={`Enter mandatory broadcast message text here... Delivered as caption with your attached ${activeOption.shortLabel.toLowerCase()}. Supports HTML formatting (<b>bold</b>, <i>italic</i>, <code>code</code>, etc.)`}
              className={`w-full p-3.5 rounded-xl text-xs border ${themeInputBg} outline-none resize-y font-sans`}
            />
          </div>

          {/* Section 3: Media Selection & Attachment (Single Choice Enforced) */}
          <div className="space-y-4 p-4 rounded-xl border border-stone-800 bg-stone-950/40">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-blue-400" />
                <span>3. Media Attachment (Select 1 Model)</span>
              </label>
              <p className="text-[11px] text-stone-400">
                Choose a single media composition model. All broadcasts enforce mandatory text plus one media attachment.
              </p>
            </div>

            {/* 5-Choice Single-Choice Selector (Radio Cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {COMPOSITION_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const isSelected = selectedCompositionType === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleSelectCompositionType(opt.type)}
                    className={`p-2.5 rounded-xl text-left border transition-all flex flex-col justify-between gap-1.5 relative last:col-span-2 sm:last:col-span-1 min-h-[60px] ${
                      isSelected
                        ? 'bg-blue-600/15 border-blue-500 text-blue-300 ring-1 ring-blue-500/40 shadow-sm'
                        : `${themeInnerCardBg} ${themeBorder} text-stone-400 hover:text-stone-200 hover:border-stone-700`
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-stone-400'}`} />
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-stone-600'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold truncate leading-tight">{opt.label}</p>
                      <p className="text-[10px] opacity-75 font-mono truncate">{opt.shortLabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Input Controls Scoped to Active Composition Type */}
            <div className="pt-2 border-t border-stone-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-stone-200">
                    Attach {activeOption.shortLabel}:
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">
                    (Single media only)
                  </span>
                </div>

                {/* Mode Selector: Media URL vs Upload File */}
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

              {/* Mode A: Scoped URL Input */}
              {mediaAttachmentTab === 'url' && (
                <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs font-semibold text-stone-200">
                    <span className="flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-blue-400" />
                      Provide {activeOption.shortLabel} URL:
                    </span>
                    <span className="text-[10px] text-stone-400">Direct HTTP / HTTPS link</span>
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
                        placeholder={activeOption.urlPlaceholder}
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
                      {hasActiveAttachment ? 'Replace Link' : 'Attach Link'}
                    </button>
                  </div>

                  {newMediaUrlError && (
                    <p className="text-[11px] text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      {newMediaUrlError}
                    </p>
                  )}

                  <p className="text-[10px] text-stone-400">
                    {activeOption.type === 'audio'
                      ? '🎵 Note: Audio URLs are dispatched via Telegram document delivery by existing bot backend.'
                      : `Provide a direct public HTTP or HTTPS link to your ${activeOption.shortLabel.toLowerCase()} file.`}
                  </p>
                </div>
              )}

              {/* Mode B: Scoped File Upload */}
              {mediaAttachmentTab === 'upload' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div className={`p-4 rounded-xl border ${uploadedMedia ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-stone-800 bg-stone-900/40'} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5 text-blue-400" />
                        Select Local {activeOption.shortLabel} File:
                      </span>
                      <span className="text-[10px] text-stone-400">
                        {activeOption.fileHint}
                      </span>
                    </div>

                    {uploadStatus !== 'uploading' && (
                      <div className="space-y-2">
                        <input
                          type="file"
                          key={`file-input-${selectedCompositionType}`}
                          id="broadcast-local-file-input"
                          accept={activeOption.acceptFiles}
                          onChange={handleLocalFileSelect}
                          className="text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer text-stone-400"
                        />
                        <p className="text-[11px] text-stone-400">
                          ⚡ Selecting a local file will upload it to server memory and attach it as your single media item.
                        </p>
                      </div>
                    )}

                    {uploadStatus === 'uploading' && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Uploading {activeOption.shortLabel} to Roxie media store...</span>
                      </div>
                    )}

                    {uploadStatus === 'error' && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-2">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <p>{uploadError || 'File upload failed. Please try a different file.'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Active Single Attachment Display */}
              <div className="space-y-2 pt-2 border-t border-stone-800/80">
                <div className="flex items-center justify-between text-xs text-stone-400">
                  <span className="font-semibold text-stone-300">
                    Active Media Attachment ({hasActiveAttachment ? 1 : 0}/1)
                  </span>
                  {hasActiveAttachment && (
                    <button
                      type="button"
                      onClick={() => {
                        setMediaLinks([]);
                        handleClearUploadedMedia();
                      }}
                      className="text-[11px] text-red-400 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove Attachment
                    </button>
                  )}
                </div>

                {!hasActiveAttachment ? (
                  <div className={`p-4 rounded-xl border border-dashed border-stone-800 ${themeInnerCardBg} text-center space-y-1`}>
                    <p className="text-xs text-amber-400/90 font-semibold flex items-center justify-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      Media attachment required
                    </p>
                    <p className="text-[11px] text-stone-500">
                      Use Media URL or Upload File above to attach 1 {activeOption.shortLabel.toLowerCase()} to complete your {activeOption.label} post.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Render Uploaded File */}
                    {uploadedMedia && (
                      <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                              LOCAL {activeOption.shortLabel.toUpperCase()}
                            </span>
                            <span className="text-xs font-mono text-stone-200 truncate">
                              {uploadedMedia.filename} ({(uploadedMedia.size / (1024 * 1024)).toFixed(2)} MB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearUploadedMedia}
                            className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 shrink-0 p-1 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Remove attachment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>

                        {/* Preview for uploaded media */}
                        {(uploadedMedia.contentType === 'photo' || uploadedMedia.contentType === 'animation') && (
                          <div className="pt-1">
                            <img
                              src={uploadedMedia.localPreviewUrl}
                              alt="Uploaded preview"
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
                        {uploadedMedia.contentType === 'document' && (
                          <div className="p-2.5 rounded-lg bg-black/30 text-xs text-stone-300 flex items-center gap-2">
                            {uploadedMedia.mimeType.startsWith('audio/') ? (
                              <Music className="w-4 h-4 text-amber-400 shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                            )}
                            <span className="truncate">{uploadedMedia.filename}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Render URL Media Item */}
                    {!uploadedMedia && primaryMedia && (
                      <div className={`p-3.5 rounded-xl border ${themeBorder} ${themeInnerCardBg} space-y-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                              {activeOption.shortLabel.toUpperCase()} URL
                            </span>
                            <a
                              href={primaryMedia.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono text-stone-300 hover:text-blue-400 truncate flex items-center gap-1"
                              title={primaryMedia.url}
                            >
                              <span className="truncate">{primaryMedia.url}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                            </a>
                          </div>

                          <button
                            type="button"
                            onClick={() => setMediaLinks([])}
                            className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 shrink-0 p-1 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Remove attachment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>

                        {/* Preview for URL */}
                        {primaryMedia.type === 'image' && (
                          <div className="pt-1">
                            <SafeImagePreview url={primaryMedia.url} />
                          </div>
                        )}
                        {primaryMedia.type === 'gif' && (
                          <div className="pt-1">
                            {primaryMedia.url.toLowerCase().endsWith('.gif') ? (
                              <SafeImagePreview url={primaryMedia.url} />
                            ) : (
                              <div className="p-2 rounded bg-black/20 text-[11px] text-stone-400 flex items-center gap-2">
                                <Film className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span>GIF Animation link configured for Telegram delivery.</span>
                              </div>
                            )}
                          </div>
                        )}
                        {primaryMedia.type === 'video' && (
                          <div className="p-2.5 rounded bg-black/20 text-[11px] text-stone-400 flex items-center gap-2">
                            <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span className="truncate">Video link: {primaryMedia.url}</span>
                          </div>
                        )}
                        {primaryMedia.type === 'audio' && (
                          <div className="p-2.5 rounded bg-black/20 text-[11px] text-stone-400 flex items-center gap-2">
                            <Music className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">Audio link: {primaryMedia.url}</span>
                          </div>
                        )}
                        {primaryMedia.type === 'document' && (
                          <div className="p-2.5 rounded bg-black/20 text-[11px] text-stone-400 flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="truncate">Document link: {primaryMedia.url}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
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

          {/* Section 5: Live Telegram Preview */}
          <div className="space-y-3 pt-3 border-t border-stone-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <span>5. Live Telegram Preview</span>
              </label>
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

            {renderTelegramBubble()}

            <div className="p-3 rounded-xl bg-stone-900/60 border border-stone-800 text-[11px] text-stone-400 flex items-start gap-2">
              <Shield className="w-4 h-4 text-stone-500 shrink-0 mt-0.5" />
              <p>
                <strong className="text-stone-300">Telegram Bot Delivery:</strong> Media files can be delivered via public HTTP/HTTPS links or direct local file upload to Roxie. Supports Text + Image, Text + Video, Text + GIF, Text + Audio, and Text + Document broadcasts.
              </p>
            </div>
          </div>
        </div>
      </div>

        {/* RIGHT COLUMN: Broadcast Recipients Panel (approx 20-30% width, ~25% on desktop) */}
        <div className="w-full lg:w-[28%] xl:w-[25%] lg:min-w-[280px] lg:sticky lg:top-4 space-y-4">
          <div className={`${themeCardBg} border rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm`}>
            {/* Panel Header */}
            <div className="flex items-center justify-between gap-2 border-b border-stone-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500 shrink-0" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-200">
                  Broadcast Recipients
                </h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                {totalSelectedRecipients} selected
              </span>
            </div>

            {lockedDestination ? (
              <div className={`p-3.5 rounded-xl border ${themeBorder} ${themeInnerCardBg} space-y-2`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-stone-300">Locked Scope</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Active
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-stone-200">
                  <span>{lockedDestination.type === 'private' ? '👤' : '👥'}</span>
                  <span className="truncate">{lockedDestination.title || `Chat ${lockedDestination.chatId}`}</span>
                </div>
                <p className="font-mono text-[10px] text-stone-500">ID: {lockedDestination.chatId}</p>
              </div>
            ) : (
              <>
                {/* Recipient Type Dropdown */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-stone-400 flex items-center justify-between">
                    <span>Recipient Type</span>
                    <span className="text-[10px] font-normal text-stone-500">
                      {recipientType === 'groups' ? 'Groups only' : recipientType === 'private_chats' ? 'Private chats only' : 'Both (Mixed)'}
                    </span>
                  </label>
                  <select
                    value={recipientType}
                    onChange={e => setRecipientType(e.target.value as 'groups' | 'private_chats' | 'both')}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-medium border ${themeInputBg} outline-none transition-colors cursor-pointer`}
                  >
                    <option value="groups">Groups</option>
                    <option value="private_chats">Private Chats</option>
                    <option value="both">Both</option>
                  </select>
                </div>

                {/* Select All / Deselect All Control & Search Box */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-950/60 border border-stone-800/80">
                    <label className="flex items-center gap-2 text-xs font-medium text-stone-300 hover:text-white transition-colors cursor-pointer select-none">
                      <input
                        ref={selectAllCheckboxRef}
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        onChange={handleToggleSelectAllVisible}
                        className="rounded bg-stone-900 border-stone-700 text-blue-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="text-[11px]">
                        {isAllVisibleSelected ? 'Deselect All' : 'Select All'}
                        <span className="text-stone-500 ml-1">({totalVisibleCount})</span>
                      </span>
                    </label>
                    <span className="text-[10px] font-mono text-stone-400">
                      {visibleSelectedCount}/{totalVisibleCount}
                    </span>
                  </div>

                  {/* Search Input */}
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 pointer-events-none" />
                    <input
                      type="text"
                      value={recipientSearchQuery}
                      onChange={e => setRecipientSearchQuery(e.target.value)}
                      placeholder="Search by name or ID..."
                      className={`w-full pl-8 pr-7 py-1.5 rounded-lg text-[11px] border ${themeInputBg} outline-none`}
                    />
                    {recipientSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setRecipientSearchQuery('')}
                        className="absolute right-2 text-stone-500 hover:text-stone-300 p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Scrollable Recipient List */}
                <div className="max-h-[260px] sm:max-h-[320px] lg:max-h-[380px] xl:max-h-[440px] overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {/* Category: Groups Only */}
                  {recipientType === 'groups' && (
                    <>
                      {visibleGroups.length === 0 ? (
                        <div className="py-8 text-center text-xs text-stone-500">
                          {activeGroups.length === 0 ? 'No active connected groups found.' : 'No groups match your search.'}
                        </div>
                      ) : (
                        visibleGroups.map(g => {
                          const isChecked = selectedGroupIds.has(g.chatId);
                          const isDelivered = deliveredRecipientIds.has(g.chatId);
                          return (
                            <div
                              key={`group_${g.chatId}`}
                              onClick={() => handleToggleGroup(g.chatId)}
                              className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none ${
                                isChecked
                                  ? 'bg-blue-600/10 border-blue-500/40 text-stone-100'
                                  : 'bg-stone-950/40 border-stone-800/80 text-stone-300 hover:border-stone-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="rounded bg-stone-900 border-stone-700 text-blue-600 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="font-semibold text-xs truncate">
                                    {g.chatTitle || g.title || `Group ${g.chatId}`}
                                  </p>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isDelivered && (
                                      <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded">
                                        Sent
                                      </span>
                                    )}
                                    {g.memberCount !== undefined && (
                                      <span className="text-[10px] text-stone-400 font-mono">
                                        {g.memberCount}m
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="font-mono text-[10px] text-stone-500 truncate">
                                  ID: {g.chatId}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </>
                  )}

                  {/* Category: Private Chats Only */}
                  {recipientType === 'private_chats' && (
                    <>
                      {visiblePrivateChats.length === 0 ? (
                        <div className="py-8 text-center text-xs text-stone-500">
                          {effectivePrivateChats.length === 0 ? 'No private chats available.' : 'No private chats match your search.'}
                        </div>
                      ) : (
                        visiblePrivateChats.map(p => {
                          const isChecked = selectedPrivateChatIds.has(p.chatId);
                          const isDelivered = deliveredRecipientIds.has(Number(p.chatId ?? p.userId));
                          const displayTitle = p.name || (p.username ? `@${p.username}` : `User ${p.chatId}`);
                          return (
                            <div
                              key={`priv_${p.chatId}`}
                              onClick={() => handleTogglePrivateChat(p.chatId)}
                              className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none ${
                                isChecked
                                  ? 'bg-emerald-600/10 border-emerald-500/40 text-stone-100'
                                  : 'bg-stone-950/40 border-stone-800/80 text-stone-300 hover:border-stone-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="rounded bg-stone-900 border-stone-700 text-emerald-600 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="font-semibold text-xs truncate">
                                    {displayTitle}
                                  </p>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {isDelivered && (
                                      <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded">
                                        Sent
                                      </span>
                                    )}
                                    {p.messageCount !== undefined && (
                                      <span className="text-[10px] text-stone-400 font-mono">
                                        {p.messageCount} msgs
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="font-mono text-[10px] text-stone-500 truncate">
                                  ID: {p.chatId}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </>
                  )}

                  {/* Category: Both (Groups & Private Chats with section headings) */}
                  {recipientType === 'both' && (
                    <div className="space-y-3">
                      {/* Sub-heading: Groups */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between px-1 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3 text-blue-400" /> Groups
                          </span>
                          <span className="text-[10px] font-mono text-stone-500">
                            {visibleGroups.filter(g => selectedGroupIds.has(g.chatId)).length}/{visibleGroups.length}
                          </span>
                        </div>
                        {visibleGroups.length === 0 ? (
                          <p className="text-[11px] text-stone-500 italic px-2 py-1">No groups found.</p>
                        ) : (
                          visibleGroups.map(g => {
                            const isChecked = selectedGroupIds.has(g.chatId);
                            const isDelivered = deliveredRecipientIds.has(g.chatId);
                            return (
                              <div
                                key={`both_g_${g.chatId}`}
                                onClick={() => handleToggleGroup(g.chatId)}
                                className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none ${
                                  isChecked
                                    ? 'bg-blue-600/10 border-blue-500/40 text-stone-100'
                                    : 'bg-stone-950/40 border-stone-800/80 text-stone-300 hover:border-stone-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded bg-stone-900 border-stone-700 text-blue-600 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="font-semibold text-xs truncate">
                                      {g.chatTitle || g.title || `Group ${g.chatId}`}
                                    </p>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isDelivered && (
                                        <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded">
                                          Sent
                                        </span>
                                      )}
                                      {g.memberCount !== undefined && (
                                        <span className="text-[10px] text-stone-400 font-mono">
                                          {g.memberCount}m
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="font-mono text-[10px] text-stone-500 truncate">
                                    ID: {g.chatId}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Sub-heading: Private Chats */}
                      <div className="space-y-1 pt-1 border-t border-stone-800/60">
                        <div className="flex items-center justify-between px-1 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3 text-emerald-400" /> Private Chats
                          </span>
                          <span className="text-[10px] font-mono text-stone-500">
                            {visiblePrivateChats.filter(p => selectedPrivateChatIds.has(p.chatId)).length}/{visiblePrivateChats.length}
                          </span>
                        </div>
                        {visiblePrivateChats.length === 0 ? (
                          <p className="text-[11px] text-stone-500 italic px-2 py-1">No private chats found.</p>
                        ) : (
                          visiblePrivateChats.map(p => {
                            const isChecked = selectedPrivateChatIds.has(p.chatId);
                            const isDelivered = deliveredRecipientIds.has(Number(p.chatId ?? p.userId));
                            const displayTitle = p.name || (p.username ? `@${p.username}` : `User ${p.chatId}`);
                            return (
                              <div
                                key={`both_p_${p.chatId}`}
                                onClick={() => handleTogglePrivateChat(p.chatId)}
                                className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none ${
                                  isChecked
                                    ? 'bg-emerald-600/10 border-emerald-500/40 text-stone-100'
                                    : 'bg-stone-950/40 border-stone-800/80 text-stone-300 hover:border-stone-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded bg-stone-900 border-stone-700 text-emerald-600 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="font-semibold text-xs truncate">
                                      {displayTitle}
                                    </p>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isDelivered && (
                                        <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.2 rounded">
                                          Sent
                                        </span>
                                      )}
                                      {p.messageCount !== undefined && (
                                        <span className="text-[10px] text-stone-400 font-mono">
                                          {p.messageCount} msgs
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className="font-mono text-[10px] text-stone-500 truncate">
                                    ID: {p.chatId}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Status Indicator / Footer */}
                <div className="pt-2 border-t border-stone-800/80">
                  {totalSelectedRecipients === 0 ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Select at least one recipient</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[11px] text-stone-400">
                      <span className="truncate">{selectedSummaryText}</span>
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MODAL 0: Media Attachment Replacement Prompt */}
      {pendingSwitchType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`${themeCardBg} border rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-stone-100">
                  Replace Existing Media Attachment?
                </h3>
                <p className={`text-xs ${themeMutedText} leading-relaxed`}>
                  You already have an attachment configured ({uploadedMedia ? uploadedMedia.filename : primaryMedia?.url}).
                  Switching to <strong>{COMPOSITION_OPTIONS.find(o => o.type === pendingSwitchType)?.label}</strong> will replace your currently attached media.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingSwitchType(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTypeSwitch}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Replace & Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Send Broadcast Confirmation */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`${themeCardBg} border rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto`}>
            <div>
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <Radio className="w-5 h-5 text-blue-400" />
                Confirm Broadcast Delivery
              </h3>
              <p className={`text-xs ${themeMutedText} mt-1`}>
                This post will be transmitted directly to Telegram via Roxie's PostSender engine.
              </p>
            </div>

            <div className={`p-4 rounded-xl border ${themeBorder} ${themeInnerCardBg} text-xs space-y-2.5 font-mono`}>
              {/* Composition Model Requirement 5 */}
              <div className="flex justify-between items-center pb-1.5 border-b border-stone-800">
                <span className="text-stone-400">Broadcast Type:</span>
                <span className="text-blue-400 font-bold flex items-center gap-1.5 font-sans">
                  <activeOption.icon className="w-3.5 h-3.5" />
                  {activeOption.label} Broadcast
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-stone-400">Total Recipients:</span>
                <span className="text-stone-200 font-bold">
                  {lockedDestination ? '1 (Locked)' : `${totalSelectedRecipients} recipient(s)`}
                </span>
              </div>

              {!lockedDestination && (
                <div className="flex justify-between items-center text-[11px] text-stone-400">
                  <span>Breakdown:</span>
                  <span className="text-stone-200 font-semibold">
                    {activeTargets.filter(t => t.type === 'group').length} group(s), {activeTargets.filter(t => t.type === 'private').length} private chat(s)
                  </span>
                </div>
              )}

              {/* Message Text Caption Preview */}
              <div className="space-y-1 pt-1 font-sans">
                <span className="text-stone-400 text-[11px] font-mono">Message Text / Caption:</span>
                <div className="p-2.5 rounded-lg bg-stone-900/80 border border-stone-800 text-stone-200 text-xs whitespace-pre-wrap max-h-24 overflow-y-auto leading-relaxed">
                  {text.trim()}
                </div>
              </div>

              {/* Attached Media Display */}
              <div className="space-y-1 pt-1 font-sans">
                <span className="text-stone-400 text-[11px] font-mono">Attached Media:</span>
                <div className="p-2 rounded-lg bg-stone-900/60 border border-stone-800 text-stone-200 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0 font-mono">
                      {uploadedMedia ? `LOCAL ${activeOption.shortLabel.toUpperCase()}` : `${activeOption.shortLabel.toUpperCase()} URL`}
                    </span>
                    <span className="truncate font-mono text-[11px]">
                      {uploadedMedia ? uploadedMedia.filename : primaryMedia?.url}
                    </span>
                  </div>
                  {uploadedMedia && (
                    <span className="text-[10px] text-stone-400 font-mono shrink-0">
                      {(uploadedMedia.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                </div>
              </div>

              {/* Duplicate Delivery Warning & Safe Retry Option */}
              {hasAlreadyDelivered && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Duplicate Delivery Warning</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGroupIds(prev => {
                          const next = new Set(prev);
                          alreadyDeliveredSelected.filter(t => t.type === 'group').forEach(t => next.delete(t.chatId));
                          return next;
                        });
                        setSelectedPrivateChatIds(prev => {
                          const next = new Set(prev);
                          alreadyDeliveredSelected.filter(t => t.type === 'private').forEach(t => next.delete(t.chatId));
                          return next;
                        });
                        setConfirmDuplicateRetry(false);
                      }}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition-colors"
                    >
                      Deselect Already Delivered ({alreadyDeliveredSelected.length})
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
                    <strong>{alreadyDeliveredSelected.length}</strong> of the <strong>{activeTargets.length}</strong> selected recipient(s) already received this broadcast post:
                    <span className="block font-mono text-[10px] text-amber-300/80 mt-1 truncate">
                      {alreadyDeliveredSelected.map(t => t.title).join(', ')}
                    </span>
                  </p>
                  <label className="flex items-start gap-2 text-[11px] text-amber-200 font-medium cursor-pointer select-none border-t border-amber-500/20 pt-2 font-sans">
                    <input
                      type="checkbox"
                      checked={confirmDuplicateRetry}
                      onChange={e => setConfirmDuplicateRetry(e.target.checked)}
                      className="rounded bg-stone-900 border-amber-500 text-amber-500 focus:ring-0 w-3.5 h-3.5 mt-0.5 cursor-pointer shrink-0"
                    />
                    <span>I understand that successful recipients may receive duplicate messages and explicitly confirm this retry.</span>
                  </label>
                </div>
              )}

              {/* Scrollable list of recipient targets */}
              {!lockedDestination && activeTargets.length > 0 && (
                <div className="max-h-28 overflow-y-auto space-y-1 p-2 rounded-lg bg-stone-900/60 border border-stone-800 text-[11px] font-sans">
                  {activeTargets.map(target => {
                    const isDelivered = deliveredRecipientIds.has(target.chatId);
                    return (
                      <div key={`modal_target_${target.chatId}`} className="flex items-center justify-between text-stone-300">
                        <span className="truncate flex items-center gap-1.5">
                          {target.type === 'group' ? (
                            <Users className="w-3 h-3 text-blue-400 shrink-0" />
                          ) : (
                            <MessageSquare className="w-3 h-3 text-emerald-400 shrink-0" />
                          )}
                          <span className="truncate">{target.title}</span>
                          {isDelivered && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                              Already Sent
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-stone-500 text-[10px] shrink-0">{target.chatId}</span>
                      </div>
                    );
                  })}
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

            {sendingProgress && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-blue-400" />
                <span>Transmitting {sendingProgress.current} of {sendingProgress.total}: <strong>{sendingProgress.targetName}</strong></span>
              </div>
            )}

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
                disabled={isSubmitting || (hasAlreadyDelivered && !confirmDuplicateRetry)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {isSubmitting
                  ? 'Transmitting...'
                  : hasAlreadyDelivered && !confirmDuplicateRetry
                  ? 'Duplicate Confirmation Required'
                  : 'Confirm & Transmit Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Schedule Post Dialog */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`${themeCardBg} border rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto`}>
            <div>
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-400" />
                Schedule Broadcast
              </h3>
              <p className={`text-xs ${themeMutedText} mt-1`}>
                Set the delivery date and time for automatic dispatch via Roxie's scheduler.
              </p>
            </div>

            {/* Composition Model Summary */}
            <div className={`p-3 rounded-xl border ${themeBorder} ${themeInnerCardBg} text-xs space-y-1.5`}>
              <div className="flex justify-between items-center pb-1 border-b border-stone-800">
                <span className="text-stone-400">Broadcast Model:</span>
                <span className="text-purple-400 font-bold flex items-center gap-1.5">
                  <activeOption.icon className="w-3.5 h-3.5" />
                  {activeOption.label}
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-stone-300">
                <span className="text-stone-400">Attached Media:</span>
                <span className="truncate max-w-[220px] font-mono">
                  {uploadedMedia ? uploadedMedia.filename : primaryMedia?.url || 'None'}
                </span>
              </div>
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
          <div className={`${themeCardBg} border rounded-2xl max-w-sm w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto`}>
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

      {/* MODAL 4: Fullscreen Preview Dialog */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`${themeCardBg} border rounded-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between border-b border-stone-800/80 pb-3">
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-400" />
                Live Telegram Preview
              </h3>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-stone-400 hover:text-stone-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderTelegramBubble()}
          </div>
        </div>
      )}
    </div>
  );
};
