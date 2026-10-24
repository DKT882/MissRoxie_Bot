import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  RefreshCw, 
  Bot, 
  Menu,
  Code,
  Terminal, 
  Settings, 
  ListChecks, 
  Lock, 
  Activity, 
  Shield, 
  Ban, 
  UserX, 
  AlertTriangle, 
  Smile, 
  Calendar, 
  Flag, 
  Volume2, 
  Search, 
  Download, 
  CheckCircle2, 
  ChevronRight, 
  Users, 
  Layers,
  Database,
  Sliders,
  X,
  MessageSquare,
  Send,
  Radio,
  Sun,
  Moon,
  LogOut,
  Check,
  ArrowLeft,
  Heart,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  Eye,
  Clock,
  SlidersHorizontal,
  ExternalLink,
  Reply,
  Loader2,
  Globe,
  Flame,
  Zap,
  UserCheck,
  UserMinus,
  Settings2,
  Upload,
  Copy,
  FileCode,
  Pin,
  Link2,
  Bookmark
} from 'lucide-react';
import { RichPostComposer, ComposerContentType, ComposerButton, PostButtonStyle } from './components/RichPostComposer';
import { RichMessageEditor, RichMessageConfigData } from './components/RichMessageEditor';
import { MentionAllComposer } from './components/MentionAllComposer';
import { ContentReuseModal, ContentReuseButton, UnifiedContentItem } from './components/ContentReuseModal';

const LIVE_TESTS = [
  { id: 'LIVE-01', title: 'Bot responds to /ping' },
  { id: 'LIVE-02', title: '/help works' },
  { id: 'LIVE-03', title: 'Normal member cannot execute /ban' },
  { id: 'LIVE-04', title: 'Admin can execute /ban' },
  { id: 'LIVE-05', title: 'Admin can execute /kick' },
  { id: 'LIVE-06', title: 'Admin can execute /mute' },
  { id: 'LIVE-07', title: 'Admin can execute /warn' },
  { id: 'LIVE-08', title: '/warnings works' },
  { id: 'LIVE-09', title: '/clear works' },
  { id: 'LIVE-10', title: '/del works' },
  { id: 'LIVE-11', title: '/report works for normal member' },
  { id: 'LIVE-12', title: '/report reaches admins' },
  { id: 'LIVE-13', title: '/links off deletes links' },
  { id: 'LIVE-14', title: '/stickers off deletes stickers' },
  { id: 'LIVE-15', title: '/free bypass works' },
  { id: 'LIVE-16', title: '/lock polls works' },
  { id: 'LIVE-17', title: '/unlock polls works' },
  { id: 'LIVE-18', title: '/flood works' },
  { id: 'LIVE-19', title: '/filter works' },
  { id: 'LIVE-20', title: '/welcome works' },
  { id: 'LIVE-21', title: '/goodbye works' },
  { id: 'LIVE-22', title: '/pin works' },
  { id: 'LIVE-23', title: '/slowmode works' },
  { id: 'LIVE-24', title: '/promote works' },
  { id: 'LIVE-25', title: '/demote works' },
  { id: 'LIVE-26', title: '/permissions UI works' },
  { id: 'LIVE-27', title: 'Anonymous admin works' },
  { id: 'LIVE-28', title: 'Owner cannot be moderated' },
  { id: 'LIVE-29', title: 'Admin cannot moderate another admin' },
  { id: 'LIVE-30', title: 'Self-target protection works' },
  { id: 'LIVE-31', title: 'Bot-target protection works' },
  { id: 'LIVE-32', title: 'Anti-raid triggers correctly' },
  { id: 'LIVE-33', title: 'CAPTCHA appears for new member' },
  { id: 'LIVE-34', title: 'CAPTCHA verification succeeds' },
  { id: 'LIVE-35', title: 'CAPTCHA failure/expiry works' },
  { id: 'LIVE-36', title: '#note shortcut works' },
  { id: 'LIVE-37', title: '/note works' },
  { id: 'LIVE-38', title: '/getnote works' },
  { id: 'LIVE-39', title: '/delnote works' },
  { id: 'LIVE-40', title: '/exportconfig works' },
  { id: 'LIVE-41', title: '/importconfig works' },
  { id: 'LIVE-42', title: 'Scheduled message executes' },
  { id: 'LIVE-43', title: 'Scheduler survives restart' },
  { id: 'LIVE-44', title: 'Multi-group isolation works' },
  { id: 'LIVE-45', title: 'Rate limiter works for normal member' },
  { id: 'LIVE-46', title: 'Admin bypasses rate limiter' },
];

interface ModerationLog {
  id: string;
  chatId: number;
  chatTitle?: string;
  targetUserId?: number;
  targetUsername?: string;
  adminUserId?: number;
  adminUsername?: string;
  action: string;
  reason?: string;
  details?: string;
  timestamp: string;
}

interface GroupInfo {
  chatId: number;
  chatTitle: string;
  chatType: string;
  username?: string;
  memberCount: number;
  status: string;
  botRole?: string;
  protectionStatus?: boolean;
  lustMode?: boolean;
  botLeft?: boolean;
  unavailable?: boolean;
  unavailableReason?: string;
  stats: {
    bans: number;
    kicks: number;
    mutes: number;
    reports: number;
    schedules: number;
  };
  settings: any;
}

interface CommandItem {
  command: string;
  category: string;
  description: string;
  syntax: string;
  example: string;
  permission: string;
  telegramPermission?: string;
  targetType: string;
  isPublic: boolean;
  modifiesState: boolean;
  auditLogged: boolean;
}

interface PrivateChatSummary {
  chatId: number | string;
  userId: number;
  username?: string;
  name?: string;
  language?: string;
  lastUpdated: number;
  messageCount: number;
  lastMessage?: string;
  status?: string;
}

function StickerPreview({
  mediaFileId,
  content,
  isDark = true
}: {
  mediaFileId?: string;
  content?: string;
  isDark?: boolean;
}) {
  const [loadError, setLoadError] = useState(false);
  const isVideo = content?.includes('[Video]');

  if (!mediaFileId || loadError) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${isDark ? 'bg-pink-500/10 text-pink-300 border-pink-500/20' : 'bg-pink-500/10 text-pink-400 border border-pink-500/20'} text-xs font-medium`}>
        <span>{content || '🎨 Sticker'}</span>
      </div>
    );
  }

  const fileUrl = `/api/telegram/file/${encodeURIComponent(mediaFileId)}`;

  return (
    <div className="flex flex-col items-start gap-1 pt-0.5">
      <div className="relative group/sticker rounded-xl overflow-hidden bg-black/5 p-1 border border-white/5">
        {isVideo ? (
          <video
            src={fileUrl}
            autoPlay
            loop
            muted
            playsInline
            onError={() => setLoadError(true)}
            className="w-24 h-24 max-w-[120px] max-h-[120px] object-contain rounded-lg transition-transform duration-200 hover:scale-105"
          />
        ) : (
          <img
            src={fileUrl}
            alt={content || 'Sticker'}
            onError={() => setLoadError(true)}
            loading="lazy"
            className="w-24 h-24 max-w-[120px] max-h-[120px] object-contain rounded-lg transition-transform duration-200 hover:scale-105"
          />
        )}
      </div>
      {content && (
        <span className="text-[10px] text-pink-400/80 font-mono tracking-wide px-1">
          {content.replace('🎨 Sticker', '🎨').trim()}
        </span>
      )}
    </div>
  );
}

export default function App() {
  // Theme state: dark vs light
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('roxie_theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('roxie_theme', next);
    } catch {}
  };

  const isDark = theme === 'dark';

  // Navigation (Default to Groups)
  // Feature 1: Post Library State
  const [savedPostsList, setSavedPostsList] = useState<any[]>([]);
  const [savedPostsLoading, setSavedPostsLoading] = useState<boolean>(false);
  const [postSearch, setPostSearch] = useState<string>('');
  const [postTypeFilter, setPostTypeFilter] = useState<string>('all');
  const [showCreatePostModal, setShowCreatePostModal] = useState<boolean>(false);
  const [showEditPostModal, setShowEditPostModal] = useState<boolean>(false);
  const [editingSavedPost, setEditingSavedPost] = useState<any | null>(null);
  const [previewingSavedPost, setPreviewingSavedPost] = useState<any | null>(null);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [postForm, setPostForm] = useState<{
    title: string;
    contentType: string;
    text: string;
    mediaFileId: string;
    buttonsJson: string;
    pinAfterSend: boolean;
    protectContent: boolean;
  }>({
    title: '',
    contentType: 'text',
    text: '',
    mediaFileId: '',
    buttonsJson: '',
    pinAfterSend: false,
    protectContent: false
  });
  const [postEditorTab, setPostEditorTab] = useState<'edit' | 'preview'>('edit');
  const [postLoadIdInput, setPostLoadIdInput] = useState<string>('');
  const [postLoadIdError, setPostLoadIdError] = useState<string | null>(null);
  const [postButtonsMode, setPostButtonsMode] = useState<'visual' | 'json'>('visual');
  const [postFormButtons, setPostFormButtons] = useState<Array<Array<{ text: string; url: string; style?: 'primary' | 'success' | 'danger' }>>>([]);
  const [newlyCreatedPostBanner, setNewlyCreatedPostBanner] = useState<{ id: string; title: string } | null>(null);
  const [postLoadedMeta, setPostLoadedMeta] = useState<{ type: string; id: string; title: string } | null>(null);
  const [postButtonsJsonError, setPostButtonsJsonError] = useState<string | null>(null);
  const [postLoadLoading, setPostLoadLoading] = useState<boolean>(false);

  // Scheduled Message Content Reuse & Loading by ID State
  const [schedReuseIdInput, setSchedReuseIdInput] = useState<string>('');
  const [schedReuseError, setSchedReuseError] = useState<string | null>(null);
  const [schedReuseLoading, setSchedReuseLoading] = useState<boolean>(false);
  const [schedReuseMode, setSchedReuseMode] = useState<'snapshot' | 'reference'>('snapshot');
  const [schedLoadedMeta, setSchedLoadedMeta] = useState<{ type: string; id: string; title: string; mode: 'snapshot' | 'reference' } | null>(null);

  const [privateNavTab, setPrivateNavTab] = useState<'conversations' | 'recipients' | 'broadcast'>('conversations');

  // Feature 5: Private Chat Recipient Registry State
  const [privateRecipientsList, setPrivateRecipientsList] = useState<any[]>([]);
  const [privateRecipientsStats, setPrivateRecipientsStats] = useState<any | null>(null);
  const [privateRecipientsLoading, setPrivateRecipientsLoading] = useState<boolean>(false);
  const [recipientFilterStatus, setRecipientFilterStatus] = useState<string>('all');
  const [recipientSearch, setRecipientSearch] = useState<string>('');

  // Feature 3: Desktop Sticker Copy Modal State
  const [showDesktopStickerCopyModal, setShowDesktopStickerCopyModal] = useState<boolean>(false);
  const [desktopCopySourceGroupId, setDesktopCopySourceGroupId] = useState<string>('');
  const [desktopCopyDestGroupId, setDesktopCopyDestGroupId] = useState<string>('');
  const [desktopCopySelectedPacks, setDesktopCopySelectedPacks] = useState<string[]>([]);
  const [desktopCopyResults, setDesktopCopyResults] = useState<any[] | null>(null);
  const [desktopCopying, setDesktopCopying] = useState<boolean>(false);

  // Auto-fetch for Post Library and Private Recipients on tab switch
  const fetchSavedPosts = useCallback(async (q = postSearch, type = postTypeFilter) => {
    setSavedPostsLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('search', q);
      if (type && type !== 'all') params.set('type', type);
      const res = await deduplicatedFetch(`/api/dashboard/posts/library?${params.toString()}`);
      if (res && res.ok) {
        const data = await res.json();
        if (data && data.posts) {
          setSavedPostsList(data.posts);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch saved posts', err);
    } finally {
      setSavedPostsLoading(false);
    }
  }, [postSearch, postTypeFilter]);

  const fetchPrivateRecipients = useCallback(async (status = recipientFilterStatus, q = recipientSearch) => {
    setPrivateRecipientsLoading(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== 'all') params.set('status', status);
      if (q) params.set('search', q);
      const res = await deduplicatedFetch(`/api/dashboard/private-recipients?${params.toString()}`);
      if (res && res.ok) {
        const data = await res.json();
        if (data) {
          if (Array.isArray(data.recipients)) setPrivateRecipientsList(data.recipients);
          if (data.stats) setPrivateRecipientsStats(data.stats);
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch private recipients', err);
    } finally {
      setPrivateRecipientsLoading(false);
    }
  }, [recipientFilterStatus, recipientSearch]);



  const handleCopyPostId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedPostId(id);
    setTimeout(() => setCopiedPostId(null), 2500);
  };

  const handleCreateSavedPostSubmit = async () => {
    if (!postForm.title.trim()) return;
    try {
      validatePostMedia();
      const parsedButtons = getCleanedPostButtons();

      const res = await fetch('/api/dashboard/posts/library', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: postForm.title.trim(),
          contentType: postForm.contentType,
          text: postForm.text,
          mediaFileId: postForm.mediaFileId.trim() || undefined,
          buttons: parsedButtons,
          pinAfterSend: postForm.pinAfterSend,
          protectContent: postForm.protectContent
        })
      });
      const data = await res.json();
      if (res.ok && data.post) {
        setShowCreatePostModal(false);
        setNewlyCreatedPostBanner({ id: data.post.id, title: data.post.title || data.post.id });
        setPostForm({ title: '', contentType: 'text', text: '', mediaFileId: '', buttonsJson: '', pinAfterSend: false, protectContent: false });
        setPostFormButtons([]);
        setPostLoadedMeta(null);
        fetchSavedPosts();
      } else {
        alert(data.error || 'Failed to create post');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getCleanedPostButtons = () => {
    if (postButtonsMode === 'visual') {
      const cleaned = postFormButtons
        .map(row => (Array.isArray(row) ? row : []).filter(b => b && typeof b.text === 'string' && b.text.trim().length > 0))
        .filter(row => row.length > 0);

      for (let r = 0; r < cleaned.length; r++) {
        const row = cleaned[r];
        for (let b = 0; b < row.length; b++) {
          const btn = row[b];
          const u = (btn.url || '').trim();
          if (!u.startsWith('http://') && !u.startsWith('https://')) {
            throw new Error(`Row ${r + 1}, Button "${btn.text}": Destination URL must start with http:// or https://`);
          }
        }
      }
      return cleaned.length > 0 ? cleaned : undefined;
    } else if (postForm.buttonsJson.trim()) {
      try {
        const parsed = JSON.parse(postForm.buttonsJson);
        if (!Array.isArray(parsed)) throw new Error('Buttons JSON must be an array of button rows: [[{ "text": "...", "url": "..." }]]');
        const validated: Array<Array<{ text: string; url: string; style?: 'primary' | 'success' | 'danger' }>> = [];
        for (let r = 0; r < parsed.length; r++) {
          const row = parsed[r];
          if (!Array.isArray(row)) throw new Error(`Row ${r + 1} must be an array of buttons.`);
          const validatedRow: Array<{ text: string; url: string; style?: 'primary' | 'success' | 'danger' }> = [];
          for (let b = 0; b < row.length; b++) {
            const btn = row[b];
            if (!btn || typeof btn !== 'object') throw new Error(`Row ${r + 1}, Button ${b + 1} is invalid.`);
            const text = String(btn.text || '').trim();
            const url = String(btn.url || '').trim();
            if (!text) throw new Error(`Row ${r + 1}, Button ${b + 1}: Label text cannot be empty.`);
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              throw new Error(`Row ${r + 1}, Button "${text}": URL must start with http:// or https://`);
            }
            const item: { text: string; url: string; style?: 'primary' | 'success' | 'danger' } = { text, url };
            if (btn.style && ['primary', 'success', 'danger'].includes(btn.style)) {
              item.style = btn.style;
            }
            validatedRow.push(item);
          }
          if (validatedRow.length > 0) validated.push(validatedRow);
        }
        return validated.length > 0 ? validated : undefined;
      } catch (err: any) {
        throw new Error(err.message || 'Invalid JSON format for inline buttons');
      }
    }
    return undefined;
  };

  const validatePostMedia = () => {
    if (postForm.contentType !== 'text') {
      const m = postForm.mediaFileId.trim();
      if (!m) {
        throw new Error(`Media URL or Telegram file_id is required for ${postForm.contentType} posts.`);
      }
      if (m.startsWith('http://') || m.startsWith('https://')) {
        try {
          const parsed = new URL(m);
          if (!parsed.hostname || !parsed.hostname.includes('.')) {
            throw new Error('Media URL must contain a valid domain (e.g. https://example.com/media.jpg).');
          }
        } catch (e: any) {
          throw new Error(e.message || 'Malformed media URL address.');
        }
      } else if (m.length < 5 || m.includes(' ') || m.includes('\\')) {
        throw new Error('Invalid Telegram file_id format. File IDs cannot contain spaces or invalid characters.');
      }
    }
  };

  const handleOpenCreatePost = () => {
    setEditingSavedPost(null);
    setPostLoadedMeta(null);
    setPostButtonsJsonError(null);
    setPostLoadLoading(false);
    setPostForm({
      title: '',
      contentType: 'text',
      text: '',
      mediaFileId: '',
      buttonsJson: '',
      pinAfterSend: false,
      protectContent: false
    });
    setPostFormButtons([]);
    setPostButtonsMode('visual');
    setPostEditorTab('edit');
    setPostLoadIdInput('');
    setPostLoadIdError(null);
    setShowCreatePostModal(true);
  };

  const handleOpenEditSavedPost = (p: any) => {
    setEditingSavedPost(p);
    setPostLoadedMeta(null);
    setPostButtonsJsonError(null);
    setPostLoadLoading(false);
    const btns = Array.isArray(p.buttons) ? p.buttons : [];
    setPostFormButtons(btns);
    setPostButtonsMode('visual');
    setPostForm({
      title: p.title || '',
      contentType: p.contentType || 'text',
      text: p.text || p.content || '',
      mediaFileId: p.mediaFileId || '',
      buttonsJson: btns.length > 0 ? JSON.stringify(btns, null, 2) : '',
      pinAfterSend: Boolean(p.pinAfterSend),
      protectContent: Boolean(p.protectContent)
    });
    setPostEditorTab('edit');
    setPostLoadIdInput('');
    setPostLoadIdError(null);
    setShowEditPostModal(true);
  };

  const handleAddPostButtonRow = () => {
    setPostFormButtons(prev => [...prev, [{ text: '', url: '', style: undefined }]]);
  };
  const handleAddPostButtonToRow = (rowIndex: number) => {
    setPostFormButtons(prev => {
      const copy = [...prev];
      copy[rowIndex] = [...copy[rowIndex], { text: '', url: '', style: undefined }];
      return copy;
    });
  };
  const handleRemovePostButton = (rowIndex: number, btnIndex: number) => {
    setPostFormButtons(prev => {
      const copy = [...prev];
      copy[rowIndex] = copy[rowIndex].filter((_, i) => i !== btnIndex);
      return copy.filter(row => row.length > 0);
    });
  };
  const handleRemovePostButtonRow = (rowIndex: number) => {
    setPostFormButtons(prev => prev.filter((_, i) => i !== rowIndex));
  };
  const handleUpdatePostButton = (rowIndex: number, btnIndex: number, field: 'text' | 'url' | 'style', val: any) => {
    setPostFormButtons(prev => {
      const copy = [...prev];
      copy[rowIndex] = copy[rowIndex].map((btn, i) => i === btnIndex ? { ...btn, [field]: val ? val : undefined } : btn);
      return copy;
    });
  };

  const handleSwitchPostButtonsMode = (newMode: 'visual' | 'json') => {
    if (newMode === 'json') {
      setPostButtonsJsonError(null);
      setPostForm(prev => ({
        ...prev,
        buttonsJson: postFormButtons.length > 0 ? JSON.stringify(postFormButtons, null, 2) : ''
      }));
      setPostButtonsMode('json');
    } else {
      const rawJson = (postForm.buttonsJson || '').trim();
      if (!rawJson) {
        setPostFormButtons([]);
        setPostButtonsJsonError(null);
        setPostButtonsMode('visual');
        return;
      }
      try {
        const parsed = JSON.parse(rawJson);
        if (!Array.isArray(parsed)) {
          throw new Error('Buttons must be an array of rows: [[{ "text": "...", "url": "..." }]]');
        }
        const validated: Array<Array<{ text: string; url: string; style?: 'primary' | 'success' | 'danger' }>> = [];
        for (let r = 0; r < parsed.length; r++) {
          const row = parsed[r];
          if (!Array.isArray(row)) {
            throw new Error(`Row ${r + 1} must be an array of button objects.`);
          }
          const validatedRow: Array<{ text: string; url: string; style?: 'primary' | 'success' | 'danger' }> = [];
          for (let b = 0; b < row.length; b++) {
            const btn = row[b];
            if (!btn || typeof btn !== 'object') {
              throw new Error(`Row ${r + 1}, Button ${b + 1} is invalid.`);
            }
            const text = String(btn.text || '').trim();
            const url = String(btn.url || '').trim();
            if (!text) {
              throw new Error(`Row ${r + 1}, Button ${b + 1}: Label text cannot be empty.`);
            }
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              throw new Error(`Row ${r + 1}, Button "${text}": URL must start with http:// or https://`);
            }
            const item: { text: string; url: string; style?: 'primary' | 'success' | 'danger' } = { text, url };
            if (btn.style && ['primary', 'success', 'danger'].includes(btn.style)) {
              item.style = btn.style;
            }
            validatedRow.push(item);
          }
          if (validatedRow.length > 0) validated.push(validatedRow);
        }
        setPostFormButtons(validated);
        setPostButtonsJsonError(null);
        setPostButtonsMode('visual');
      } catch (err: any) {
        setPostButtonsJsonError(err.message || 'Malformed JSON format for inline buttons.');
      }
    }
  };

  const handleLoadPostById = async () => {
    const raw = postLoadIdInput.trim();
    if (!raw) {
      setPostLoadIdError('Please enter a content ID or reference (e.g. POST-XXXXX or {{post:...}}).');
      return;
    }
    setPostLoadIdError(null);
    let searchId = raw;
    const match = raw.match(/\{\{(?:item|post|schedule|template):([A-Za-z0-9_-]+)\}\}/i);
    if (match) searchId = match[1];

    setPostLoadLoading(true);
    try {
      const res = await deduplicatedFetch(`/api/dashboard/content-items/${encodeURIComponent(searchId)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Content item "${searchId}" not found.`);
      }
      const data = await res.json();
      const item = data.item;
      if (item) {
        setPostLoadedMeta({
          type: item.type,
          id: item.id,
          title: item.title || item.id
        });
        setPostForm(prev => ({
          ...prev,
          title: item.title ? (editingSavedPost ? prev.title : `${item.title} (Loaded)`) : prev.title,
          contentType: item.contentType || 'text',
          text: item.text || '',
          mediaFileId: item.mediaFileId || '',
          pinAfterSend: Boolean(item.options?.pinAfterSend),
          protectContent: Boolean(item.options?.protectContent)
        }));
        const loadedBtns = Array.isArray(item.buttons) ? item.buttons : [];
        setPostFormButtons(loadedBtns);
        setPostForm(prev => ({
          ...prev,
          buttonsJson: loadedBtns.length > 0 ? JSON.stringify(loadedBtns, null, 2) : ''
        }));
        setPostLoadIdInput('');
      }
    } catch (err: any) {
      setPostLoadIdError(err.message || 'Failed to load content item.');
    } finally {
      setPostLoadLoading(false);
    }
  };

  const handleUpdateSavedPostSubmit = async () => {
    if (!editingSavedPost || !postForm.title.trim()) return;
    try {
      validatePostMedia();
      const parsedButtons = getCleanedPostButtons();

      const res = await fetch(`/api/dashboard/posts/library/${editingSavedPost.id}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: postForm.title.trim(),
          contentType: postForm.contentType,
          text: postForm.text,
          mediaFileId: postForm.mediaFileId.trim() || undefined,
          buttons: parsedButtons,
          pinAfterSend: postForm.pinAfterSend,
          protectContent: postForm.protectContent
        })
      });
      const data = await res.json();
      if (res.ok && data.post) {
        setShowEditPostModal(false);
        setEditingSavedPost(null);
        setPostLoadedMeta(null);
        fetchSavedPosts();
      } else {
        alert(data.error || 'Failed to update post');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDuplicateSavedPost = async (id: string) => {
    try {
      const res = await fetch(`/api/dashboard/posts/library/${id}/duplicate`, {
        method: 'POST',
        credentials: 'same-origin'
      });
      if (res.ok) {
        fetchSavedPosts();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteSavedPost = async (id: string, title: string) => {
    // Check for dependent schedules or templates first
    try {
      const depRes = await fetch(`/api/dashboard/posts/library/${encodeURIComponent(id)}/dependents`);
      if (depRes.ok) {
        const depData = await depRes.json();
        if (depData.dependents && depData.dependents.length > 0) {
          const list = depData.dependents.map((d: any) => `• [${d.type.toUpperCase()}] ${d.title} (ID: ${d.id})`).join('\n');
          const proceed = confirm(
            `⚠️ Warning: Saved post "${title}" (${id}) is actively used by ${depData.dependents.length} schedule(s) or template(s):\n\n${list}\n\nDeleting this post may break these schedules. Are you sure you want to force-delete this post?`
          );
          if (!proceed) return;

          const delRes = await fetch(`/api/dashboard/posts/library/${encodeURIComponent(id)}?force=true`, {
            method: 'DELETE',
            credentials: 'same-origin'
          });
          if (delRes.ok) {
            fetchSavedPosts();
          } else {
            const errData = await delRes.json().catch(() => ({}));
            alert(errData.error || 'Failed to delete saved post');
          }
          return;
        }
      }
    } catch {}

    if (!confirm(`Are you sure you want to delete saved post "${title}" (${id})?`)) return;
    try {
      const res = await fetch(`/api/dashboard/posts/library/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      if (res.ok) {
        fetchSavedPosts();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Failed to delete saved post');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleRecipientOptOut = async (chatId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'opted_out' ? 'active' : 'opted_out';
    try {
      const res = await fetch(`/api/dashboard/private-recipients/${chatId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        fetchPrivateRecipients();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteRecipient = async (chatId: number) => {
    if (!confirm(`Remove recipient ${chatId} from registry?`)) return;
    try {
      const res = await fetch(`/api/dashboard/private-recipients/${chatId}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      if (res.ok) {
        fetchPrivateRecipients();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleOpenDesktopStickerCopy = (sourceChatId?: number) => {
    const active = groups.filter(g => !g.botLeft);
    if (active.length < 2) {
      alert('You need at least 2 active connected groups to copy sticker packs between them.');
      return;
    }
    const src = sourceChatId ? String(sourceChatId) : String(active[0].chatId);
    const dst = active.find(g => String(g.chatId) !== src) ? String(active.find(g => String(g.chatId) !== src)!.chatId) : String(active[1].chatId);
    setDesktopCopySourceGroupId(src);
    setDesktopCopyDestGroupId(dst);
    setDesktopCopySelectedPacks([]);
    setDesktopCopyResults(null);
    setShowDesktopStickerCopyModal(true);
  };

  const handleExecuteDesktopStickerCopy = async () => {
    if (!desktopCopySourceGroupId || !desktopCopyDestGroupId || desktopCopySelectedPacks.length === 0) {
      alert('Please select source group, destination group, and at least one pack to copy.');
      return;
    }
    setDesktopCopying(true);
    try {
      const res = await fetch(`/api/dashboard/groups/${desktopCopyDestGroupId}/stickers/packs/copy`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceChatId: Number(desktopCopySourceGroupId),
          packNames: desktopCopySelectedPacks
        })
      });
      const data = await res.json();
      if (res.ok && data.results) {
        setDesktopCopyResults(data.results);
      } else {
        alert(data.error || 'Failed to copy sticker packs');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDesktopCopying(false);
    }
  };

  const [activeNav, setActiveNav] = useState<string>('groups');

  useEffect(() => {
    if (activeNav === 'post-library') {
      fetchSavedPosts();
    } else if (activeNav === 'private-recipients' || (activeNav === 'private-chats' && privateNavTab === 'recipients')) {
      fetchPrivateRecipients();
    }
  }, [activeNav, privateNavTab, fetchSavedPosts, fetchPrivateRecipients]);
  const [broadcastSubTab, setBroadcastSubTab] = useState<'standard' | 'mention-all'>('standard');
  const [selectedChatId, setSelectedChatId] = useState<number | 'all'>('all');
  const [activeGroupDetailId, setActiveGroupDetailId] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  // Auto-scroll to top on view changes (tab switch or group detail toggle)
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeNav, activeGroupDetailId]);

  // Unified single-view tab navigation handler
  const handleNavSelect = useCallback((navId: string) => {
    if (navId === 'private-recipients') {
      setActiveNav('private-chats');
      setPrivateNavTab('recipients');
    } else {
      setActiveNav(navId);
    }
    setActiveGroupDetailId(null);
    setMobileMenuOpen(false);
  }, []);
  const [groupDetailTab, setGroupDetailTab] = useState<
    | 'overview'
    | 'welcome_dm'
    | 'welcome_goodbye'
    | 'rich_post'
    | 'mention_all'
    | 'general'
    | 'moderation'
    | 'content_protection'
    | 'ai_conversation'
    | 'lust_mode'
    | 'stickers'
    | 'auto_engine'
    | 'auto_response'
    | 'auto_sticker'
    | 'slowmode'
    | 'abuse_words'
    | 'members'
    | 'moderators'
    | 'telegram_permissions'
    | 'commands'
    | 'messages'
    | 'activity'
    | 'danger_zone'
    | 'backup'
    | 'settings'
    | 'permissions'
    | 'schedules'
  >('overview');

  // Scheduled Messages & Rules State
  const [schedulesList, setSchedulesList] = useState<any[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState<boolean>(false);
  const [schedulesFilterChatId, setSchedulesFilterChatId] = useState<number | 'all'>('all');
  const [showCreateScheduleModal, setShowCreateScheduleModal] = useState<boolean>(false);
  const [showCopyScheduleFromIdModal, setShowCopyScheduleFromIdModal] = useState<boolean>(false);
  const [copyFromIdInput, setCopyFromIdInput] = useState<string>('');
  const [copyFromIdError, setCopyFromIdError] = useState<string | null>(null);
  const [copiedScheduleId, setCopiedScheduleId] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<any | null>(null);
  const [copyScheduleModal, setCopyScheduleModal] = useState<{
    isOpen: boolean;
    schedule: any;
    command: string;
    jsonConfig: any;
    copiedField: 'command' | 'json' | null;
  } | null>(null);
  const [scheduleFormError, setScheduleFormError] = useState<string | null>(null);
  const [scheduleNotification, setScheduleNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [newScheduleForm, setNewScheduleForm] = useState<{
    chatId: number | string;
    name: string;
    message: string;
    scheduleType: 'one_time' | 'daily' | 'weekly' | 'interval' | 'custom';
    intervalStr: string;
    nextRunDate: string;
    nextRunTime: string;
    timezone: string;
    contentType: string;
    mediaFileId: string;
    replyToMessageId: string;
    enabled: boolean;
    pinAfterSend: boolean;
    replyToLatest: boolean;
    autoDeletePrevious: boolean;
    triggerKeyword: string;
    inlineKeyboard: Array<Array<{ text: string; url: string; style?: 'primary' | 'success' | 'danger' }>>;
  }>({
    chatId: '',
    name: '',
    message: '',
    scheduleType: 'interval',
    intervalStr: '1h',
    nextRunDate: new Date().toISOString().split('T')[0],
    nextRunTime: '12:00',
    timezone: 'UTC',
    contentType: 'text',
    mediaFileId: '',
    replyToMessageId: '',
    enabled: true,
    pinAfterSend: false,
    replyToLatest: false,
    autoDeletePrevious: false,
    triggerKeyword: '',
    inlineKeyboard: []
  });

  // Group Automations State
  const [groupAutomationsList, setGroupAutomationsList] = useState<any[]>([]);
  const [automationsLoading, setAutomationsLoading] = useState<boolean>(false);
  const [showCreateAutomationModal, setShowCreateAutomationModal] = useState<boolean>(false);
  const [newAutomationForm, setNewAutomationForm] = useState<{
    trigger: string;
    action: string;
    parameters: string;
    enabled: boolean;
  }>({
    trigger: 'spam_detected',
    action: 'delete_message',
    parameters: '',
    enabled: true
  });

  // Global Settings state
  const [globalSettings, setGlobalSettings] = useState<any>({
    botEnabled: true,
    aiConversationEnabled: true,
    globalModerationEnabled: true,
    globalStickersEnabled: true,
    globalAutoResponseEnabled: true,
    globalAutoStickerEnabled: true,
    globalLustModeAvailable: true,
    globalLoggingEnabled: true,
    maintenanceMode: false
  });
  const [savingGlobal, setSavingGlobal] = useState<boolean>(false);

  // Backup & Restore states
  const [backupEditorJson, setBackupEditorJson] = useState<string>('');
  const [backupEditorError, setBackupEditorError] = useState<string | null>(null);
  const [backupEditorSuccess, setBackupEditorSuccess] = useState<string | null>(null);
  const [backupImportJson, setBackupImportJson] = useState<string>('');
  const [backupImportSelectedSections, setBackupImportSelectedSections] = useState<string[]>([
    'settings', 'welcome', 'moderation', 'contentProtection', 'abuseWords',
    'stickers', 'lustMode', 'autoResponse', 'autoSticker', 'slowmode',
    'personality', 'schedules', 'notes'
  ]);
  const [backupOverrideChatId, setBackupOverrideChatId] = useState<boolean>(false);
  const [backupDiffPreview, setBackupDiffPreview] = useState<any | null>(null);
  const [backupHistoryList, setBackupHistoryList] = useState<any[]>([]);
  const [backupNotification, setBackupNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [backupLoading, setBackupLoading] = useState<boolean>(false);
  const [copiedJsonToast, setCopiedJsonToast] = useState<boolean>(false);
  const [botBackupJson, setBotBackupJson] = useState<string>('');
  const [botBackupNotification, setBotBackupNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [botBackupLoading, setBotBackupLoading] = useState<boolean>(false);

  // Group Full Management States
  const [groupAbuseWords, setGroupAbuseWords] = useState<string[]>([]);
  const [newAbuseWordInput, setNewAbuseWordInput] = useState<string>('');
  const [abuseSearch, setAbuseSearch] = useState<string>('');
  const [debouncedAbuseSearch, setDebouncedAbuseSearch] = useState<string>('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAbuseSearch(abuseSearch), 400);
    return () => clearTimeout(t);
  }, [abuseSearch]);

  const [groupMembersList, setGroupMembersList] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState<string>('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMemberSearch(memberSearch), 400);
    return () => clearTimeout(t);
  }, [memberSearch]);
  const [groupLustUsers, setGroupLustUsers] = useState<any[]>([]);
  const [slowmodeInput, setSlowmodeInput] = useState<number>(0);
  const [slowmodeFeedback, setSlowmodeFeedback] = useState<string | null>(null);
  const [applyingSlowmode, setApplyingSlowmode] = useState<boolean>(false);
  const [memberActionLoading, setMemberActionLoading] = useState<Record<string, boolean>>({});
  const [memberActionFeedback, setMemberActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dangerConfirmInput, setDangerConfirmInput] = useState<string>('');
  const [dangerModal, setDangerModal] = useState<'reset_settings' | 'clear_memory' | 'clear_stickers' | 'clear_abuse' | null>(null);
  const [executingDangerAction, setExecutingDangerAction] = useState<boolean>(false);

  // Core Data states
  const [overview, setOverview] = useState<any | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupDetails, setGroupDetails] = useState<any | null>(null);
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [privateChats, setPrivateChats] = useState<PrivateChatSummary[]>([]);
  const [activePrivateChatId, setActivePrivateChatId] = useState<number | string | null>(null);
  const [conversationSearch, setConversationSearch] = useState<string>('');
  const [privateChatMessages, setPrivateChatMessages] = useState<any[]>([]);
  const [privateReplyText, setPrivateReplyText] = useState<string>('');
  const [sendingPrivateReply, setSendingPrivateReply] = useState<boolean>(false);

  // Group moderators & permissions & stickers
  const [groupModerators, setGroupModerators] = useState<any | null>(null);
  const [groupPermissionsData, setGroupPermissionsData] = useState<any | null>(null);
  const [groupStickersData, setGroupStickersData] = useState<any | null>(null);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Sticker Pack Management Modals
  const [showAddPackModal, setShowAddPackModal] = useState<boolean>(false);
  const [newPackInput, setNewPackInput] = useState<string>('');
  const [addingPack, setAddingPack] = useState<boolean>(false);
  const [addPackError, setAddPackError] = useState<string | null>(null);
  const [previewPack, setPreviewPack] = useState<any | null>(null);
  const [removePackModal, setRemovePackModal] = useState<any | null>(null);
  const [removingPack, setRemovingPack] = useState<boolean>(false);

  // Welcome & Goodbye State in Group Details
  const [welcomeGoodbyeSubTab, setWelcomeGoodbyeSubTab] = useState<'group_welcome' | 'group_goodbye' | 'welcome_dm'>('group_welcome');
  const [groupWelcomeConfig, setGroupWelcomeConfig] = useState<RichMessageConfigData>({
    enabled: false,
    mode: 'simple',
    contentType: 'text',
    text: '👋 Welcome {user} to {groupname}!'
  });
  const [groupGoodbyeConfig, setGroupGoodbyeConfig] = useState<RichMessageConfigData>({
    enabled: false,
    mode: 'simple',
    contentType: 'text',
    text: '👋 Goodbye {user}, we will miss you!'
  });
  const [welcomeDmConfig, setWelcomeDmConfig] = useState<RichMessageConfigData>({
    enabled: false,
    mode: 'simple',
    contentType: 'text',
    text: 'You joined {groupname} 🎉'
  });
  const [welcomeGoodbyeSaving, setWelcomeGoodbyeSaving] = useState<boolean>(false);
  const [welcomeGoodbyeTesting, setWelcomeGoodbyeTesting] = useState<boolean>(false);
  const [welcomeGoodbyeNotification, setWelcomeGoodbyeNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Private Chat Inner Sub-tab (Conversation vs Rich Post)
  const [privateChatSubTab, setPrivateChatSubTab] = useState<'chat' | 'rich_post'>('chat');

  // Send Message Modal / Action
  const [sendTargetType, setSendTargetType] = useState<'group' | 'private'>('group');
  const [sendTargetId, setSendTargetId] = useState<string>('');
  const [sendMessageContent, setSendMessageContent] = useState<string>('');
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);
  const [sendResult, setSendResult] = useState<any | null>(null);

  // Group Messages Direct Composer & Reply-to-User State
  const [groupComposerText, setGroupComposerText] = useState<string>('');
  const [groupReplyTarget, setGroupReplyTarget] = useState<any | null>(null);
  const [sendingGroupMessage, setSendingGroupMessage] = useState<boolean>(false);
  const [groupMessageFeedback, setGroupMessageFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Broadcast Action
  const [broadcastSelectedGroups, setBroadcastSelectedGroups] = useState<number[]>([]);
  const [broadcastContent, setBroadcastContent] = useState<string>('');
  const [broadcasting, setBroadcasting] = useState<boolean>(false);
  const [broadcastResult, setBroadcastResult] = useState<any | null>(null);
  const [showBroadcastConfirm, setShowBroadcastConfirm] = useState<boolean>(false);

  // Leave Group Modal
  const [leaveModalGroup, setLeaveModalGroup] = useState<GroupInfo | null>(null);
  const [leaveConfirmInput, setLeaveConfirmInput] = useState<string>('');
  const [leavingGroup, setLeavingGroup] = useState<boolean>(false);

  // Remove from Dashboard Modal
  const [removeDashboardModalGroup, setRemoveDashboardModalGroup] = useState<GroupInfo | null>(null);
  const [removingFromDashboard, setRemovingFromDashboard] = useState<boolean>(false);

  // Search & Filters (Debounced 400ms)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [dateFilter, setDateFilter] = useState<string>('24h');
  const [logFilterType, setLogFilterType] = useState<string>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<ModerationLog | null>(null);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<any | null>(null);
  const [healthData, setHealthData] = useState<any | null>(null);
  
  // Stickers View Filter
  const [stickerTab, setStickerTab] = useState<'all' | 'custom' | 'lust' | 'default'>('all');
  const [globalStickersData, setGlobalStickersData] = useState<any | null>(null);

  // Autosave Debounce & Batching Engine (1500ms)
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const pendingSettingsBatchRef = useRef<Record<string, any>>({});
  const settingsDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const settingsSaveStatusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSettingsSentTimestampRef = useRef<number>(0);

  // Enterprise Operator Authentication State
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [session, setSession] = useState<{ sessionId: string; username: string; role: string; expiresAt?: number } | null>(null);
  const [operator, setOperator] = useState<{ id?: string; username: string; name?: string; role: string } | null>(null);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginUsername, setLoginUsername] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState<boolean>(false);

  useEffect(() => {
    const savedSessionId = localStorage.getItem('roxie_session_id');
    const authHeaders: Record<string, string> = {};
    if (savedSessionId) {
      authHeaders['x-session-id'] = savedSessionId;
      authHeaders['Authorization'] = `Bearer ${savedSessionId}`;
    }

    fetch('/api/auth/session', {
      credentials: 'same-origin',
      headers: authHeaders
    })
      .then(res => res.json())
      .then(data => {
        if (data?.authenticated && data?.session) {
          setSession(data.session);
          setOperator(data.operator || { username: data.session.username, role: data.session.role });
          localStorage.setItem('roxie_session_id', data.session.sessionId);
        } else {
          localStorage.removeItem('roxie_session_id');
          setSession(null);
          setOperator(null);
        }
      })
      .catch(() => {
        localStorage.removeItem('roxie_session_id');
        setSession(null);
        setOperator(null);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('Username and password are required');
      return;
    }
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword })
      });
      const data = await res.json();
      if (res.ok && data.session) {
        localStorage.setItem('roxie_session_id', data.session.sessionId);
        setSession(data.session);
        setOperator(data.operator || { username: data.session.username, role: data.session.role });
        setShowLoginModal(false);
        setLoginPassword('');
        setLoginError(null);
      } else {
        setLoginError(data.error || 'Invalid credentials');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login request failed. Server unreachable.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    const savedSessionId = localStorage.getItem('roxie_session_id') || session?.sessionId;
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': savedSessionId || '',
          'Authorization': `Bearer ${savedSessionId || ''}`
        },
        body: JSON.stringify({ sessionId: savedSessionId })
      });
    } catch {}
    localStorage.removeItem('roxie_session_id');
    setSession(null);
    setOperator(null);
  };

  // In-flight GET request deduplication cache
  const inFlightGetMap = useRef<Map<string, Promise<any>>>(new Map());

  const deduplicatedFetch = async (url: string, options?: RequestInit): Promise<Response> => {
    const sessionToken = localStorage.getItem('roxie_session_id') || session?.sessionId;
    const authHeaders: Record<string, string> = {};
    if (sessionToken) {
      authHeaders['x-session-id'] = sessionToken;
      authHeaders['Authorization'] = `Bearer ${sessionToken}`;
    }
    const mergedOptions: RequestInit = {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...authHeaders,
        ...(options?.headers || {})
      }
    };
    if (mergedOptions && mergedOptions.method && mergedOptions.method !== 'GET') {
      const res = await fetch(url, mergedOptions);
      if (res.status === 401 && !url.includes('/api/auth/')) {
        localStorage.removeItem('roxie_session_id');
        setSession(null);
        setOperator(null);
      }
      return res;
    }
    if (inFlightGetMap.current.has(url)) {
      return inFlightGetMap.current.get(url)!;
    }
    const promise = (async () => {
      try {
        const res = await fetch(url, mergedOptions);
        if (res.status === 401 && !url.includes('/api/auth/')) {
          localStorage.removeItem('roxie_session_id');
          setSession(null);
          setOperator(null);
        }
        return res;
      } finally {
        inFlightGetMap.current.delete(url);
      }
    })();
    inFlightGetMap.current.set(url, promise);
    return promise;
  };

  // Live checklist
  const [liveTestStatus, setLiveTestStatus] = useState<Record<string, 'NOT TESTED' | 'PASS' | 'FAIL'>>(() => {
    try {
      const saved = localStorage.getItem('roxie_live_test_status');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const updateTestStatus = (testId: string, status: 'NOT TESTED' | 'PASS' | 'FAIL') => {
    const updated = { ...liveTestStatus, [testId]: status };
    setLiveTestStatus(updated);
    try {
      localStorage.setItem('roxie_live_test_status', JSON.stringify(updated));
    } catch {}
  };

  // Active target group ID ref to guard against race conditions when switching groups
  const activeTargetIdRef = useRef<number | string | null>(null);
  const lastFetchedGroupIdRef = useRef<number | string | null>(null);

  // Group Details On-Demand Data Fetcher (fullReload: true for initial/manual load, false for lightweight 30s background sync)
  const fetchGroupDetailsData = useCallback(async (targetDetailId: number | string, fullReload: boolean = true, activeTab?: string) => {
    try {
      const numChatId = Number(targetDetailId);
      const reqTargetIdStr = String(targetDetailId);

      // Build targeted request set: always include core group details; if background sync, only include the active sub-tab
      const requests: { key: string; promise: Promise<any> }[] = [
        { key: 'details', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}`) }
      ];

      if (fullReload || activeTab === 'moderators') {
        requests.push({ key: 'moderators', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/moderators`) });
      }
      if (fullReload || activeTab === 'permissions' || activeTab === 'telegram_permissions') {
        requests.push({ key: 'permissions', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/permissions`) });
      }
      if (fullReload || activeTab === 'stickers') {
        requests.push({ key: 'stickers', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/stickers`) });
      }
      if (fullReload || activeTab === 'abuse_words') {
        requests.push({ key: 'abuse_words', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/abuse-words`) });
      }
      if (fullReload || activeTab === 'members') {
        requests.push({ key: 'members', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/members`) });
      }
      if (fullReload || activeTab === 'lust') {
        requests.push({ key: 'lust_users', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/lust/users`) });
      }
      if (fullReload || activeTab === 'backups' || activeTab === 'backup') {
        requests.push({ key: 'backups', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/backup/history`) });
      }
      if (fullReload || activeTab === 'automations') {
        requests.push({ key: 'automations', promise: deduplicatedFetch(`/api/dashboard/groups/${targetDetailId}/automations`) });
      }

      const results = await Promise.allSettled(requests.map(r => r.promise));

      // Guard: If user navigated away from this group while requests were in flight, discard response
      if (activeTargetIdRef.current !== null && String(activeTargetIdRef.current) !== reqTargetIdStr) {
        return;
      }

      const resultMap: Record<string, PromiseSettledResult<any>> = {};
      requests.forEach((req, idx) => {
        resultMap[req.key] = results[idx];
      });

      const detailResult = resultMap['details'];
      const modsResult = resultMap['moderators'];
      const permsResult = resultMap['permissions'];
      const groupStickersResult = resultMap['stickers'];
      const abuseResult = resultMap['abuse_words'];
      const membersResult = resultMap['members'];
      const lustUsersResult = resultMap['lust_users'];
      const historyResult = resultMap['backups'];
      const autoResult = resultMap['automations'];

      if (autoResult && autoResult.status === 'fulfilled' && autoResult.value.ok) {
        try {
          const aData = await autoResult.value.json();
          setGroupAutomationsList(aData.automations || []);
        } catch {}
      }

      if (detailResult && detailResult.status === 'fulfilled' && detailResult.value.ok) {
        try {
          const dData = await detailResult.value.json();
          setGroupDetails(dData);
          if (dData.settings?.slowModeSeconds !== undefined) {
            setSlowmodeInput(dData.settings.slowModeSeconds);
          }
        } catch {}
      } else if (fullReload) {
        // If the group detail endpoint returned an error or is missing, synthesize a safe default object from existing groups
        setGroupDetails(prev => (prev && prev.chatId === numChatId) ? prev : {
          chatId: numChatId,
          chatTitle: `Group ${targetDetailId}`,
          settings: {},
          locks: {},
          filters: {},
          linksWhitelist: [],
          bans: [],
          kicks: [],
          mutes: [],
          reports: [],
          schedules: [],
          notes: [],
          approvedUsers: [],
          freedUsers: [],
          storedMessages: [],
          logs: [],
          status: 'Active',
          botRole: 'Administrator'
        });
      }

      if (modsResult && modsResult.status === 'fulfilled' && modsResult.value.ok) {
        try {
          setGroupModerators(await modsResult.value.json());
        } catch {}
      }
      if (permsResult && permsResult.status === 'fulfilled' && permsResult.value.ok) {
        try {
          setGroupPermissionsData(await permsResult.value.json());
        } catch {}
      }
      if (groupStickersResult && groupStickersResult.status === 'fulfilled' && groupStickersResult.value.ok) {
        try {
          setGroupStickersData(await groupStickersResult.value.json());
        } catch {}
      }
      if (abuseResult && abuseResult.status === 'fulfilled' && abuseResult.value.ok) {
        try {
          const aData = await abuseResult.value.json();
          setGroupAbuseWords(aData.words || []);
        } catch {}
      }
      if (membersResult && membersResult.status === 'fulfilled' && membersResult.value.ok) {
        try {
          setGroupMembersList(await membersResult.value.json());
        } catch {}
      }
      if (lustUsersResult && lustUsersResult.status === 'fulfilled' && lustUsersResult.value.ok) {
        try {
          setGroupLustUsers(await lustUsersResult.value.json());
        } catch {}
      }
      if (historyResult && historyResult.status === 'fulfilled' && historyResult.value.ok) {
        try {
          setBackupHistoryList(await historyResult.value.json());
        } catch {}
      }
    } catch (err) {
      console.warn('Group details fetch error:', err);
    }
  }, []);

  const hasLoadedStaticCatalog = useRef<boolean>(false);

  // Primary Data Fetcher (Global Summary Resources ONLY)
  const fetchData = useCallback(async (isManualRefresh: boolean = false) => {
    try {
      const shouldLoadCatalog = !hasLoadedStaticCatalog.current || isManualRefresh;
      const fetches = [
        deduplicatedFetch('/api/dashboard/overview'),
        deduplicatedFetch('/api/dashboard/groups'),
        deduplicatedFetch('/api/telegram/status'),
        deduplicatedFetch('/api/health'),
        deduplicatedFetch('/api/dashboard/private-chats'),
        deduplicatedFetch('/api/dashboard/schedules'),
        deduplicatedFetch('/api/dashboard/private-recipients')
      ];

      if (shouldLoadCatalog) {
        fetches.push(
          deduplicatedFetch('/api/commands'),
          deduplicatedFetch('/api/dashboard/stickers'),
          deduplicatedFetch('/api/dashboard/control-center/global'),
          deduplicatedFetch('/api/dashboard/posts/library')
        );
      }

      const results = await Promise.all(fetches);
      const [overviewRes, groupsRes, statusRes, healthRes, dmsRes, schedulesRes, recipientsRes] = results;

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (groupsRes.ok) setGroups(await groupsRes.json());
      if (statusRes.ok) setTelegramStatus(await statusRes.json());
      if (healthRes.ok) setHealthData(await healthRes.json());
      if (dmsRes.ok) setPrivateChats(await dmsRes.json());
      if (schedulesRes.ok) {
        const sData = await schedulesRes.json();
        setSchedulesList(sData.schedules || []);
      }
      if (recipientsRes && recipientsRes.ok) {
        const rData = await recipientsRes.json();
        if (rData) {
          if (Array.isArray(rData.recipients)) setPrivateRecipientsList(rData.recipients);
          if (rData.stats) setPrivateRecipientsStats(rData.stats);
        }
      }

      if (shouldLoadCatalog) {
        const cmdsRes = results[7];
        const stickersRes = results[8];
        const globalRes = results[9];
        const postsRes = results[10];
        if (cmdsRes && cmdsRes.ok) setCommands(await cmdsRes.json());
        if (stickersRes && stickersRes.ok) setGlobalStickersData(await stickersRes.json());
        if (globalRes && globalRes.ok) setGlobalSettings(await globalRes.json());
        if (postsRes && postsRes.ok) {
          const pData = await postsRes.json();
          if (pData && Array.isArray(pData.posts)) setSavedPostsList(pData.posts);
        }
        hasLoadedStaticCatalog.current = true;
      }
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
    }
  }, []);

  // Refresh current active view (both global and active group details if open)
  const refreshCurrentView = useCallback(() => {
    fetchData(true);
    const targetDetailId = activeGroupDetailId || (selectedChatId !== 'all' ? selectedChatId : null);
    if (targetDetailId) {
      fetchGroupDetailsData(targetDetailId, true);
    }
  }, [fetchData, fetchGroupDetailsData, activeGroupDetailId, selectedChatId]);

  // Global Dashboard Polling (15,000 ms)
  useEffect(() => {
    if (!session) return;
    fetchData(false);
    const interval = setInterval(() => fetchData(false), 15000);
    return () => {
      clearInterval(interval);
      if (settingsDebounceTimerRef.current) {
        clearTimeout(settingsDebounceTimerRef.current);
      }
    };
  }, [session, fetchData]);

  // Group Details On-Demand Fetch & Gentle Refresh (30,000 ms while group is active)
  useEffect(() => {
    if (!session) return;
    const targetDetailId = activeGroupDetailId || (selectedChatId !== 'all' ? selectedChatId : null);
    activeTargetIdRef.current = targetDetailId;

    if (targetDetailId) {
      // Immediate reset when navigating to a different group to prevent showing stale data from previously selected group
      if (lastFetchedGroupIdRef.current !== targetDetailId) {
        lastFetchedGroupIdRef.current = targetDetailId;
        setGroupDetails(null);
        setGroupModerators(null);
        setGroupPermissionsData(null);
        setGroupStickersData(null);
        setGroupAbuseWords([]);
        setGroupMembersList([]);
        setGroupLustUsers([]);
        setBackupHistoryList([]);
        setGroupAutomationsList([]);
      }

      fetchGroupDetailsData(targetDetailId, true);
      const groupInterval = setInterval(() => {
        fetchGroupDetailsData(targetDetailId, false, groupDetailTab);
      }, 30000);
      return () => clearInterval(groupInterval);
    } else {
      activeTargetIdRef.current = null;
      lastFetchedGroupIdRef.current = null;
      setGroupDetails(null);
      setGroupModerators(null);
      setGroupPermissionsData(null);
      setGroupStickersData(null);
      setGroupAbuseWords([]);
      setGroupMembersList([]);
      setGroupLustUsers([]);
      setBackupHistoryList([]);
      setGroupAutomationsList([]);
    }
  }, [session, activeGroupDetailId, selectedChatId, groupDetailTab, fetchGroupDetailsData]);

  // Track last group chatId to only re-initialize configs when switching to a different group
  const lastWelcomeGoodbyeGroupChatIdRef = useRef<number | string | null>(null);

  // Synchronize local Welcome & Goodbye form states whenever group is loaded or switched
  useEffect(() => {
    if (groupDetails?.chatId && groupDetails.settings) {
      const currentChatId = groupDetails.chatId;
      const isDifferentGroup = lastWelcomeGoodbyeGroupChatIdRef.current !== currentChatId;

      if (isDifferentGroup) {
        lastWelcomeGoodbyeGroupChatIdRef.current = currentChatId;
        const s = groupDetails.settings;
        const gw = s.groupWelcome || {
          enabled: Boolean(s.welcomeEnabled),
          mode: 'simple',
          contentType: 'text',
          text: s.welcomeMessage || '👋 Welcome {user} to {groupname}!'
        };
        const gg = s.groupGoodbye || {
          enabled: Boolean(s.goodbyeEnabled),
          mode: 'simple',
          contentType: 'text',
          text: s.goodbyeMessage || '👋 Goodbye {user}, we will miss you!'
        };
        const wdm = s.welcomeDm || {
          enabled: false,
          mode: 'simple',
          contentType: 'text',
          text: 'You joined {groupname} 🎉'
        };

        setGroupWelcomeConfig({
          enabled: Boolean(gw.enabled),
          mode: gw.mode || (gw.buttons && gw.buttons.length > 0 ? 'rich' : 'simple'),
          contentType: (gw.contentType as ComposerContentType) || 'text',
          text: gw.text !== undefined && gw.text !== null ? gw.text : '👋 Welcome {user} to {groupname}!',
          mediaFileId: gw.mediaFileId || '',
          mediaUploadId: gw.mediaUploadId || undefined,
          buttons: Array.isArray(gw.buttons) ? gw.buttons : []
        });

        setGroupGoodbyeConfig({
          enabled: Boolean(gg.enabled),
          mode: gg.mode || (gg.buttons && gg.buttons.length > 0 ? 'rich' : 'simple'),
          contentType: (gg.contentType as ComposerContentType) || 'text',
          text: gg.text !== undefined && gg.text !== null ? gg.text : '👋 Goodbye {user}, we will miss you!',
          mediaFileId: gg.mediaFileId || '',
          mediaUploadId: gg.mediaUploadId || undefined,
          buttons: Array.isArray(gg.buttons) ? gg.buttons : []
        });

        setWelcomeDmConfig({
          enabled: Boolean(wdm.enabled),
          mode: wdm.mode || (wdm.buttons && wdm.buttons.length > 0 ? 'rich' : 'simple'),
          contentType: (wdm.contentType as ComposerContentType) || 'text',
          text: wdm.text !== undefined && wdm.text !== null ? wdm.text : 'You joined {groupname} 🎉',
          mediaFileId: wdm.mediaFileId || '',
          mediaUploadId: wdm.mediaUploadId || undefined,
          buttons: Array.isArray(wdm.buttons) ? wdm.buttons : []
        });
      }
    } else if (!groupDetails) {
      lastWelcomeGoodbyeGroupChatIdRef.current = null;
    }
  }, [groupDetails?.chatId]);

  // Save Welcome & Goodbye configuration for current group
  const handleSaveWelcomeGoodbye = async (overrideConfigs?: {
    groupWelcome?: RichMessageConfigData;
    groupGoodbye?: RichMessageConfigData;
    welcomeDm?: RichMessageConfigData;
  }) => {
    if (!activeGroupDetailId) return;
    setWelcomeGoodbyeSaving(true);
    setWelcomeGoodbyeNotification(null);
    try {
      const gwToSend = overrideConfigs?.groupWelcome || groupWelcomeConfig;
      const ggToSend = overrideConfigs?.groupGoodbye || groupGoodbyeConfig;
      const wdmToSend = overrideConfigs?.welcomeDm || welcomeDmConfig;

      const payload = {
        groupWelcome: gwToSend,
        groupGoodbye: ggToSend,
        welcomeDm: wdmToSend
      };

      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/welcome-goodbye`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.sessionId ? { 'x-session-id': session.sessionId } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save Welcome & Goodbye configurations');
      }

      const returnedGw: RichMessageConfigData = data.groupWelcome || data.settings?.groupWelcome || gwToSend;
      const returnedGg: RichMessageConfigData = data.groupGoodbye || data.settings?.groupGoodbye || ggToSend;
      const returnedWdm: RichMessageConfigData = data.welcomeDm || data.settings?.welcomeDm || wdmToSend;

      setGroupDetails((prev: any) => prev ? {
        ...prev,
        settings: {
          ...prev.settings,
          groupWelcome: returnedGw,
          groupGoodbye: returnedGg,
          welcomeDm: returnedWdm,
          welcomeEnabled: Boolean(returnedGw.enabled),
          welcomeMessage: returnedGw.text,
          goodbyeEnabled: Boolean(returnedGg.enabled),
          goodbyeMessage: returnedGg.text
        }
      } : prev);

      setGroupWelcomeConfig(returnedGw);
      setGroupGoodbyeConfig(returnedGg);
      setWelcomeDmConfig(returnedWdm);

      setWelcomeGoodbyeNotification({ type: 'success', message: 'Welcome & Goodbye configurations saved successfully!' });
      setTimeout(() => setWelcomeGoodbyeNotification(null), 4000);
    } catch (err: any) {
      setWelcomeGoodbyeNotification({ type: 'error', message: err.message || 'Failed to save Welcome & Goodbye settings' });
    } finally {
      setWelcomeGoodbyeSaving(false);
    }
  };

  const handleToggleGroupWelcome = async (newEnabled: boolean) => {
    const updated: RichMessageConfigData = { ...groupWelcomeConfig, enabled: newEnabled };
    setGroupWelcomeConfig(updated);
    setGroupDetails((prev: any) => prev ? {
      ...prev,
      settings: {
        ...prev.settings,
        groupWelcome: updated,
        welcomeEnabled: newEnabled
      }
    } : prev);
    await handleSaveWelcomeGoodbye({ groupWelcome: updated });
  };

  const handleToggleGroupGoodbye = async (newEnabled: boolean) => {
    const updated: RichMessageConfigData = { ...groupGoodbyeConfig, enabled: newEnabled };
    setGroupGoodbyeConfig(updated);
    setGroupDetails((prev: any) => prev ? {
      ...prev,
      settings: {
        ...prev.settings,
        groupGoodbye: updated,
        goodbyeEnabled: newEnabled
      }
    } : prev);
    await handleSaveWelcomeGoodbye({ groupGoodbye: updated });
  };

  const handleToggleWelcomeDm = async (newEnabled: boolean) => {
    const updated: RichMessageConfigData = { ...welcomeDmConfig, enabled: newEnabled };
    setWelcomeDmConfig(updated);
    setGroupDetails((prev: any) => prev ? {
      ...prev,
      settings: {
        ...prev.settings,
        welcomeDm: updated
      }
    } : prev);
    await handleSaveWelcomeGoodbye({ welcomeDm: updated });
  };

  // Send Test Welcome or Goodbye Message
  const handleTestWelcomeGoodbye = async (target: 'groupWelcome' | 'groupGoodbye' | 'welcomeDm', targetUserId?: number) => {
    if (!activeGroupDetailId) return;
    if (target === 'welcomeDm') {
      if (!targetUserId || targetUserId <= 0) {
        setWelcomeGoodbyeNotification({
          type: 'error',
          message: 'Please enter a valid numeric Telegram User ID to receive the test DM.'
        });
        return;
      }
    }
    setWelcomeGoodbyeTesting(true);
    setWelcomeGoodbyeNotification(null);
    try {
      const payload = {
        target,
        targetUserId,
        groupWelcome: groupWelcomeConfig,
        groupGoodbye: groupGoodbyeConfig,
        welcomeDm: welcomeDmConfig
      };

      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/welcome-goodbye/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.sessionId ? { 'x-session-id': session.sessionId } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to send test ${target}`);
      }

      const targetTitle = target === 'welcomeDm'
        ? `User ID ${targetUserId}`
        : (groupDetails?.chatTitle || `Group ${activeGroupDetailId}`);
      const typeLabel = target === 'groupWelcome' ? 'Group Welcome' : target === 'groupGoodbye' ? 'Group Goodbye' : 'Welcome Private DM';

      setWelcomeGoodbyeNotification({
        type: 'success',
        message: `Test ${typeLabel} successfully delivered to ${targetTitle}!`
      });
      setTimeout(() => setWelcomeGoodbyeNotification(null), 5000);
    } catch (err: any) {
      setWelcomeGoodbyeNotification({
        type: 'error',
        message: err.message || `Failed to send test ${target}`
      });
    } finally {
      setWelcomeGoodbyeTesting(false);
    }
  };

  // Private Chat Messages On-Demand Fetch & Refresh (15,000 ms while active)
  useEffect(() => {
    if (!session || !activePrivateChatId) {
      setPrivateChatMessages([]);
      return;
    }
    const fetchPrivateChat = async () => {
      try {
        const pRes = await deduplicatedFetch(`/api/dashboard/private-chats/${activePrivateChatId}/messages`);
        if (pRes.ok) {
          const pData = await pRes.json();
          setPrivateChatMessages(pData.messages || []);
        }
      } catch {}
    };
    fetchPrivateChat();
    const pInterval = setInterval(fetchPrivateChat, 15000);
    return () => clearInterval(pInterval);
  }, [session, activePrivateChatId]);

  // Handle connection test
  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await fetch('/api/telegram/test-connection', { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
      fetchData();
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTestingConnection(false);
    }
  };

  // Export logs
  const exportData = (format: 'json' | 'csv') => {
    const logsToExport = selectedChatId === 'all' ? (overview?.recentLogs || []) : (groupDetails?.logs || []);
    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logsToExport, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `roxie_logs_${selectedChatId}_${new Date().toISOString().slice(0,10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } else {
      const headers = ['id', 'action', 'targetUsername', 'adminUsername', 'reason', 'timestamp'];
      const rows = logsToExport.map((l: any) => [l.id, l.action, l.targetUsername || '', l.adminUsername || '', l.reason || '', l.timestamp]);
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map((e: any) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", encodedUri);
      downloadAnchor.setAttribute("download", `roxie_logs_${selectedChatId}_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }
  };



  // Add Sticker Pack
  const handleAddStickerPack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupDetailId || !newPackInput.trim()) return;
    setAddingPack(true);
    setAddPackError(null);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/stickers/packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packNameOrUrl: newPackInput.trim() })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewPackInput('');
        setShowAddPackModal(false);
        fetchData();
      } else {
        setAddPackError(data.error || 'Failed to add sticker pack from Telegram');
      }
    } catch (err: any) {
      setAddPackError(err.message);
    } finally {
      setAddingPack(false);
    }
  };

  // Toggle Sticker Pack State
  const handleToggleStickerPack = async (packName: string, enabled: boolean) => {
    if (!activeGroupDetailId) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/stickers/packs/${packName}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Remove Sticker Pack from Group Configuration
  const handleRemoveStickerPack = async () => {
    if (!activeGroupDetailId || !removePackModal) return;
    setRemovingPack(true);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/stickers/packs/${removePackModal.name}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRemovePackModal(null);
        fetchData();
      } else {
        const data = await res.json();
        alert(`❌ Failed to remove pack: ${data.error}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setRemovingPack(false);
    }
  };

  // Leave Group Execution
  const handleLeaveGroup = async () => {
    if (!leaveModalGroup || leaveConfirmInput !== 'LEAVE') return;
    setLeavingGroup(true);
    try {
      const res = await fetch(`/api/dashboard/groups/${leaveModalGroup.chatId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'LEAVE' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ ${data.message}`);
        setLeaveModalGroup(null);
        setLeaveConfirmInput('');
        if (activeGroupDetailId === leaveModalGroup.chatId) {
          setActiveGroupDetailId(null);
        }
        fetchData();
      } else {
        alert(`❌ Failed to leave: ${data.error || 'Telegram rejected leave request'}`);
        setLeaveModalGroup(null);
        setLeaveConfirmInput('');
        fetchData();
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setLeavingGroup(false);
    }
  };

  // Remove Group from Dashboard Listing
  const handleRemoveFromDashboard = async () => {
    if (!removeDashboardModalGroup) return;
    const targetChatId = removeDashboardModalGroup.chatId;
    setRemovingFromDashboard(true);
    try {
      const res = await deduplicatedFetch(`/api/dashboard/groups/${targetChatId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGroups(prev => prev.filter(g => g.chatId !== targetChatId));
        if (activeGroupDetailId === targetChatId) {
          setActiveGroupDetailId(null);
        }
        if (selectedChatId === targetChatId) {
          setSelectedChatId('all');
        }
        setRemoveDashboardModalGroup(null);
        fetchData();
      } else {
        alert(`❌ Failed to remove group from dashboard: ${data.error || 'Request failed'}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setRemovingFromDashboard(false);
    }
  };

  // Global Settings Fetch & Update
  const updateGlobalSetting = async (key: string, value: boolean) => {
    setSavingGlobal(true);
    try {
      const res = await fetch('/api/dashboard/control-center/global', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value })
      });
      if (res.ok) {
        const data = await res.json();
        setGlobalSettings(data);
      }
    } catch (err: any) {
      alert(`Error updating global setting: ${err.message}`);
    } finally {
      setSavingGlobal(false);
    }
  };

  // Abuse Words
  const handleAddAbuseWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroupDetailId || !newAbuseWordInput.trim()) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/abuse-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: newAbuseWordInput.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setGroupAbuseWords(data.words || []);
        setNewAbuseWordInput('');
      } else {
        alert(data.error || 'Failed to add abuse word');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemoveAbuseWord = async (word: string) => {
    if (!activeGroupDetailId) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/abuse-words/${encodeURIComponent(word)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        setGroupAbuseWords(data.words || []);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleClearAbuseWords = async () => {
    if (!activeGroupDetailId) return;
    if (!confirm('Clear all custom abuse words for this group?')) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/abuse-words`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setGroupAbuseWords([]);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Slowmode
  const handleApplySlowmode = async (seconds: number) => {
    if (!activeGroupDetailId) return;
    setApplyingSlowmode(true);
    setSlowmodeFeedback(null);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/slowmode`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds })
      });
      const data = await res.json();
      if (res.ok) {
        setSlowmodeInput(seconds);
        const tgNotice = data.telegramResult?.ok ? 'Applied to Telegram.' : (data.telegramResult?.description ? `(Telegram: ${data.telegramResult.description})` : '');
        setSlowmodeFeedback(`✓ Slowmode set to ${seconds}s. ${tgNotice}`);
        fetchData();
      } else {
        setSlowmodeFeedback(`✕ ${data.error || 'Failed to set slowmode'}`);
      }
    } catch (err: any) {
      setSlowmodeFeedback(`✕ ${err.message}`);
    } finally {
      setApplyingSlowmode(false);
    }
  };

  // Members Moderation Actions
  const handleMemberAction = async (action: 'ban' | 'unban' | 'restrict' | 'promote' | 'demote', userId: number) => {
    if (!activeGroupDetailId) return;
    const actionKey = `${action}_${userId}`;
    setMemberActionLoading(prev => ({ ...prev, [actionKey]: true }));
    setMemberActionFeedback(null);
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/members/${userId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMemberActionFeedback({ type: 'success', message: `✓ Successfully executed ${action} on user ${userId}` });
        fetchData();
      } else {
        setMemberActionFeedback({ type: 'error', message: `✕ Telegram error: ${data.description || data.error || 'Action failed'}` });
      }
    } catch (err: any) {
      setMemberActionFeedback({ type: 'error', message: `✕ Network error: ${err.message}` });
    } finally {
      setMemberActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  // Lust Mode Group & Users Reset
  const handleResetGroupLust = async () => {
    if (!activeGroupDetailId) return;
    if (!confirm('Reset group lust state to Level 0?')) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/lust/reset-group`, { method: 'POST' });
      if (res.ok) {
        alert('✓ Group lust level reset to 0');
        fetchData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResetUserLustLevels = async () => {
    if (!activeGroupDetailId) return;
    if (!confirm('Reset all user lust levels in this group to Level 0?')) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/lust/reset-users`, { method: 'POST' });
      if (res.ok) {
        alert('✓ All user lust levels reset to 0');
        fetchData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Danger Zone Actions
  const handleExecuteDangerAction = async () => {
    if (!activeGroupDetailId || !dangerModal) return;
    if (dangerConfirmInput !== 'CONFIRM') {
      alert('Please type CONFIRM exactly to proceed.');
      return;
    }
    setExecutingDangerAction(true);
    try {
      let endpoint = '';
      if (dangerModal === 'reset_settings') endpoint = `/api/dashboard/groups/${activeGroupDetailId}/reset`;
      if (dangerModal === 'clear_memory') endpoint = `/api/dashboard/groups/${activeGroupDetailId}/clear-memory`;
      if (dangerModal === 'clear_stickers') endpoint = `/api/dashboard/groups/${activeGroupDetailId}/clear-stickers`;
      if (dangerModal === 'clear_abuse') endpoint = `/api/dashboard/groups/${activeGroupDetailId}/abuse-words`;

      const res = await fetch(endpoint, { method: dangerModal === 'clear_abuse' ? 'DELETE' : 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`✓ Operation executed successfully.`);
        setDangerModal(null);
        setDangerConfirmInput('');
        fetchData();
      } else {
        alert(`✕ Failed: ${data.error || 'Error'}`);
      }
    } catch (err: any) {
      alert(`✕ Error: ${err.message}`);
    } finally {
      setExecutingDangerAction(false);
    }
  };

  // --- Backup & Restore Handlers ---
  const handleDownloadGroupJson = async () => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/export-json`);
      if (!res.ok) throw new Error('Failed to export JSON');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roxie_group_${Math.abs(Number(activeGroupDetailId))}_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupNotification({ type: 'success', message: 'Lossless JSON configuration backup downloaded!' });
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: e.message || 'Download failed' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDownloadGroupCsv = async () => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/export-csv`);
      if (!res.ok) throw new Error('Failed to export CSV');
      const csvText = await res.text();
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roxie_group_${Math.abs(Number(activeGroupDetailId))}_report_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupNotification({ type: 'success', message: 'Human-readable CSV report downloaded!' });
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: e.message || 'CSV download failed' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleCopyGroupJson = async () => {
    if (!activeGroupDetailId) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/export-json`);
      if (!res.ok) throw new Error('Failed to fetch JSON');
      const data = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedJsonToast(true);
      setTimeout(() => setCopiedJsonToast(false), 3000);
      setBackupNotification({ type: 'success', message: 'Configuration JSON copied to clipboard!' });
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: 'Failed to copy to clipboard' });
    }
  };

  const handleLoadGroupJsonIntoEditor = async () => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      setBackupEditorError(null);
      setBackupEditorSuccess(null);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/export-json`);
      if (!res.ok) throw new Error('Failed to load JSON');
      const data = await res.json();
      setBackupEditorJson(JSON.stringify(data, null, 2));
      setBackupEditorSuccess('Loaded latest group configuration into editor');
    } catch (e: any) {
      setBackupEditorError(e.message || 'Failed to load configuration');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleValidateEditorJson = () => {
    setBackupEditorError(null);
    setBackupEditorSuccess(null);
    if (!backupEditorJson.trim()) {
      setBackupEditorError('Editor is empty. Click "Load Group JSON" to populate.');
      return false;
    }
    try {
      const parsed = JSON.parse(backupEditorJson);
      if (typeof parsed !== 'object' || parsed === null) {
        setBackupEditorError('Root value must be a JSON object');
        return false;
      }
      setBackupEditorSuccess('✅ JSON is completely valid syntax!');
      return true;
    } catch (e: any) {
      setBackupEditorError(`Syntax Error: ${e.message}`);
      return false;
    }
  };

  const handleFormatEditorJson = () => {
    try {
      const parsed = JSON.parse(backupEditorJson);
      setBackupEditorJson(JSON.stringify(parsed, null, 2));
      setBackupEditorError(null);
      setBackupEditorSuccess('Formatted JSON successfully');
    } catch (e: any) {
      setBackupEditorError(`Cannot format: ${e.message}`);
    }
  };

  const handlePreviewImport = async (jsonString: string) => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      setBackupNotification(null);
      const parsed = JSON.parse(jsonString);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: parsed,
          selectedSections: backupImportSelectedSections
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Preview generation failed');
      setBackupDiffPreview(data);
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: `Preview failed: ${e.message}` });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleApplyImport = async (jsonString: string) => {
    if (!activeGroupDetailId) return;
    try {
      setBackupLoading(true);
      setBackupNotification(null);
      const parsed = JSON.parse(jsonString);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          config: parsed,
          selectedSections: backupImportSelectedSections,
          overrideChatId: backupOverrideChatId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Import failed');
      setBackupNotification({ type: 'success', message: data.message || 'Configuration restored successfully!' });
      setBackupDiffPreview(null);
      fetchData();
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: e.message || 'Import failed' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreSafetySnapshot = async (filename: string) => {
    if (!activeGroupDetailId) return;
    if (!confirm(`Restore safety backup snapshot "${filename}"? This will restore the group configuration.`)) return;
    try {
      setBackupLoading(true);
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/backup/restore-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to restore snapshot');
      setBackupNotification({ type: 'success', message: data.message || 'Safety backup snapshot restored!' });
      fetchData();
    } catch (e: any) {
      setBackupNotification({ type: 'error', message: e.message });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleExportAllBotBackup = async () => {
    try {
      setBotBackupLoading(true);
      setBotBackupNotification(null);
      const res = await fetch('/api/dashboard/backup/export-all');
      if (!res.ok) throw new Error('Failed to export bot backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roxie_full_bot_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBotBackupNotification({ type: 'success', message: `Full bot backup with ${data.totalGroups || 0} groups exported!` });
    } catch (e: any) {
      setBotBackupNotification({ type: 'error', message: e.message || 'Export failed' });
    } finally {
      setBotBackupLoading(false);
    }
  };

  const handleRestoreAllBotBackup = async () => {
    if (!botBackupJson.trim()) {
      setBotBackupNotification({ type: 'error', message: 'Please paste or upload full bot backup JSON' });
      return;
    }
    if (!confirm('Restore full bot backup? This will restore configurations for all groups contained in the backup file.')) return;
    try {
      setBotBackupLoading(true);
      setBotBackupNotification(null);
      const parsed = JSON.parse(botBackupJson);
      const res = await fetch('/api/dashboard/backup/restore-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payload: parsed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Full bot restore failed');
      setBotBackupNotification({ type: 'success', message: data.message || 'Bot backup restored successfully!' });
      fetchData();
    } catch (e: any) {
      setBotBackupNotification({ type: 'error', message: e.message || 'Restore failed' });
    } finally {
      setBotBackupLoading(false);
    }
  };

  // Send Message Execution (In-Flight Lock + Idempotency Key)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendTargetId || !sendMessageContent.trim() || sendingMessage) return;
    setSendingMessage(true);
    setSendResult(null);
    try {
      const clientRequestId = `send_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await deduplicatedFetch('/api/dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: sendTargetType,
          targetId: sendTargetId,
          message: sendMessageContent.trim(),
          clientRequestId
        })
      });
      const data = await res.json();
      setSendResult({ ok: res.ok, data });
      if (res.ok) {
        setSendMessageContent('');
        fetchData();
      }
    } catch (err: any) {
      setSendResult({ ok: false, data: { error: err.message } });
    } finally {
      setSendingMessage(false);
    }
  };

  // Send Private Reply (In-Flight Lock + Idempotency Key)
  const handleSendPrivateReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePrivateChatId || !privateReplyText.trim() || sendingPrivateReply) return;
    setSendingPrivateReply(true);
    try {
      const clientRequestId = `priv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await deduplicatedFetch('/api/dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'private',
          targetId: activePrivateChatId,
          message: privateReplyText.trim(),
          clientRequestId
        })
      });
      if (res.ok) {
        setPrivateReplyText('');
        try {
          const pRes = await deduplicatedFetch(`/api/dashboard/private-chats/${activePrivateChatId}/messages`);
          if (pRes.ok) {
            const pData = await pRes.json();
            setPrivateChatMessages(pData.messages || []);
          }
        } catch {}
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`❌ Send failed: ${err.error || 'Telegram rejected delivery'}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    } finally {
      setSendingPrivateReply(false);
    }
  };

  // Group Messages Direct Composer & Reply-to-User Execution
  const handleSelectReplyTarget = (msg: any) => {
    if (!msg.messageId) {
      alert('Reply unavailable — Telegram message ID was not recorded for this message.');
      return;
    }
    setGroupReplyTarget(msg);
    setGroupMessageFeedback(null);
    const composerElem = document.getElementById('group-message-composer');
    if (composerElem) {
      composerElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const textarea = composerElem.querySelector('textarea');
      if (textarea) textarea.focus();
    }
  };

  const handleSendGroupMessage = async () => {
    if (!activeGroupDetailId || !groupComposerText.trim() || sendingGroupMessage) return;
    setSendingGroupMessage(true);
    setGroupMessageFeedback(null);
    try {
      const clientRequestId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const payload: any = {
        targetType: 'group',
        targetId: activeGroupDetailId,
        chatId: activeGroupDetailId,
        message: groupComposerText.trim(),
        text: groupComposerText.trim(),
        clientRequestId
      };
      if (groupReplyTarget?.messageId) {
        payload.replyToMessageId = groupReplyTarget.messageId;
      }

      const res = await deduplicatedFetch('/api/dashboard/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setGroupMessageFeedback({
          type: 'success',
          message: groupReplyTarget ? '✓ Reply sent as Roxie' : '✓ Message sent as Roxie'
        });
        setGroupComposerText('');
        setGroupReplyTarget(null);
        await fetchData();
        setTimeout(() => setGroupMessageFeedback(null), 4000);
      } else {
        setGroupMessageFeedback({
          type: 'error',
          message: data.error || '✕ Failed to send message'
        });
      }
    } catch (err: any) {
      setGroupMessageFeedback({
        type: 'error',
        message: `✕ Error: ${err.message}`
      });
    } finally {
      setSendingGroupMessage(false);
    }
  };

  // Broadcast Execution (In-Flight Lock + Unique Broadcast ID)
  const handleBroadcast = async () => {
    if (broadcastSelectedGroups.length === 0 || !broadcastContent.trim() || broadcasting) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    setShowBroadcastConfirm(false);
    try {
      const broadcastId = `bcast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const res = await deduplicatedFetch('/api/dashboard/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broadcastId,
          groupIds: broadcastSelectedGroups,
          message: broadcastContent.trim()
        })
      });
      const data = await res.json();
      setBroadcastResult(data);
      if (res.ok) {
        setBroadcastContent('');
        fetchData();
      }
    } catch (err: any) {
      setBroadcastResult({ error: err.message });
    } finally {
      setBroadcasting(false);
    }
  };

  // Schedule and Automation Action Handlers
  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  };

  const fetchDashboardContentItem = async (id: string): Promise<UnifiedContentItem> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('roxie_session_id') : null;
    const headers: Record<string, string> = {};
    if (token) {
      headers['x-session-id'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await deduplicatedFetch(`/api/dashboard/content-items/${encodeURIComponent(id)}`, {
      headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Content item "${id}" not found.`);
    }
    const data = await res.json();
    return data.item;
  };

  const handleApplyReusedContentToSchedule = (item: UnifiedContentItem, options: { includeTiming?: boolean }) => {
    if (editingSchedule) {
      // PRESERVE EXISTING SCHEDULE RECORD AND ITS ID
      setNewScheduleForm(prev => ({
        ...prev,
        message: item.text || '',
        contentType: item.contentType || 'text',
        mediaFileId: item.mediaFileId || '',
        inlineKeyboard: item.buttons && item.buttons.length > 0
          ? item.buttons.map(row => row.map(btn => ({ text: btn.text, url: btn.url, style: btn.style || 'primary' })))
          : [],
        pinAfterSend: (item.options?.pinAfterSend !== undefined || item.options?.pinMessage !== undefined)
          ? Boolean(item.options?.pinAfterSend || item.options?.pinMessage)
          : prev.pinAfterSend,
        replyToLatest: item.options?.replyToLatest !== undefined ? Boolean(item.options.replyToLatest) : prev.replyToLatest,
        autoDeletePrevious: item.options?.autoDeletePrevious !== undefined ? Boolean(item.options.autoDeletePrevious) : prev.autoDeletePrevious
      }));
      setScheduleNotification({
        type: 'success',
        message: `Applied content from ${item.type.toUpperCase()}: "${item.title || item.id}" to schedule #${editingSchedule.id}. (Schedule ID preserved)`
      });
    } else {
      // NEW SCHEDULE DRAFT: CREATE DISABLED DRAFT WITH CONTENT (AND OPTIONAL TIMING)
      const baseName = item.title || item.id || 'Scheduled Message';
      const draftName = baseName.includes('(Copy)') ? baseName : `${baseName} (Copy)`;

      setNewScheduleForm(prev => ({
        ...prev,
        name: draftName,
        message: item.text || '',
        contentType: item.contentType || 'text',
        mediaFileId: item.mediaFileId || '',
        inlineKeyboard: item.buttons && item.buttons.length > 0
          ? item.buttons.map(row => row.map(btn => ({ text: btn.text, url: btn.url, style: btn.style || 'primary' })))
          : [],
        enabled: false, // Default to disabled/paused until explicitly enabled per user requirement!
        pinAfterSend: Boolean(item.options?.pinAfterSend || item.options?.pinMessage),
        replyToLatest: Boolean(item.options?.replyToLatest),
        autoDeletePrevious: Boolean(item.options?.autoDeletePrevious),
        scheduleType: (options.includeTiming && item.scheduleConfig?.scheduleType) ? item.scheduleConfig.scheduleType : prev.scheduleType,
        intervalStr: (options.includeTiming && item.scheduleConfig?.intervalStr) ? item.scheduleConfig.intervalStr : prev.intervalStr,
        timezone: (options.includeTiming && item.scheduleConfig?.timezone) ? item.scheduleConfig.timezone : prev.timezone
      }));
      setShowCreateScheduleModal(true);
      setScheduleNotification({
        type: 'success',
        message: `Loaded draft from ${item.type.toUpperCase()}: "${item.title || item.id}" (Created in paused state)`
      });
    }
    setTimeout(() => setScheduleNotification(null), 4000);
  };

  const handleCopyScheduleFromIdSubmit = async () => {
    const trimmedId = copyFromIdInput.trim().toUpperCase();
    if (!trimmedId) {
      setCopyFromIdError('Please enter a content or schedule ID.');
      return;
    }
    try {
      const item = await fetchDashboardContentItem(trimmedId);
      handleApplyReusedContentToSchedule(item, { includeTiming: true });
      setShowCopyScheduleFromIdModal(false);
      setCopyFromIdInput('');
      setCopyFromIdError(null);
    } catch (err: any) {
      setCopyFromIdError(err.message || 'Failed to load content item');
    }
  };

  const handleLoadScheduleContentById = async () => {
    const raw = schedReuseIdInput.trim();
    if (!raw) {
      setSchedReuseError('Please enter a content ID or reference (e.g. POST-XXXXX or {{post:...}}).');
      return;
    }
    setSchedReuseError(null);
    let searchId = raw;
    const match = raw.match(/\{\{(?:item|post|schedule|template):([A-Za-z0-9_-]+)\}\}/i);
    if (match) searchId = match[1];

    setSchedReuseLoading(true);
    try {
      const res = await deduplicatedFetch(`/api/dashboard/content-items/${encodeURIComponent(searchId)}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Content item "${searchId}" not found.`);
      }
      const data = await res.json();
      const item: UnifiedContentItem = data.item;
      if (!item) throw new Error(`Content item "${searchId}" not found.`);

      setSchedLoadedMeta({
        type: item.type,
        id: item.id,
        title: item.title || item.id,
        mode: schedReuseMode
      });

      const loadedButtons = Array.isArray(item.buttons)
        ? item.buttons.map(row => (Array.isArray(row) ? row : []).map(btn => ({
            text: btn.text || '',
            url: btn.url || '',
            style: (btn.style && ['primary', 'success', 'danger'].includes(btn.style)) ? btn.style : undefined
          })))
        : [];

      if (schedReuseMode === 'reference') {
        const refTag = `{{${item.type === 'schedule' ? 'schedule' : item.type === 'post' ? 'post' : 'item'}:${item.id}}}`;
        setNewScheduleForm(prev => ({
          ...prev,
          message: refTag,
          contentType: item.contentType || 'text',
          mediaFileId: item.mediaFileId || '',
          inlineKeyboard: loadedButtons,
          pinAfterSend: (item.options?.pinAfterSend !== undefined || item.options?.pinMessage !== undefined)
            ? Boolean(item.options?.pinAfterSend || item.options?.pinMessage)
            : prev.pinAfterSend,
          replyToLatest: item.options?.replyToLatest !== undefined ? Boolean(item.options.replyToLatest) : prev.replyToLatest,
          autoDeletePrevious: item.options?.autoDeletePrevious !== undefined ? Boolean(item.options.autoDeletePrevious) : prev.autoDeletePrevious
        }));
      } else {
        setNewScheduleForm(prev => ({
          ...prev,
          message: item.text || '',
          contentType: item.contentType || 'text',
          mediaFileId: item.mediaFileId || '',
          inlineKeyboard: loadedButtons,
          pinAfterSend: (item.options?.pinAfterSend !== undefined || item.options?.pinMessage !== undefined)
            ? Boolean(item.options?.pinAfterSend || item.options?.pinMessage)
            : prev.pinAfterSend,
          replyToLatest: item.options?.replyToLatest !== undefined ? Boolean(item.options.replyToLatest) : prev.replyToLatest,
          autoDeletePrevious: item.options?.autoDeletePrevious !== undefined ? Boolean(item.options.autoDeletePrevious) : prev.autoDeletePrevious
        }));
      }
      setSchedReuseIdInput('');
    } catch (err: any) {
      setSchedReuseError(err.message || 'Failed to load content item.');
    } finally {
      setSchedReuseLoading(false);
    }
  };

  const handleCopyAllStickerPackLinks = async () => {
    const packs = groupStickersData?.packs || [];
    if (!packs.length) {
      alert('No sticker packs configured for this group');
      return;
    }
    const links = packs
      .map((p: any) => {
        const name = p.name || p.title;
        if (!name) return null;
        return name.startsWith('http') ? name : `https://t.me/addstickers/${name}`;
      })
      .filter(Boolean);

    if (!links.length) {
      alert('No sticker packs configured for this group');
      return;
    }

    const textToCopy = links.join('\n');
    const ok = await copyTextToClipboard(textToCopy);
    if (ok) {
      alert(`Copied ${links.length} sticker pack link(s) to clipboard`);
    } else {
      alert('Failed to copy sticker pack links to clipboard');
    }
  };

  const handleDuplicateSchedule = (s: any) => {
    setEditingSchedule(null);
    setScheduleFormError(null);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    let defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    let defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    if (s.nextRun) {
      try {
        const d = new Date(s.nextRun);
        if (!isNaN(d.getTime())) {
          defaultDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          defaultTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      } catch {}
    }
    setNewScheduleForm({
      chatId: s.chatId,
      name: `${s.name || 'Schedule'} (Copy)`,
      message: s.message || s.messageText || '',
      scheduleType: s.scheduleType || 'interval',
      intervalStr: s.intervalFormatted || '1h',
      nextRunDate: defaultDate,
      nextRunTime: defaultTime,
      timezone: s.timezone || 'UTC',
      contentType: s.contentType || 'text',
      mediaFileId: s.mediaFileId || '',
      replyToMessageId: s.replyToMessageId ? String(s.replyToMessageId) : '',
      enabled: false, // Strictly created in paused/draft state to prevent unexpected activation
      pinAfterSend: Boolean(s.pinAfterSend),
      replyToLatest: Boolean(s.replyToLatest),
      autoDeletePrevious: Boolean(s.autoDeletePrevious),
      triggerKeyword: s.triggerKeyword || '',
      inlineKeyboard: Array.isArray(s.inlineKeyboard)
        ? s.inlineKeyboard.map((row: any[]) =>
            Array.isArray(row)
              ? row.map(btn => ({
                  text: btn.text || '',
                  url: btn.url || '',
                  style: btn.style && ['primary', 'success', 'danger'].includes(btn.style) ? btn.style : undefined
                }))
              : []
          )
        : []
    });
    setScheduleNotification({
      type: 'success',
      message: 'Schedule duplicated into draft form (paused). Review and save.'
    });
    setShowCreateScheduleModal(true);
  };

  const handleCopyScheduleCode = async (s: any) => {
    try {
      let command = '';
      let jsonConfig: any = {};
      const res = await deduplicatedFetch(`/api/dashboard/schedules/${s.id}/code`);
      if (res.ok) {
        const data = await res.json();
        command = data.command;
        jsonConfig = data.jsonConfig;
      } else {
        const interval = s.intervalFormatted || s.intervalStr || '1h';
        const delTag = s.autoDeletePrevious ? ' delOn' : '';
        const pinTag = s.pinAfterSend ? ' pin' : '';
        const replyTag = s.replyToLatest ? ' replyOn' : '';
        const message = s.message || s.messageText || '';
        command = `/schedule ${interval}${delTag}${pinTag}${replyTag} ${message}`.trim();
        jsonConfig = {
          name: s.name || 'Schedule',
          scheduleType: s.scheduleType || 'interval',
          interval,
          message,
          contentType: s.contentType || 'text',
          pinAfterSend: Boolean(s.pinAfterSend),
          replyToLatest: Boolean(s.replyToLatest),
          autoDeletePrevious: Boolean(s.autoDeletePrevious),
          targetChatId: '<REPLACE_WITH_DESTINATION_CHAT_ID>',
          ...(s.mediaFileId ? { mediaFileId: s.mediaFileId } : {}),
          ...(s.timezone ? { timezone: s.timezone } : {})
        };
      }
      setCopyScheduleModal({
        isOpen: true,
        schedule: s,
        command,
        jsonConfig,
        copiedField: null
      });
    } catch {
      setScheduleNotification({ type: 'error', message: 'Failed to generate schedule code.' });
    }
  };

  const handleSaveSchedule = async () => {
    if (schedulesLoading) return;
    setScheduleFormError(null);

    if (!newScheduleForm.chatId) {
      setScheduleFormError('Please select a target group.');
      return;
    }
    if (!newScheduleForm.message.trim() && !newScheduleForm.mediaFileId?.trim()) {
      setScheduleFormError('Message text or media is required for schedule.');
      return;
    }

    const scheduleId = editingSchedule ? (editingSchedule.id || editingSchedule._id) : null;
    if (editingSchedule && !scheduleId) {
      setScheduleFormError('Cannot update schedule: Missing schedule ID.');
      return;
    }

    setSchedulesLoading(true);
    try {
      const cleanedKeyboard = newScheduleForm.inlineKeyboard
        .map(row =>
          (Array.isArray(row) ? row : [])
            .filter(b => b && b.text?.trim() && b.url?.trim())
            .map(b => {
              const item: { text: string; url: string; style?: 'primary' | 'success' | 'danger' } = {
                text: b.text.trim(),
                url: b.url.trim()
              };
              if (b.style && ['primary', 'success', 'danger'].includes(b.style)) {
                item.style = b.style;
              }
              return item;
            })
        )
        .filter(row => row.length > 0);

      const payload: any = {
        chatId: Number(newScheduleForm.chatId),
        name: newScheduleForm.name.trim() || newScheduleForm.message.trim().slice(0, 30),
        message: newScheduleForm.message.trim(),
        messageText: newScheduleForm.message.trim(),
        scheduleType: newScheduleForm.scheduleType,
        timezone: newScheduleForm.timezone || 'UTC',
        contentType: newScheduleForm.contentType || 'text',
        mediaFileId: newScheduleForm.contentType !== 'text'
          ? ((newScheduleForm.mediaFileId || '').trim() || (editingSchedule ? null : undefined))
          : (editingSchedule ? null : undefined),
        replyToMessageId: newScheduleForm.replyToMessageId ? Number(newScheduleForm.replyToMessageId) : (editingSchedule ? null : undefined),
        enabled: newScheduleForm.enabled,
        pinAfterSend: Boolean(newScheduleForm.pinAfterSend),
        replyToLatest: Boolean(newScheduleForm.replyToLatest),
        autoDeletePrevious: Boolean(newScheduleForm.autoDeletePrevious),
        triggerKeyword: (newScheduleForm.triggerKeyword || '').trim().length > 0
          ? (newScheduleForm.triggerKeyword || '').trim()
          : (editingSchedule ? null : undefined),
        inlineKeyboard: cleanedKeyboard.length > 0 ? cleanedKeyboard : (editingSchedule ? [] : undefined)
      };

      if (newScheduleForm.scheduleType === 'interval') {
        payload.scheduleType = 'interval';
        payload.intervalFormatted = newScheduleForm.intervalStr || '1h';
        const rawStr = (newScheduleForm.intervalStr || '1h').toLowerCase().trim();
        const match = rawStr.match(/^(\d+(?:\.\d+)?)\s*(m(?:in(?:ute)?s?)?|h(?:(?:ou)?rs?)?|d(?:ays?)?)$/);
        let calculatedMs = 3600000;
        if (match) {
          const val = parseFloat(match[1]);
          const unit = match[2];
          if (unit.startsWith('m')) calculatedMs = val * 60 * 1000;
          else if (unit.startsWith('d')) calculatedMs = val * 24 * 60 * 60 * 1000;
          else calculatedMs = val * 60 * 60 * 1000;
        } else {
          const num = parseFloat(rawStr) || 1;
          if (rawStr.endsWith('m') || rawStr.includes('min')) calculatedMs = num * 60 * 1000;
          else if (rawStr.endsWith('d') || rawStr.includes('day')) calculatedMs = num * 24 * 60 * 60 * 1000;
          else calculatedMs = num * 60 * 60 * 1000;
        }
        payload.intervalMs = calculatedMs;

        if (editingSchedule && editingSchedule.nextRun && (
          (newScheduleForm.intervalStr || '1h').trim().toLowerCase() === (editingSchedule.intervalFormatted || '1h').trim().toLowerCase() ||
          payload.intervalMs === editingSchedule.intervalMs
        )) {
          payload.nextRun = editingSchedule.nextRun;
        } else {
          payload.nextRun = new Date(Date.now() + payload.intervalMs).toISOString();
        }
      } else if (newScheduleForm.scheduleType === 'daily') {
        payload.scheduleType = 'daily';
        payload.intervalMs = 86400000;
        payload.intervalFormatted = '1 day';
        const dateStr = `${newScheduleForm.nextRunDate}T${newScheduleForm.nextRunTime || '12:00'}:00`;
        const parsedDate = new Date(dateStr);
        payload.nextRun = isNaN(parsedDate.getTime()) ? new Date(Date.now() + 86400000).toISOString() : parsedDate.toISOString();
      } else {
        payload.scheduleType = 'one_time';
        payload.intervalMs = null;
        payload.intervalFormatted = null;
        const dateStr = `${newScheduleForm.nextRunDate}T${newScheduleForm.nextRunTime || '12:00'}:00`;
        const parsedDate = new Date(dateStr);
        payload.nextRun = isNaN(parsedDate.getTime()) ? new Date(Date.now() + 3600000).toISOString() : parsedDate.toISOString();
      }

      const method = editingSchedule ? 'PUT' : 'POST';
      const endpoint = editingSchedule ? `/api/dashboard/schedules/${scheduleId}` : '/api/dashboard/schedules';

      const res = await deduplicatedFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => null);

      if (res.ok && (data?.success !== false)) {
        setShowCreateScheduleModal(false);
        setEditingSchedule(null);
        setScheduleFormError(null);
        setScheduleNotification({
          type: 'success',
          message: editingSchedule ? 'Scheduled message updated successfully.' : 'Scheduled message created successfully.'
        });
        await fetchData();
        setTimeout(() => setScheduleNotification(null), 4000);
      } else {
        const errorMsg = data?.error || (res.status === 401 ? 'Unauthorized: Operator session required.' : res.status === 403 ? 'Forbidden: Requires MODERATOR role or higher.' : res.status === 404 ? 'Schedule not found.' : `Failed to save schedule (HTTP ${res.status}).`);
        setScheduleFormError(errorMsg);
      }
    } catch (err: any) {
      console.error('Failed to save schedule:', err);
      setScheduleFormError(err?.message || 'Network error while saving schedule.');
    } finally {
      setSchedulesLoading(false);
    }
  };

  const handleToggleSchedule = async (id: string, currentEnabled: boolean) => {
    try {
      const res = await deduplicatedFetch(`/api/dashboard/schedules/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || `Failed to toggle schedule (HTTP ${res.status})`);
      }
    } catch (err: any) {
      console.error('Failed to toggle schedule:', err);
      alert(err?.message || 'Network error while toggling schedule.');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled message?')) return;
    try {
      const res = await deduplicatedFetch(`/api/dashboard/schedules/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error || `Failed to delete schedule (HTTP ${res.status})`);
      }
    } catch (err: any) {
      console.error('Failed to delete schedule:', err);
      alert(err?.message || 'Network error while deleting schedule.');
    }
  };

  const handleSaveAutomation = async () => {
    const targetChatId = activeGroupDetailId || (schedulesFilterChatId !== 'all' ? schedulesFilterChatId : null);
    if (!targetChatId) return;
    setAutomationsLoading(true);
    try {
      const res = await fetch(`/api/dashboard/groups/${targetChatId}/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger: newAutomationForm.trigger,
          action: newAutomationForm.action,
          parameters: newAutomationForm.parameters.trim() || undefined,
          enabled: newAutomationForm.enabled
        })
      });
      if (res.ok) {
        setShowCreateAutomationModal(false);
        setNewAutomationForm({ trigger: 'spam_detected', action: 'delete_message', parameters: '', enabled: true });
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to save automation:', err);
    } finally {
      setAutomationsLoading(false);
    }
  };

  const handleDeleteAutomation = async (chatId: number, autoId: string) => {
    if (!confirm('Are you sure you want to delete this automation rule?')) return;
    try {
      const res = await fetch(`/api/dashboard/groups/${chatId}/automations/${autoId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to delete automation:', err);
    }
  };

  const handleToggleAutomation = async (chatId: number, autoId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/dashboard/groups/${chatId}/automations/${autoId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle automation:', err);
    }
  };

  const fetchAutomations = async (targetChatId: number) => {
    if (!targetChatId) return;
    setAutomationsLoading(true);
    try {
      const res = await deduplicatedFetch(`/api/dashboard/groups/${targetChatId}/automations`);
      if (res.ok) {
        const data = await res.json();
        setGroupAutomationsList(data.automations || []);
      }
    } catch (err) {
      console.error('Failed to fetch automations:', err);
    } finally {
      setAutomationsLoading(false);
    }
  };

  // Flush Pending Debounced Settings Batch to Backend (Single Combined PATCH)
  const flushPendingSettings = async () => {
    if (!activeGroupDetailId) return;
    if (settingsDebounceTimerRef.current) {
      clearTimeout(settingsDebounceTimerRef.current);
      settingsDebounceTimerRef.current = null;
    }

    const payload = { ...pendingSettingsBatchRef.current };
    if (Object.keys(payload).length === 0) return;

    pendingSettingsBatchRef.current = {};
    const clientTimestamp = Date.now();
    lastSettingsSentTimestampRef.current = clientTimestamp;
    payload._clientTimestamp = clientTimestamp;

    setSavingSettings(true);
    setSettingsSaveStatus('saving');
    setSettingsSaveError(null);

    try {
      const res = await fetch(`/api/dashboard/groups/${activeGroupDetailId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        if (clientTimestamp >= lastSettingsSentTimestampRef.current) {
          setSettingsSaveStatus('saved');
          if (settingsSaveStatusTimerRef.current) clearTimeout(settingsSaveStatusTimerRef.current);
          settingsSaveStatusTimerRef.current = setTimeout(() => {
            setSettingsSaveStatus('idle');
          }, 2500);
        }
      } else {
        setSettingsSaveStatus('error');
        setSettingsSaveError(data.error || 'Autosave failed');
      }
    } catch (err: any) {
      setSettingsSaveStatus('error');
      setSettingsSaveError(err.message || 'Network error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Update Group Setting Helper (1500ms Debounce with Batching & Optimistic UI Update)
  const updateSetting = (key: string, value: any, immediate: boolean = false) => {
    if (!activeGroupDetailId) return;

    // 1. Optimistic local state update for instant UI feedback
    setGroupDetails((prev: any) => {
      if (!prev) return prev;
      const updated = { ...prev };
      const keys = key.split('.');
      if (keys.length === 1) {
        updated.settings = { ...(updated.settings || {}), [key]: value };
      } else if (keys.length === 2) {
        updated.settings = {
          ...(updated.settings || {}),
          [keys[0]]: {
            ...(updated.settings?.[keys[0]] || {}),
            [keys[1]]: value
          }
        };
      }
      return updated;
    });

    // 2. Deep merge into pending batch
    const keys = key.split('.');
    if (keys.length === 1) {
      pendingSettingsBatchRef.current[key] = value;
    } else if (keys.length === 2) {
      pendingSettingsBatchRef.current[keys[0]] = {
        ...(pendingSettingsBatchRef.current[keys[0]] || groupDetails?.settings?.[keys[0]] || {}),
        [keys[1]]: value
      };
    }

    if (immediate) {
      flushPendingSettings();
      return;
    }

    setSettingsSaveStatus('saving');

    // 3. Debounce 1500ms
    if (settingsDebounceTimerRef.current) {
      clearTimeout(settingsDebounceTimerRef.current);
    }
    settingsDebounceTimerRef.current = setTimeout(() => {
      flushPendingSettings();
    }, 1500);
  };

  const botInfo = overview?.botStatus?.botInfo;
  const isPolling = overview?.botStatus?.isPolling;
  const stats = overview?.stats || { totalBans: 0, totalKicks: 0, totalWarns: 0, totalReports: 0, activeSchedules: 0 };

  // Filter logs based on search & group selection
  const rawLogs = selectedChatId === 'all' 
    ? overview?.recentLogs || [] 
    : groupDetails?.logs || [];

  const filteredLogs = rawLogs.filter((l: ModerationLog) => {
    const matchesSearch = debouncedSearchQuery === '' || 
      l.action?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.targetUsername?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.adminUsername?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.reason?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.details?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      l.chatTitle?.toLowerCase().includes(debouncedSearchQuery.toLowerCase());

    const matchesType = logFilterType === 'ALL' || l.action?.toLowerCase() === logFilterType.toLowerCase();
    return matchesSearch && matchesType;
  });

  // All stored messages across groups for the Messages tab
  const allStoredMessages = useMemo(() => {
    if (activeGroupDetailId) {
      return (groupDetails?.storedMessages || []).map((m: any) => ({ ...m, groupTitle: groupDetails.chatTitle, chatId: activeGroupDetailId }));
    }
    if (groupDetails?.storedMessages) {
      return groupDetails.storedMessages;
    }
    return [];
  }, [activeGroupDetailId, groupDetails]);

  // Color classes helper for themes
  const themeBg = isDark ? 'bg-stone-900 text-stone-100' : 'bg-slate-50 text-slate-900';
  const themeHeaderBg = isDark ? 'bg-stone-950 border-stone-800' : 'bg-white border-slate-200';
  const themeSidebarBg = isDark ? 'bg-stone-950 border-stone-800' : 'bg-white border-slate-200';
  const themeCardBg = isDark ? 'bg-stone-950 border-stone-800' : 'bg-white border-slate-200 shadow-sm';
  const themeInnerCardBg = isDark ? 'bg-stone-900 border-stone-800' : 'bg-slate-50 border-slate-200';
  const themeMutedText = isDark ? 'text-stone-400' : 'text-slate-500';
  const themeBorder = isDark ? 'border-stone-800' : 'border-slate-200';
  const themeInputBg = isDark ? 'bg-stone-900 border-stone-800 text-stone-100 placeholder:text-stone-600' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400';

  // Group Auto Engine settings extraction
  const curAutoEngine = groupDetails?.settings?.autoEngine || {
    enabled: true,
    mode: 'messages_and_stickers',
    messages: {
      preset: 'normal',
      minSeconds: 480,
      maxSeconds: 900,
      cooldownSeconds: 480,
      randomize: true
    },
    stickers: {
      preset: 'normal',
      minSeconds: 600,
      maxSeconds: 1200,
      cooldownSeconds: 600,
      randomize: true
    }
  };
  const curAutoResponse = groupDetails?.settings?.autoResponse || {
    enabled: true,
    mode: 'every_message',
    cooldownSeconds: 30,
    randomize: false,
    minSeconds: 30,
    maxSeconds: 120
  };
  const curAutoSticker = groupDetails?.settings?.autoSticker || {
    enabled: true,
    mode: 'cooldown',
    cooldownSeconds: 60,
    randomize: false,
    minSeconds: 60,
    maxSeconds: 300
  };

  // Auth Guard: While checking operator session
  if (authLoading) {
    return (
      <div className="h-screen w-screen bg-stone-950 text-stone-100 flex flex-col items-center justify-center font-sans select-none">
        <div className="flex flex-col items-center gap-4 p-8 rounded-3xl bg-stone-900/60 border border-stone-800/80 shadow-2xl backdrop-blur-xl">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-pink-600 via-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-purple-500/25 animate-pulse">
            <Bot className="w-7 h-7" />
          </div>
          <div className="text-center">
            <h2 className="text-sm font-bold tracking-tight text-white flex items-center justify-center gap-2">
              ROXIE CONTROL CENTER
            </h2>
            <p className="text-xs text-stone-400 mt-1">Verifying operator session...</p>
          </div>
          <Loader2 className="w-5 h-5 text-purple-400 animate-spin mt-2" />
        </div>
      </div>
    );
  }

  // Auth Guard: Fullscreen Dark-Themed Login Screen
  if (!session) {
    return (
      <div className="min-h-screen w-full bg-stone-950 text-stone-100 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden select-none">
        {/* Ambient Glow Background Effects */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/15 rounded-full blur-[128px] pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-pink-600/15 rounded-full blur-[128px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[160px] pointer-events-none" />

        <div className="w-full max-w-md bg-stone-900/80 border border-stone-800 rounded-3xl p-8 shadow-2xl backdrop-blur-2xl space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-300">
          <div className="text-center space-y-2.5">
            <div className="inline-flex p-3.5 rounded-2xl bg-gradient-to-tr from-pink-600 via-purple-600 to-indigo-600 text-white shadow-xl shadow-purple-500/30 mb-1">
              <Bot className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              ROXIE CONTROL CENTER
            </h1>
            <p className="text-xs text-stone-400 max-w-xs mx-auto">
              Authenticate operator credentials to access group moderation, direct chats, and system security controls.
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-medium">{loginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                Operator Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoFocus
                  className="w-full bg-stone-950/70 border border-stone-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-stone-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1.5">
                Operator Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full bg-stone-950/70 border border-stone-800 rounded-2xl px-4 py-3 text-xs text-white placeholder-stone-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 p-1 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-2xl text-xs font-bold transition-all shadow-lg shadow-purple-600/30 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 cursor-pointer active:scale-[0.99]"
            >
              {loggingIn ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating Operator...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Authenticate Operator</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-3 border-t border-stone-800/80 text-center">
            <p className="text-[11px] text-stone-500 flex items-center justify-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              <span>Restricted Access • Authorized Operators Only</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen overflow-hidden ${themeBg} flex flex-col font-sans transition-colors duration-200`}>
      
      {/* Top Banner / Global Header */}
      <header className={`${themeHeaderBg} border-b px-3 sm:px-6 py-2.5 sm:py-3.5 flex flex-row items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-sm`}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile Hamburger Menu Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className={`lg:hidden p-2 rounded-xl border ${themeBorder} ${themeInnerCardBg} hover:opacity-80 transition-colors text-stone-200 shrink-0`}
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20 shrink-0">
            <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold tracking-tight flex items-center gap-1.5 sm:gap-2 truncate">
              ROXIE CONTROL CENTER
              <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-semibold uppercase tracking-wider shrink-0">
                Telegram Core
              </span>
            </h1>
            <p className={`hidden md:block text-xs ${themeMutedText} truncate`}>Multi-Group Moderation, Direct Chats, Security & Broadcast Operations</p>
          </div>
        </div>

        {/* Status Indicators, Theme Toggle & Test Button */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {session ? (
            <div className={`flex items-center gap-1.5 sm:gap-2 ${themeInnerCardBg} px-2 sm:px-3 py-1.5 rounded-xl border ${themeBorder} text-xs`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="font-semibold text-xs truncate max-w-[90px] sm:max-w-none">{operator?.username || session.username}</span>
              <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-mono font-bold">
                {session.role}
              </span>
              <button
                onClick={handleAdminLogout}
                className="ml-1 text-[11px] text-rose-400 hover:text-rose-300 font-medium hover:underline flex items-center gap-1 shrink-0"
                title="Log out of Admin session"
              >
                <LogOut className="w-3 h-3" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setLoginError(null); setShowLoginModal(true); }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm shrink-0"
              title="Operator / Admin Login"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Admin Login</span>
            </button>
          )}

          <div className={`hidden sm:flex items-center gap-2 ${themeInnerCardBg} px-3 py-1.5 rounded-xl border ${themeBorder} text-xs`}>
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isPolling ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="font-medium text-xs">
              {isPolling ? '🟢 Online' : '🟡 Inactive'}
            </span>
          </div>

          <button
            onClick={toggleTheme}
            className={`p-2 rounded-xl border ${themeBorder} ${themeInnerCardBg} hover:opacity-80 transition-colors text-xs flex items-center gap-1.5 shrink-0`}
            title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />}
            <span className="text-[11px] font-medium hidden md:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>

          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{testingConnection ? 'Testing...' : 'Test Connection'}</span>
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Container */}
          <aside className={`fixed inset-y-0 left-0 w-72 max-w-[85vw] ${themeSidebarBg} border-r ${themeBorder} p-4 space-y-4 flex flex-col justify-between h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200`}>
            <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-2 border-b border-stone-800">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-blue-500" />
                  <span className="font-bold text-sm text-stone-100">Roxie Menu</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-stone-800 text-stone-400 hover:text-stone-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Group Scope Selector */}
              <div className="space-y-1.5 shrink-0">
                <label className={`text-[11px] font-semibold ${themeMutedText} uppercase tracking-wider flex items-center gap-1.5`}>
                  <Users className="w-3.5 h-3.5" /> Group Scope
                </label>
                <select
                  value={selectedChatId}
                  onChange={(e) => {
                    const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                    setSelectedChatId(val);
                    if (val !== 'all') {
                      setActiveGroupDetailId(val);
                      setActiveNav('groups');
                    } else {
                      setActiveGroupDetailId(null);
                    }
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors`}
                >
                  <option value="all">🟢 [ All Groups ] ({groups.length})</option>
                  {groups.map((g) => (
                    <option key={g.chatId} value={g.chatId}>
                      {g.botLeft ? '⚫' : '🟢'} {g.chatTitle} ({g.chatId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Navigation Menu */}
              <nav className="space-y-1.5 overflow-y-auto flex-1 pr-1 text-xs">
                {[
                  { id: 'groups', label: '👥 Groups', icon: Users, badge: groups.length },
                  { id: 'private-chats', label: '💬 Private Chats', icon: MessageSquare, badge: privateChats.length },
                  { id: 'broadcast', label: '📣 Broadcast', icon: Radio },
                  { id: 'post-library', label: '🔖 Post Library', icon: Bookmark },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNav === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavSelect(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors min-h-[44px] ${
                        isActive
                          ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 font-semibold'
                          : `${themeMutedText} hover:bg-stone-800/20`
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.badge !== undefined && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold font-mono">
                            {item.badge}
                          </span>
                        )}
                        {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Sidebar Footer info */}
            <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-[11px] ${themeMutedText} space-y-1.5 shrink-0`}>
              <div className="flex justify-between">
                <span>Bot Username:</span>
                <span className="font-mono font-semibold">@{botInfo?.username || 'MissRoxie_Bot'}</span>
              </div>
              <div className="flex justify-between">
                <span>Connected Groups:</span>
                <span className="font-bold text-blue-500">{groups.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Security Engine:</span>
                <span className="text-emerald-500 font-semibold">Active</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-65px)] overflow-hidden">
        
        {/* Desktop Sidebar Navigation */}
        <aside className={`hidden lg:flex lg:w-72 ${themeSidebarBg} border-r p-4 space-y-4 flex-col justify-between h-full overflow-hidden shrink-0`}>
          <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
            
            {/* Group Scope Selector */}
            <div className="space-y-1.5 shrink-0">
              <label className={`text-[11px] font-semibold ${themeMutedText} uppercase tracking-wider flex items-center gap-1.5`}>
                <Users className="w-3.5 h-3.5" /> Group Scope
              </label>
              <select
                value={selectedChatId}
                onChange={(e) => {
                  const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                  setSelectedChatId(val);
                  if (val !== 'all') {
                    setActiveGroupDetailId(val);
                    setActiveNav('groups');
                  } else {
                    setActiveGroupDetailId(null);
                  }
                }}
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors`}
              >
                <option value="all">🟢 [ All Groups ] ({groups.length})</option>
                {groups.map((g) => (
                  <option key={g.chatId} value={g.chatId}>
                    {g.botLeft ? '⚫' : '🟢'} {g.chatTitle} ({g.chatId})
                  </option>
                ))}
              </select>
            </div>

            {/* Navigation Menu */}
            <nav className="space-y-1.5 overflow-y-auto flex-1 pr-1 text-xs">
              {[
                { id: 'groups', label: '👥 Groups', icon: Users, badge: groups.length },
                { id: 'private-chats', label: '💬 Private Chats', icon: MessageSquare, badge: privateChats.length },
                { id: 'broadcast', label: '📣 Broadcast', icon: Radio },
                { id: 'post-library', label: '🔖 Post Library', icon: Bookmark },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavSelect(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-colors ${
                      isActive 
                        ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20 font-semibold' 
                        : `${themeMutedText} hover:bg-stone-800/20`
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {item.badge !== undefined && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold font-mono">
                          {item.badge}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer info */}
          <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-[11px] ${themeMutedText} space-y-1.5 shrink-0`}>
            <div className="flex justify-between">
              <span>Bot Username:</span>
              <span className="font-mono font-semibold">@{botInfo?.username || 'MissRoxie_Bot'}</span>
            </div>
            <div className="flex justify-between">
              <span>Connected Groups:</span>
              <span className="font-bold text-blue-500">{groups.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Security Engine:</span>
              <span className="text-emerald-500 font-semibold">Active</span>
            </div>
          </div>
        </aside>

        {/* Content Area - Scrollable */}
        <main ref={mainScrollRef as any} className="flex-1 p-3 sm:p-6 pb-24 lg:pb-6 space-y-6 overflow-y-auto h-full">
          
          {/* Global Search & Export Header */}
          <div className={`sticky top-0 z-30 ${themeCardBg} backdrop-blur-md border rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3`}>
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search events, users, groups, messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-blue-500 transition-colors`}
              />
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className={`${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
              >
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="all">All Time</option>
              </select>

              <button
                onClick={() => exportData('json')}
                className={`flex items-center gap-1.5 px-3 py-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-xs transition-colors`}
              >
                <Download className="w-3.5 h-3.5" /> JSON
              </button>
              <button
                onClick={() => exportData('csv')}
                className={`flex items-center gap-1.5 px-3 py-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-xs transition-colors`}
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* TAB: OVERVIEW */}
          {activeNav === 'overview' && !activeGroupDetailId && (
            <div className="space-y-6">
              
              {/* Top Metrics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: '🤖 Bot Status', value: isPolling ? 'ONLINE' : 'OFFLINE', subtitle: isPolling ? 'Telegram Connected' : 'Polling Inactive', icon: Bot, color: isPolling ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
                  { label: '👥 Connected Groups', value: groups.length, subtitle: `${groups.filter(g => !g.botLeft).length} Active`, icon: Users, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
                  { label: '💬 Private Chats', value: overview?.privateChatsCount || privateChats.length, subtitle: 'Users in Direct Chat', icon: MessageSquare, color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
                  { label: '📨 Stored Messages', value: overview?.totalMessagesCount || 0, subtitle: 'Group & Private Memory', icon: FileText, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' },
                ].map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <div key={idx} className={`${themeCardBg} border rounded-2xl p-5 flex items-center justify-between`}>
                      <div>
                        <p className={`text-xs ${themeMutedText} font-medium`}>{s.label}</p>
                        <h3 className="text-2xl font-bold mt-1">{s.value}</h3>
                        <p className="text-[11px] text-stone-400 mt-0.5">{s.subtitle}</p>
                      </div>
                      <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${s.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bot Identity Banner */}
              <div className={`${themeCardBg} border rounded-2xl p-6`}>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-blue-500/20 shrink-0">
                      🤖
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-lg font-bold">@{botInfo?.username || 'MissRoxie_Bot'}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isPolling ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                          {isPolling ? 'POLLING ACTIVE' : 'DISCONNECTED'}
                        </span>
                      </div>
                      <p className={`text-xs ${themeMutedText} mt-0.5 font-mono`}>
                        ID: {botInfo?.id || '1087968824'} • Name: {botInfo?.firstName || 'Miss Roxie'} • Uptime: {Math.floor((overview?.uptimeSeconds || 0) / 60)}m {(overview?.uptimeSeconds || 0) % 60}s
                      </p>
                      <div className="flex items-center gap-3 mt-3 text-xs">
                        <span className="flex items-center gap-1 text-blue-500 font-medium">
                          <Users className="w-3.5 h-3.5" /> {overview?.activeUsersCount || 0} Active Users
                        </span>
                        <span className="flex items-center gap-1 text-purple-500 font-medium">
                          <Smile className="w-3.5 h-3.5" /> {overview?.totalStickersCount || 0} Stickers
                        </span>
                        <span className="flex items-center gap-1 text-emerald-500 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" /> Anti-Raid Active
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                    <button
                      onClick={() => { handleNavSelect('broadcast'); setBroadcastSubTab('standard'); }}
                      className="flex-1 md:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      <Radio className="w-4 h-4" /> Broadcast
                    </button>
                    <button
                      onClick={() => handleNavSelect('send-message')}
                      className={`flex-1 md:flex-none px-4 py-2 ${themeInnerCardBg} hover:opacity-80 border ${themeBorder} rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2`}
                    >
                      <Send className="w-4 h-4" /> Send Message
                    </button>
                  </div>
                </div>
              </div>

              {/* Connected Groups Quick Grid */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-500" /> Connected Telegram Groups ({groups.length})
                  </h3>
                  <button
                    onClick={() => setActiveNav('groups')}
                    className="text-xs text-blue-500 hover:underline font-semibold"
                  >
                    View All Groups →
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {groups.slice(0, 6).map((g) => (
                    <div key={g.chatId} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            g.status === 'Unavailable' ? 'bg-red-500' :
                            g.botLeft ? 'bg-stone-500' : 'bg-emerald-500'
                          }`} />
                          <h4 className="text-xs font-bold">{g.chatTitle}</h4>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                            g.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' :
                            g.status === 'Bot Left' ? 'bg-stone-500/10 text-stone-400' :
                            g.status === 'Unavailable' ? 'bg-red-500/10 text-red-500' :
                            'bg-amber-500/10 text-amber-500'
                          }`}>
                            {g.status}
                          </span>
                        </div>
                        <div className={`text-[11px] ${themeMutedText} font-mono`}>
                          Chat ID: {g.chatId} • Role: {g.botRole || 'Admin'}
                        </div>
                      </div>

                      <button
                        onClick={() => { setActiveGroupDetailId(g.chatId); setActiveNav('groups'); }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        Open
                      </button>
                    </div>
                  ))}
                  {groups.length === 0 && (
                    <p className={`text-xs ${themeMutedText} col-span-2 py-6 text-center`}>No groups discovered yet. Add Roxie to a Telegram group to begin monitoring.</p>
                  )}
                </div>
              </div>

              {/* Moderation Actions Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Bans Issued', count: stats.totalBans, icon: Ban, color: 'text-red-500' },
                  { label: 'Kicks Issued', count: stats.totalKicks, icon: UserX, color: 'text-amber-500' },
                  { label: 'Warnings Issued', count: stats.totalWarns, icon: AlertTriangle, color: 'text-yellow-500' },
                  { label: 'Reports Handled', count: stats.totalReports, icon: Flag, color: 'text-blue-500' },
                ].map((m, idx) => (
                  <div key={idx} className={`${themeCardBg} border rounded-2xl p-4 space-y-1`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${themeMutedText}`}>{m.label}</span>
                      <m.icon className={`w-4 h-4 ${m.color}`} />
                    </div>
                    <div className="text-xl font-bold font-mono">{m.count}</div>
                  </div>
                ))}
              </div>

            </div>
          )}

          {/* TAB: GLOBAL CONTROL CENTER */}
          {activeNav === 'control-center' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Sliders className="w-5 h-5 text-purple-400" /> Global Control Center
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold uppercase tracking-wider">
                      🌐 Bot-Wide Master Controls
                    </span>
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>
                    Configure global bot policies, master engine toggles, and view cross-scope operational status.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {savingGlobal && <span className="text-xs text-purple-400 animate-pulse font-semibold">Updating global settings...</span>}
                  <button
                    onClick={fetchData}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>
              </div>

              {/* Hierarchy / Scope Explainer Legend */}
              <div className={`${themeCardBg} border rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4`}>
                <div className={`${themeInnerCardBg} p-3.5 rounded-xl border ${themeBorder} space-y-1`}>
                  <div className="flex items-center gap-2 font-bold text-xs text-purple-400">
                    <Globe className="w-4 h-4" /> 🌐 GLOBAL SCOPE
                  </div>
                  <p className={`text-[11px] ${themeMutedText}`}>
                    Master switches that apply across the entire Roxie instance. If disabled here, feature is inactive everywhere.
                  </p>
                </div>
                <div className={`${themeInnerCardBg} p-3.5 rounded-xl border ${themeBorder} space-y-1`}>
                  <div className="flex items-center gap-2 font-bold text-xs text-blue-400">
                    <Users className="w-4 h-4" /> 👥 GROUP SCOPE
                  </div>
                  <p className={`text-[11px] ${themeMutedText}`}>
                    Completely isolated per Telegram group in <code className="font-mono text-[10px]">data/groups/&lt;chatId&gt;.json</code>.
                  </p>
                </div>
                <div className={`${themeInnerCardBg} p-3.5 rounded-xl border ${themeBorder} space-y-1`}>
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-400">
                    <MessageSquare className="w-4 h-4" /> 👤 PRIVATE CHAT
                  </div>
                  <p className={`text-[11px] ${themeMutedText}`}>
                    Direct 1-on-1 personal conversations with Roxie saved in <code className="font-mono text-[10px]">data/private/&lt;userId&gt;.json</code>.
                  </p>
                </div>
              </div>

              {/* Master Global Controls Grid */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-5`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Master Engine Toggles
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { key: 'botEnabled', label: '🤖 Telegram Bot Online', desc: 'Global master switch for bot responsiveness' },
                    { key: 'aiConversationEnabled', label: '💬 AI Conversation Engine', desc: 'Enable AI chat processing globally' },
                    { key: 'globalModerationEnabled', label: '🛡️ Moderation Engine', desc: 'Enforce anti-spam, anti-flood and filters' },
                    { key: 'globalStickersEnabled', label: '🎨 Sticker & Media System', desc: 'Enable custom & anime sticker responses' },
                    { key: 'globalAutoResponseEnabled', label: '🤖 Auto-Response System', desc: 'Enable scheduled or frequency-based AI chats' },
                    { key: 'globalAutoStickerEnabled', label: '🎭 Auto-Sticker System', desc: 'Enable auto-sticker response frequency engine' },
                    { key: 'globalLustModeAvailable', label: '❤️ Lust Mode Availability', desc: 'Allow groups to activate Lust Mode (Levels 0-4)' },
                    { key: 'globalLoggingEnabled', label: '📋 Audit Logging', desc: 'Record operator and bot moderation events' },
                    { key: 'maintenanceMode', label: '🚧 Maintenance Mode', desc: 'Restrict operations to dashboard operators only' },
                  ].map((ctrl) => {
                    const isChecked = Boolean((globalSettings as any)[ctrl.key]);
                    return (
                      <div key={ctrl.key} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between gap-3`}>
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            {ctrl.label}
                          </span>
                          <p className={`text-[10px] ${themeMutedText}`}>{ctrl.desc}</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => updateGlobalSetting(ctrl.key, e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connected Groups Quick Jumper */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Users className="w-4 h-4" /> Connected Telegram Groups ({groups.length})
                  </h3>
                  <span className={`text-xs ${themeMutedText}`}>Select a group to open its full 18-tab Control Center</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {groups.map((g) => (
                    <button
                      key={g.chatId}
                      onClick={() => {
                        setSelectedChatId(g.chatId);
                        setActiveGroupDetailId(g.chatId);
                        setGroupDetailTab('overview');
                      }}
                      className={`${themeInnerCardBg} border ${themeBorder} hover:border-purple-500/50 p-3 rounded-xl text-left transition-all space-y-1 group`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold truncate group-hover:text-purple-400 transition-colors">
                          {g.chatTitle}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                          g.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-stone-500/10 text-stone-400'
                        }`}>
                          {g.status}
                        </span>
                      </div>
                      <div className={`text-[10px] font-mono ${themeMutedText}`}>
                        ID: {g.chatId}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot-Wide Full Backup & Restore */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Database className="w-4 h-4" /> Bot-Wide Complete Backup & Restore
                    </h3>
                    <p className={`text-[11px] ${themeMutedText}`}>
                      Export or restore configurations for all {groups.length} Telegram groups and global flags in a single JSON backup.
                    </p>
                  </div>
                  <button
                    onClick={handleExportAllBotBackup}
                    disabled={botBackupLoading}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {botBackupLoading ? 'Exporting...' : 'Export All Groups JSON'}
                  </button>
                </div>

                {botBackupNotification && (
                  <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    botBackupNotification.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {botBackupNotification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{botBackupNotification.message}</span>
                  </div>
                )}

                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                  <span className="text-xs font-bold block">Restore Full Bot Backup</span>
                  <p className={`text-[11px] ${themeMutedText}`}>
                    Upload or paste a complete bot backup JSON file to restore all groups. All current group states will have safety backups created automatically before restoration.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-stone-700/40 hover:bg-stone-700/60 rounded-xl text-xs font-semibold flex items-center gap-1.5 text-stone-300 border border-stone-600/30">
                        <Upload className="w-3.5 h-3.5" /> Select .json File
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setBotBackupJson(ev.target?.result as string || '');
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                      </label>
                      {botBackupJson && (
                        <span className="text-[11px] text-emerald-400 font-mono">
                          JSON payload loaded ({botBackupJson.length} bytes)
                        </span>
                      )}
                    </div>
                    <textarea
                      value={botBackupJson}
                      onChange={(e) => setBotBackupJson(e.target.value)}
                      placeholder='Paste full bot backup JSON here: { "backupVersion": "1.0", "groups": { ... } }'
                      rows={3}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-emerald-500`}
                    />
                    <div className="flex items-center justify-end">
                      <button
                        onClick={handleRestoreAllBotBackup}
                        disabled={!botBackupJson.trim() || botBackupLoading}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${botBackupLoading ? 'animate-spin' : ''}`} />
                        {botBackupLoading ? 'Restoring All Groups...' : 'Restore Full Bot Backup'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: GROUPS LIST VIEW */}
          {activeNav === 'groups' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-500" /> Telegram Groups ({groups.length})
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Real-time inspection, administration, settings and permission controls.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => { handleNavSelect('broadcast'); setBroadcastSubTab('standard'); }}
                    className={`px-3 py-1.5 ${themeInnerCardBg} hover:opacity-80 text-stone-300 border ${themeBorder} rounded-xl text-xs font-semibold flex items-center gap-1.5`}
                  >
                    <Radio className="w-3.5 h-3.5 text-blue-400" /> Broadcast
                  </button>
                  <button
                    onClick={fetchData}
                    className={`px-3 py-1.5 ${themeInnerCardBg} hover:opacity-80 text-stone-300 border ${themeBorder} rounded-xl text-xs font-semibold flex items-center gap-1.5`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh Groups
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((g) => (
                  <div key={g.chatId} className={`${themeCardBg} border rounded-2xl p-5 space-y-4 flex flex-col justify-between`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-base">
                            {g.chatTitle.slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-xs font-bold truncate max-w-[160px]">{g.chatTitle}</h3>
                            <span className={`text-[10px] font-mono ${themeMutedText}`}>ID: {g.chatId}</span>
                          </div>
                        </div>

                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                          g.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                          g.status === 'Bot Left' ? 'bg-stone-500/10 text-stone-400 border border-stone-500/20' :
                          g.status === 'Unavailable' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                          'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                        }`}>
                          {g.status}
                        </span>
                      </div>

                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs space-y-1.5`}>
                        <div className="flex justify-between">
                          <span className={themeMutedText}>Roxie Role:</span>
                          <span className="font-semibold">{g.botRole || '🛡️ Administrator'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={themeMutedText}>Members:</span>
                          <span className="font-mono">{g.memberCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={themeMutedText}>Protection:</span>
                          <span className={`font-semibold ${g.protectionStatus ? 'text-emerald-500' : 'text-stone-400'}`}>
                            {g.protectionStatus ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={themeMutedText}>Lust Mode:</span>
                          <span className={`font-semibold ${g.lustMode ? 'text-pink-500' : 'text-stone-400'}`}>
                            {g.lustMode ? '❤️ Enabled' : 'Off'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => { setActiveGroupDetailId(g.chatId); setGroupDetailTab('overview'); }}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>[ OPEN ]</span>
                      </button>
                      <button
                        onClick={() => setRemoveDashboardModalGroup(g)}
                        className="px-2.5 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                        title="Remove from Dashboard"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Remove</span>
                      </button>
                      {g.status === 'Bot Left' ? (
                        <span className="px-3 py-2 bg-stone-500/10 text-stone-400 border border-stone-500/20 rounded-xl text-xs font-semibold flex items-center gap-1">
                          <LogOut className="w-3.5 h-3.5" /> Left
                        </span>
                      ) : g.status === 'Unavailable' ? (
                        <span
                          className="px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold flex items-center gap-1"
                          title={g.unavailableReason || 'Unavailable on Telegram'}
                        >
                          <AlertTriangle className="w-3.5 h-3.5" /> Stale
                        </span>
                      ) : (
                        <button
                          onClick={() => { setLeaveModalGroup(g); setLeaveConfirmInput(''); }}
                          className="px-3 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1"
                          title="Leave Group"
                        >
                          <LogOut className="w-3.5 h-3.5" /> Leave
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: GROUP DETAIL VIEW WITH INNER TABS */}
          {activeNav === 'groups' && activeGroupDetailId && groupDetails && (
            <div className="space-y-6">
              
              {/* Group Detail Header */}
              <div className={`${themeCardBg} border rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4`}>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setActiveGroupDetailId(null)}
                    className={`p-2 ${themeInnerCardBg} hover:opacity-80 rounded-xl border ${themeBorder} text-xs flex items-center gap-1`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold">{groupDetails.chatTitle}</h2>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        groupDetails.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                        groupDetails.status === 'Bot Left' ? 'bg-stone-500/10 text-stone-400 border border-stone-500/20' :
                        groupDetails.status === 'Unavailable' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                        'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      }`}>
                        {groupDetails.status}
                      </span>
                      {settingsSaveStatus === 'saving' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Saving...
                        </span>
                      )}
                      {settingsSaveStatus === 'saved' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Saved ✓
                        </span>
                      )}
                      {settingsSaveStatus === 'error' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertCircle className="w-3 h-3" /> Save failed
                          <button onClick={() => flushPendingSettings()} className="underline ml-1 font-bold hover:text-rose-200">Retry</button>
                        </span>
                      )}
                    </div>
                    <p className={`text-xs ${themeMutedText} font-mono mt-0.5`}>
                      Chat ID: {groupDetails.chatId} • Authority: {groupDetails.botRole || '🛡️ Administrator'}
                      {groupDetails.unavailableReason && (
                        <span className="text-red-400 ml-2 font-sans font-medium">({groupDetails.unavailableReason})</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Inner Tabs Navigation */}
                <div className={`flex items-center gap-1.5 ${themeInnerCardBg} p-2 rounded-xl border ${themeBorder} flex-wrap text-xs font-semibold overflow-x-auto`}>
                  {[
                    { id: 'overview', label: '📊 Overview' },
                    { id: 'welcome_goodbye', label: '👋 Welcome & Goodbye' },
                    { id: 'rich_post', label: '✨ Rich Post' },
                    { id: 'mention_all', label: '📢 Mention All (@all)' },
                    { id: 'general', label: '⚙️ General' },
                    { id: 'moderation', label: '🛡️ Moderation' },
                    { id: 'content_protection', label: '🔒 Content Protection' },
                    { id: 'ai_conversation', label: '🤖 AI / Chat' },
                    { id: 'lust_mode', label: '❤️ Lust Mode' },
                    { id: 'stickers', label: `🎨 Stickers (${groupStickersData?.packs?.length || 0})` },
                    { id: 'auto_engine', label: '⚡ Auto Engine' },
                    { id: 'slowmode', label: '⏱️ Slowmode' },
                    { id: 'abuse_words', label: `🤬 Abuse Words (${groupAbuseWords.length})` },
                    { id: 'members', label: `👥 Members (${groupMembersList.length})` },
                    { id: 'moderators', label: `👮 Moderators (${groupModerators?.administrators?.length || 0})` },
                    { id: 'telegram_permissions', label: '🔐 Permissions' },
                    { id: 'commands', label: '📜 Commands' },
                    { id: 'messages', label: `💬 Messages (${groupDetails.storedMessages?.length || 0})` },
                    { id: 'schedules', label: `⏰ Schedules & Rules (${schedulesList.filter(s => s.chatId === activeGroupDetailId).length})` },
                    { id: 'activity', label: '📋 Activity' },
                    { id: 'backup', label: '💾 Backup & Restore' },
                    { id: 'danger_zone', label: '🚨 Danger Zone' }
                  ].map((tab: any) => (
                    <button
                      key={tab.id}
                      onClick={() => setGroupDetailTab(tab.id)}
                      className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap ${
                        groupDetailTab === tab.id || (groupDetailTab === 'settings' && tab.id === 'general') || (groupDetailTab === 'permissions' && tab.id === 'telegram_permissions')
                          ? 'bg-blue-600 text-white shadow-sm font-bold'
                          : `${themeMutedText} hover:opacity-80 hover:bg-stone-800/20`
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* INNER TAB: GROUP OVERVIEW */}
              {groupDetailTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                      { label: 'Bans', count: groupDetails.bans?.length || 0, icon: Ban, color: 'text-red-500' },
                      { label: 'Kicks', count: groupDetails.kicks?.length || 0, icon: UserX, color: 'text-amber-500' },
                      { label: 'Mutes', count: groupDetails.mutes?.length || 0, icon: Volume2, color: 'text-yellow-500' },
                      { label: 'Reports', count: groupDetails.reports?.length || 0, icon: Flag, color: 'text-blue-500' },
                    ].map((s, idx) => (
                      <div key={idx} className={`${themeCardBg} border rounded-2xl p-4 space-y-1`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${themeMutedText}`}>{s.label}</span>
                          <s.icon className={`w-4 h-4 ${s.color}`} />
                        </div>
                        <div className="text-xl font-bold font-mono">{s.count}</div>
                      </div>
                    ))}
                  </div>

                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <h3 className="text-xs font-bold uppercase tracking-wider">Active Group Protections</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Link Protection', on: Boolean(groupDetails.settings?.linksProtection) },
                        { label: 'Sticker Protection', on: Boolean(groupDetails.settings?.stickerProtection) },
                        { label: 'Anti-Flood', on: Boolean(groupDetails.settings?.floodEnabled) },
                        { label: 'Anti-Raid', on: Boolean(groupDetails.settings?.raidEnabled) },
                        { label: 'CAPTCHA Verification', on: Boolean(groupDetails.settings?.captchaEnabled) },
                        { label: 'AI Chatbot', on: Boolean(groupDetails.settings?.chatbotEnabled) },
                        { label: 'Lust Mode', on: Boolean(groupDetails.settings?.lustMode) },
                        { label: 'Reports System', on: Boolean(groupDetails.settings?.reportsEnabled) }
                      ].map((p, idx) => (
                        <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                          <span>{p.label}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.on ? 'bg-emerald-500/10 text-emerald-500' : 'bg-stone-500/10 text-stone-400'}`}>
                            {p.on ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP WELCOME & GOODBYE + PRIVATE DM */}
              {groupDetailTab === 'welcome_goodbye' && (
                <div className="space-y-6">
                  {/* Top Sub-Navigation for Welcome & Goodbye */}
                  <div className={`flex items-center gap-2 ${themeInnerCardBg} p-2 rounded-xl border ${themeBorder} text-xs font-semibold overflow-x-auto`}>
                    {[
                      { id: 'group_welcome' as const, label: '👥 Group Welcome (In-Group)', active: Boolean(groupWelcomeConfig.enabled) },
                      { id: 'group_goodbye' as const, label: '👋 Group Goodbye (In-Group)', active: Boolean(groupGoodbyeConfig.enabled) },
                      { id: 'welcome_dm' as const, label: '✉️ Welcome Private DM', active: Boolean(welcomeDmConfig.enabled) }
                    ].map(st => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setWelcomeGoodbyeSubTab(st.id)}
                        className={`px-3 py-2 rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${
                          welcomeGoodbyeSubTab === st.id
                            ? 'bg-blue-600 text-white shadow-sm font-bold'
                            : `${themeMutedText} hover:bg-stone-800/20 hover:text-stone-200`
                        }`}
                      >
                        <span>{st.label}</span>
                        <span className={`w-2 h-2 rounded-full ${st.active ? 'bg-emerald-400 ring-2 ring-emerald-400/20' : 'bg-stone-600'}`} />
                      </button>
                    ))}
                  </div>

                  {/* Sub-tab 1: Group Welcome */}
                  {welcomeGoodbyeSubTab === 'group_welcome' && (
                    <RichMessageEditor
                      title="👥 Group Welcome Greeting"
                      subtitle="Sent in-group when a new member joins"
                      description={`Broadcasted inside ${groupDetails.chatTitle || 'this group'} whenever a real human user joins.`}
                      badgeLabel="In-Group Join"
                      config={groupWelcomeConfig}
                      defaultText="👋 Welcome {user} to {groupname}!"
                      groupTitle={groupDetails.chatTitle}
                      groupId={groupDetails.chatId}
                      isPrivateDm={false}
                      theme={theme}
                      onChange={setGroupWelcomeConfig}
                      onToggle={handleToggleGroupWelcome}
                      onSave={() => handleSaveWelcomeGoodbye()}
                      onTest={() => handleTestWelcomeGoodbye('groupWelcome')}
                      testLabel="Send Test to Group"
                      isSaving={welcomeGoodbyeSaving}
                      isTesting={welcomeGoodbyeTesting}
                      notification={welcomeGoodbyeNotification}
                      onClearNotification={() => setWelcomeGoodbyeNotification(null)}
                    />
                  )}

                  {/* Sub-tab 2: Group Goodbye */}
                  {welcomeGoodbyeSubTab === 'group_goodbye' && (
                    <RichMessageEditor
                      title="👋 Group Goodbye Farewell"
                      subtitle="Sent in-group when a member leaves"
                      description={`Broadcasted inside ${groupDetails.chatTitle || 'this group'} when a member leaves or is removed. Note: Roxie NEVER sends private goodbye DMs.`}
                      badgeLabel="In-Group Leave"
                      config={groupGoodbyeConfig}
                      defaultText="👋 Goodbye {user}, we will miss you!"
                      groupTitle={groupDetails.chatTitle}
                      groupId={groupDetails.chatId}
                      isPrivateDm={false}
                      theme={theme}
                      onChange={setGroupGoodbyeConfig}
                      onToggle={handleToggleGroupGoodbye}
                      onSave={() => handleSaveWelcomeGoodbye()}
                      onTest={() => handleTestWelcomeGoodbye('groupGoodbye')}
                      testLabel="Send Test to Group"
                      isSaving={welcomeGoodbyeSaving}
                      isTesting={welcomeGoodbyeTesting}
                      notification={welcomeGoodbyeNotification}
                      onClearNotification={() => setWelcomeGoodbyeNotification(null)}
                    />
                  )}

                  {/* Sub-tab 3: Welcome Private DM */}
                  {welcomeGoodbyeSubTab === 'welcome_dm' && (
                    <RichMessageEditor
                      title="✉️ Welcome Private DM"
                      subtitle="Sent directly to user in private chat"
                      description={`Automatically dispatched to the joining user's private Telegram DM when they enter ${groupDetails.chatTitle || 'this group'}.`}
                      badgeLabel="Private DM"
                      config={welcomeDmConfig}
                      defaultText="You joined {groupname} 🎉"
                      groupTitle={groupDetails.chatTitle}
                      groupId={groupDetails.chatId}
                      isPrivateDm={true}
                      theme={theme}
                      onChange={setWelcomeDmConfig}
                      onToggle={handleToggleWelcomeDm}
                      onSave={() => handleSaveWelcomeGoodbye()}
                      onTest={(targetUserId) => handleTestWelcomeGoodbye('welcomeDm', targetUserId)}
                      testLabel="Send Test DM"
                      testPlaceholder="Your Telegram User ID (e.g. 123456789)"
                      isSaving={welcomeGoodbyeSaving}
                      isTesting={welcomeGoodbyeTesting}
                      notification={welcomeGoodbyeNotification}
                      onClearNotification={() => setWelcomeGoodbyeNotification(null)}
                    />
                  )}
                </div>
              )}

              {/* INNER TAB: GROUP RICH POST */}
              {groupDetailTab === 'rich_post' && (
                <RichPostComposer
                  groups={groups}
                  selectedChatId={groupDetails.chatId}
                  lockedDestination={{
                    type: 'group',
                    chatId: groupDetails.chatId,
                    title: groupDetails.chatTitle
                  }}
                  theme={theme}
                  onRefresh={refreshCurrentView}
                  botUsername={botInfo?.username || 'MissRoxie_Bot'}
                />
              )}

              {/* INNER TAB: GROUP MENTION ALL (@ALL) */}
              {groupDetailTab === 'mention_all' && (
                <MentionAllComposer
                  groups={groups}
                  selectedChatId={groupDetails.chatId}
                  lockToSelectedGroup={true}
                  theme={theme}
                  onRefresh={refreshCurrentView}
                />
              )}

              {/* INNER TAB: GROUP STORED MESSAGES */}
              {groupDetailTab === 'messages' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" /> Stored Group Messages ({groupDetails.storedMessages?.length || 0})
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Real messages received & recorded in group memory by Roxie.</p>
                    </div>
                    <button
                      onClick={refreshCurrentView}
                      className={`px-3 py-1.5 ${themeInnerCardBg} border ${themeBorder} hover:opacity-80 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                  </div>

                  {/* Messages Feed */}
                  <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                    {(groupDetails.storedMessages || []).map((msg: any, idx: number) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-start gap-3 transition-colors hover:border-blue-500/30`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          msg.role === 'assistant' || msg.source === 'dashboard' ? 'bg-blue-600 text-white shadow-sm' : 'bg-purple-600/20 text-purple-400'
                        }`}>
                          {msg.role === 'assistant' || msg.source === 'dashboard' ? 'R' : (msg.name?.slice(0, 1) || 'U')}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold">{msg.displayName || msg.name || (msg.role === 'assistant' ? 'Roxie' : 'User')}</span>
                              {msg.username && (
                                <span className={`text-[10px] font-mono ${themeMutedText}`}>@{msg.username}</span>
                              )}
                              {msg.source === 'dashboard' && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  DASHBOARD OPERATOR
                                </span>
                              )}
                              {msg.messageId && (
                                <span className={`text-[10px] font-mono ${themeMutedText}`}>#{msg.messageId}</span>
                              )}
                            </div>
                            <span className={`text-[10px] font-mono ${themeMutedText}`}>
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          {/* Reply quote preview if replying to another message */}
                          {msg.replyTo && (
                            <div className="border-l-2 border-blue-500 bg-blue-500/5 px-2.5 py-1 rounded text-[11px] text-blue-300">
                              <span className="font-semibold">↩ Replying to {msg.replyTo.name || 'user'}:</span> {msg.replyTo.text ? `"${msg.replyTo.text}"` : ''}
                            </div>
                          )}

                          {msg.mediaType === 'sticker' ||
                          msg.content?.startsWith('🎨 Sticker') ||
                          msg.content?.includes('[Sent sticker]') ? (
                            <StickerPreview mediaFileId={msg.mediaFileId} content={msg.content} isDark={false} />
                          ) : (
                            <p className="text-xs leading-relaxed break-words">{msg.content}</p>
                          )}

                          {/* Reply Action Button */}
                          <div className="pt-1 flex items-center justify-end gap-2">
                            {msg.messageId ? (
                              <button
                                onClick={() => handleSelectReplyTarget(msg)}
                                className="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                                title={`Reply directly to message #${msg.messageId}`}
                              >
                                <Reply className="w-3 h-3" /> Reply
                              </button>
                            ) : (
                              <span className="text-[10px] text-stone-500 italic" title="Reply unavailable — Telegram message ID not stored">
                                Reply unavailable
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!groupDetails.storedMessages || groupDetails.storedMessages.length === 0) && (
                      <p className={`text-xs ${themeMutedText} text-center py-8`}>No messages stored for this group yet.</p>
                    )}
                  </div>

                  {/* Professional Sticky Message Composer */}
                  <div id="group-message-composer" className={`border ${themeBorder} rounded-2xl overflow-hidden shadow-lg transition-all ${themeInnerCardBg}`}>
                    {/* Reply Target Preview Bar */}
                    {groupReplyTarget && (
                      <div className="bg-blue-600/10 border-b border-blue-500/20 px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Reply className="w-4 h-4 text-blue-400 shrink-0" />
                          <div className="text-xs truncate">
                            <span className="text-blue-400 font-semibold">Replying to {groupReplyTarget.displayName || groupReplyTarget.name || (groupReplyTarget.username ? `@${groupReplyTarget.username}` : 'User')}</span>
                            {groupReplyTarget.messageId && (
                              <span className={`ml-1.5 font-mono text-[10px] ${themeMutedText}`}>#{groupReplyTarget.messageId}</span>
                            )}
                            <p className={`text-[11px] ${themeMutedText} truncate italic mt-0.5 max-w-[400px]`}>
                              "{groupReplyTarget.content}"
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setGroupReplyTarget(null)}
                          className="p-1 hover:bg-stone-500/20 rounded-lg text-stone-400 hover:text-stone-200 transition-colors shrink-0 cursor-pointer"
                          title="Cancel Reply"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Feedback Notification Banner */}
                    {groupMessageFeedback && (
                      <div className={`px-4 py-2 text-xs flex items-center justify-between ${
                        groupMessageFeedback.type === 'success'
                          ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-b border-red-500/20'
                      }`}>
                        <span>{groupMessageFeedback.message}</span>
                        <button onClick={() => setGroupMessageFeedback(null)} className="hover:opacity-70 cursor-pointer">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Composer Input Area */}
                    <div className="p-3.5 space-y-2.5">
                      <textarea
                        rows={2}
                        value={groupComposerText}
                        onChange={(e) => setGroupComposerText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendGroupMessage();
                          }
                        }}
                        disabled={sendingGroupMessage || groupDetails.status === 'Bot Left' || groupDetails.status === 'Unavailable'}
                        placeholder={
                          groupDetails.status === 'Bot Left' ? 'Cannot send: Roxie has left this group.' :
                          groupDetails.status === 'Unavailable' ? 'Cannot send: This group is unavailable on Telegram.' :
                          groupReplyTarget ? `Reply to ${groupReplyTarget.displayName || groupReplyTarget.name || 'user'} as Roxie...` :
                          'Write a message as Roxie...'
                        }
                        className={`w-full bg-transparent resize-none text-xs focus:outline-none placeholder:text-stone-500 leading-relaxed`}
                      />

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                          <span>
                            Press <kbd className="px-1 py-0.5 rounded bg-stone-500/20 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-stone-500/20 font-mono text-[10px]">Shift+Enter</kbd> for new line • Sending as <strong>Roxie</strong>
                          </span>
                        </div>

                        <button
                          onClick={handleSendGroupMessage}
                          disabled={!groupComposerText.trim() || sendingGroupMessage || groupDetails.status === 'Bot Left' || groupDetails.status === 'Unavailable'}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {sendingGroupMessage ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Sending...</span>
                            </>
                          ) : (
                            <>
                              <Send className="w-3.5 h-3.5" />
                              <span>{groupReplyTarget ? 'Reply as Roxie' : 'Send'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP MODERATORS */}
              {groupDetailTab === 'moderators' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" /> Telegram Group Administrators
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Source: {groupModerators?.source === 'telegram' ? '🟢 Telegram Authoritative API' : '🟡 Local Cache Fallback'}</p>
                  </div>

                  <div className="space-y-3">
                    {(groupModerators?.administrators || []).map((adm: any, idx: number) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3`}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold">{adm.name}</span>
                            {adm.username && <span className={`text-xs font-mono ${themeMutedText}`}>@{adm.username}</span>}
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold">
                              {adm.role}
                            </span>
                          </div>
                          <div className={`text-[11px] font-mono ${themeMutedText}`}>User ID: {adm.userId} {adm.customTitle ? `• Title: ${adm.customTitle}` : ''}</div>
                        </div>

                        {adm.permissions && (
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono">
                            {Object.entries(adm.permissions).map(([pKey, pVal]: [string, any]) => (
                              <span key={pKey} className={`px-2 py-0.5 rounded ${pVal ? 'bg-emerald-500/10 text-emerald-500' : 'bg-stone-500/10 text-stone-400'}`}>
                                {pKey.replace('can_', '')}: {pVal ? 'YES' : 'NO'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {(!groupModerators?.administrators || groupModerators.administrators.length === 0) && (
                      <p className={`text-xs ${themeMutedText} text-center py-8`}>No administrators found.</p>
                    )}
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP STICKERS */}
              {groupDetailTab === 'stickers' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Smile className="w-4 h-4 text-amber-500" /> Group Sticker Pack Management
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>
                        Per-group isolated sticker packs. Packs can be independently enabled, disabled, previewed, or removed.
                      </p>
                    </div>

                    <button
                      onClick={() => { setShowAddPackModal(true); setAddPackError(null); }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-4 h-4" /> Add Sticker Pack
                    </button>
                  </div>

                  {/* Configured Sticker Packs List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                        <span>Configured Sticker Packs</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-bold font-mono text-[10px]">
                          {groupStickersData?.packs?.length || 0}
                        </span>
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(groupStickersData?.packs || []).map((pack: any, idx: number) => {
                        const isEnabled = pack.enabled !== false;
                        return (
                          <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold">{pack.title || pack.name}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                    isEnabled 
                                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                      : 'bg-stone-500/10 text-stone-400 border border-stone-500/20'
                                  }`}>
                                    {isEnabled ? '🟢 Enabled' : '🔴 Disabled'}
                                  </span>
                                </div>
                                <div className={`text-[11px] font-mono ${themeMutedText}`}>
                                  {pack.name} • {pack.stickerCount || pack.stickers?.length || 0} Stickers
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                onClick={() => setPreviewPack(pack)}
                                className={`px-2.5 py-1.5 ${themeCardBg} hover:opacity-80 border ${themeBorder} rounded-lg text-xs font-medium flex items-center gap-1`}
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-500" /> Preview
                              </button>

                              <button
                                onClick={() => handleToggleStickerPack(pack.name, !isEnabled)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                  isEnabled 
                                    ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' 
                                    : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                                }`}
                              >
                                {isEnabled ? 'Disable' : 'Enable'}
                              </button>

                              <button
                                onClick={() => setRemovePackModal(pack)}
                                className="px-2.5 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-lg text-xs font-medium flex items-center gap-1 ml-auto"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {(!groupStickersData?.packs || groupStickersData.packs.length === 0) && (
                        <div className={`col-span-2 text-center py-10 border border-dashed ${themeBorder} rounded-xl space-y-2`}>
                          <Smile className="w-8 h-8 text-stone-400 mx-auto" />
                          <p className={`text-xs ${themeMutedText}`}>No custom sticker packs configured for this group yet.</p>
                          <button
                            onClick={() => setShowAddPackModal(true)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
                          >
                            + Add First Sticker Pack
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP GENERAL SETTINGS */}
              {(groupDetailTab === 'general' || groupDetailTab === 'settings') && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2">
                        <Settings className="w-4 h-4 text-blue-500" /> General Group Configuration
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Core policies, warning thresholds, welcome & goodbye announcements, and CAPTCHA.</p>
                    </div>
                    {savingSettings && <span className="text-xs text-blue-500 animate-pulse font-semibold">Saving changes...</span>}
                  </div>

                  {/* Warning System & Enforcement */}
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Warning & Moderation Escalation
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Warning Threshold</label>
                        <select
                          value={groupDetails.settings?.warnLimit ?? 3}
                          onChange={(e) => updateSetting('warnLimit', Number(e.target.value))}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="3">3 Warnings</option>
                          <option value="5">5 Warnings</option>
                          <option value="10">10 Warnings</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Action upon Threshold</label>
                        <select
                          value={groupDetails.settings?.warnAction || 'ban'}
                          onChange={(e) => updateSetting('warnAction', e.target.value)}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="ban">Ban User</option>
                          <option value="kick">Kick User</option>
                          <option value="mute">Mute User</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Warning Expiry</label>
                        <select
                          value={groupDetails.settings?.warnExpireSeconds ?? 0}
                          onChange={(e) => updateSetting('warnExpireSeconds', Number(e.target.value))}
                          className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                        >
                          <option value="0">Never Expire</option>
                          <option value="86400">1 Day</option>
                          <option value="604800">7 Days</option>
                          <option value="2592000">30 Days</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Welcome & Goodbye Messages */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold flex items-center gap-2 cursor-pointer">
                          <span>👋 Welcome Message</span>
                        </label>
                        <input
                          type="checkbox"
                          checked={Boolean(groupDetails.settings?.welcomeEnabled)}
                          onChange={(e) => updateSetting('welcomeEnabled', e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={groupDetails.settings?.welcomeMessage || 'Welcome {user} to {chat}!'}
                        onChange={(e) => updateSetting('welcomeMessage', e.target.value)}
                        placeholder="Welcome {user} to {chat}!"
                        className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl p-2.5 text-xs font-mono focus:outline-none`}
                      />
                    </div>

                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold flex items-center gap-2 cursor-pointer">
                          <span>👋 Goodbye Message</span>
                        </label>
                        <input
                          type="checkbox"
                          checked={Boolean(groupDetails.settings?.goodbyeEnabled)}
                          onChange={(e) => updateSetting('goodbyeEnabled', e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                      </div>
                      <textarea
                        rows={2}
                        value={groupDetails.settings?.goodbyeMessage || 'Goodbye {user}!'}
                        onChange={(e) => updateSetting('goodbyeMessage', e.target.value)}
                        placeholder="Goodbye {user}!"
                        className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl p-2.5 text-xs font-mono focus:outline-none`}
                      />
                    </div>
                  </div>

                  {/* Join Request & CAPTCHA Verification */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div>
                        <span className="text-xs font-bold block">Auto-Accept Join Requests</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Automatically approve pending join requests</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.autoAcceptEnabled)}
                        onChange={(e) => updateSetting('autoAcceptEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                    </div>

                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div>
                        <span className="text-xs font-bold block">New Member CAPTCHA</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Require button or math verification on join</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.captchaEnabled)}
                        onChange={(e) => updateSetting('captchaEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP MODERATION */}
              {groupDetailTab === 'moderation' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" /> Moderation & Anti-Spam Controls
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Automated flood, raid, abusive language and promotional spam engines.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { key: 'stopSpamEnabled', label: '🛑 Master Anti-Spam', desc: 'Global filter for spam patterns' },
                      { key: 'floodEnabled', label: '🌊 Anti-Flood Engine', desc: 'Limit rapid-fire message bursts' },
                      { key: 'raidEnabled', label: '🛡️ Anti-Raid Defense', desc: 'Lockdown group on mass joins' },
                      { key: 'stopAbusiveEnabled', label: '🤬 Abuse Filter', desc: 'Enforce custom & core abuse lists' },
                      { key: 'stopPromotionEnabled', label: '📢 Promo Filter', desc: 'Block channel adverts & invites' },
                      { key: 'automodEnabled', label: '🤖 Auto-Moderator', desc: 'Automated warnings & escalation' },
                      { key: 'reportsEnabled', label: '🚩 Member Reports', desc: 'Allow @admin report triggers' },
                      { key: 'securityEnabled', label: '🔒 Deep Security', desc: 'Enhanced link & forward analysis' }
                    ].map((m) => {
                      const isChecked = Boolean(groupDetails.settings?.[m.key]);
                      return (
                        <div key={m.key} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between gap-2`}>
                          <div>
                            <span className="text-xs font-bold block">{m.label}</span>
                            <span className={`text-[10px] ${themeMutedText}`}>{m.desc}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => updateSetting(m.key, e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Warnings Table */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500">Active Warnings In Group</h4>
                    {(!groupDetails.warnings || groupDetails.warnings.length === 0) ? (
                      <p className={`text-xs ${themeMutedText} py-4 text-center border rounded-xl ${themeBorder}`}>No active warnings for members in this group.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className={`border-b ${themeBorder} ${themeMutedText} uppercase text-[10px]`}>
                            <tr>
                              <th className="py-2">User ID</th>
                              <th className="py-2">Count</th>
                              <th className="py-2">Reason</th>
                              <th className="py-2">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groupDetails.warnings.map((w: any, idx: number) => (
                              <tr key={idx} className={`border-b ${themeBorder}`}>
                                <td className="py-2 font-mono">{w.userId}</td>
                                <td className="py-2 font-bold text-amber-500">{w.count} / {groupDetails.settings?.warnLimit || 3}</td>
                                <td className="py-2">{w.reason || 'Rule violation'}</td>
                                <td className="py-2 font-mono text-[10px]">{new Date(w.timestamp).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INNER TAB: CONTENT PROTECTION */}
              {groupDetailTab === 'content_protection' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Lock className="w-4 h-4 text-emerald-500" /> Content & Media Protection
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Filter unwanted media types, links, bursts, and maintain allowed domains.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { key: 'linksProtection', label: '🔗 Links Protection', desc: 'Block unauthorized URLs' },
                      { key: 'stickerProtection', label: '🎨 Sticker Protection', desc: 'Restrict oversized sticker spam' },
                      { key: 'fileProtection', label: '📁 File Protection', desc: 'Block downloadable executables/docs' },
                      { key: 'imageProtection', label: '🖼️ Image Protection', desc: 'Restrict mass image uploads' },
                      { key: 'gifProtection', label: '🎬 GIF/Animation Protection', desc: 'Block looping GIF spam' },
                      { key: 'voiceProtection', label: '🎤 Voice Message Protection', desc: 'Block voice notes from non-admins' }
                    ].map((p) => {
                      const isChecked = Boolean(groupDetails.settings?.[p.key]);
                      return (
                        <div key={p.key} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between gap-2`}>
                          <div>
                            <span className="text-xs font-bold block">{p.label}</span>
                            <span className={`text-[10px] ${themeMutedText}`}>{p.desc}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => updateSetting(p.key, e.target.checked)}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Whitelisted Domains */}
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-3`}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">Allowed Link Domains (Whitelist)</h4>
                    <div className="flex flex-wrap gap-2">
                      {(groupDetails.settings?.linksWhitelist || []).map((domain: string, idx: number) => (
                        <span key={idx} className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-mono flex items-center gap-1.5">
                          {domain}
                        </span>
                      ))}
                      {(!groupDetails.settings?.linksWhitelist || groupDetails.settings.linksWhitelist.length === 0) && (
                        <span className={`text-xs ${themeMutedText}`}>No domains currently whitelisted.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: AI & CONVERSATION */}
              {groupDetailTab === 'ai_conversation' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Bot className="w-4 h-4 text-purple-400" /> Roxie AI Chatbot & Personality
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Configure casual conversational intelligence, language style, and persona filters.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div>
                        <span className="text-xs font-bold block">AI Chatbot Enabled</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Roxie converses naturally with group members</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.chatbotEnabled)}
                        onChange={(e) => updateSetting('chatbotEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                    </div>

                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between`}>
                      <div>
                        <span className="text-xs font-bold block">Brother-Zone Filter</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Playful response when members call Roxie 'didi' or 'sister'</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.brotherZoneEnabled)}
                        onChange={(e) => updateSetting('brotherZoneEnabled', e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>AI Personality Style</label>
                      <select
                        value={groupDetails.settings?.personality || 'normal'}
                        onChange={(e) => updateSetting('personality', e.target.value)}
                        className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                      >
                        <option value="normal">😊 Sweet & Helpful (Normal)</option>
                        <option value="tsundere">😤 Tsundere (Feisty & Proud)</option>
                        <option value="affectionate">🥰 Affectionate (Warm & Caring)</option>
                        <option value="strict">🧐 Strict (Disciplined Moderator)</option>
                        <option value="sarcastic">😏 Sarcastic (Witty & Teasing)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Preferred Language</label>
                      <select
                        value={groupDetails.settings?.language || 'hinglish'}
                        onChange={(e) => updateSetting('language', e.target.value)}
                        className={`w-full ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                      >
                        <option value="hinglish">🇮🇳 Hinglish (Natural Indian Mix)</option>
                        <option value="hindi">🇮🇳 Hindi (Shuddh / Devanagari / Roman)</option>
                        <option value="english">🌐 English (Global)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: LUST MODE */}
              {groupDetailTab === 'lust_mode' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-pink-500">
                        <Flame className="w-4 h-4" /> Lust Mode & Flirtatious Intelligence
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Levels 0 (Off) to 4 (Sensual & Passionate). Isolated per group.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleResetGroupLust}
                        className="px-3 py-1.5 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/20 rounded-xl text-xs font-semibold"
                      >
                        Reset Group Lust (0)
                      </button>
                      <button
                        onClick={handleResetUserLustLevels}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Reset All Users
                      </button>
                    </div>
                  </div>

                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold block">Lust Mode Status</span>
                        <span className={`text-[11px] ${themeMutedText}`}>Enables flirty responses and lust-sticker reactions</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(groupDetails.settings?.lustMode)}
                        onChange={(e) => updateSetting('lustMode', e.target.checked)}
                        className="w-5 h-5 rounded text-pink-600"
                      />
                    </div>

                    <div className="space-y-2 pt-2">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>
                        Current Group Base Lust Level: <span className="text-pink-400 font-bold font-mono text-sm">{groupDetails.settings?.lustLevel ?? 0}</span> / 4
                      </label>
                      <div className="grid grid-cols-5 gap-2">
                        {[0, 1, 2, 3, 4].map((lvl) => (
                          <button
                            key={lvl}
                            onClick={() => updateSetting('lustLevel', lvl)}
                            className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                              (groupDetails.settings?.lustLevel ?? 0) === lvl
                                ? 'bg-pink-600 text-white shadow-sm'
                                : `${themeCardBg} border ${themeBorder} ${themeMutedText} hover:text-pink-400`
                            }`}
                          >
                            Level {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Known User Lust Levels in this Group */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-pink-400">
                      User Lust Levels in this Group ({groupLustUsers.length})
                    </h4>
                    {groupLustUsers.length === 0 ? (
                      <p className={`text-xs ${themeMutedText} py-4 text-center border rounded-xl ${themeBorder}`}>
                        No individual user lust scores recorded for this group yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {groupLustUsers.map((ul: any, idx: number) => (
                          <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                            <span className="font-mono">{ul.userId}</span>
                            <span className="px-2 py-0.5 rounded font-bold font-mono bg-pink-500/10 text-pink-400 border border-pink-500/20">
                              Level {ul.level}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INNER TAB: UNIFIED AUTO ENGINE */}
              {(groupDetailTab === 'auto_engine' || groupDetailTab === 'auto_response' || groupDetailTab === 'auto_sticker') && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-indigo-500">
                        <Zap className="w-4 h-4" /> Unified Auto Engine
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Autonomous proactive AI message and sticker participation system.</p>
                    </div>
                    {savingSettings && <span className="text-xs text-indigo-500 animate-pulse font-semibold">Saving changes...</span>}
                  </div>

                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-5`}>
                    {/* Master Switch and Status */}
                    <div className="flex items-center justify-between border-b border-stone-800/40 pb-4">
                      <div className="space-y-0.5">
                        <span className="text-xs font-bold block">Engine Master Switch</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Toggle autonomous proactive engagement for this group</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-2.5 py-1 rounded-full font-bold ${
                          curAutoEngine.enabled && curAutoEngine.mode !== 'off'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-stone-500/10 text-stone-400 border border-stone-500/20'
                        }`}>
                          {curAutoEngine.enabled && curAutoEngine.mode !== 'off' ? '🟢 Active' : '⚪ Disabled'}
                        </span>
                        <input
                          type="checkbox"
                          checked={Boolean(curAutoEngine.enabled && curAutoEngine.mode !== 'off')}
                          onChange={(e) => {
                            const enabled = e.target.checked;
                            const newMode = enabled ? (curAutoEngine.mode === 'off' ? 'messages_and_stickers' : curAutoEngine.mode) : 'off';
                            updateSetting('autoEngine', { ...curAutoEngine, enabled, mode: newMode });
                          }}
                          className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Unified Mode Selection */}
                    <div className="space-y-2">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Operating Mode</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                          { id: 'off', label: 'Off', desc: 'Disabled' },
                          { id: 'messages_only', label: 'Messages Only', desc: 'Text only' },
                          { id: 'stickers_only', label: 'Stickers Only', desc: 'Stickers only' },
                          { id: 'messages_and_stickers', label: 'Messages & Stickers', desc: 'Full participation' }
                        ].map((m) => {
                          const isActive = curAutoEngine.mode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                updateSetting('autoEngine', {
                                  ...curAutoEngine,
                                  enabled: m.id !== 'off',
                                  mode: m.id
                                });
                              }}
                              className={`p-3 rounded-xl border text-left transition-all ${
                                isActive
                                  ? 'bg-indigo-600/15 border-indigo-500/50 text-indigo-300 font-bold shadow-sm'
                                  : `${themeCardBg} ${themeBorder} ${themeMutedText} hover:border-indigo-500/30`
                              }`}
                            >
                              <div className="text-xs">{m.label}</div>
                              <div className="text-[10px] opacity-75 font-normal mt-0.5">{m.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Frequency Presets */}
                    <div className="space-y-2 pt-2">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Frequency Preset</label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { id: 'very_low', label: 'Very Low', timing: '30 – 60 min' },
                          { id: 'low', label: 'Low', timing: '15 – 30 min' },
                          { id: 'normal', label: 'Normal', timing: '8 – 15 min' },
                          { id: 'high', label: 'High', timing: '3 – 8 min' },
                          { id: 'custom', label: 'Custom', timing: 'User defined' }
                        ].map((p) => {
                          const isSelected = curAutoEngine.messages?.preset === p.id || (!curAutoEngine.messages?.preset && p.id === 'normal');
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                updateSetting('autoEngine', {
                                  ...curAutoEngine,
                                  messages: {
                                    ...(curAutoEngine.messages || {}),
                                    preset: p.id
                                  },
                                  stickers: {
                                    ...(curAutoEngine.stickers || {}),
                                    preset: p.id
                                  }
                                });
                              }}
                              className={`p-2.5 rounded-xl border text-center transition-all ${
                                isSelected
                                  ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-sm'
                                  : `${themeCardBg} ${themeBorder} ${themeMutedText} hover:border-blue-500/30`
                              }`}
                            >
                              <div className="text-xs">{p.label}</div>
                              <div className="text-[9px] opacity-80 mt-0.5">{p.timing}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Custom Intervals (visible when custom preset selected) */}
                    {curAutoEngine.messages?.preset === 'custom' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-stone-800/40">
                        <div className="space-y-1.5 p-3 rounded-xl bg-stone-900/40 border border-stone-800">
                          <span className="text-xs font-bold text-blue-400 block">💬 Messages Interval (Seconds)</span>
                          <p className={`text-[10px] ${themeMutedText}`}>Server minimum limit: 120 seconds (2 minutes)</p>
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="number"
                              min="120"
                              max="86400"
                              placeholder="Min (120s)"
                              value={curAutoEngine.messages?.minSeconds || 120}
                              onChange={(e) => {
                                const min = Math.max(120, Number(e.target.value));
                                updateSetting('autoEngine', {
                                  ...curAutoEngine,
                                  messages: {
                                    ...(curAutoEngine.messages || {}),
                                    preset: 'custom',
                                    minSeconds: min,
                                    maxSeconds: Math.max(min, curAutoEngine.messages?.maxSeconds || 300)
                                  }
                                });
                              }}
                              className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-1.5 text-xs font-mono`}
                            />
                            <span className="text-xs text-stone-400">-</span>
                            <input
                              type="number"
                              min="120"
                              max="86400"
                              placeholder="Max (300s)"
                              value={curAutoEngine.messages?.maxSeconds || 300}
                              onChange={(e) => {
                                const max = Math.max(120, Number(e.target.value));
                                updateSetting('autoEngine', {
                                  ...curAutoEngine,
                                  messages: {
                                    ...(curAutoEngine.messages || {}),
                                    preset: 'custom',
                                    maxSeconds: max
                                  }
                                });
                              }}
                              className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-1.5 text-xs font-mono`}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5 p-3 rounded-xl bg-stone-900/40 border border-stone-800">
                          <span className="text-xs font-bold text-amber-400 block">🎭 Stickers Interval (Seconds)</span>
                          <p className={`text-[10px] ${themeMutedText}`}>Server minimum limit: 120 seconds (2 minutes)</p>
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="number"
                              min="120"
                              max="86400"
                              placeholder="Min (120s)"
                              value={curAutoEngine.stickers?.minSeconds || 120}
                              onChange={(e) => {
                                const min = Math.max(120, Number(e.target.value));
                                updateSetting('autoEngine', {
                                  ...curAutoEngine,
                                  stickers: {
                                    ...(curAutoEngine.stickers || {}),
                                    preset: 'custom',
                                    minSeconds: min,
                                    maxSeconds: Math.max(min, curAutoEngine.stickers?.maxSeconds || 300)
                                  }
                                });
                              }}
                              className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-1.5 text-xs font-mono`}
                            />
                            <span className="text-xs text-stone-400">-</span>
                            <input
                              type="number"
                              min="120"
                              max="86400"
                              placeholder="Max (300s)"
                              value={curAutoEngine.stickers?.maxSeconds || 300}
                              onChange={(e) => {
                                const max = Math.max(120, Number(e.target.value));
                                updateSetting('autoEngine', {
                                  ...curAutoEngine,
                                  stickers: {
                                    ...(curAutoEngine.stickers || {}),
                                    preset: 'custom',
                                    maxSeconds: max
                                  }
                                });
                              }}
                              className={`w-1/2 ${themeCardBg} border ${themeBorder} rounded-xl px-2.5 py-1.5 text-xs font-mono`}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live Telemetry & Cooldown Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-stone-800/40">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-xs">
                        <span className="text-stone-300 flex items-center gap-1.5 font-medium">💬 Message Status</span>
                        <span className="font-mono font-bold text-blue-400">
                          {groupDetails.autoEngineMessageNextSeconds > 0 || groupDetails.autoResponseNextAvailableSeconds > 0
                            ? `⏳ in ~${groupDetails.autoEngineMessageNextSeconds || groupDetails.autoResponseNextAvailableSeconds}s`
                            : '🟢 Ready'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs">
                        <span className="text-stone-300 flex items-center gap-1.5 font-medium">🎭 Sticker Status</span>
                        <span className="font-mono font-bold text-amber-400">
                          {groupDetails.autoEngineStickerNextSeconds > 0 || groupDetails.autoStickerNextAvailableSeconds > 0
                            ? `⏳ in ~${groupDetails.autoEngineStickerNextSeconds || groupDetails.autoStickerNextAvailableSeconds}s`
                            : '🟢 Ready'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: SLOWMODE */}
              {groupDetailTab === 'slowmode' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2 text-blue-500">
                      <Clock className="w-4 h-4" /> Telegram Slowmode Delay Control
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>
                      Directly sets Telegram slowmode for this chat via <code className="font-mono text-[10px]">setChatSlowModeDelay</code>.
                    </p>
                  </div>

                  {slowmodeFeedback && (
                    <div className={`p-3 rounded-xl text-xs font-semibold ${
                      slowmodeFeedback.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {slowmodeFeedback}
                    </div>
                  )}

                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-5 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Current Slowmode:</span>
                      <span className="text-sm font-mono font-bold text-blue-400">
                        {groupDetails.settings?.slowModeSeconds ? `${groupDetails.settings.slowModeSeconds}s` : 'Disabled (0s)'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <label className={`text-[11px] ${themeMutedText} font-semibold block`}>Quick Presets:</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'Off', sec: 0 },
                          { label: '10s', sec: 10 },
                          { label: '30s', sec: 30 },
                          { label: '1 min', sec: 60 },
                          { label: '5 min', sec: 300 },
                          { label: '15 min', sec: 900 },
                          { label: '1 hour', sec: 3600 }
                        ].map((preset) => (
                          <button
                            key={preset.sec}
                            onClick={() => handleApplySlowmode(preset.sec)}
                            disabled={applyingSlowmode}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                              (groupDetails.settings?.slowModeSeconds ?? 0) === preset.sec
                                ? 'bg-blue-600 text-white shadow-sm'
                                : `${themeCardBg} border ${themeBorder} hover:opacity-80`
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <input
                        type="number"
                        min="0"
                        max="86400"
                        value={slowmodeInput}
                        onChange={(e) => setSlowmodeInput(Number(e.target.value))}
                        className={`w-40 ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono`}
                        placeholder="Seconds"
                      />
                      <button
                        onClick={() => handleApplySlowmode(slowmodeInput)}
                        disabled={applyingSlowmode}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {applyingSlowmode ? 'Applying to Telegram...' : 'Apply Slowmode'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: ABUSE WORDS */}
              {groupDetailTab === 'abuse_words' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-red-500">
                        <Ban className="w-4 h-4" /> Custom Abuse Words Management ({groupAbuseWords.length})
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Isolated per group. Messages containing any of these words will be moderated.</p>
                    </div>
                    {groupAbuseWords.length > 0 && (
                      <button
                        onClick={handleClearAbuseWords}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Clear All Words
                      </button>
                    )}
                  </div>

                  {/* Add Word Form */}
                  <form onSubmit={handleAddAbuseWord} className="flex gap-2">
                    <input
                      type="text"
                      value={newAbuseWordInput}
                      onChange={(e) => setNewAbuseWordInput(e.target.value)}
                      placeholder="Add new word or phrase..."
                      className={`flex-1 ${themeInnerCardBg} border ${themeBorder} rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-red-500`}
                    />
                    <button
                      type="submit"
                      disabled={!newAbuseWordInput.trim()}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      + Add Word
                    </button>
                  </form>

                  {/* Search and Word Chips */}
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={abuseSearch}
                      onChange={(e) => setAbuseSearch(e.target.value)}
                      placeholder="Search abuse words..."
                      className={`w-full sm:w-64 ${themeCardBg} border ${themeBorder} rounded-xl px-3 py-1.5 text-xs focus:outline-none`}
                    />

                    <div className="flex flex-wrap gap-2 pt-1 max-h-72 overflow-y-auto pr-1">
                      {groupAbuseWords
                        .filter(w => !debouncedAbuseSearch || w.toLowerCase().includes(debouncedAbuseSearch.toLowerCase()))
                        .map((w, idx) => (
                          <span
                            key={idx}
                            className={`${themeInnerCardBg} border ${themeBorder} px-3 py-1.5 rounded-xl text-xs font-mono flex items-center gap-2 group hover:border-red-500/40`}
                          >
                            <span>{w}</span>
                            <button
                              onClick={() => handleRemoveAbuseWord(w)}
                              className="text-stone-400 hover:text-red-400 transition-colors"
                              title="Delete word"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      {groupAbuseWords.length === 0 && (
                        <p className={`text-xs ${themeMutedText} py-6 text-center w-full`}>No custom abuse words added for this group yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: MEMBERS & TELEGRAM ACTIONS */}
              {groupDetailTab === 'members' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div className="flex items-center justify-between border-b pb-4">
                    <div>
                      <h3 className="text-sm font-bold flex items-center gap-2 text-blue-500">
                        <Users className="w-4 h-4" /> Group Members & Moderation Console ({groupMembersList.length})
                      </h3>
                      <p className={`text-xs ${themeMutedText}`}>Real-time member actions executed against the authoritative Telegram API.</p>
                    </div>
                    <button
                      onClick={refreshCurrentView}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh Members
                    </button>
                  </div>

                  {memberActionFeedback && (
                    <div className={`p-3 rounded-xl text-xs font-semibold ${
                      memberActionFeedback.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {memberActionFeedback.message}
                    </div>
                  )}

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search member by name, username, or ID..."
                      className={`w-full sm:w-80 ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                    />

                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {groupMembersList
                        .filter(m => {
                          if (!debouncedMemberSearch) return true;
                          const s = debouncedMemberSearch.toLowerCase();
                          return (
                            String(m.userId).includes(s) ||
                            (m.firstName && m.firstName.toLowerCase().includes(s)) ||
                            (m.username && m.username.toLowerCase().includes(s))
                          );
                        })
                        .map((m, idx) => (
                          <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3`}>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold">{m.firstName || m.name || `User ${m.userId}`}</span>
                                {m.username && <span className={`text-xs font-mono ${themeMutedText}`}>@{m.username}</span>}
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  m.role === 'creator' || m.role === 'administrator' ? 'bg-blue-500/10 text-blue-400' : 'bg-stone-700/20 text-stone-300'
                                }`}>
                                  {m.role || 'Member'}
                                </span>
                              </div>
                              <div className={`text-[10px] font-mono ${themeMutedText}`}>
                                User ID: {m.userId} {m.lastActive ? `• Last active: ${new Date(m.lastActive).toLocaleDateString()}` : ''}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => handleMemberAction('ban', m.userId)}
                                disabled={memberActionLoading[`ban_${m.userId}`]}
                                className="px-2.5 py-1 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`ban_${m.userId}`] ? 'Banning...' : '🚫 Ban'}
                              </button>
                              <button
                                onClick={() => handleMemberAction('unban', m.userId)}
                                disabled={memberActionLoading[`unban_${m.userId}`]}
                                className="px-2.5 py-1 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`unban_${m.userId}`] ? 'Unbanning...' : '🔓 Unban'}
                              </button>
                              <button
                                onClick={() => handleMemberAction('restrict', m.userId)}
                                disabled={memberActionLoading[`restrict_${m.userId}`]}
                                className="px-2.5 py-1 bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-500/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`restrict_${m.userId}`] ? 'Muting...' : '🔇 Mute'}
                              </button>
                              <button
                                onClick={() => handleMemberAction('promote', m.userId)}
                                disabled={memberActionLoading[`promote_${m.userId}`]}
                                className="px-2.5 py-1 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`promote_${m.userId}`] ? 'Promoting...' : '👮 Promote'}
                              </button>
                              <button
                                onClick={() => handleMemberAction('demote', m.userId)}
                                disabled={memberActionLoading[`demote_${m.userId}`]}
                                className="px-2.5 py-1 bg-stone-700/20 hover:bg-stone-700/40 text-stone-300 border border-stone-600/20 rounded-lg text-xs font-semibold transition-colors"
                              >
                                {memberActionLoading[`demote_${m.userId}`] ? 'Demoting...' : '🔻 Demote'}
                              </button>
                            </div>
                          </div>
                        ))}
                      {groupMembersList.length === 0 && (
                        <p className={`text-xs ${themeMutedText} py-6 text-center`}>No member records found for this group.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: TELEGRAM PERMISSIONS */}
              {(groupDetailTab === 'telegram_permissions' || groupDetailTab === 'permissions') && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Lock className="w-4 h-4 text-blue-500" /> Telegram Permissions Matrix
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>
                      Authoritative Telegram ChatMember permissions. Telegram hierarchy is strictly enforced.
                    </p>
                  </div>

                  {/* Roxie's Own Admin Permissions */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">
                      Roxie Administrator Permissions (Current Role: {groupPermissionsData?.roxieRole || '🛡️ Administrator'})
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Object.entries(groupPermissionsData?.roxiePermissions || {}).map(([pKey, pVal]: [string, any]) => (
                        <div key={pKey} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                          <span className="font-mono">{pKey.replace('can_', '')}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pVal ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                            {pVal ? 'ALLOWED' : 'DENIED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Default Group Member Permissions */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                      Default Member Permissions (Telegram setChatPermissions)
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Object.entries(groupPermissionsData?.defaultMemberPermissions || {}).map(([pKey, pVal]: [string, any]) => (
                        <div key={pKey} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                          <span className="font-mono">{pKey.replace('can_', '')}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pVal ? 'bg-blue-500/10 text-blue-500' : 'bg-stone-500/10 text-stone-400'}`}>
                            {pVal ? 'YES' : 'NO'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: BACKUP, EXPORT & RESTORE */}
              {groupDetailTab === 'backup' && (
                <div className="space-y-6">
                  {/* Header Banner */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-3`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="space-y-1">
                        <h3 className="text-base font-bold flex items-center gap-2 text-emerald-400">
                          <Database className="w-5 h-5" /> 💾 Group Backup, Lossless Export & Restore Studio
                        </h3>
                        <p className={`text-xs ${themeMutedText}`}>
                          Isolated backup management for Group <strong className="font-mono text-emerald-400">{activeGroupDetailId}</strong>. JSON is the authoritative lossless format; CSV provides a flattened summary for human inspection.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Scope: 👥 GROUP ISOLATED
                        </span>
                      </div>
                    </div>

                    {backupNotification && (
                      <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 ${
                        backupNotification.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        <div className="flex items-center gap-2">
                          {backupNotification.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                          <span>{backupNotification.message}</span>
                        </div>
                        <button onClick={() => setBackupNotification(null)} className="opacity-70 hover:opacity-100">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Section 1: Quick Export Cards */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <Download className="w-4 h-4" /> 1. Quick Export & Downloads
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* JSON Download */}
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col justify-between space-y-3`}>
                        <div className="space-y-1">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-blue-400">
                            <FileCode className="w-4 h-4" /> 📥 Complete JSON Backup
                          </span>
                          <p className={`text-[11px] ${themeMutedText}`}>
                            Machine-restorable lossless export containing all settings, sticker packs, abuse words, lust modes, and automations.
                          </p>
                        </div>
                        <button
                          onClick={handleDownloadGroupJson}
                          disabled={backupLoading}
                          className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" /> Download JSON Backup
                        </button>
                      </div>

                      {/* CSV Download */}
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col justify-between space-y-3`}>
                        <div className="space-y-1">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-amber-400">
                            <FileText className="w-4 h-4" /> 📊 Flattened CSV Report
                          </span>
                          <p className={`text-[11px] ${themeMutedText}`}>
                            Human-readable spreadsheet export of active rules and policies. Note: Use JSON for complete lossless restore.
                          </p>
                        </div>
                        <button
                          onClick={handleDownloadGroupCsv}
                          disabled={backupLoading}
                          className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" /> Download CSV Report
                        </button>
                      </div>

                      {/* Copy JSON */}
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col justify-between space-y-3`}>
                        <div className="space-y-1">
                          <span className="text-xs font-bold flex items-center gap-1.5 text-purple-400">
                            <Copy className="w-4 h-4" /> 📋 Copy JSON to Clipboard
                          </span>
                          <p className={`text-[11px] ${themeMutedText}`}>
                            Directly copy the formatted backup payload to paste into code editors or other group configs.
                          </p>
                        </div>
                        <button
                          onClick={handleCopyGroupJson}
                          className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          {copiedJsonToast ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedJsonToast ? 'Copied to Clipboard!' : 'Copy JSON Configuration'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Direct JSON Editor */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                          <FileCode className="w-4 h-4" /> 2. Direct JSON Editor
                        </h4>
                        <p className={`text-[11px] ${themeMutedText}`}>
                          Inspect and modify raw JSON parameters directly with instant syntax validation.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleLoadGroupJsonIntoEditor}
                          disabled={backupLoading}
                          className="px-3 py-1.5 bg-stone-700/50 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${backupLoading ? 'animate-spin' : ''}`} /> Load Current JSON
                        </button>
                        <button
                          onClick={handleFormatEditorJson}
                          disabled={!backupEditorJson.trim()}
                          className="px-3 py-1.5 bg-stone-700/50 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-40"
                        >
                          Format
                        </button>
                        <button
                          onClick={handleValidateEditorJson}
                          disabled={!backupEditorJson.trim()}
                          className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-40"
                        >
                          Validate Syntax
                        </button>
                      </div>
                    </div>

                    {backupEditorError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>{backupEditorError}</span>
                      </div>
                    )}

                    {backupEditorSuccess && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-mono flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{backupEditorSuccess}</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <textarea
                        value={backupEditorJson}
                        onChange={(e) => {
                          setBackupEditorJson(e.target.value);
                          setBackupEditorError(null);
                          setBackupEditorSuccess(null);
                        }}
                        placeholder='Click "Load Current JSON" above to populate this editor with the group configuration.'
                        rows={12}
                        className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-purple-500 leading-relaxed`}
                        spellCheck={false}
                      />
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className={`text-[11px] ${themeMutedText}`}>
                          Editing JSON directly requires applying changes to take runtime effect.
                        </span>
                        <button
                          onClick={() => {
                            if (handleValidateEditorJson()) {
                              handlePreviewImport(backupEditorJson);
                            }
                          }}
                          disabled={!backupEditorJson.trim() || backupLoading}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" /> Preview & Apply JSON Edits
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Import & Partial Restore Studio */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-5`}>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <Upload className="w-4 h-4" /> 3. Import & Partial Configuration Restore
                      </h4>
                      <p className={`text-[11px] ${themeMutedText}`}>
                        Restore full backups or selectively restore specific categories without overwriting existing data.
                      </p>
                    </div>

                    {/* File upload or paste input */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="cursor-pointer px-4 py-2 bg-stone-700/40 hover:bg-stone-700/60 rounded-xl text-xs font-semibold flex items-center gap-2 text-stone-200 border border-stone-600/30 transition-colors">
                          <Upload className="w-4 h-4" /> Upload .json Backup File
                          <input
                            type="file"
                            accept=".json,application/json"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  setBackupImportJson(ev.target?.result as string || '');
                                };
                                reader.readAsText(file);
                              }
                            }}
                          />
                        </label>
                        {backupImportJson && (
                          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> JSON Loaded ({backupImportJson.length} bytes)
                          </span>
                        )}
                      </div>

                      <textarea
                        value={backupImportJson}
                        onChange={(e) => setBackupImportJson(e.target.value)}
                        placeholder='Or paste exported group backup JSON here: { "backupVersion": "1.0", "settings": { ... } }'
                        rows={4}
                        className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs font-mono focus:outline-none focus:border-emerald-500`}
                        spellCheck={false}
                      />
                    </div>

                    {/* Group ID Mismatch Warning & Override */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-2`}>
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          id="overrideChatIdCheck"
                          checked={backupOverrideChatId}
                          onChange={(e) => setBackupOverrideChatId(e.target.checked)}
                          className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <label htmlFor="overrideChatIdCheck" className="text-xs cursor-pointer select-none space-y-0.5 block">
                          <span className="font-bold text-stone-200 block">
                            Import as new configuration for this group (Allow Chat ID Override)
                          </span>
                          <span className={`text-[11px] ${themeMutedText} block`}>
                            Enable this option if you are applying a configuration template exported from another group to this group ({activeGroupDetailId}).
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Partial Import Section Selector Checkboxes */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-200">
                          Select Categories to Restore:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setBackupImportSelectedSections([
                              'settings', 'welcome', 'moderation', 'contentProtection', 'abuseWords',
                              'stickers', 'lustMode', 'autoResponse', 'autoSticker', 'slowmode',
                              'personality', 'schedules', 'notes'
                            ])}
                            className="text-[11px] text-blue-400 hover:underline font-semibold"
                          >
                            Select All
                          </button>
                          <span className="text-stone-600">•</span>
                          <button
                            onClick={() => setBackupImportSelectedSections([])}
                            className="text-[11px] text-stone-400 hover:underline font-semibold"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                        {[
                          { id: 'settings', label: '⚙️ General Settings' },
                          { id: 'welcome', label: '👋 Welcome & Goodbye' },
                          { id: 'moderation', label: '🛡️ Moderation & Spam' },
                          { id: 'contentProtection', label: '🔒 Content Protection' },
                          { id: 'abuseWords', label: '🤬 Abuse Words List' },
                          { id: 'stickers', label: '🎨 Sticker Packs & Library' },
                          { id: 'lustMode', label: '❤️ Lust Mode & Levels' },
                          { id: 'autoResponse', label: '🤖 Auto-Response Engine' },
                          { id: 'autoSticker', label: '🎭 Auto-Sticker Engine' },
                          { id: 'slowmode', label: '⏱️ Slowmode Delay' },
                          { id: 'personality', label: '💬 AI & Personality' },
                          { id: 'schedules', label: '📅 Schedules' },
                          { id: 'notes', label: '📝 Group Notes' }
                        ].map((sec) => {
                          const isSelected = backupImportSelectedSections.includes(sec.id);
                          return (
                            <button
                              key={sec.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setBackupImportSelectedSections(backupImportSelectedSections.filter(s => s !== sec.id));
                                } else {
                                  setBackupImportSelectedSections([...backupImportSelectedSections, sec.id]);
                                }
                              }}
                              className={`p-2.5 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-all ${
                                isSelected
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                  : `${themeInnerCardBg} ${themeBorder} opacity-60 hover:opacity-90`
                              }`}
                            >
                              <span>{sec.label}</span>
                              {isSelected ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <div className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Import Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-800">
                      <button
                        onClick={() => handlePreviewImport(backupImportJson)}
                        disabled={!backupImportJson.trim() || backupLoading || backupImportSelectedSections.length === 0}
                        className="px-4 py-2 bg-stone-700/50 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> 🔍 Preview Changes
                      </button>
                      <button
                        onClick={() => handleApplyImport(backupImportJson)}
                        disabled={!backupImportJson.trim() || backupLoading || backupImportSelectedSections.length === 0}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <Database className="w-3.5 h-3.5" /> 💾 Apply Configuration
                      </button>
                    </div>
                  </div>

                  {/* Section 4: Automatic Safety Backups History */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Clock className="w-4 h-4" /> 4. Automatic Safety Backups History ({backupHistoryList.length})
                        </h4>
                        <p className={`text-[11px] ${themeMutedText}`}>
                          Automatic snapshots saved in <code className="font-mono text-[10px]">data/backups/group_{activeGroupDetailId}/</code> before every configuration import.
                        </p>
                      </div>
                      <button
                        onClick={refreshCurrentView}
                        className="p-1.5 rounded-lg bg-stone-800/40 hover:bg-stone-800 text-stone-300 text-xs flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Refresh Snapshots
                      </button>
                    </div>

                    {backupHistoryList.length === 0 ? (
                      <div className={`p-6 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-center space-y-1`}>
                        <p className={`text-xs ${themeMutedText}`}>No pre-import safety backups recorded yet for this group.</p>
                        <p className={`text-[10px] ${themeMutedText}`}>A snapshot is generated automatically each time a configuration is imported.</p>
                      </div>
                    ) : (
                      <div className={`border ${themeBorder} rounded-xl overflow-hidden`}>
                        <table className="w-full text-xs text-left">
                          <thead className={`${themeInnerCardBg} border-b ${themeBorder} text-[11px] font-semibold text-stone-400`}>
                            <tr>
                              <th className="p-3">Snapshot Timestamp</th>
                              <th className="p-3">File Name</th>
                              <th className="p-3">Size</th>
                              <th className="p-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-800">
                            {backupHistoryList.map((snap: any, idx: number) => (
                              <tr key={idx} className="hover:bg-stone-800/20">
                                <td className="p-3 font-mono text-[11px] text-stone-300">
                                  {new Date(snap.timestamp).toLocaleString()}
                                </td>
                                <td className="p-3 font-mono text-[11px] text-blue-400">
                                  {snap.filename}
                                </td>
                                <td className="p-3 font-mono text-[11px] text-stone-400">
                                  {(snap.size / 1024).toFixed(1)} KB
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    onClick={() => handleRestoreSafetySnapshot(snap.filename)}
                                    disabled={backupLoading}
                                    className="px-3 py-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1"
                                  >
                                    <RefreshCw className="w-3 h-3" /> Restore Snapshot
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INNER TAB: DANGER ZONE */}
              {groupDetailTab === 'danger_zone' && (
                <div className={`${themeCardBg} border border-red-500/30 rounded-2xl p-6 space-y-6 bg-red-950/5`}>
                  <div className="border-b border-red-500/20 pb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2 text-red-400">
                      <AlertTriangle className="w-4 h-4" /> Danger Zone — Destructive Operations
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>
                      These actions permanently clear group state, reset settings, or remove Roxie from the chat. All actions require confirmation.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Reset Group Settings */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block">Reset Group Settings</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Revert all moderation, protection, and response policies for this group to factory defaults.</p>
                      </div>
                      <button
                        onClick={() => { setDangerModal('reset_settings'); setDangerConfirmInput(''); }}
                        className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Reset Group Settings
                      </button>
                    </div>

                    {/* Clear Conversation Memory */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block">Clear Group Memory</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Permanently wipe all recorded conversation history and AI context memory for this chat.</p>
                      </div>
                      <button
                        onClick={() => { setDangerModal('clear_memory'); setDangerConfirmInput(''); }}
                        className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Clear Memory
                      </button>
                    </div>

                    {/* Remove All Custom Stickers */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block">Remove Custom Stickers</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Unlink and remove all custom sticker pack configurations belonging to this group.</p>
                      </div>
                      <button
                        onClick={() => { setDangerModal('clear_stickers'); setDangerConfirmInput(''); }}
                        className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-semibold"
                      >
                        Remove Custom Stickers
                      </button>
                    </div>

                    {/* Leave Group */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block">Leave Telegram Group</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Command Roxie to leave this Telegram chat immediately via Telegram leaveChat API.</p>
                      </div>
                      <button
                        onClick={() => {
                          const gInfo = groups.find(g => g.chatId === activeGroupDetailId);
                          if (gInfo) {
                            setLeaveModalGroup(gInfo);
                            setLeaveConfirmInput('');
                          }
                        }}
                        className="px-3 py-1.5 bg-red-600 text-white hover:bg-red-500 rounded-xl text-xs font-semibold"
                      >
                        Leave Group
                      </button>
                    </div>

                    {/* Remove from Dashboard */}
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-rose-400 block">Remove from Dashboard</span>
                        <p className={`text-[11px] ${themeMutedText}`}>Remove this group from the dashboard view. Roxie will remain in the Telegram group.</p>
                      </div>
                      <button
                        onClick={() => {
                          const gInfo = groups.find(g => g.chatId === activeGroupDetailId) || ({
                            chatId: activeGroupDetailId,
                            chatTitle: groupDetails?.chatTitle || `Group ${activeGroupDetailId}`
                          } as GroupInfo);
                          setRemoveDashboardModalGroup(gInfo);
                        }}
                        className="px-3 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold"
                      >
                        Remove from Dashboard
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP COMMANDS */}
              {groupDetailTab === 'commands' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-blue-500" /> Commands Usable in This Group
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {commands.slice(0, 12).map((cmd, idx) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 space-y-1`}>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-blue-500">{cmd.command}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-stone-800 text-stone-300 font-semibold">{cmd.permission}</span>
                        </div>
                        <p className={`text-xs ${themeMutedText}`}>{cmd.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP ACTIVITY */}
              {groupDetailTab === 'activity' && (
                <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-500" /> Activity Log for {groupDetails.chatTitle}
                  </h3>
                  <div className="space-y-2">
                    {(groupDetails.logs || []).map((l: any, idx: number) => (
                      <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex items-center justify-between text-xs`}>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-stone-400">{new Date(l.timestamp).toLocaleTimeString()}</span>
                          <span className="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-blue-500/10 text-blue-500">{l.action}</span>
                          <span>{l.details || l.reason || 'Event executed'}</span>
                        </div>
                        <span className={`font-mono ${themeMutedText}`}>@{l.adminUsername || 'system'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* INNER TAB: GROUP SCHEDULES & RULES */}
              {groupDetailTab === 'schedules' && (
                <div className="space-y-6">
                  {/* Scheduled Messages for this group */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-500" /> Scheduled Messages ({schedulesList.filter(s => s.chatId === activeGroupDetailId).length})
                        </h3>
                        <p className={`text-xs ${themeMutedText}`}>Automated recurring broadcasts and scheduled announcements for {groupDetails.chatTitle}.</p>
                      </div>
                      <button
                        onClick={() => {
                          setEditingSchedule(null);
                          setScheduleFormError(null);
                          const now = new Date();
                          const pad = (n: number) => String(n).padStart(2, '0');
                          const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                          const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
                          setNewScheduleForm({
                            chatId: activeGroupDetailId,
                            name: '',
                            message: '',
                            scheduleType: 'interval',
                            intervalStr: '1h',
                            nextRunDate: defaultDate,
                            nextRunTime: defaultTime,
                            timezone: 'UTC',
                            contentType: 'text',
                            mediaFileId: '',
                            replyToMessageId: '',
                            enabled: true,
                            pinAfterSend: false,
                            replyToLatest: false,
                            autoDeletePrevious: false,
                            triggerKeyword: '',
                            inlineKeyboard: []
                          });
                          setShowCreateScheduleModal(true);
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> New Schedule
                      </button>
                      <ContentReuseButton
                        onClick={() => {
                          setEditingSchedule(null);
                          setShowCopyScheduleFromIdModal(true);
                        }}
                        label="Reuse by ID"
                      />
                    </div>

                    {schedulesList.filter(s => s.chatId === activeGroupDetailId).length === 0 ? (
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-8 text-center space-y-2`}>
                        <Clock className="w-8 h-8 text-stone-500 mx-auto opacity-40" />
                        <p className="text-xs font-semibold text-stone-400">No scheduled messages configured for this group</p>
                        <p className={`text-[11px] ${themeMutedText}`}>Create a schedule to automatically send hourly reminders, daily announcements, or custom broadcasts.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {schedulesList.filter(s => s.chatId === activeGroupDetailId).map((s: any) => (
                          <div key={s.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs`}>
                            <div className="space-y-1 max-w-xl">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">ID: {s.id}</span>
                                <span className="font-semibold text-sm">{s.name || 'Scheduled Message'}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.enabled !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-stone-800 text-stone-400'}`}>
                                  {s.enabled !== false ? '● Active' : '○ Paused'}
                                </span>
                                {s.scheduleType && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 uppercase font-semibold">
                                    {s.scheduleType}
                                  </span>
                                )}
                                {s.pinAfterSend && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 font-semibold border border-purple-500/20">
                                    📌 Pin
                                  </span>
                                )}
                                {s.replyToLatest && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
                                    ↩️ Reply Latest
                                  </span>
                                )}
                                {s.autoDeletePrevious && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20">
                                    🗑️ delOn
                                  </span>
                                )}
                                {s.inlineKeyboard && s.inlineKeyboard.length > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20">
                                    🔗 {s.inlineKeyboard.flat().length} Button{s.inlineKeyboard.flat().length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <p className={`line-clamp-2 text-xs ${isDark ? 'text-stone-300' : 'text-slate-700'}`}>{s.message || s.messageText}</p>
                              <div className={`flex flex-wrap items-center gap-3 text-[11px] ${themeMutedText} pt-1`}>
                                <span>Interval: <strong className="text-stone-300">{s.intervalFormatted || 'Custom'}</strong></span>
                                {s.triggerKeyword && (
                                  <span>Trigger: <strong className="text-emerald-400">"{s.triggerKeyword}"</strong></span>
                                )}
                                <span>Next: <strong className="text-stone-300">{s.nextRun ? new Date(s.nextRun).toLocaleString() : 'N/A'}</strong></span>
                                <span>Runs: <strong className="text-stone-300">{s.runsCount || 0}</strong></span>
                                {s.lastStatus && (
                                  <span className={s.lastStatus === 'success' ? 'text-emerald-400' : 'text-rose-400'}>
                                    Last: {s.lastStatus}
                                  </span>
                                )}
                                {s.lastStatus === 'failure' && s.lastError && (
                                  <span
                                    className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 max-w-sm truncate"
                                    title={String(s.lastError).replace(/\b\d{8,11}:[a-zA-Z0-9_-]{35}\b/g, '[REDACTED]').replace(/bot\d+:[a-zA-Z0-9_-]+/gi, 'bot[REDACTED]')}
                                  >
                                    Error: {String(s.lastError).replace(/\b\d{8,11}:[a-zA-Z0-9_-]{35}\b/g, '[REDACTED]').replace(/bot\d+:[a-zA-Z0-9_-]+/gi, 'bot[REDACTED]')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleToggleSchedule(s.id, s.enabled !== false)}
                                className={`px-2.5 py-1 rounded-lg font-semibold text-xs border ${
                                  s.enabled !== false
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                }`}
                              >
                                {s.enabled !== false ? 'Pause' : 'Enable'}
                              </button>
                              <button
                                onClick={async () => {
                                  const ok = await copyTextToClipboard(s.id);
                                  if (ok) {
                                    setScheduleNotification({ type: 'success', message: 'Schedule ID copied' }); setTimeout(() => setScheduleNotification(null), 3000);
                                  } else {
                                    setScheduleNotification({ type: 'error', message: 'Failed to copy ID to clipboard' }); setTimeout(() => setScheduleNotification(null), 3000);
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg ${themeInnerCardBg} border ${themeBorder} text-cyan-300 hover:text-white flex items-center gap-1`}
                                title="Copy Schedule ID"
                              >
                                <Copy className="w-3.5 h-3.5" /> Copy ID
                              </button>
                              <button
                                onClick={() => handleCopyScheduleCode(s)}
                                className={`px-2.5 py-1 rounded-lg ${themeInnerCardBg} border ${themeBorder} text-slate-300 hover:text-white flex items-center gap-1`}
                                title="Export Schedule Code & JSON"
                              >
                                <Code className="w-3.5 h-3.5" /> Code
                              </button>
                              <button
                                onClick={() => {
                                  setEditingSchedule(s);
                                  setScheduleFormError(null);
                                  const now = new Date();
                                  const pad = (n: number) => String(n).padStart(2, '0');
                                  let defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                                  let defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
                                  if (s.nextRun) {
                                    try {
                                      const d = new Date(s.nextRun);
                                      if (!isNaN(d.getTime())) {
                                        defaultDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                                        defaultTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                      }
                                    } catch {}
                                  }
                                  setNewScheduleForm({
                                    chatId: s.chatId,
                                    name: s.name || '',
                                    message: s.message || s.messageText || '',
                                    scheduleType: s.scheduleType || 'interval',
                                    intervalStr: s.intervalFormatted || '1h',
                                    nextRunDate: defaultDate,
                                    nextRunTime: defaultTime,
                                    timezone: s.timezone || 'UTC',
                                    contentType: s.contentType || 'text',
                                    mediaFileId: s.mediaFileId || '',
                                    replyToMessageId: s.replyToMessageId ? String(s.replyToMessageId) : '',
                                    enabled: s.enabled !== false,
                                    pinAfterSend: Boolean(s.pinAfterSend),
                                    replyToLatest: Boolean(s.replyToLatest),
                                    autoDeletePrevious: Boolean(s.autoDeletePrevious),
                                    triggerKeyword: s.triggerKeyword || '',
                                    inlineKeyboard: Array.isArray(s.inlineKeyboard) ? s.inlineKeyboard.map((row: any[]) => Array.isArray(row) ? row.map(btn => ({ text: btn.text || '', url: btn.url || '', style: btn.style && ['primary', 'success', 'danger'].includes(btn.style) ? btn.style : undefined })) : []) : []
                                  });
                                  setShowCreateScheduleModal(true);
                                }}
                                className={`px-2.5 py-1 rounded-lg ${themeInnerCardBg} border ${themeBorder} text-stone-300 hover:text-white`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(s.id)}
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                                title="Delete Schedule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Automation Rules for this group */}
                  <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-500" /> Automation Rules ({groupAutomationsList.length})
                        </h3>
                        <p className={`text-xs ${themeMutedText}`}>Reactive automation triggers and enforcement actions for {groupDetails.chatTitle}.</p>
                      </div>
                      <button
                        onClick={() => setShowCreateAutomationModal(true)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Rule
                      </button>
                    </div>

                    {groupAutomationsList.length === 0 ? (
                      <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-8 text-center space-y-2`}>
                        <Zap className="w-8 h-8 text-stone-500 mx-auto opacity-40" />
                        <p className="text-xs font-semibold text-stone-400">No automation rules configured for this group</p>
                        <p className={`text-[11px] ${themeMutedText}`}>Add custom reactive rules (e.g., auto-delete spam, instant user warns, link blocks).</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {groupAutomationsList.map((a: any) => (
                          <div key={a.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between text-xs`}>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">RULE: {a.id}</span>
                                <span className="font-semibold text-blue-400">Trigger: {a.trigger}</span>
                                <span className="text-stone-500">➔</span>
                                <span className="font-semibold text-amber-400">Action: {a.action}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.enabled !== false ? 'bg-emerald-500/10 text-emerald-400' : 'bg-stone-800 text-stone-400'}`}>
                                  {a.enabled !== false ? 'Active' : 'Disabled'}
                                </span>
                              </div>
                              {a.parameters && (
                                <p className={`text-[11px] ${themeMutedText}`}>Parameters: <code className="font-mono">{a.parameters}</code></p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleAutomation(activeGroupDetailId, a.id, a.enabled !== false)}
                                className={`px-2 py-1 rounded-lg text-xs font-semibold border ${
                                  a.enabled !== false
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}
                              >
                                {a.enabled !== false ? 'Disable' : 'Enable'}
                              </button>
                              <button
                                onClick={() => handleDeleteAutomation(activeGroupDetailId, a.id)}
                                className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB: PRIVATE CHATS (UNIFIED CONVERSATIONS, RECIPIENTS & BROADCAST) */}
          {(activeNav === 'private-chats' || activeNav === 'private-recipients') && (
            <div className="space-y-4">
              {/* Header with Unified Sub-tabs */}
              <div className={`flex items-center gap-2 border-b ${themeBorder} pb-3 flex-wrap`}>
                <button
                  type="button"
                  onClick={() => setPrivateNavTab('conversations')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all min-h-[42px] ${
                    privateNavTab === 'conversations'
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50'
                      : `${themeInnerCardBg} ${isDark ? 'text-stone-300 hover:text-white hover:bg-stone-800/40' : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100'} border ${themeBorder}`
                  }`}
                >
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <span>Conversations</span>
                  {privateChats.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      privateNavTab === 'conversations' ? 'bg-blue-700/60 text-blue-100' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {privateChats.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrivateNavTab('recipients');
                    fetchPrivateRecipients();
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all min-h-[42px] ${
                    privateNavTab === 'recipients'
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50'
                      : `${themeInnerCardBg} ${isDark ? 'text-stone-300 hover:text-white hover:bg-stone-800/40' : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100'} border ${themeBorder}`
                  }`}
                >
                  <UserCheck className="w-4 h-4 text-blue-400" />
                  <span>DM Recipients</span>
                  {(privateRecipientsStats?.total || privateRecipientsList.length) > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      privateNavTab === 'recipients' ? 'bg-blue-700/60 text-blue-100' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {privateRecipientsStats?.total ?? privateRecipientsList.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPrivateNavTab('broadcast')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all min-h-[42px] ${
                    privateNavTab === 'broadcast'
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50'
                      : `${themeInnerCardBg} ${isDark ? 'text-stone-300 hover:text-white hover:bg-stone-800/40' : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100'} border ${themeBorder}`
                  }`}
                >
                  <Radio className="w-4 h-4 text-blue-400" />
                  <span>DM Broadcast</span>
                </button>
              </div>

              {/* Sub-tab 1: Live Conversations */}
              {privateNavTab === 'conversations' && (
                <div className={`${themeCardBg} border rounded-2xl h-[calc(100vh-230px)] flex flex-col md:flex-row overflow-hidden`}>
              
              {/* Left Pane: Users list */}
              <div className={`w-full md:w-80 border-r ${themeBorder} p-3 sm:p-4 flex flex-col space-y-3 shrink-0 overflow-hidden ${activePrivateChatId ? 'hidden md:flex' : 'flex'}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" /> Private Conversations ({privateChats.length})
                  </h3>
                </div>

                {/* Contact Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={conversationSearch}
                    onChange={(e) => setConversationSearch(e.target.value)}
                    placeholder="Search name, @username, or ID..."
                    className={`w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border ${themeBorder} ${themeInnerCardBg} focus:outline-none focus:border-blue-500`}
                  />
                  {conversationSearch && (
                    <button
                      type="button"
                      onClick={() => setConversationSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200 text-xs px-1"
                      title="Clear search"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                  {privateChats
                    .filter(chat => {
                      if (!conversationSearch.trim()) return true;
                      const q = conversationSearch.toLowerCase().trim();
                      const nameMatch = chat.name?.toLowerCase().includes(q);
                      const usernameMatch = chat.username?.toLowerCase().includes(q);
                      const idMatch = String(chat.chatId).includes(q) || String(chat.userId).includes(q);
                      return Boolean(nameMatch || usernameMatch || idMatch);
                    })
                    .map((chat) => {
                      const isSelected = String(activePrivateChatId) === String(chat.chatId);
                      const hasMessages = chat.messageCount > 0;
                      return (
                        <div
                          key={chat.chatId}
                          onClick={() => setActivePrivateChatId(chat.chatId)}
                          className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-600/10 border-blue-500/30'
                              : `${themeInnerCardBg} ${themeBorder} hover:opacity-80`
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold truncate max-w-[140px]">{chat.name}</span>
                            <span className={`text-[10px] font-mono ${themeMutedText}`}>
                              {chat.lastUpdated > 0
                                ? new Date(chat.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })
                                : 'New'}
                            </span>
                          </div>
                          <p className={`text-xs ${themeMutedText} truncate mt-1`}>
                            {hasMessages ? (chat.lastMessage || 'Conversation active') : 'No messages yet'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] flex-wrap">
                            {chat.username && (
                              <span className="px-1.5 py-0.2 rounded bg-stone-700/40 text-stone-300 font-mono">
                                @{chat.username}
                              </span>
                            )}
                            <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-500 font-medium">
                              {chat.language || 'English'}
                            </span>
                            <span className={`font-mono ${themeMutedText}`}>ID: {chat.userId}</span>
                            {chat.status && chat.status !== 'active' && (
                              <span className={`px-1.5 py-0.2 rounded font-medium ${
                                chat.status === 'blocked' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {chat.status}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {privateChats.length === 0 && (
                    <p className={`text-xs ${themeMutedText} text-center py-12`}>No private contacts recorded yet.</p>
                  )}
                  {privateChats.length > 0 && conversationSearch && privateChats.filter(chat => {
                    const q = conversationSearch.toLowerCase().trim();
                    return chat.name?.toLowerCase().includes(q) || chat.username?.toLowerCase().includes(q) || String(chat.chatId).includes(q) || String(chat.userId).includes(q);
                  }).length === 0 && (
                    <p className={`text-xs ${themeMutedText} text-center py-12`}>No contacts match "{conversationSearch}".</p>
                  )}
                </div>
              </div>

              {/* Right Pane: Conversation Thread */}
              <div className={`flex-1 flex flex-col h-full overflow-hidden ${!activePrivateChatId ? 'hidden md:flex' : 'flex'}`}>
                {activePrivateChatId ? (
                  <>
                    {/* Thread Header */}
                    <div className={`p-3 sm:p-4 border-b ${themeBorder} flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0`}>
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        {/* Mobile Back to List Button */}
                        <button
                          type="button"
                          onClick={() => setActivePrivateChatId(null)}
                          className="md:hidden p-2 rounded-xl border border-stone-700 bg-stone-800/80 hover:bg-stone-700 text-stone-200 text-xs flex items-center gap-1 shrink-0"
                          title="Back to conversations list"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          <span className="font-semibold text-xs">Back</span>
                        </button>

                        <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                          {privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.name?.slice(0, 1) || 'U'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold truncate">
                              {privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.name || `Chat ${activePrivateChatId}`}
                            </h4>
                            {privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.status && privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.status !== 'active' && (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.status === 'blocked' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.status}
                              </span>
                            )}
                          </div>
                          <span className={`text-[10px] sm:text-[11px] font-mono ${themeMutedText} truncate block`}>
                            Telegram ID: {activePrivateChatId}
                            {privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.username ? ` • @${privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.username}` : ''}
                            {` • Language: ${privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.language || 'English'}`}
                          </span>
                        </div>
                      </div>

                      {/* Sub-tabs: Chat vs Rich Post */}
                      <div className={`flex items-center gap-1 ${themeInnerCardBg} p-1 rounded-xl border ${themeBorder}`}>
                        <button
                          type="button"
                          onClick={() => setPrivateChatSubTab('chat')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                            privateChatSubTab === 'chat'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : `${themeMutedText} hover:text-stone-200`
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Chat History
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrivateChatSubTab('rich_post')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                            privateChatSubTab === 'rich_post'
                              ? 'bg-blue-600 text-white shadow-sm'
                              : `${themeMutedText} hover:text-stone-200`
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          Rich Post
                        </button>
                      </div>
                    </div>

                    {/* Status Alert Banner */}
                    {privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.status === 'blocked' && (
                      <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>This recipient is marked as <strong>blocked</strong> on Telegram. Direct delivery may fail.</span>
                      </div>
                    )}
                    {privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.status === 'opted_out' && (
                      <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center gap-2 shrink-0">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>This user has <strong>opted out</strong> of automated broadcasts. Direct personalized messages can still be sent.</span>
                      </div>
                    )}

                    {privateChatSubTab === 'chat' ? (
                      <>
                        {/* Messages Scroll Area */}
                        <div className="flex-1 p-4 overflow-y-auto space-y-3">
                          {privateChatMessages.map((m, idx) => {
                            const isOut = m.direction === 'out' || m.role === 'assistant';
                            return (
                              <div key={idx} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-md p-3 rounded-2xl text-xs space-y-1 ${
                                  isOut
                                    ? 'bg-blue-600 text-white rounded-br-none'
                                    : `${themeInnerCardBg} border ${themeBorder} rounded-bl-none`
                                }`}>
                                  <div className="flex items-center justify-between gap-4 text-[10px] opacity-70">
                                    <span>{isOut ? 'Roxie' : 'User'}</span>
                                    <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                  {m.mediaType === 'sticker' ||
                                  m.content?.startsWith('🎨 Sticker') ||
                                  m.content?.includes('[Sent sticker]') ? (
                                    <StickerPreview mediaFileId={m.mediaFileId} content={m.content} isDark={true} />
                                  ) : (
                                    <p className="whitespace-pre-wrap">{m.content}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {privateChatMessages.length === 0 && (
                            <p className={`text-xs ${themeMutedText} text-center py-16`}>
                              No messages in this conversation yet. Send a personalized private message below.
                            </p>
                          )}
                        </div>

                        {/* Reply Composer */}
                        <form onSubmit={handleSendPrivateReply} className={`p-4 border-t ${themeBorder} flex items-center gap-2 shrink-0`}>
                          <input
                            type="text"
                            placeholder={
                              privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.name
                                ? `Type personalized message to ${privateChats.find(c => String(c.chatId) === String(activePrivateChatId))?.name}...`
                                : "Type personalized message..."
                            }
                            value={privateReplyText}
                            onChange={(e) => setPrivateReplyText(e.target.value)}
                            className={`flex-1 ${themeInnerCardBg} border ${themeBorder} rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-blue-500`}
                          />
                          <button
                            type="submit"
                            disabled={sendingPrivateReply || !privateReplyText.trim()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                          >
                            <Send className="w-3.5 h-3.5" /> Send
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="flex-1 p-6 overflow-y-auto">
                        <RichPostComposer
                          groups={groups}
                          selectedChatId={Number(activePrivateChatId)}
                          lockedDestination={{
                            type: 'private',
                            chatId: Number(activePrivateChatId),
                            title: privateChats.find(c => c.chatId === activePrivateChatId)?.name || `User ${activePrivateChatId}`
                          }}
                          theme={theme}
                          onRefresh={refreshCurrentView}
                          botUsername={botInfo?.username || 'MissRoxie_Bot'}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
                    <MessageSquare className="w-10 h-10 text-stone-400" />
                    <h4 className="text-xs font-bold">Select a Conversation</h4>
                    <p className={`text-xs ${themeMutedText}`}>Choose a user from the left pane to view their chat history with Roxie.</p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* Sub-tab 2: DM Recipients Registry */}
          {privateNavTab === 'recipients' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-blue-500" /> Direct Message (DM) Recipients Registry
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>
                    Permitted metadata registry for users who opted in or initiated private chats with the bot. Broadcasts respect block/opt-out status.
                  </p>
                </div>
                <button
                  onClick={() => fetchPrivateRecipients()}
                  disabled={privateRecipientsLoading}
                  className={`p-2 rounded-xl ${themeInnerCardBg} border ${themeBorder} text-stone-400 hover:text-white transition-colors`}
                  title="Refresh Recipients"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${privateRecipientsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Stats Summary Cards */}
              {privateRecipientsStats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3.5`}>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${themeMutedText}`}>Total Registered</p>
                    <p className="text-xl font-bold font-mono mt-1 text-white">{privateRecipientsStats.total || 0}</p>
                  </div>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3.5`}>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${themeMutedText}`}>Active Subscribers</p>
                    <p className="text-xl font-bold font-mono mt-1 text-emerald-400">{privateRecipientsStats.active || 0}</p>
                  </div>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3.5`}>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${themeMutedText}`}>Blocked / Inactive</p>
                    <p className="text-xl font-bold font-mono mt-1 text-rose-400">{privateRecipientsStats.blocked || 0}</p>
                  </div>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3.5`}>
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${themeMutedText}`}>Opted Out</p>
                    <p className="text-xl font-bold font-mono mt-1 text-amber-400">{privateRecipientsStats.optedOut || 0}</p>
                  </div>
                </div>
              )}

              {/* Filter controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={recipientSearch}
                    onChange={(e) => {
                      setRecipientSearch(e.target.value);
                      fetchPrivateRecipients(recipientFilterStatus, e.target.value);
                    }}
                    placeholder="Search by username, name, or Telegram ID..."
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 pl-9 text-xs focus:outline-none`}
                  />
                  <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-2.5" />
                </div>
                <select
                  value={recipientFilterStatus}
                  onChange={(e) => {
                    setRecipientFilterStatus(e.target.value);
                    fetchPrivateRecipients(e.target.value, recipientSearch);
                  }}
                  className={`${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="blocked">Blocked</option>
                  <option value="opted_out">Opted Out</option>
                </select>
              </div>

              {/* Recipients Table */}
              {privateRecipientsList.length === 0 ? (
                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-2xl p-12 text-center space-y-3`}>
                  <UserCheck className="w-12 h-12 text-stone-500 mx-auto opacity-30" />
                  <p className="text-sm font-semibold text-stone-300">No private recipients found</p>
                  <p className={`text-xs ${themeMutedText} max-w-sm mx-auto`}>
                    Recipients are automatically added when users start a direct chat with the bot or opt into notifications.
                  </p>
                </div>
              ) : (
                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-2xl overflow-hidden`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-stone-900/60 text-stone-400 uppercase text-[10px] font-bold border-b border-stone-800">
                        <tr>
                          <th className="p-3.5">User</th>
                          <th className="p-3.5">Telegram ID</th>
                          <th className="p-3.5">Opt-in Date</th>
                          <th className="p-3.5">Status</th>
                          <th className="p-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-800">
                        {privateRecipientsList.map((r: any) => (
                          <tr key={r.chatId} className="hover:bg-stone-800/30 transition-colors">
                            <td className="p-3.5">
                              <div className="font-semibold text-white">
                                {r.firstName || 'User'} {r.lastName || ''}
                              </div>
                              {r.username && <div className="text-[11px] text-blue-400 font-mono">@{r.username}</div>}
                            </td>
                            <td className="p-3.5 font-mono text-stone-300">{r.chatId}</td>
                            <td className="p-3.5 text-stone-400">
                              {r.optedInAt ? new Date(r.optedInAt).toLocaleDateString() : '—'}
                            </td>
                            <td className="p-3.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                r.status === 'active'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : r.status === 'blocked'
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {r.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-right space-x-1.5">
                              <button
                                onClick={() => {
                                  setActivePrivateChatId(r.chatId);
                                  setPrivateNavTab('conversations');
                                }}
                                className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-[11px] font-semibold"
                                title="Open private conversation"
                              >
                                Message
                              </button>
                              <button
                                onClick={() => handleToggleRecipientOptOut(r.chatId, r.status)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                                  r.status === 'opted_out'
                                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                                    : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                                }`}
                              >
                                {r.status === 'opted_out' ? 'Re-activate' : 'Opt Out'}
                              </button>
                              <button
                                onClick={() => handleDeleteRecipient(r.chatId)}
                                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-[11px] font-semibold"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub-tab 3: DM Broadcast */}
          {privateNavTab === 'broadcast' && (
            <div className={`${themeCardBg} border rounded-2xl p-4 sm:p-6 space-y-4`}>
              <div className="border-b pb-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Radio className="w-4 h-4 text-blue-500" /> Direct Message Broadcast
                </h3>
                <p className={`text-xs ${themeMutedText}`}>
                  Compose and send rich broadcasts directly to all private chat users and registered DM recipients.
                </p>
              </div>
              <RichPostComposer
                groups={groups}
                privateChats={privateChats}
                selectedChatId="all"
                theme={theme}
                onRefresh={refreshCurrentView}
                botUsername={botInfo?.username || 'MissRoxie_Bot'}
              />
            </div>
          )}

        </div>
      )}

          {/* TAB: MESSAGES (STORED GROUP MESSAGES) */}
          {activeNav === 'messages' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" /> Stored Message Center
                </h3>
                <p className={`text-xs ${themeMutedText}`}>Inspection of messages received and remembered by Roxie.</p>
              </div>

              <div className="space-y-3">
                {allStoredMessages.map((msg: any, idx: number) => (
                  <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-start justify-between gap-3`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold">{msg.name || (msg.role === 'assistant' ? 'Roxie' : 'User')}</span>
                        {msg.groupTitle && <span className={`text-[10px] ${themeMutedText}`}>in {msg.groupTitle}</span>}
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${msg.role === 'assistant' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                          {msg.role}
                        </span>
                      </div>
                      <p className="text-xs">{msg.content}</p>
                    </div>
                    <span className={`text-[10px] font-mono ${themeMutedText} shrink-0`}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {allStoredMessages.length === 0 && (
                  <p className={`text-xs ${themeMutedText} text-center py-12`}>Select a specific group to view its stored conversation memory.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB: RICH POST COMPOSER */}
          {activeNav === 'rich-post' && (
            <RichPostComposer
              groups={groups}
              privateChats={privateChats}
              selectedChatId={selectedChatId}
              theme={theme}
              onRefresh={refreshCurrentView}
              botUsername={botInfo?.username || 'MissRoxie_Bot'}
            />
          )}

          {/* TAB: SEND MESSAGE */}
          {activeNav === 'send-message' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6 max-w-2xl`}>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Send className="w-4 h-4 text-blue-500" /> Send Direct Telegram Message
                </h3>
                <p className={`text-xs ${themeMutedText}`}>Transmit a message to a connected group or private chat directly via Telegram API.</p>
              </div>

              {sendResult && (
                <div className={`p-4 rounded-xl text-xs border ${sendResult.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                  {sendResult.ok ? '✅ Message sent successfully!' : `❌ Failed to send: ${sendResult.data?.error}`}
                </div>
              )}

              <form onSubmit={handleSendMessage} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold block">Target Destination</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="targetType"
                        checked={sendTargetType === 'group'}
                        onChange={() => { setSendTargetType('group'); setSendTargetId(''); }}
                        className="text-blue-600"
                      />
                      <span>Telegram Group</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="targetType"
                        checked={sendTargetType === 'private'}
                        onChange={() => { setSendTargetType('private'); setSendTargetId(''); }}
                        className="text-blue-600"
                      />
                      <span>Private Chat (DM)</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold block">Select Target</label>
                  {sendTargetType === 'group' ? (
                    <select
                      value={sendTargetId}
                      onChange={(e) => setSendTargetId(e.target.value)}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2.5 text-xs focus:outline-none`}
                    >
                      <option value="">-- Choose Group --</option>
                      {groups.filter(g => !g.botLeft).map(g => (
                        <option key={g.chatId} value={g.chatId}>{g.chatTitle} ({g.chatId})</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={sendTargetId}
                      onChange={(e) => setSendTargetId(e.target.value)}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2.5 text-xs focus:outline-none`}
                    >
                      <option value="">-- Choose User --</option>
                      {privateChats.map(c => (
                        <option key={c.chatId} value={c.chatId}>{c.name} ({c.chatId})</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold block">Message Content (HTML supported)</label>
                  <textarea
                    rows={4}
                    placeholder="Enter message to send..."
                    value={sendMessageContent}
                    onChange={(e) => setSendMessageContent(e.target.value)}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs focus:outline-none focus:border-blue-500`}
                  />
                </div>

                {sendMessageContent.trim() && (
                  <div className="space-y-1 pt-1">
                    <span className={`text-[11px] ${themeMutedText}`}>Live Preview:</span>
                    <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs`}>
                      {sendMessageContent}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={sendingMessage || !sendTargetId || !sendMessageContent.trim()}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendingMessage ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </div>
          )}

          {/* TAB: SCHEDULES & RULES */}
          {activeNav === 'schedules' && (
            <div className="space-y-6">
              {/* Header & Main Schedule Management */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
                {scheduleNotification && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                    scheduleNotification.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  }`}>
                    <span className="font-semibold">{scheduleNotification.message}</span>
                    <button onClick={() => setScheduleNotification(null)} className="opacity-70 hover:opacity-100">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" /> Scheduled Messages ({schedulesList.length})
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Configure automated recurring messages, intervals, and one-time announcements across all chats.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingSchedule(null);
                        setScheduleFormError(null);
                        const now = new Date();
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                        const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
                        setNewScheduleForm({
                          chatId: groups[0]?.chatId || '',
                          name: '',
                          message: '',
                          scheduleType: 'interval',
                          intervalStr: '1h',
                          nextRunDate: defaultDate,
                          nextRunTime: defaultTime,
                          timezone: 'UTC',
                          contentType: 'text',
                          mediaFileId: '',
                          replyToMessageId: '',
                          enabled: true,
                          pinAfterSend: false,
                          replyToLatest: false,
                          autoDeletePrevious: false,
                          triggerKeyword: '',
                          inlineKeyboard: []
                        });
                        setShowCreateScheduleModal(true);
                      }}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Schedule
                    </button>
                    <ContentReuseButton
                      onClick={() => {
                        setEditingSchedule(null);
                        setShowCopyScheduleFromIdModal(true);
                      }}
                      label="Reuse by ID"
                    />
                    <button
                      onClick={() => fetchData()}
                      disabled={schedulesLoading}
                      className={`p-2 rounded-xl ${themeInnerCardBg} border ${themeBorder} text-stone-400 hover:text-white transition-colors`}
                      title="Refresh"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${schedulesLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Filter by Target Group */}
                <div className="flex items-center gap-2 text-xs">
                  <span className={`font-semibold ${themeMutedText}`}>Filter Target:</span>
                  <select
                    value={schedulesFilterChatId}
                    onChange={(e) => setSchedulesFilterChatId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                    className={`${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none`}
                  >
                    <option value="all">All Groups ({schedulesList.length} schedules)</option>
                    {groups.map(g => (
                      <option key={g.chatId} value={g.chatId}>
                        {g.chatTitle} ({schedulesList.filter(s => s.chatId === g.chatId).length})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Schedules List */}
                {schedulesList.filter(s => schedulesFilterChatId === 'all' || s.chatId === schedulesFilterChatId).length === 0 ? (
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-10 text-center space-y-3`}>
                    <Clock className="w-10 h-10 text-stone-500 mx-auto opacity-40" />
                    <p className="text-sm font-semibold text-stone-300">No scheduled messages found</p>
                    <p className={`text-xs ${themeMutedText} max-w-sm mx-auto`}>
                      Click "New Schedule" to create automated recurring announcements, hourly reminders, or scheduled notices for any group.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedulesList
                      .filter(s => schedulesFilterChatId === 'all' || s.chatId === schedulesFilterChatId)
                      .map((s: any) => {
                        const targetGroup = groups.find(g => g.chatId === s.chatId);
                        return (
                          <div key={s.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs`}>
                            <div className="space-y-1.5 max-w-2xl">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">ID: {s.id}</span>
                                <span className="font-bold text-sm">{s.name || 'Scheduled Broadcast'}</span>
                                <span className="text-stone-400">➔</span>
                                <span className="font-semibold text-blue-400">{targetGroup?.chatTitle || s.chatTitle || `Chat ${s.chatId}`}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.enabled !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-stone-800 text-stone-400'}`}>
                                  {s.enabled !== false ? '● Active' : '○ Paused'}
                                </span>
                                {s.scheduleType && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 uppercase font-semibold">
                                    {s.scheduleType}
                                  </span>
                                )}
                                {s.triggerKeyword && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20" title={`Trigger keyword: ${s.triggerKeyword}`}>
                                    ⚡ Trigger: "{s.triggerKeyword}"
                                  </span>
                                )}
                                {s.pinAfterSend && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-400 font-semibold border border-purple-500/20">
                                    📌 Pin
                                  </span>
                                )}
                                {s.replyToLatest && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 font-semibold border border-amber-500/20">
                                    ↩️ Reply Latest
                                  </span>
                                )}
                                {s.autoDeletePrevious && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20">
                                    🗑️ delOn
                                  </span>
                                )}
                                {s.inlineKeyboard && s.inlineKeyboard.length > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20">
                                    🔗 {s.inlineKeyboard.flat().length} Button{s.inlineKeyboard.flat().length > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <p className={`line-clamp-2 text-xs ${isDark ? 'text-stone-300' : 'text-slate-700'}`}>{s.message || s.messageText}</p>
                              <div className={`flex flex-wrap items-center gap-3 text-[11px] ${themeMutedText} pt-1`}>
                                <span>Interval: <strong className="text-stone-300">{s.intervalFormatted || 'Custom'}</strong></span>
                                {s.triggerKeyword && (
                                  <span>Trigger: <strong className="text-emerald-400">"{s.triggerKeyword}"</strong></span>
                                )}
                                <span>Next: <strong className="text-stone-300">{s.nextRun ? new Date(s.nextRun).toLocaleString() : 'N/A'}</strong></span>
                                <span>Runs: <strong className="text-stone-300">{s.runsCount || 0}</strong></span>
                                {s.lastRun && (
                                  <span>Last: <strong className="text-stone-300">{new Date(s.lastRun).toLocaleString()}</strong></span>
                                )}
                                {s.lastStatus && (
                                  <span className={s.lastStatus === 'success' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                                    Status: {s.lastStatus}
                                  </span>
                                )}
                                {s.lastStatus === 'failure' && s.lastError && (
                                  <span
                                    className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 max-w-sm truncate"
                                    title={String(s.lastError).replace(/\b\d{8,11}:[a-zA-Z0-9_-]{35}\b/g, '[REDACTED]').replace(/bot\d+:[a-zA-Z0-9_-]+/gi, 'bot[REDACTED]')}
                                  >
                                    Error: {String(s.lastError).replace(/\b\d{8,11}:[a-zA-Z0-9_-]{35}\b/g, '[REDACTED]').replace(/bot\d+:[a-zA-Z0-9_-]+/gi, 'bot[REDACTED]')}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleToggleSchedule(s.id, s.enabled !== false)}
                                className={`px-3 py-1.5 rounded-xl font-semibold text-xs border transition-colors ${
                                  s.enabled !== false
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                }`}
                              >
                                {s.enabled !== false ? 'Pause' : 'Enable'}
                              </button>
                              <button
                                onClick={async () => {
                                  const ok = await copyTextToClipboard(s.id);
                                  if (ok) {
                                    setScheduleNotification({ type: 'success', message: 'Schedule ID copied' }); setTimeout(() => setScheduleNotification(null), 3000);
                                  } else {
                                    setScheduleNotification({ type: 'error', message: 'Failed to copy ID to clipboard' }); setTimeout(() => setScheduleNotification(null), 3000);
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-xl ${themeInnerCardBg} border ${themeBorder} text-cyan-300 hover:text-white flex items-center gap-1 transition-colors`}
                                title="Copy Schedule ID"
                              >
                                <Copy className="w-3.5 h-3.5" /> Copy ID
                              </button>
                              <button
                                onClick={() => handleCopyScheduleCode(s)}
                                className={`px-3 py-1.5 rounded-xl ${themeInnerCardBg} border ${themeBorder} text-slate-300 hover:text-white flex items-center gap-1 transition-colors`}
                                title="Export Schedule Code & JSON"
                              >
                                <Code className="w-3.5 h-3.5" /> Code
                              </button>
                              <button
                                onClick={() => {
                                  setEditingSchedule(s);
                                  setScheduleFormError(null);
                                  const now = new Date();
                                  const pad = (n: number) => String(n).padStart(2, '0');
                                  let defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
                                  let defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
                                  if (s.nextRun) {
                                    try {
                                      const d = new Date(s.nextRun);
                                      if (!isNaN(d.getTime())) {
                                        defaultDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                                        defaultTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                      }
                                    } catch {}
                                  }
                                  setNewScheduleForm({
                                    chatId: s.chatId,
                                    name: s.name || '',
                                    message: s.message || s.messageText || '',
                                    scheduleType: s.scheduleType || 'interval',
                                    intervalStr: s.intervalFormatted || '1h',
                                    nextRunDate: defaultDate,
                                    nextRunTime: defaultTime,
                                    timezone: s.timezone || 'UTC',
                                    contentType: s.contentType || 'text',
                                    mediaFileId: s.mediaFileId || '',
                                    replyToMessageId: s.replyToMessageId ? String(s.replyToMessageId) : '',
                                    enabled: s.enabled !== false,
                                    pinAfterSend: Boolean(s.pinAfterSend),
                                    replyToLatest: Boolean(s.replyToLatest),
                                    autoDeletePrevious: Boolean(s.autoDeletePrevious),
                                    triggerKeyword: s.triggerKeyword || '',
                                    inlineKeyboard: Array.isArray(s.inlineKeyboard) ? s.inlineKeyboard.map((row: any[]) => Array.isArray(row) ? row.map(btn => ({ text: btn.text || '', url: btn.url || '', style: btn.style && ['primary', 'success', 'danger'].includes(btn.style) ? btn.style : undefined })) : []) : []
                                  });
                                  setShowCreateScheduleModal(true);
                                }}
                                className={`px-3 py-1.5 rounded-xl ${themeInnerCardBg} border ${themeBorder} text-stone-300 hover:text-white transition-colors`}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(s.id)}
                                className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                                title="Delete Schedule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Group Automation Rules Section */}
              <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" /> Group Automation Rules
                    </h3>
                    <p className={`text-xs ${themeMutedText}`}>Configure reactive automation triggers and moderation actions for individual groups.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={schedulesFilterChatId === 'all' ? (groups[0]?.chatId || '') : schedulesFilterChatId}
                      onChange={(e) => {
                        const cid = Number(e.target.value);
                        setSchedulesFilterChatId(cid);
                        fetchAutomations(cid);
                      }}
                      className={`${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none`}
                    >
                      {groups.map(g => (
                        <option key={g.chatId} value={g.chatId}>
                          {g.chatTitle}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowCreateAutomationModal(true)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Rule
                    </button>
                  </div>
                </div>

                {groupAutomationsList.length === 0 ? (
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-8 text-center space-y-2`}>
                    <Zap className="w-8 h-8 text-stone-500 mx-auto opacity-40" />
                    <p className="text-xs font-semibold text-stone-400">No automation rules configured for selected group</p>
                    <p className={`text-[11px] ${themeMutedText}`}>Add custom reactive rules (e.g., auto-delete spam, instant user warns, link blocks).</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupAutomationsList.map((a: any) => {
                      const curChatId = schedulesFilterChatId === 'all' ? groups[0]?.chatId : schedulesFilterChatId;
                      return (
                        <div key={a.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 flex items-center justify-between text-xs`}>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-bold">RULE: {a.id}</span>
                              <span className="font-semibold text-blue-400">Trigger: {a.trigger}</span>
                              <span className="text-stone-500">➔</span>
                              <span className="font-semibold text-amber-400">Action: {a.action}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${a.enabled !== false ? 'bg-emerald-500/10 text-emerald-400' : 'bg-stone-800 text-stone-400'}`}>
                                {a.enabled !== false ? 'Active' : 'Disabled'}
                              </span>
                            </div>
                            {a.parameters && (
                              <p className={`text-[11px] ${themeMutedText}`}>Parameters: <code className="font-mono">{a.parameters}</code></p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleAutomation(Number(curChatId), a.id, a.enabled !== false)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                                a.enabled !== false
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              }`}
                            >
                              {a.enabled !== false ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleDeleteAutomation(Number(curChatId), a.id)}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: BROADCAST (UNIFIED POST COMPOSER & MENTION ALL) */}
          {activeNav === 'broadcast' && (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 border-b ${themeBorder} pb-3 flex-wrap`}>
                <button
                  type="button"
                  onClick={() => setBroadcastSubTab('standard')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all min-h-[42px] ${
                    broadcastSubTab === 'standard'
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50'
                      : `${themeInnerCardBg} ${isDark ? 'text-stone-300 hover:text-white hover:bg-stone-800/40' : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100'} border ${themeBorder}`
                  }`}
                >
                  <Radio className="w-4 h-4 text-blue-400" />
                  <span>Standard Broadcast</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastSubTab('mention-all')}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all min-h-[42px] ${
                    broadcastSubTab === 'mention-all'
                      ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-500/50'
                      : `${themeInnerCardBg} ${isDark ? 'text-stone-300 hover:text-white hover:bg-stone-800/40' : 'text-stone-700 hover:text-stone-900 hover:bg-stone-100'} border ${themeBorder}`
                  }`}
                >
                  <Users className="w-4 h-4 text-purple-400" />
                  <span>Mention All (@all)</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                    broadcastSubTab === 'mention-all' ? 'bg-purple-700/60 text-purple-100' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  }`}>
                    @all
                  </span>
                </button>
              </div>

              {broadcastSubTab === 'standard' ? (
                <RichPostComposer
                  groups={groups}
                  privateChats={privateChats}
                  selectedChatId={selectedChatId}
                  theme={theme}
                  onRefresh={refreshCurrentView}
                  botUsername={botInfo?.username || 'MissRoxie_Bot'}
                />
              ) : (
                <MentionAllComposer
                  groups={groups}
                  selectedChatId={typeof selectedChatId === 'number' ? selectedChatId : null}
                  theme={theme}
                  onRefresh={refreshCurrentView}
                />
              )}
            </div>
          )}

          {/* TAB: STICKER CENTER */}
          {activeNav === 'stickers' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Smile className="w-4 h-4 text-amber-500" /> Sticker Center
                  </h3>
                  <p className={`text-xs ${themeMutedText}`}>Catalog of imported, custom group, and Lust Mode sticker sets.</p>
                </div>

                <div className={`flex items-center gap-1.5 ${themeInnerCardBg} p-1 rounded-xl border ${themeBorder} text-xs font-semibold`}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'custom', label: 'Custom' },
                    { id: 'lust', label: 'Lust Mode' },
                    { id: 'default', label: 'Default' }
                  ].map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => setStickerTab(t.id)}
                      className={`px-3 py-1 rounded-lg transition-colors ${
                        stickerTab === t.id ? 'bg-blue-600 text-white' : `${themeMutedText}`
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Object.entries(globalStickersData?.global?.stickers || {}).flatMap(([mood, list]: [string, any]) => {
                  if (!Array.isArray(list)) return [];
                  return list.map((st: any) => ({
                    fileId: typeof st === 'string' ? st : st.fileId,
                    mood,
                    source: typeof st === 'object' ? st.source : 'custom'
                  }));
                }).map((item, idx) => (
                  <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 flex flex-col items-center justify-between text-center space-y-2`}>
                    <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-2xl">
                      🎨
                    </div>
                    <div className="space-y-0.5 w-full">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 block truncate">{item.mood}</span>
                      <span className={`text-[10px] font-mono ${themeMutedText} block truncate`} title={item.fileId}>
                        {item.fileId.slice(0, 10)}...
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: COMMANDS */}
          {activeNav === 'commands' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-blue-500" /> Authoritative Command Registry ({commands.length} Commands)
                </h3>
                <p className={`text-xs ${themeMutedText}`}>Synchronized single source of truth for Telegram bot commands, permissions, syntax, and aliases.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {commands.map((cmd, idx) => (
                  <div key={idx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-2`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-blue-500/10 text-blue-500 font-mono text-xs font-bold rounded-lg border border-blue-500/20">
                          {cmd.command}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-stone-500/10 text-stone-400">
                          {cmd.category}
                        </span>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                        cmd.permission === 'Owner' ? 'bg-red-500/20 text-red-500' :
                        cmd.permission === 'Admin' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'
                      }`}>
                        {cmd.permission}
                      </span>
                    </div>
                    <p className="text-xs">{cmd.description}</p>
                    {cmd.aliases && cmd.aliases.length > 0 && (
                      <div className="text-[11px] text-blue-400">
                        <strong>Aliases:</strong> {cmd.aliases.join(', ')}
                      </div>
                    )}
                    <div className={`${themeCardBg} rounded-lg p-2.5 text-[11px] font-mono space-y-0.5 ${themeMutedText}`}>
                      <div><strong>Syntax:</strong> {cmd.syntax}</div>
                      <div><strong>Example:</strong> {cmd.example}</div>
                      {cmd.scopes && (
                        <div><strong>Scopes:</strong> {cmd.scopes.join(', ')}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: ACTIVITY / AUDIT LOG */}
          {activeNav === 'audit' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-500" /> Moderation & System Audit Log
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className={`${themeInnerCardBg} ${themeMutedText} border-b ${themeBorder}`}>
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Group</th>
                      <th className="p-3">Actor</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Target</th>
                      <th className="p-3">Details / Reason</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-stone-900' : 'divide-slate-200'}`}>
                    {filteredLogs.map((l: ModerationLog, idx: number) => (
                      <tr key={idx} onClick={() => setSelectedEvent(l)} className="hover:opacity-80 cursor-pointer">
                        <td className={`p-3 font-mono ${themeMutedText}`}>{new Date(l.timestamp).toLocaleTimeString()}</td>
                        <td className="p-3">{l.chatTitle || l.chatId}</td>
                        <td className="p-3 font-mono">@{l.adminUsername || l.adminUserId || 'system'}</td>
                        <td className="p-3 font-bold text-blue-500">{l.action}</td>
                        <td className="p-3 font-mono">@{l.targetUsername || l.targetUserId || '-'}</td>
                        <td className={`p-3 truncate max-w-xs ${themeMutedText}`}>{l.reason || l.details || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: HEALTH & DIAGNOSTICS */}
          {activeNav === 'health-diagnostics' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-500" /> Roxie Production Monitoring & Diagnostics
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Real-time system health, component statuses, runtime metrics, and error diagnostics.</p>
                </div>
                <button
                  onClick={fetchData}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Diagnostics
                </button>
              </div>

              {/* Status Banner */}
              <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                healthData?.status === 'HEALTHY' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
                healthData?.status === 'DEGRADED' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                'bg-red-500/10 border-red-500/30 text-red-500'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full animate-pulse ${
                    healthData?.status === 'HEALTHY' ? 'bg-emerald-500' :
                    healthData?.status === 'DEGRADED' ? 'bg-amber-500' : 'bg-red-500'
                  }`} />
                  <div>
                    <h3 className="text-sm font-bold">System Status: {healthData?.status || 'HEALTHY'}</h3>
                    <p className="text-xs opacity-80">Last checked: {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : 'N/A'}</p>
                  </div>
                </div>
                <div className="text-xs font-mono">
                  Uptime: {Math.floor((healthData?.uptimeSeconds || 0) / 60)}m {(healthData?.uptimeSeconds || 0) % 60}s
                </div>
              </div>

              {/* Component Status Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {[
                  { name: 'Bot Core', status: healthData?.components?.bot?.configured ? 'Configured' : 'Missing Token', ok: healthData?.components?.bot?.configured },
                  { name: 'Telegram Polling', status: healthData?.components?.telegramPolling?.status || 'HEALTHY', ok: healthData?.components?.telegramPolling?.status !== 'DEGRADED' },
                  {
                    name: 'MTProto Member Service',
                    status: healthData?.components?.mtproto?.status === 'HEALTHY' ? '🟢 Connected' :
                            healthData?.components?.mtproto?.canOperate && healthData?.components?.mtproto?.userSessionWarning ? '🟢 Bot Mode Active' :
                            healthData?.components?.mtproto?.status === 'AUTH_KEY_UNREGISTERED' ? '🔴 Key Revoked (401)' :
                            healthData?.components?.mtproto?.status === 'AUTH_REVOKED' ? '🔴 Session Revoked' :
                            healthData?.components?.mtproto?.status === 'NOT_CONFIGURED' ? '⚪ Not Configured' :
                            healthData?.components?.mtproto?.isConnected ? '🟢 Connected' :
                            healthData?.components?.mtproto?.canOperate ? '🟢 Ready (Bot Auth)' : '🟡 Standby / Ready',
                    ok: Boolean(healthData?.components?.mtproto?.canOperate || healthData?.components?.mtproto?.isConnected),
                    extra: (
                      <div className={`text-[11px] ${themeMutedText} space-y-0.5 pt-1.5 border-t border-white/5`}>
                        <div><span className="font-semibold">Mode:</span> {healthData?.components?.mtproto?.mode || 'NONE'}</div>
                        <div><span className="font-semibold">Can Operate:</span> {healthData?.components?.mtproto?.canOperate ? 'Yes' : 'No'}</div>
                        {healthData?.components?.mtproto?.userSessionWarning ? (
                          <div className="text-amber-400 font-sans text-[10px] line-clamp-2" title={healthData?.components?.mtproto?.userSessionWarning}>
                            User session revoked; running in Bot Mode
                          </div>
                        ) : healthData?.components?.mtproto?.errorCode && (
                          <div className="text-rose-400 font-mono text-[10px] truncate" title={healthData?.components?.mtproto?.actionRequired || healthData?.components?.mtproto?.errorCode}>
                            {healthData?.components?.mtproto?.errorCode}
                          </div>
                        )}
                      </div>
                    )
                  },
                  { name: 'Scheduler', status: healthData?.components?.scheduler?.status || 'HEALTHY', ok: true },
                  { name: 'AI Chatbot', status: healthData?.components?.ai?.status || 'HEALTHY', ok: true },
                  {
                    name: 'Storage Persistence',
                    status: healthData?.components?.storage?.indicator === 'persistent' ? '🟢 Persistent' :
                            healthData?.components?.storage?.indicator === 'local_ephemeral' ? '🟡 Local / Ephemeral' : '🔴 Persistence Error',
                    ok: healthData?.components?.storage?.indicator !== 'error',
                    extra: (
                      <div className={`text-[11px] ${themeMutedText} space-y-0.5 pt-1.5 border-t border-white/5`}>
                        <div className="truncate"><span className="font-semibold">Data Dir:</span> {healthData?.components?.storage?.dataDirectory || 'data'}</div>
                        <div><span className="font-semibold">Writable:</span> {healthData?.components?.storage?.isWritable ? 'Yes' : 'No'}</div>
                      </div>
                    )
                  }
                ].map((comp: any, idx) => (
                  <div key={idx} className={`${themeCardBg} border rounded-2xl p-4 space-y-2 flex flex-col justify-between`}>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${themeMutedText}`}>{comp.name}</span>
                        <span className={`w-2 h-2 rounded-full ${comp.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      </div>
                      <div className="text-sm font-bold">{comp.status}</div>
                    </div>
                    {comp.extra && comp.extra}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: LIVE CHECKLIST */}
          {activeNav === 'live-checklist' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-4`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-blue-500" /> Live Test Checklist (LIVE-01 to LIVE-46)
                  </h3>
                  <p className={`text-xs ${themeMutedText}`}>Record verification status for end-to-end Telegram bot behaviors.</p>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg">
                    Pass: {Object.values(liveTestStatus).filter(v => v === 'PASS').length}
                  </span>
                  <span className="px-2.5 py-1 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg">
                    Fail: {Object.values(liveTestStatus).filter(v => v === 'FAIL').length}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className={`${themeInnerCardBg} ${themeMutedText} border-b ${themeBorder}`}>
                    <tr>
                      <th className="p-3 w-28">Test ID</th>
                      <th className="p-3">Behavior / Feature Description</th>
                      <th className="p-3 w-40 text-right">Verification Status</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-stone-900' : 'divide-slate-200'}`}>
                    {LIVE_TESTS.map((test) => {
                      const status = liveTestStatus[test.id] || 'NOT TESTED';
                      return (
                        <tr key={test.id} className="hover:opacity-80">
                          <td className="p-3 font-mono font-bold text-blue-500">{test.id}</td>
                          <td className="p-3">{test.title}</td>
                          <td className="p-3 text-right">
                            <select
                              value={status}
                              onChange={(e) => updateTestStatus(test.id, e.target.value as any)}
                              className={`px-3 py-1.5 rounded-xl font-medium text-xs border ${
                                status === 'PASS' 
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' 
                                  : status === 'FAIL' 
                                  ? 'bg-red-500/10 text-red-500 border-red-500/30' 
                                  : `${themeInnerCardBg} ${themeBorder}`
                              }`}
                            >
                              <option value="NOT TESTED">NOT TESTED</option>
                              <option value="PASS">PASS</option>
                              <option value="FAIL">FAIL</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: LIVE TELEGRAM VERIFICATION */}
          {activeNav === 'live-verify' && (
            <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6`}>
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Live Telegram Verification
                  </h3>
                  <p className={`text-xs ${themeMutedText}`}>Real-time Telegram API connection and bot identity diagnostics.</p>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} /> Test Connection
                </button>
              </div>

              {testResult && (
                <div className={`p-4 rounded-xl text-xs border ${testResult.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
                  {testResult.success ? `✅ Successfully connected to bot @${testResult.bot?.username} (${testResult.bot?.first_name})` : `❌ Connection failed: ${testResult.error}`}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-1`}>
                  <span className={`text-[11px] ${themeMutedText} font-medium`}>Connection State</span>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${isPolling ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                    <span>{isPolling ? 'CONNECTED & POLLING' : 'DISCONNECTED'}</span>
                  </div>
                </div>

                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-1`}>
                  <span className={`text-[11px] ${themeMutedText} font-medium`}>Bot Username</span>
                  <div className="text-sm font-bold font-mono">
                    @{botInfo?.username || 'MissRoxie_Bot'}
                  </div>
                </div>

                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-1`}>
                  <span className={`text-[11px] ${themeMutedText} font-medium`}>Polling Errors</span>
                  <div className="text-xs font-mono text-emerald-500 truncate">
                    {telegramStatus?.pollingError || 'None'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LOADING FALLBACK FOR GROUP DETAILS */}
          {activeNav === 'groups' && activeGroupDetailId && !groupDetails && (
            <div className={`${themeCardBg} border rounded-2xl p-12 text-center space-y-4`}>
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
              <div>
                <h3 className="text-sm font-bold">Loading Group Data...</h3>
                <p className={`text-xs ${themeMutedText} mt-1`}>Fetching settings, permissions, and members for Chat ID: {activeGroupDetailId}</p>
              </div>
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => fetchData()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry
                </button>
                <button
                  onClick={() => setActiveGroupDetailId(null)}
                  className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Back to Overview
                </button>
              </div>
            </div>
          )}

          {/* TAB: SETTINGS HUB */}
          {activeNav === 'settings' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Settings className="w-5 h-5 text-blue-500" /> Group & Global Settings Hub
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Select any Telegram group to configure its individual moderation, AI, welcome, or security settings.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {groups.map((g) => (
                  <div key={g.chatId} className={`${themeCardBg} border rounded-2xl p-5 space-y-3 flex flex-col justify-between`}>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold truncate">{g.chatTitle}</h3>
                      <p className={`text-[10px] font-mono ${themeMutedText}`}>ID: {g.chatId}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedChatId(g.chatId);
                        setActiveGroupDetailId(g.chatId);
                        setGroupDetailTab('general');
                      }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Settings2 className="w-3.5 h-3.5" /> Open Group Settings
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: MODERATORS HUB */}
          {activeNav === 'moderators' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-500" /> Group Moderators Hub
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Inspect group administrators, promote/demote members, and manage custom moderator privileges.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {groups.map((g) => (
                  <div key={g.chatId} className={`${themeCardBg} border rounded-2xl p-5 space-y-3 flex flex-col justify-between`}>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold truncate">{g.chatTitle}</h3>
                      <p className={`text-[10px] font-mono ${themeMutedText}`}>ID: {g.chatId} • {g.botRole || 'Admin'}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedChatId(g.chatId);
                        setActiveGroupDetailId(g.chatId);
                        setGroupDetailTab('moderators');
                      }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Shield className="w-3.5 h-3.5" /> Manage Moderators
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: PERMISSIONS HUB */}
          {activeNav === 'permissions' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Lock className="w-5 h-5 text-blue-500" /> Group Content Permissions Hub
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>Configure content locks, custom user roles, and sticker/media exemptions per group.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {groups.map((g) => (
                  <div key={g.chatId} className={`${themeCardBg} border rounded-2xl p-5 space-y-3 flex flex-col justify-between`}>
                    <div className="space-y-1">
                      <h3 className="text-xs font-bold truncate">{g.chatTitle}</h3>
                      <p className={`text-[10px] font-mono ${themeMutedText}`}>ID: {g.chatId}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedChatId(g.chatId);
                        setActiveGroupDetailId(g.chatId);
                        setGroupDetailTab('permissions');
                      }}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" /> Manage Permissions
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: POST LIBRARY (Feature 1 & Parity) */}
          {activeNav === 'post-library' && !activeGroupDetailId && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Bookmark className="w-5 h-5 text-blue-500" /> Saved Post Library
                  </h2>
                  <p className={`text-xs ${themeMutedText}`}>
                    Persistent, reusable posts with media and inline button layouts. Use references like <code className="text-cyan-400 font-mono">{"{{post:POST-XXXXX}}"}</code> in broadcasts and schedules.
                  </p>
                </div>
                <button
                  onClick={handleOpenCreatePost}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Create Saved Post
                </button>
              </div>

              {/* Prominently displayed newly saved post banner */}
              {newlyCreatedPostBanner && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/80 via-slate-900/90 to-cyan-950/80 border border-cyan-500/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">Post Created Successfully!</span>
                        <span className="text-[11px] text-stone-400 truncate max-w-[220px]">
                          &quot;{newlyCreatedPostBanner.title}&quot;
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] text-stone-300">Generated Post ID:</span>
                        <span className="font-mono font-bold text-cyan-300 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-500/40 text-xs">
                          {newlyCreatedPostBanner.id}
                        </span>
                        <span className="text-[11px] text-stone-400 font-mono">
                          &#123;&#123;post:{newlyCreatedPostBanner.id}&#125;&#125;
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyPostId(newlyCreatedPostBanner.id)}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                      title="Copy Post ID"
                    >
                      {copiedPostId === newlyCreatedPostBanner.id ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPostId === newlyCreatedPostBanner.id ? 'Copied ID!' : 'Copy ID'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(`{{post:${newlyCreatedPostBanner.id}}}`);
                        setCopiedPostId(`ref_${newlyCreatedPostBanner.id}`);
                        setTimeout(() => setCopiedPostId(null), 2500);
                      }}
                      className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Copy Dynamic Reference Syntax"
                    >
                      {copiedPostId === `ref_${newlyCreatedPostBanner.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPostId === `ref_${newlyCreatedPostBanner.id}` ? 'Copied Ref!' : 'Copy Reference'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewlyCreatedPostBanner(null)}
                      className="text-stone-400 hover:text-white p-1"
                      title="Dismiss Banner"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={postSearch}
                    onChange={(e) => {
                      setPostSearch(e.target.value);
                      fetchSavedPosts(e.target.value, postTypeFilter);
                    }}
                    placeholder="Search posts by title, text, or ID..."
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 pl-9 text-xs focus:outline-none`}
                  />
                  <Search className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-2.5" />
                </div>
                <select
                  value={postTypeFilter}
                  onChange={(e) => {
                    setPostTypeFilter(e.target.value);
                    fetchSavedPosts(postSearch, e.target.value);
                  }}
                  className={`${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                >
                  <option value="all">All Content Types</option>
                  <option value="text">Text Only</option>
                  <option value="photo">Photos</option>
                  <option value="video">Videos</option>
                  <option value="document">Documents</option>
                  <option value="sticker">Stickers</option>
                </select>
                <button
                  onClick={() => fetchSavedPosts()}
                  disabled={savedPostsLoading}
                  className={`p-2 rounded-xl ${themeInnerCardBg} border ${themeBorder} text-stone-400 hover:text-white transition-colors`}
                  title="Refresh Posts"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${savedPostsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Saved Posts Grid */}
              {savedPostsList.length === 0 ? (
                <div className={`${themeInnerCardBg} border ${themeBorder} rounded-2xl p-12 text-center space-y-3`}>
                  <Bookmark className="w-12 h-12 text-stone-500 mx-auto opacity-30" />
                  <p className="text-sm font-semibold text-stone-300">No saved posts found</p>
                  <p className={`text-xs ${themeMutedText} max-w-sm mx-auto`}>
                    Create reusable template posts to quickly send announcements or incorporate into recurring schedules.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedPostsList.map((p: any) => (
                    <div key={p.id} className={`${themeInnerCardBg} border ${themeBorder} rounded-2xl p-4 space-y-3 flex flex-col justify-between`}>
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-sm truncate max-w-[200px]">{p.title}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-cyan-400 font-bold text-xs">{p.id}</span>
                              <span className="px-1.5 py-0.5 rounded bg-stone-800 text-[10px] text-stone-300 font-semibold uppercase">{p.contentType}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteSavedPost(p.id, p.title || p.id)}
                            className="text-stone-500 hover:text-rose-400 p-1"
                            title="Delete Saved Post"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {p.text && (
                          <p className={`text-xs ${themeMutedText} line-clamp-3 leading-relaxed bg-stone-900/40 p-2 rounded-xl border border-stone-800/60 font-sans`}>
                            {p.text}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 text-[10px] text-stone-400">
                          {p.buttons && Array.isArray(p.buttons) && p.buttons.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-mono font-medium">
                              {p.buttons.flat().length} Button(s)
                            </span>
                          )}
                          {p.protectContent && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">Protected</span>
                          )}
                          {p.pinAfterSend && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-medium">Pin</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-stone-800/80">
                        <button
                          onClick={() => handleCopyPostId(p.id)}
                          className={`flex-1 py-1.5 ${themeCardBg} hover:opacity-80 border ${themeBorder} text-cyan-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors`}
                          title="Copy Post ID"
                        >
                          {copiedPostId === p.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedPostId === p.id ? 'Copied ID!' : 'Copy ID'}
                        </button>
                        <button
                          onClick={() => handleDuplicateSavedPost(p.id)}
                          className={`px-3 py-1.5 ${themeCardBg} hover:opacity-80 border ${themeBorder} text-purple-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors`}
                          title="Duplicate Post"
                        >
                          <Layers className="w-3.5 h-3.5" /> Duplicate
                        </button>
                        <button
                          onClick={() => handleOpenEditSavedPost(p)}
                          className={`px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer`}
                          title="Edit Post"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Unified Content Reuse Modal for Schedules */}
        <ContentReuseModal
          isOpen={showCopyScheduleFromIdModal}
          onClose={() => setShowCopyScheduleFromIdModal(false)}
          targetContext="schedule"
          isEditingExistingSchedule={Boolean(editingSchedule)}
          currentScheduleId={editingSchedule?.id}
          fetchItem={fetchDashboardContentItem}
          onApply={handleApplyReusedContentToSchedule}
          theme={theme}
          title={editingSchedule ? `Reuse Content for Schedule #${editingSchedule.id}` : 'Reuse Existing Content for Schedule'}
        />

        {/* Create / Edit Saved Post Modal (Feature 1 - Comprehensive Post Authoring Studio) */}
        {(showCreatePostModal || showEditPostModal) && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`${themeCardBg} border rounded-2xl p-6 max-w-2xl w-full space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl`}>
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-5 h-5 text-blue-500" />
                  <h3 className="text-base font-bold text-white">
                    {showEditPostModal ? 'Edit Saved Post' : 'Create Saved Post'}
                  </h3>
                  {showEditPostModal && editingSavedPost && (
                    <div className="flex items-center gap-1.5 ml-2 px-2.5 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono text-xs">
                      <span>{editingSavedPost.id}</span>
                      <span className="text-[10px] text-cyan-400/80 font-sans font-medium">(Stable ID Preserved)</span>
                      <button
                        type="button"
                        onClick={() => handleCopyPostId(editingSavedPost.id)}
                        className="hover:text-white p-0.5"
                        title="Copy Post ID"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setShowCreatePostModal(false); setShowEditPostModal(false); }}
                  className="text-stone-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Load / Reuse Content by ID Header */}
              <div className="p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Reuse Existing Content by ID
                  </span>
                  <span className={`text-[10px] ${themeMutedText}`}>
                    Accepts POST-XXXXX, schedule ID, or {"{{post:ID}}"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={postLoadIdInput}
                    onChange={e => { setPostLoadIdInput(e.target.value); setPostLoadIdError(null); }}
                    placeholder="Paste ID or reference to populate editor (e.g. POST-12345)..."
                    className={`flex-1 p-2 rounded-xl text-xs ${themeInnerCardBg} border ${themeBorder} outline-none font-mono`}
                  />
                  <button
                    type="button"
                    onClick={handleLoadPostById}
                    disabled={postLoadLoading || !postLoadIdInput.trim()}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    {postLoadLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>Load Content</span>
                  </button>
                </div>
                {postLoadIdError && <p className="text-[11px] text-red-400">{postLoadIdError}</p>}
                {postLoadedMeta && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      <span className="font-semibold">Loaded from {postLoadedMeta.type.toUpperCase()}:</span>
                      <span className="font-mono bg-emerald-950 px-1.5 py-0.5 rounded text-[11px] font-bold text-white">
                        {postLoadedMeta.id}
                      </span>
                      <span className="truncate text-stone-300">({postLoadedMeta.title})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPostLoadedMeta(null)}
                      className="text-stone-400 hover:text-white p-0.5 shrink-0"
                      title="Dismiss indicator"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Editor Tabs: Edit vs Live Preview */}
              <div className="flex items-center justify-between border-b border-stone-800 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPostEditorTab('edit')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      postEditorTab === 'edit'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : `${themeMutedText} hover:text-white`
                    }`}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostEditorTab('preview')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      postEditorTab === 'preview'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : `${themeMutedText} hover:text-white`
                    }`}
                  >
                    <span>Live Preview</span>
                    {postFormButtons.flat().length > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-mono">
                        {postFormButtons.flat().length} btn
                      </span>
                    )}
                  </button>
                </div>

                {postEditorTab === 'edit' && (
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-stone-400">Buttons:</span>
                    <button
                      type="button"
                      onClick={() => handleSwitchPostButtonsMode('visual')}
                      className={`px-2 py-0.5 rounded-lg cursor-pointer ${postButtonsMode === 'visual' ? 'bg-blue-600 text-white font-bold' : 'text-stone-500 hover:text-stone-300'}`}
                    >
                      Visual
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchPostButtonsMode('json')}
                      className={`px-2 py-0.5 rounded-lg cursor-pointer ${postButtonsMode === 'json' ? 'bg-blue-600 text-white font-bold' : 'text-stone-500 hover:text-stone-300'}`}
                    >
                      JSON
                    </button>
                  </div>
                )}
              </div>

              {postEditorTab === 'edit' ? (
                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="text-stone-300 font-semibold block mb-1">Post Title / Name (Required)</label>
                    <input
                      type="text"
                      value={postForm.title}
                      onChange={e => setPostForm({ ...postForm, title: e.target.value })}
                      placeholder="e.g. Community Announcement & Rules"
                      className={`w-full p-2.5 rounded-xl text-xs ${themeInnerCardBg} border ${themeBorder} outline-none`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-stone-300 font-semibold block mb-1">Content Type</label>
                      <select
                        value={postForm.contentType}
                        onChange={e => setPostForm({ ...postForm, contentType: e.target.value })}
                        className={`w-full p-2.5 rounded-xl text-xs ${themeInnerCardBg} border ${themeBorder} outline-none`}
                      >
                        <option value="text">Text Only</option>
                        <option value="photo">Photo / Image URL</option>
                        <option value="video">Video URL</option>
                        <option value="animation">GIF / Animation URL</option>
                        <option value="document">Document / File URL</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-stone-300 font-semibold block mb-1">
                        Media URL / File ID {postForm.contentType !== 'text' ? '(Required)' : '(Optional)'}
                      </label>
                      <input
                        type="text"
                        value={postForm.mediaFileId}
                        onChange={e => setPostForm({ ...postForm, mediaFileId: e.target.value })}
                        placeholder="https://example.com/image.jpg or Telegram file_id"
                        className={`w-full p-2.5 rounded-xl text-xs ${themeInnerCardBg} border ${themeBorder} outline-none font-mono`}
                      />
                      {postForm.contentType !== 'text' && (
                        <p className={`text-[10px] mt-1 ${themeMutedText}`}>
                          Enter a public HTTP/HTTPS URL (e.g. image, GIF, video, doc) or an existing Telegram file_id.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-stone-300 font-semibold">Message Text / Caption (Mandatory)</label>
                      <span className={`text-[10px] font-mono ${postForm.text.length > (postForm.contentType === 'text' ? 4096 : 1024) ? 'text-red-400 font-bold' : themeMutedText}`}>
                        {postForm.text.length} / {postForm.contentType === 'text' ? 4096 : 1024} chars
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={postForm.text}
                      onChange={e => setPostForm({ ...postForm, text: e.target.value })}
                      placeholder="Enter post text with HTML formatting (<b>bold</b>, <i>italic</i>, <code>code</code>, <a href='...'>link</a>)..."
                      className={`w-full p-2.5 rounded-xl text-xs ${themeInnerCardBg} border ${themeBorder} outline-none resize-y`}
                    />
                  </div>

                  {/* Inline Buttons Builder */}
                  <div className="space-y-2 p-3 rounded-xl border border-stone-800 bg-stone-900/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-400" />
                        Inline URL Buttons Keyboard
                      </span>
                      {postButtonsMode === 'visual' && (
                        <button
                          type="button"
                          onClick={handleAddPostButtonRow}
                          className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3 text-blue-400" /> Add Button Row
                        </button>
                      )}
                    </div>

                    {postButtonsMode === 'visual' ? (
                      <div className="space-y-2 pt-1">
                        {postFormButtons.length === 0 ? (
                          <p className={`text-[11px] ${themeMutedText} italic py-2 text-center`}>
                            No buttons added. Click &quot;Add Button Row&quot; above to attach interactive URL buttons.
                          </p>
                        ) : (
                          postFormButtons.map((row, rIdx) => (
                            <div key={rIdx} className="p-2.5 rounded-xl border border-stone-800/80 bg-stone-950/40 space-y-2">
                              <div className="flex items-center justify-between text-[11px] text-stone-400">
                                <span className="font-semibold text-stone-300">Row {rIdx + 1} ({row.length} button{row.length !== 1 ? 's' : ''})</span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleAddPostButtonToRow(rIdx)}
                                    className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 font-semibold text-[10px]"
                                  >
                                    + Add Button
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePostButtonRow(rIdx)}
                                    className="p-1 text-stone-500 hover:text-red-400"
                                    title="Delete Row"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {row.map((btn, bIdx) => {
                                  const isInvalidUrl = Boolean(btn.url && !/^https?:\/\/.+/i.test(btn.url.trim()));
                                  return (
                                    <div key={bIdx} className="p-2.5 rounded-lg border border-stone-800 bg-stone-900/60 space-y-2 relative">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-stone-400 font-mono">Button #{bIdx + 1}</span>
                                        <button
                                          type="button"
                                          onClick={() => handleRemovePostButton(rIdx, bIdx)}
                                          className="text-stone-500 hover:text-red-400 p-0.5"
                                          title="Remove Button"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <input
                                        type="text"
                                        value={btn.text}
                                        onChange={e => handleUpdatePostButton(rIdx, bIdx, 'text', e.target.value)}
                                        placeholder="Label (e.g. Join Community)"
                                        className={`w-full p-1.5 rounded-md text-xs ${themeInnerCardBg} border ${themeBorder} outline-none`}
                                      />
                                      <input
                                        type="url"
                                        value={btn.url}
                                        onChange={e => handleUpdatePostButton(rIdx, bIdx, 'url', e.target.value)}
                                        placeholder="https://t.me/..."
                                        className={`w-full p-1.5 rounded-md text-[11px] font-mono ${themeInnerCardBg} border ${isInvalidUrl ? 'border-rose-500/60' : themeBorder} outline-none`}
                                      />
                                      {isInvalidUrl && (
                                        <span className="text-[10px] text-rose-400 block pl-0.5">
                                          URL must start with http:// or https://
                                        </span>
                                      )}
                                      <select
                                        value={btn.style || ''}
                                        onChange={e => handleUpdatePostButton(rIdx, bIdx, 'style', e.target.value)}
                                        className={`w-full p-1 rounded-md text-[11px] ${themeInnerCardBg} border ${themeBorder} outline-none text-stone-300 font-medium`}
                                      >
                                        <option value="">Default Style</option>
                                        <option value="primary">Primary 🔵</option>
                                        <option value="success">Success 🟢</option>
                                        <option value="danger">Danger 🔴</option>
                                      </select>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <textarea
                          rows={4}
                          value={postForm.buttonsJson}
                          onChange={e => {
                            setPostForm({ ...postForm, buttonsJson: e.target.value });
                            setPostButtonsJsonError(null);
                          }}
                          placeholder='[[{"text": "Visit Website", "url": "https://example.com", "style": "primary"}]]'
                          className={`w-full p-2.5 rounded-xl text-[11px] font-mono ${themeInnerCardBg} border ${postButtonsJsonError ? 'border-rose-500' : themeBorder} outline-none resize-y`}
                        />
                        {postButtonsJsonError && (
                          <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1 font-medium">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{postButtonsJsonError}</span>
                          </p>
                        )}
                        <p className={`text-[10px] ${themeMutedText}`}>
                          JSON format: Array of rows, where each row is an array of button objects: <code>[[&#123;&quot;text&quot;: &quot;...&quot;, &quot;url&quot;: &quot;https://...&quot;&#125;]]</code>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={postForm.pinAfterSend}
                        onChange={e => setPostForm({ ...postForm, pinAfterSend: e.target.checked })}
                        className="w-4 h-4 accent-blue-500 rounded"
                      />
                      <span className="text-stone-300">Pin after sending</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={postForm.protectContent}
                        onChange={e => setPostForm({ ...postForm, protectContent: e.target.checked })}
                        className="w-4 h-4 accent-blue-500 rounded"
                      />
                      <span className="text-stone-300">Protect content (anti-forward)</span>
                    </label>
                  </div>
                </div>
              ) : (
                /* LIVE PREVIEW TAB */
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-stone-900/90 border border-stone-800 space-y-3 max-w-md mx-auto shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-stone-800/80">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                          R
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">Roxie Bot</p>
                          <p className="text-[10px] text-stone-400">{postForm.contentType.toUpperCase()}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-mono text-[10px]">
                        Preview
                      </span>
                    </div>

                    {/* Media Preview */}
                    {postForm.contentType !== 'text' && postForm.mediaFileId && (
                      <div className="rounded-xl overflow-hidden border border-stone-800 bg-black/40">
                        {postForm.contentType === 'video' ? (
                          <video src={postForm.mediaFileId} className="w-full max-h-56 object-cover" controls />
                        ) : postForm.contentType === 'document' ? (
                          <div className="p-4 flex items-center gap-3 text-stone-300">
                            <FileText className="w-8 h-8 text-blue-400 shrink-0" />
                            <div className="truncate">
                              <p className="font-semibold text-xs truncate">{postForm.mediaFileId.split('/').pop() || 'document.pdf'}</p>
                              <p className="text-[10px] text-stone-500">Document Attachment</p>
                            </div>
                          </div>
                        ) : (
                          <img
                            src={postForm.mediaFileId}
                            alt="Preview"
                            className="w-full max-h-56 object-cover"
                            onError={(e) => {
                              (e.target as any).style.display = 'none';
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Text / Caption */}
                    <div className="text-xs text-stone-200 whitespace-pre-wrap leading-relaxed font-sans">
                      {postForm.text ? postForm.text : <span className="italic text-stone-500">No caption entered yet.</span>}
                    </div>

                    {/* Inline Buttons Grid Preview */}
                    {postFormButtons.length > 0 && (
                      <div className="space-y-1.5 pt-2">
                        {postFormButtons.map((row, rIdx) => (
                          <div key={rIdx} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}>
                            {row.map((btn, bIdx) => {
                              let styleClass = 'bg-blue-600/15 border-blue-500/30 text-blue-300';
                              if (btn.style === 'primary') {
                                styleClass = 'bg-blue-600/40 border-blue-500/60 text-blue-100 font-bold';
                              } else if (btn.style === 'success') {
                                styleClass = 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200 font-bold';
                              } else if (btn.style === 'danger') {
                                styleClass = 'bg-red-600/30 border-red-500/50 text-red-200 font-bold';
                              }
                              return (
                                <a
                                  key={bIdx}
                                  href={btn.url || '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={e => e.preventDefault()}
                                  className={`px-3 py-2 rounded-xl border ${styleClass} text-[11px] text-center truncate flex items-center justify-center gap-1 transition-colors`}
                                >
                                  <span>{btn.text || `Button ${bIdx + 1}`}</span>
                                  <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                                </a>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Metadata tags */}
                    <div className="flex items-center gap-2 pt-2 border-t border-stone-800 text-[10px] text-stone-400">
                      {postForm.pinAfterSend && <span className="text-cyan-400 flex items-center gap-1"><Pin className="w-3 h-3" /> Pin</span>}
                      {postForm.protectContent && <span className="text-amber-400 flex items-center gap-1"><Shield className="w-3 h-3" /> Protected</span>}
                      <span className="ml-auto font-mono">{postForm.title || 'Untitled Post'}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => { setShowCreatePostModal(false); setShowEditPostModal(false); }}
                  className="px-4 py-2 bg-stone-800 text-stone-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={showEditPostModal ? handleUpdateSavedPostSubmit : handleCreateSavedPostSubmit}
                  disabled={!postForm.title.trim()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  {showEditPostModal ? 'Save Changes' : 'Create Saved Post'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Desktop Sticker Copy Modal (Feature 3) */}
        {showDesktopStickerCopyModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`${themeCardBg} border rounded-2xl p-6 max-w-lg w-full space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl`}>
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <div className="flex items-center gap-2">
                  <Copy className="w-5 h-5 text-blue-500" />
                  <h3 className="text-base font-bold text-white">Copy Sticker Packs Between Groups</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDesktopStickerCopyModal(false)}
                  className="text-stone-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-stone-300 font-semibold block mb-1">Source Group</label>
                    <select
                      value={desktopCopySourceGroupId}
                      onChange={e => {
                        setDesktopCopySourceGroupId(e.target.value);
                        setDesktopCopySelectedPacks([]);
                        setDesktopCopyResults(null);
                      }}
                      className={`w-full p-2.5 rounded-xl text-xs ${themeInnerCardBg} border ${themeBorder} outline-none`}
                    >
                      {groups.filter(g => !g.botLeft).map(g => (
                        <option key={g.chatId} value={g.chatId}>{g.chatTitle} ({g.chatId})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-stone-300 font-semibold block mb-1">Destination Group</label>
                    <select
                      value={desktopCopyDestGroupId}
                      onChange={e => {
                        setDesktopCopyDestGroupId(e.target.value);
                        setDesktopCopyResults(null);
                      }}
                      className={`w-full p-2.5 rounded-xl text-xs ${themeInnerCardBg} border ${themeBorder} outline-none`}
                    >
                      {groups.filter(g => !g.botLeft && String(g.chatId) !== desktopCopySourceGroupId).map(g => (
                        <option key={g.chatId} value={g.chatId}>{g.chatTitle} ({g.chatId})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Pack list */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-stone-300 font-semibold">Configured Sticker Packs in Source</label>
                    {(() => {
                      const srcGroup = groups.find(g => String(g.chatId) === desktopCopySourceGroupId);
                      const packs = srcGroup?.settings?.stickerPacks ? Object.values(srcGroup.settings.stickerPacks) : [];
                      if (packs.length === 0) return null;
                      const allSelected = desktopCopySelectedPacks.length === packs.length;
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (allSelected) {
                              setDesktopCopySelectedPacks([]);
                            } else {
                              setDesktopCopySelectedPacks(packs.map((p: any) => p.name));
                            }
                          }}
                          className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                        >
                          {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      );
                    })()}
                  </div>

                  <div className={`space-y-1.5 max-h-48 overflow-y-auto p-1 rounded-xl ${themeInnerCardBg} border ${themeBorder}`}>
                    {(() => {
                      const srcGroup = groups.find(g => String(g.chatId) === desktopCopySourceGroupId);
                      const packs = srcGroup?.settings?.stickerPacks ? Object.values(srcGroup.settings.stickerPacks) : [];
                      if (packs.length === 0) {
                        return <p className="text-stone-500 py-3 text-center">No packs configured in source group.</p>;
                      }
                      return packs.map((p: any) => {
                        const isChecked = desktopCopySelectedPacks.includes(p.name);
                        return (
                          <label
                            key={p.name}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-stone-800/30 transition-colors`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setDesktopCopySelectedPacks(desktopCopySelectedPacks.filter(n => n !== p.name));
                                  } else {
                                    setDesktopCopySelectedPacks([...desktopCopySelectedPacks, p.name]);
                                  }
                                }}
                                className="w-4 h-4 accent-blue-500 rounded"
                              />
                              <div>
                                <div className="font-semibold text-white">{p.title || p.name}</div>
                                <div className="text-[10px] text-stone-500 font-mono">{p.name}</div>
                              </div>
                            </div>
                            <span className="text-[10px] text-stone-400 font-mono">{p.stickers?.length || 0} stickers</span>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Results display */}
                {desktopCopyResults && (
                  <div className={`p-3 rounded-xl ${themeInnerCardBg} border ${themeBorder} space-y-2`}>
                    <div className="font-bold text-white text-xs">Copy Results:</div>
                    <div className="space-y-1">
                      {desktopCopyResults.map((r, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="font-mono text-stone-300">{r.packName}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.status === 'copied' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            r.status === 'already_exists' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                            'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}>
                            {r.status === 'copied' ? 'Copied' : r.status === 'already_exists' ? 'Already Configured' : 'Failed'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowDesktopStickerCopyModal(false)}
                  className="px-4 py-2 bg-stone-800 text-stone-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleExecuteDesktopStickerCopy}
                  disabled={desktopCopying || desktopCopySelectedPacks.length === 0}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
                >
                  {desktopCopying ? 'Copying...' : `Copy Selected (${desktopCopySelectedPacks.length})`}
                </button>
              </div>
            </div>
          </div>
        )}
        </main>

        {/* Mobile Bottom Navigation Bar (1-Tap Tab Switching) */}
        <nav className={`lg:hidden fixed bottom-0 left-0 right-0 z-30 ${themeHeaderBg} border-t ${themeBorder} px-3 py-1.5 flex items-center justify-around backdrop-blur-lg shadow-lg`}>
          {[
            { id: 'groups', label: 'Groups', icon: Users, badge: groups.length },
            { id: 'private-chats', label: 'Private Chats', icon: MessageSquare, badge: privateChats.length },
            { id: 'broadcast', label: 'Broadcast', icon: Radio },
            { id: 'post-library', label: 'Posts', icon: Bookmark },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavSelect(item.id)}
                className={`flex-1 flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all min-h-[48px] relative ${
                  isActive
                    ? 'text-blue-500 font-bold bg-blue-500/10'
                    : `${themeMutedText} hover:text-stone-200 font-medium`
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-500' : ''}`} />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 -right-3 text-[9px] min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center font-mono">
                      {item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] mt-0.5 leading-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Add Sticker Pack Modal */}
      {showAddPackModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-500" /> Add Telegram Sticker Pack
              </h3>
              <button onClick={() => setShowAddPackModal(false)} className="text-stone-400 hover:opacity-80">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className={`text-xs ${themeMutedText}`}>
              Enter an existing Telegram sticker pack name or link (e.g. <code>https://t.me/addstickers/MyPack</code> or <code>MyPack</code>).
              Roxie will resolve the pack directly from Telegram without re-hosting.
            </p>

            {addPackError && (
              <div className="p-3 rounded-xl text-xs bg-red-500/10 border border-red-500/20 text-red-500">
                {addPackError}
              </div>
            )}

            <form onSubmit={handleAddStickerPack} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold block">Sticker Pack Name or URL</label>
                <input
                  type="text"
                  placeholder="https://t.me/addstickers/... or pack_name"
                  value={newPackInput}
                  onChange={(e) => setNewPackInput(e.target.value)}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddPackModal(false)}
                  className={`px-3 py-1.5 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingPack || !newPackInput.trim()}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {addingPack ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {addingPack ? 'Resolving...' : 'Add Pack'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Sticker Pack Modal */}
      {previewPack && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden`}>
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Smile className="w-4 h-4 text-amber-500" /> {previewPack.title || previewPack.name}
                </h3>
                <span className={`text-[11px] font-mono ${themeMutedText}`}>
                  {previewPack.name} • {previewPack.stickerCount || previewPack.stickers?.length || 0} Stickers • {previewPack.enabled !== false ? '🟢 Active' : '🔴 Disabled'}
                </span>
              </div>
              <button onClick={() => setPreviewPack(null)} className="text-stone-400 hover:opacity-80">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {(previewPack.stickers || []).map((st: any, sIdx: number) => (
                  <div key={sIdx} className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-2 flex flex-col items-center justify-center text-center space-y-1`}>
                    <span className="text-2xl">{st.emoji || '🎨'}</span>
                    <span className={`text-[9px] font-mono ${themeMutedText} truncate w-full`} title={st.fileId}>
                      {st.fileId ? st.fileId.slice(0, 8) : `ID #${sIdx+1}`}
                    </span>
                  </div>
                ))}
                {(!previewPack.stickers || previewPack.stickers.length === 0) && (
                  <p className={`text-xs ${themeMutedText} col-span-4 text-center py-8`}>Sticker metadata resolved on demand.</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t shrink-0 text-xs">
              <span className={themeMutedText}>Configured for Group {activeGroupDetailId}</span>
              <button
                onClick={() => setPreviewPack(null)}
                className={`px-4 py-1.5 ${themeInnerCardBg} border ${themeBorder} rounded-xl font-semibold`}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Sticker Pack Confirmation Modal */}
      {removePackModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center gap-3 text-red-500">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Remove Sticker Pack?</h3>
            </div>

            <p className="text-xs leading-relaxed">
              This will remove <strong>"{removePackModal.title || removePackModal.name}"</strong> from Roxie's allowed sticker collection for this group.
            </p>
            <p className={`text-[11px] ${themeMutedText}`}>
              <em>Note:</em> This only removes the pack from Roxie's local group configuration. It does <strong>not</strong> delete the pack from Telegram.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRemovePackModal(null)}
                className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveStickerPack}
                disabled={removingPack}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                {removingPack ? 'Removing...' : 'Remove Pack'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Group Confirmation Modal */}
      {leaveModalGroup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center gap-3 text-red-500">
              <LogOut className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Leave Telegram Group?</h3>
            </div>

            <p className="text-xs leading-relaxed">
              Are you sure you want Roxie to leave <strong>"{leaveModalGroup.chatTitle}"</strong> (Chat ID: {leaveModalGroup.chatId})?
              Roxie will authoritatively verify the group and membership via Telegram before departing. All automated moderation, AI conversation, and protections will cease immediately for this group.
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-stone-400 block">
                To confirm, type <strong className="text-red-500">LEAVE</strong> below:
              </label>
              <input
                type="text"
                value={leaveConfirmInput}
                onChange={(e) => setLeaveConfirmInput(e.target.value)}
                placeholder="Type LEAVE to confirm"
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-red-500`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setLeaveModalGroup(null)}
                className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                onClick={handleLeaveGroup}
                disabled={leaveConfirmInput !== 'LEAVE' || leavingGroup}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                {leavingGroup ? 'Leaving...' : 'Confirm & Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove from Dashboard Confirmation Modal */}
      {removeDashboardModalGroup && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border border-rose-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Remove from Dashboard?</h3>
            </div>

            <p className="text-xs leading-relaxed">
              Remove <strong>"{removeDashboardModalGroup.chatTitle}"</strong> (Chat ID: {removeDashboardModalGroup.chatId}) from the dashboard?
            </p>
            <p className={`text-[11px] ${themeMutedText}`}>
              Roxie will remain a member of the Telegram group. Only this bot's dashboard record will be removed.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRemoveDashboardModalGroup(null)}
                className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveFromDashboard}
                disabled={removingFromDashboard}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors flex items-center gap-1.5"
              >
                {removingFromDashboard ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove from Dashboard</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Action Modal */}
      {dangerModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border border-red-500/30 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">
                {dangerModal === 'reset_settings' && 'Reset Group Settings?'}
                {dangerModal === 'clear_memory' && 'Clear Group Memory?'}
                {dangerModal === 'clear_stickers' && 'Remove Custom Stickers?'}
                {dangerModal === 'clear_abuse' && 'Clear All Abuse Words?'}
              </h3>
            </div>

            <p className="text-xs leading-relaxed">
              This action is permanent and cannot be undone.
              {dangerModal === 'reset_settings' && ' All custom policies, auto-response frequencies, and rules will be reset to defaults.'}
              {dangerModal === 'clear_memory' && ' All user context and conversation history stored for this group will be wiped.'}
              {dangerModal === 'clear_stickers' && ' All sticker pack configurations for this group will be erased.'}
              {dangerModal === 'clear_abuse' && ' All custom abuse words configured for this group will be deleted.'}
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-stone-400 block">
                To confirm, type <strong className="text-red-500">CONFIRM</strong> below:
              </label>
              <input
                type="text"
                value={dangerConfirmInput}
                onChange={(e) => setDangerConfirmInput(e.target.value)}
                placeholder="Type CONFIRM to proceed"
                className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-red-500`}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => { setDangerModal(null); setDangerConfirmInput(''); }}
                className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDangerAction}
                disabled={dangerConfirmInput !== 'CONFIRM' || executingDangerAction}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors"
              >
                {executingDangerAction ? 'Executing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Import Diff Preview Modal */}
      {backupDiffPreview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border ${themeBorder} rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[85vh] flex flex-col`}>
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold">🔍 Configuration Changes Preview</h3>
              </div>
              <button
                onClick={() => setBackupDiffPreview(null)}
                className={`p-1 rounded-lg ${themeInnerCardBg} ${themeMutedText} hover:opacity-100`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Group check */}
            {!backupDiffPreview.matchedChatId && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-400 space-y-1">
                <span className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Group ID Mismatch Detected
                </span>
                <p>
                  Backup belongs to Group <strong>{backupDiffPreview.configChatId}</strong> but you are applying it to Group <strong>{backupDiffPreview.currentChatId}</strong>. Override confirmation is active.
                </p>
              </div>
            )}

            <div className="overflow-y-auto space-y-4 pr-1 flex-1 text-xs">
              {/* Modified Section */}
              {backupDiffPreview.modified?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Modified Parameters ({backupDiffPreview.modified.length})
                  </h4>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl divide-y divide-stone-800`}>
                    {backupDiffPreview.modified.map((m: any, idx: number) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between font-mono text-[11px]">
                        <span className="font-semibold text-stone-200">{m.field}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-red-400 line-through opacity-80">{String(m.oldValue)}</span>
                          <span className="text-stone-500">→</span>
                          <span className="text-emerald-400 font-bold">{String(m.newValue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Added Section */}
              {backupDiffPreview.added?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-emerald-400 text-xs flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Added Items ({backupDiffPreview.added.length})
                  </h4>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-2.5 space-y-1 font-mono text-[11px]`}>
                    {backupDiffPreview.added.map((a: any, idx: number) => (
                      <div key={idx} className="text-emerald-400 flex items-center gap-2">
                        <span>+ {a.field}:</span>
                        <span className="text-stone-300">{String(a.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Removed Section */}
              {backupDiffPreview.removed?.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-red-400 text-xs flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" /> Removed Items ({backupDiffPreview.removed.length})
                  </h4>
                  <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-2.5 space-y-1 font-mono text-[11px]`}>
                    {backupDiffPreview.removed.map((r: any, idx: number) => (
                      <div key={idx} className="text-red-400 flex items-center gap-2">
                        <span>- {r.field}:</span>
                        <span className="text-stone-400 line-through">{String(r.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unchanged summary */}
              {backupDiffPreview.unchanged?.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className={`text-[11px] ${themeMutedText}`}>
                    • {backupDiffPreview.unchanged.length} parameters unchanged.
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-stone-800">
              <span className={`text-[11px] ${themeMutedText}`}>
                A safety snapshot will be created automatically before applying.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBackupDiffPreview(null)}
                  className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const payload = backupImportJson.trim() || backupEditorJson.trim();
                    handleApplyImport(payload);
                  }}
                  disabled={backupLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Apply Changes Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Details Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className={`w-full max-w-md ${themeCardBg} border-l ${themeBorder} p-6 space-y-6 overflow-y-auto`}>
            <div className="flex items-center justify-between border-b pb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" /> Event Details
              </h3>
              <button onClick={() => setSelectedEvent(null)} className={`p-1 ${themeInnerCardBg} rounded-lg ${themeMutedText}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <span className={`${themeMutedText} block`}>Event ID:</span>
                <span className="font-semibold">{selectedEvent.id}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Action:</span>
                <span className="text-blue-500 font-bold">{selectedEvent.action}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Chat ID / Group:</span>
                <span>{selectedEvent.chatTitle || selectedEvent.chatId}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Actor:</span>
                <span>@{selectedEvent.adminUsername || selectedEvent.adminUserId || 'system'}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Target:</span>
                <span>@{selectedEvent.targetUsername || selectedEvent.targetUserId || '-'}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Reason / Details:</span>
                <span>{selectedEvent.reason || selectedEvent.details || 'None'}</span>
              </div>
              <div>
                <span className={`${themeMutedText} block`}>Timestamp:</span>
                <span>{new Date(selectedEvent.timestamp).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Schedule Modal */}
      {showCreateScheduleModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500" />
                  {editingSchedule ? 'Edit Scheduled Message' : 'Create Scheduled Message'}
                </h3>
                {editingSchedule && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono text-xs font-bold">
                    <span>#{editingSchedule.id}</span>
                    <span className="text-[10px] text-cyan-400/80 font-sans font-normal">(Preserved ID)</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setShowCreateScheduleModal(false);
                  setEditingSchedule(null);
                  setScheduleFormError(null);
                  setSchedReuseIdInput('');
                  setSchedReuseError(null);
                  setSchedLoadedMeta(null);
                }}
                className={`p-1.5 rounded-lg ${themeInnerCardBg} border ${themeBorder} text-stone-400 hover:text-white`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Banner in modal */}
            {scheduleFormError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1 font-medium">{scheduleFormError}</span>
              </div>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleSaveSchedule(); }} className="space-y-4 text-xs">
              {/* Target Group */}
              <div className="space-y-1.5">
                <label className="font-semibold block">Target Group</label>
                <select
                  value={newScheduleForm.chatId}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, chatId: Number(e.target.value) })}
                  disabled={Boolean(editingSchedule)}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-500`}
                >
                  <option value="">Select a group...</option>
                  {editingSchedule && !groups.some(g => String(g.chatId) === String(editingSchedule.chatId)) && (
                    <option value={editingSchedule.chatId}>
                      {editingSchedule.chatTitle || `Group ${editingSchedule.chatId}`} (ID: {editingSchedule.chatId})
                    </option>
                  )}
                  {groups.map(g => (
                    <option key={g.chatId} value={g.chatId}>
                      {g.chatTitle} (ID: {g.chatId})
                    </option>
                  ))}
                </select>
              </div>

              {/* Schedule Title */}
              <div className="space-y-1.5">
                <label className="font-semibold block">Schedule Name / Label</label>
                <input
                  type="text"
                  placeholder="e.g., Daily Morning Greeting, Hourly Reminder"
                  value={newScheduleForm.name}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, name: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500`}
                />
              </div>

              {/* Trigger Keyword / Phrase */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold block">Trigger Keyword / Phrase (Optional)</label>
                  <span className={`text-[10px] ${themeMutedText}`}>Dispatches post immediately on group match</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g., hii, good morning, rules, help me (comma-separated, leave blank for time-only)"
                  value={newScheduleForm.triggerKeyword}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, triggerKeyword: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-blue-500`}
                />
                <p className={`text-[10px] ${themeMutedText}`}>
                  Case-insensitive whole-word or phrase matching. Supports multiple triggers separated by commas (e.g. "hii, good morning, rules, help me"). When someone sends any matching phrase in the group, Roxie broadcasts this post immediately.
                </p>
              </div>

              {/* Load Content by ID / Reuse Existing Content Workflow */}
              <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Load Content by ID / Reuse Content
                  </span>
                  <span className={`text-[10px] ${themeMutedText}`}>
                    Accepts POST-XXXXX, schedule ID, or template ID
                  </span>
                </div>

                {/* Explicit Option: Snapshot vs Dynamic Reference */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-stone-900/50 p-2.5 rounded-xl border border-stone-800">
                  <label className="flex items-start gap-2 cursor-pointer p-1 rounded-lg hover:bg-stone-800/40">
                    <input
                      type="radio"
                      name="schedReuseModeChoice"
                      value="snapshot"
                      checked={schedReuseMode === 'snapshot'}
                      onChange={() => setSchedReuseMode('snapshot')}
                      className="accent-blue-500 mt-0.5"
                    />
                    <div>
                      <span className={`block font-semibold ${schedReuseMode === 'snapshot' ? 'text-white' : 'text-stone-300'}`}>
                        Copy content snapshot
                      </span>
                      <span className="text-[10px] text-stone-400 leading-tight block">
                        Copies text, media &amp; buttons directly. Independent of future library changes.
                      </span>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer p-1 rounded-lg hover:bg-stone-800/40">
                    <input
                      type="radio"
                      name="schedReuseModeChoice"
                      value="reference"
                      checked={schedReuseMode === 'reference'}
                      onChange={() => setSchedReuseMode('reference')}
                      className="accent-blue-500 mt-0.5"
                    />
                    <div>
                      <span className={`block font-semibold ${schedReuseMode === 'reference' ? 'text-cyan-300' : 'text-stone-300'}`}>
                        Retain dynamic reference
                      </span>
                      <span className="text-[10px] text-stone-400 leading-tight block">
                        Uses &#123;&#123;post:ID&#125;&#125; syntax. Dispatches latest library updates automatically.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Input and Action */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={schedReuseIdInput}
                    onChange={e => { setSchedReuseIdInput(e.target.value); setSchedReuseError(null); }}
                    placeholder="Enter POST-XXXXX, schedule ID (e.g. UNE4AT), or {{post:...}}..."
                    className={`flex-1 p-2 rounded-xl text-xs ${themeInnerCardBg} border ${themeBorder} outline-none font-mono`}
                  />
                  <button
                    type="button"
                    onClick={handleLoadScheduleContentById}
                    disabled={schedReuseLoading || !schedReuseIdInput.trim()}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    {schedReuseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Load Content</span>
                  </button>
                </div>

                {schedReuseError && (
                  <p className="text-[11px] text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{schedReuseError}</span>
                  </p>
                )}

                {/* Confirmation badge when loaded */}
                {schedLoadedMeta && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      <span className="font-semibold">Loaded from {schedLoadedMeta.type.toUpperCase()}:</span>
                      <span className="font-mono bg-emerald-950 px-1.5 py-0.5 rounded text-[11px] font-bold text-white">
                        {schedLoadedMeta.id}
                      </span>
                      <span className="truncate text-stone-300">({schedLoadedMeta.title})</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300">
                        {schedLoadedMeta.mode === 'reference' ? 'Dynamic Reference' : 'Content Snapshot'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSchedLoadedMeta(null)}
                      className="text-stone-400 hover:text-white p-0.5 shrink-0"
                      title="Dismiss indicator"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Message Content */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold block">Message Content (HTML supported)</label>
                  <ContentReuseButton
                    onClick={() => setShowCopyScheduleFromIdModal(true)}
                    label="Browse Library / All Content"
                  />
                </div>
                <textarea
                  rows={4}
                  required
                  placeholder="Enter message text to broadcast or {{post:POST-XXXXX}} reference..."
                  value={newScheduleForm.message}
                  onChange={(e) => setNewScheduleForm({ ...newScheduleForm, message: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl p-3 text-xs focus:outline-none focus:border-blue-500 font-sans`}
                />
              </div>

              {/* Schedule Type & Frequency */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold block">Schedule Type</label>
                  <select
                    value={newScheduleForm.scheduleType}
                    onChange={(e: any) => setNewScheduleForm({ ...newScheduleForm, scheduleType: e.target.value })}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                  >
                    <option value="interval">Recurring Interval (e.g. 1h, 30m)</option>
                    <option value="one_time">One-Time Execution</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                {newScheduleForm.scheduleType === 'interval' ? (
                  <div className="space-y-1.5">
                    <label className="font-semibold block">Interval Format</label>
                    <input
                      type="text"
                      placeholder="e.g. 30m, 1h, 2h, 1d"
                      value={newScheduleForm.intervalStr}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, intervalStr: e.target.value })}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="font-semibold block">Timezone</label>
                    <select
                      value={newScheduleForm.timezone}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, timezone: e.target.value })}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                    >
                      <option value="UTC">UTC</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Date & Time if One-Time / Daily */}
              {newScheduleForm.scheduleType !== 'interval' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold block">Execution Date</label>
                    <input
                      type="date"
                      value={newScheduleForm.nextRunDate}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, nextRunDate: e.target.value })}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold block">Execution Time</label>
                    <input
                      type="time"
                      value={newScheduleForm.nextRunTime}
                      onChange={(e) => setNewScheduleForm({ ...newScheduleForm, nextRunTime: e.target.value })}
                      className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                    />
                  </div>
                </div>
              )}

              {/* Content Type & Media */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold block">Content Type</label>
                  <select
                    value={newScheduleForm.contentType}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, contentType: e.target.value })}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                  >
                    <option value="text">Text Only</option>
                    <option value="photo">Photo / Image</option>
                    <option value="sticker">Sticker</option>
                    <option value="animation">GIF / Animation</option>
                    <option value="video">Video</option>
                    <option value="document">Document</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold block">Reply To Message ID (optional)</label>
                  <input
                    type="number"
                    placeholder="e.g. 1234"
                    value={newScheduleForm.replyToMessageId}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, replyToMessageId: e.target.value })}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                  />
                </div>
              </div>

              {newScheduleForm.contentType !== 'text' && (
                <div className="space-y-1.5">
                  <label className="font-semibold block">Media File ID / URL</label>
                  <input
                    type="text"
                    placeholder="Telegram file_id or public media URL"
                    value={newScheduleForm.mediaFileId}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, mediaFileId: e.target.value })}
                    className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                  />
                </div>
              )}

              {/* Inline Link Buttons (URL Buttons) */}
              <div className="space-y-2 pt-1 border-t border-stone-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-semibold block text-xs flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-blue-400" /> Inline Link Buttons (URL Buttons)
                    </label>
                    <span className={`text-[10px] ${themeMutedText}`}>Add clickable URL buttons arranged in customizable rows below the post.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewScheduleForm({
                        ...newScheduleForm,
                        inlineKeyboard: [...newScheduleForm.inlineKeyboard, [{ text: '', url: '' }]]
                      });
                    }}
                    className="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Row
                  </button>
                </div>

                {newScheduleForm.inlineKeyboard.length > 0 && (
                  <div className="space-y-3 pt-1">
                    {newScheduleForm.inlineKeyboard.map((row, rIdx) => (
                      <div key={rIdx} className={`p-3 rounded-xl ${themeInnerCardBg} border ${themeBorder} space-y-2`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[11px] text-stone-400">Row {rIdx + 1} ({row.length} button{row.length > 1 ? 's' : ''})</span>
                          <div className="flex items-center gap-1.5">
                            {row.length < 8 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...newScheduleForm.inlineKeyboard];
                                  updated[rIdx] = [...updated[rIdx], { text: '', url: '' }];
                                  setNewScheduleForm({ ...newScheduleForm, inlineKeyboard: updated });
                                }}
                                className="px-2 py-0.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded text-[10px] font-semibold flex items-center gap-1"
                              >
                                <Plus className="w-2.5 h-2.5" /> Button
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const updated = newScheduleForm.inlineKeyboard.filter((_, idx) => idx !== rIdx);
                                setNewScheduleForm({ ...newScheduleForm, inlineKeyboard: updated });
                              }}
                              className="p-1 hover:bg-rose-500/20 text-stone-400 hover:text-rose-400 rounded transition-colors"
                              title="Delete Row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {row.map((btn, bIdx) => {
                            const isInvalidUrl = Boolean(btn.url && !/^https?:\/\/.+/i.test(btn.url.trim()));
                            return (
                              <div key={bIdx} className="space-y-1">
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                  <input
                                    type="text"
                                    placeholder="Button label (e.g. Website)"
                                    value={btn.text}
                                    onChange={(e) => {
                                      const updated = [...newScheduleForm.inlineKeyboard];
                                      updated[rIdx][bIdx] = { ...updated[rIdx][bIdx], text: e.target.value };
                                      setNewScheduleForm({ ...newScheduleForm, inlineKeyboard: updated });
                                    }}
                                    className={`sm:w-1/3 ${themeCardBg} border ${themeBorder} rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500`}
                                  />
                                  <input
                                    type="url"
                                    placeholder="https://example.com"
                                    value={btn.url}
                                    onChange={(e) => {
                                      const updated = [...newScheduleForm.inlineKeyboard];
                                      updated[rIdx][bIdx] = { ...updated[rIdx][bIdx], url: e.target.value };
                                      setNewScheduleForm({ ...newScheduleForm, inlineKeyboard: updated });
                                    }}
                                    className={`flex-1 ${themeCardBg} border ${isInvalidUrl ? 'border-rose-500/50' : themeBorder} rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500`}
                                  />
                                  <select
                                    value={btn.style || ''}
                                    onChange={(e) => {
                                      const updated = [...newScheduleForm.inlineKeyboard];
                                      const val = e.target.value as 'primary' | 'success' | 'danger' | '';
                                      updated[rIdx][bIdx] = {
                                        ...updated[rIdx][bIdx],
                                        style: val ? val : undefined
                                      };
                                      setNewScheduleForm({ ...newScheduleForm, inlineKeyboard: updated });
                                    }}
                                    className={`sm:w-28 ${themeCardBg} border ${themeBorder} rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 font-medium`}
                                    title="Telegram Button Style"
                                  >
                                    <option value="">Default</option>
                                    <option value="primary">Primary 🔵</option>
                                    <option value="success">Success 🟢</option>
                                    <option value="danger">Danger 🔴</option>
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...newScheduleForm.inlineKeyboard];
                                      updated[rIdx] = updated[rIdx].filter((_, idx) => idx !== bIdx);
                                      const cleaned = updated.filter(r => r.length > 0);
                                      setNewScheduleForm({ ...newScheduleForm, inlineKeyboard: cleaned });
                                    }}
                                    className="p-1.5 text-stone-500 hover:text-rose-400 transition-colors"
                                    title="Remove Button"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                                {isInvalidUrl && (
                                  <span className="text-[10px] text-rose-400 block pl-1">
                                    URL must start with http:// or https://
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Button Grid Live Preview */}
                    {newScheduleForm.inlineKeyboard.some(r => r.some(b => b.text.trim())) && (
                      <div className="p-3 bg-stone-900/60 rounded-xl border border-dashed border-stone-700 space-y-1.5">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-stone-400 block">Button Layout Preview:</span>
                        <div className="space-y-1.5">
                          {newScheduleForm.inlineKeyboard.map((row, rIdx) => (
                            <div key={rIdx} className="flex gap-1.5">
                              {row.filter(b => b.text.trim()).map((b, bIdx) => {
                                let styleClass = 'bg-blue-600/20 border-blue-500/30 text-blue-300';
                                if (b.style === 'primary') {
                                  styleClass = 'bg-blue-600/40 border-blue-500/60 text-blue-200';
                                } else if (b.style === 'success') {
                                  styleClass = 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300';
                                } else if (b.style === 'danger') {
                                  styleClass = 'bg-red-600/30 border-red-500/50 text-red-300';
                                }
                                return (
                                  <div key={bIdx} className={`flex-1 py-1.5 px-2.5 border rounded-lg text-center font-semibold text-[11px] truncate flex items-center justify-center gap-1 ${styleClass}`}>
                                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                    <span className="truncate">{b.text}</span>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Delivery & Behavior Toggles */}
              <div className="space-y-2 pt-2 border-t border-stone-800">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newScheduleForm.pinAfterSend}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, pinAfterSend: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="flex items-center gap-1.5">
                    <Pin className="w-3.5 h-3.5 text-purple-400" /> Pin message in group after successful delivery
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newScheduleForm.replyToLatest}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, replyToLatest: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="flex items-center gap-1.5">
                    <Reply className="w-3.5 h-3.5 text-amber-400" /> Reply to latest message in chat (replyOn)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newScheduleForm.autoDeletePrevious}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, autoDeletePrevious: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="flex items-center gap-1.5">
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Auto-delete previous scheduled message on new trigger (delOn)
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newScheduleForm.enabled}
                    onChange={(e) => setNewScheduleForm({ ...newScheduleForm, enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span>Enable Schedule Immediately</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateScheduleModal(false);
                    setEditingSchedule(null);
                    setScheduleFormError(null);
                    setSchedReuseIdInput('');
                    setSchedReuseError(null);
                    setSchedLoadedMeta(null);
                  }}
                  className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={schedulesLoading || !newScheduleForm.chatId || (!newScheduleForm.message.trim() && !newScheduleForm.mediaFileId?.trim())}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {schedulesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {editingSchedule ? 'Save Changes' : 'Create Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy Schedule Code Modal */}
      {copyScheduleModal?.isOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border ${themeBorder} rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl`}>
            <div className={`flex items-center justify-between border-b ${themeBorder} pb-3`}>
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Copy className="w-5 h-5 text-cyan-500" /> Copy Schedule Code
                </h3>
                <p className={`text-xs ${themeMutedText}`}>
                  {copyScheduleModal.schedule.name || copyScheduleModal.schedule.id}
                </p>
              </div>
              <button
                onClick={() => setCopyScheduleModal(null)}
                className={`p-1 rounded-lg hover:bg-stone-800 ${themeMutedText} hover:text-white transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-200">Ready-to-use Bot Command</span>
                  <button
                    onClick={async () => {
                      const ok = await copyTextToClipboard(copyScheduleModal.command);
                      if (ok) {
                        setCopyScheduleModal({ ...copyScheduleModal, copiedField: 'command' });
                        setScheduleNotification({ type: 'success', message: 'Schedule command copied to clipboard!' });
                      } else {
                        setScheduleNotification({ type: 'error', message: 'Clipboard access unavailable. Please select and copy text manually.' });
                      }
                    }}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copyScheduleModal.copiedField === 'command' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copyScheduleModal.copiedField === 'command' ? 'Copied!' : 'Copy Command'}
                  </button>
                </div>
                <div
                  onClick={async () => {
                    const ok = await copyTextToClipboard(copyScheduleModal.command);
                    if (ok) {
                      setCopyScheduleModal({ ...copyScheduleModal, copiedField: 'command' });
                      setScheduleNotification({ type: 'success', message: 'Schedule command copied to clipboard!' });
                    }
                  }}
                  className={`p-3 rounded-xl font-mono text-xs text-cyan-300 break-all select-all cursor-pointer border ${themeBorder} ${themeInnerCardBg} hover:border-cyan-500/50`}
                  title="Click to copy"
                >
                  {copyScheduleModal.command}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-200">Complete JSON Configuration</span>
                  <button
                    onClick={async () => {
                      const ok = await copyTextToClipboard(JSON.stringify(copyScheduleModal.jsonConfig, null, 2));
                      if (ok) {
                        setCopyScheduleModal({ ...copyScheduleModal, copiedField: 'json' });
                        setScheduleNotification({ type: 'success', message: 'Schedule JSON configuration copied to clipboard!' });
                      } else {
                        setScheduleNotification({ type: 'error', message: 'Clipboard access unavailable. Please select and copy text manually.' });
                      }
                    }}
                    className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copyScheduleModal.copiedField === 'json' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copyScheduleModal.copiedField === 'json' ? 'Copied!' : 'Copy JSON'}
                  </button>
                </div>
                <pre
                  onClick={async () => {
                    const ok = await copyTextToClipboard(JSON.stringify(copyScheduleModal.jsonConfig, null, 2));
                    if (ok) {
                      setCopyScheduleModal({ ...copyScheduleModal, copiedField: 'json' });
                      setScheduleNotification({ type: 'success', message: 'Schedule JSON configuration copied to clipboard!' });
                    }
                  }}
                  className={`p-3 rounded-xl font-mono text-[11px] text-stone-300 max-h-48 overflow-y-auto cursor-pointer border ${themeBorder} ${themeInnerCardBg} hover:border-cyan-500/50`}
                  title="Click to copy"
                >
                  {JSON.stringify(copyScheduleModal.jsonConfig, null, 2)}
                </pre>
              </div>

              <div className="p-3 bg-cyan-950/40 border border-cyan-800/40 rounded-xl text-xs text-cyan-200/90 space-y-1.5">
                <div className="font-semibold text-cyan-300">ℹ️ Schedule Reusability & Format Guidance:</div>
                <ul className="list-disc pl-4 space-y-1 text-cyan-300/80 text-[11px]">
                  <li><b>Ready Command:</b> Convenient for quick chat execution. <i>Note:</i> Telegram bot command format cannot represent rich features like custom inline URL buttons.</li>
                  <li><b>JSON Configuration:</b> Complete canonical representation containing all supported schedule options (buttons, pin, reply, auto-delete, media). Replace <code>&lt;REPLACE_WITH_DESTINATION_CHAT_ID&gt;</code> before destination import.</li>
                  <li><b>Zero Duplicates:</b> Copying code is strictly read-only and never creates, activates, pauses, or modifies any schedules.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-stone-800">
              <button
                onClick={() => setCopyScheduleModal(null)}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Automation Rule Modal */}
      {showCreateAutomationModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className={`${themeCardBg} border rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Add Automation Rule
              </h3>
              <button
                onClick={() => setShowCreateAutomationModal(false)}
                className={`p-1.5 rounded-lg ${themeInnerCardBg} border ${themeBorder} text-stone-400 hover:text-white`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveAutomation(); }} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold block">Trigger Condition</label>
                <select
                  value={newAutomationForm.trigger}
                  onChange={(e) => setNewAutomationForm({ ...newAutomationForm, trigger: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                >
                  <option value="spam_detected">Spam Message Detected</option>
                  <option value="link_posted">Unauthorized Link Posted</option>
                  <option value="abuse_word_detected">Abuse Word / Hate Speech</option>
                  <option value="caps_flood">Excessive Capslock Flood</option>
                  <option value="forward_flood">Channel Forward Flood</option>
                  <option value="join_event">New Member Join</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block">Enforcement Action</label>
                <select
                  value={newAutomationForm.action}
                  onChange={(e) => setNewAutomationForm({ ...newAutomationForm, action: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none`}
                >
                  <option value="delete_message">Delete Message Immediately</option>
                  <option value="warn_user">Issue Warning to User</option>
                  <option value="mute_user">Temporarily Mute User</option>
                  <option value="kick_user">Kick User from Group</option>
                  <option value="ban_user">Permanently Ban User</option>
                  <option value="send_alert">Send Alert Notice to Chat</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold block">Parameters (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. duration=10m or alert message"
                  value={newAutomationForm.parameters}
                  onChange={(e) => setNewAutomationForm({ ...newAutomationForm, parameters: e.target.value })}
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none`}
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={newAutomationForm.enabled}
                    onChange={(e) => setNewAutomationForm({ ...newAutomationForm, enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-600"
                  />
                  <span>Enable Rule Immediately</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setShowCreateAutomationModal(false)}
                  className={`px-4 py-2 ${themeInnerCardBg} border ${themeBorder} rounded-xl text-xs font-semibold`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={automationsLoading}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors shadow-sm flex items-center gap-1.5"
                >
                  {automationsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md ${themeCardBg} border ${themeBorder} rounded-2xl p-6 shadow-2xl space-y-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Admin Operator Login</h3>
                  <p className={`text-[11px] ${themeMutedText}`}>Authenticate to access protected administrative controls</p>
                </div>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className={`p-1.5 rounded-lg hover:bg-white/10 ${themeMutedText} transition-colors`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider ${themeMutedText} mb-1`}>
                  Username
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin"
                  required
                  autoFocus
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 transition-colors`}
                />
              </div>

              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider ${themeMutedText} mb-1`}>
                  Password
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className={`w-full ${themeInnerCardBg} border ${themeBorder} rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-purple-500 transition-colors`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold ${themeInnerCardBg} border ${themeBorder} hover:opacity-80 transition-opacity`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {loggingIn ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Log In</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
