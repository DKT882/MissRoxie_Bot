import React, { useState, useEffect } from 'react';
import {
  Copy,
  Sparkles,
  Clock,
  Send,
  FileText,
  Radio,
  Check,
  AlertCircle,
  X,
  Loader2,
  Bookmark,
  ExternalLink,
  Shield,
  Pin,
  RefreshCw,
  Sliders,
  Layers
} from 'lucide-react';

export type ContentItemType = 'post' | 'schedule' | 'broadcast' | 'inline_button';

export interface UnifiedContentItem {
  id: string;
  type: ContentItemType;
  title: string;
  contentType: string;
  text?: string;
  mediaFileId?: string;
  mediaUploadId?: string;
  buttons?: Array<Array<{ text: string; url: string; style?: 'primary' | 'success' | 'danger' }>>;
  options?: {
    pinAfterSend?: boolean;
    pinMessage?: boolean;
    replyToLatest?: boolean;
    protectContent?: boolean;
    autoDeletePrevious?: boolean;
  };
  scheduleConfig?: {
    scheduleType?: 'one_time' | 'daily' | 'weekly' | 'interval' | 'custom';
    intervalStr?: string;
    intervalMs?: number;
    timezone?: string;
    cron?: string;
  };
  sourceGroupId?: number;
  createdBy?: {
    userId?: number;
    username?: string;
    role?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface ContentReuseModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetContext: 'schedule' | 'rich_post' | 'broadcast' | 'mention_all';
  isEditingExistingSchedule?: boolean;
  currentScheduleId?: string | number | null;
  fetchItem: (id: string) => Promise<UnifiedContentItem>;
  onApply: (item: UnifiedContentItem, options: { includeTiming?: boolean }) => void;
  theme?: 'dark' | 'light';
  title?: string;
}

export const ContentReuseModal: React.FC<ContentReuseModalProps> = ({
  isOpen,
  onClose,
  targetContext,
  isEditingExistingSchedule = false,
  currentScheduleId = null,
  fetchItem,
  onApply,
  theme = 'dark',
  title
}) => {
  const [contentId, setContentId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectedItem, setInspectedItem] = useState<UnifiedContentItem | null>(null);
  const [includeTiming, setIncludeTiming] = useState<boolean>(true);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setContentId('');
      setError(null);
      setInspectedItem(null);
      setIncludeTiming(true);
      setCopiedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isDark = theme !== 'light';
  const modalBg = isDark ? 'bg-stone-900 border-stone-800 text-stone-100' : 'bg-white border-stone-200 text-stone-900';
  const innerCardBg = isDark ? 'bg-stone-950/70 border-stone-800' : 'bg-stone-50 border-stone-200';
  const inputBg = isDark ? 'bg-stone-950 border-stone-800 text-stone-100' : 'bg-stone-100 border-stone-300 text-stone-900';
  const mutedText = isDark ? 'text-stone-400' : 'text-stone-500';

  const handleInspect = async (idToFetch?: string) => {
    const rawId = (idToFetch || contentId).trim();
    if (!rawId) {
      setError('Please enter a content ID (e.g. POST-XXXXX, schedule ID, or template ID).');
      return;
    }

    setLoading(true);
    setError(null);
    setInspectedItem(null);

    try {
      const item = await fetchItem(rawId);
      if (!item || !item.id) {
        throw new Error(`Content item "${rawId}" not found or inaccessible.`);
      }
      setInspectedItem(item);
    } catch (err: any) {
      setError(err.message || `Failed to fetch item "${rawId}".`);
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const trimmed = text.trim();
          setContentId(trimmed);
          setCopiedSuccess(true);
          setTimeout(() => setCopiedSuccess(false), 2000);
          handleInspect(trimmed);
        }
      }
    } catch {
      // Clipboard access might be blocked in some iframe contexts, user can paste directly
    }
  };

  const handleConfirmApply = () => {
    if (!inspectedItem) return;
    onApply(inspectedItem, {
      includeTiming: inspectedItem.type === 'schedule' && includeTiming && !isEditingExistingSchedule
    });
    onClose();
  };

  const getTypeBadge = (type: ContentItemType) => {
    switch (type) {
      case 'post':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Bookmark className="w-3 h-3" /> Saved Post
          </span>
        );
      case 'schedule':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Clock className="w-3 h-3" /> Scheduled Message
          </span>
        );
      case 'broadcast':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Radio className="w-3 h-3" /> Broadcast Template
          </span>
        );
      case 'inline_button':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Sliders className="w-3 h-3" /> Inline Button Template
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <FileText className="w-3 h-3" /> Content Item
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className={`${modalBg} border rounded-2xl max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 border-stone-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                {title || 'Reuse Existing Content by ID'}
              </h3>
              <p className={`text-[11px] ${mutedText}`}>
                {targetContext === 'schedule'
                  ? isEditingExistingSchedule
                    ? `Update schedule #${currentScheduleId} content without altering its ID`
                    : 'Create a new draft from any saved post, schedule, or template'
                  : targetContext === 'broadcast' || targetContext === 'mention_all'
                  ? 'Import message content and buttons into this broadcast draft'
                  : 'Load reusable content into Rich Post Composer'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-white p-1.5 rounded-lg hover:bg-stone-800/40 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input & Search Section */}
        <div className="space-y-2">
          <label className="text-xs font-semibold block">Content ID</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={contentId}
                onChange={e => setContentId(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInspect();
                  }
                }}
                placeholder="e.g. POST-4K9P2, 1024, TPL-BCAST-01..."
                className={`w-full px-3 py-2 text-xs rounded-xl border ${inputBg} font-mono focus:outline-none focus:border-blue-500 transition`}
                autoFocus
              />
              {contentId && (
                <button
                  type="button"
                  onClick={() => setContentId('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handlePaste}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border ${innerCardBg} hover:bg-stone-800/40 flex items-center gap-1.5 transition text-stone-300`}
              title="Paste from clipboard"
            >
              {copiedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSuccess ? 'Pasted' : 'Paste'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleInspect()}
              disabled={loading || !contentId.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Inspect</span>
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1 font-medium">{error}</span>
          </div>
        )}

        {/* Content Item Preview Card */}
        {inspectedItem && (
          <div className={`p-4 rounded-xl border ${innerCardBg} space-y-3 animate-in fade-in duration-200`}>
            {/* Item Meta */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5 border-stone-800/60">
              <div className="flex items-center gap-2">
                {getTypeBadge(inspectedItem.type)}
                <span className="font-mono text-xs font-bold text-stone-200">
                  {inspectedItem.id}
                </span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${innerCardBg} border uppercase text-stone-400`}>
                {inspectedItem.contentType || 'text'}
              </span>
            </div>

            {/* Title */}
            <div>
              <span className={`text-[10px] uppercase font-bold tracking-wider ${mutedText} block`}>
                Source Item Title
              </span>
              <p className="text-xs font-semibold text-stone-100">
                {inspectedItem.title || inspectedItem.id}
              </p>
            </div>

            {/* Message Text Preview */}
            <div className="space-y-1">
              <span className={`text-[10px] uppercase font-bold tracking-wider ${mutedText} block`}>
                Message Content
              </span>
              {inspectedItem.text ? (
                <div className={`p-2.5 rounded-lg border ${inputBg} text-xs font-sans whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed`}>
                  {inspectedItem.text}
                </div>
              ) : (
                <div className={`p-2.5 rounded-lg border ${inputBg} text-xs italic ${mutedText}`}>
                  No message text — item contains interactive buttons only.
                </div>
              )}
            </div>

            {/* Media Attachment Info if present */}
            {inspectedItem.mediaFileId && (
              <div className="flex items-center gap-2 text-xs text-stone-300">
                <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className={`${mutedText}`}>Media:</span>
                <span className="font-mono text-[11px] truncate" title={inspectedItem.mediaFileId}>
                  {inspectedItem.mediaFileId}
                </span>
              </div>
            )}

            {/* Buttons Preview if present */}
            {inspectedItem.buttons && inspectedItem.buttons.length > 0 && inspectedItem.buttons.some(r => r.length > 0) && (
              <div className="space-y-1.5">
                <span className={`text-[10px] uppercase font-bold tracking-wider ${mutedText} block`}>
                  Interactive Buttons Layout ({inspectedItem.buttons.flat().length} buttons)
                </span>
                <div className="space-y-1 p-2 rounded-lg bg-stone-900/60 border border-stone-800/80">
                  {inspectedItem.buttons.map((row, rIdx) => (
                    <div key={rIdx} className="flex gap-1.5">
                      {row.map((btn, bIdx) => (
                        <div
                          key={bIdx}
                          className="flex-1 py-1 px-2 rounded-md bg-stone-800 text-[11px] font-semibold text-stone-200 flex items-center justify-center gap-1 border border-stone-700/60 truncate"
                        >
                          <span className="truncate">{btn.text || '(empty)'}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery / Protection Options badges */}
            <div className="flex flex-wrap gap-2 pt-1">
              {(inspectedItem.options?.pinAfterSend || inspectedItem.options?.pinMessage) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Pin className="w-2.5 h-2.5" /> Pin message
                </span>
              )}
              {inspectedItem.options?.protectContent && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Shield className="w-2.5 h-2.5" /> Content protected
                </span>
              )}
              {inspectedItem.options?.replyToLatest && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <RefreshCw className="w-2.5 h-2.5" /> Reply to latest
                </span>
              )}
            </div>

            {/* Schedule-specific options */}
            {inspectedItem.type === 'schedule' && (
              <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-xs text-cyan-300 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" /> Source Timing:
                  </span>
                  <span className="font-mono text-[11px] text-cyan-200">
                    {inspectedItem.scheduleConfig?.intervalStr || 'Interval'} ({inspectedItem.scheduleConfig?.scheduleType || 'interval'})
                  </span>
                </div>

                {/* Option to reuse timing when creating a new schedule */}
                {targetContext === 'schedule' && !isEditingExistingSchedule && (
                  <label className="flex items-center gap-2 pt-1 text-xs cursor-pointer text-stone-200">
                    <input
                      type="checkbox"
                      checked={includeTiming}
                      onChange={e => setIncludeTiming(e.target.checked)}
                      className="w-3.5 h-3.5 accent-cyan-500 rounded"
                    />
                    <span>Reuse interval and timing settings for new schedule draft</span>
                  </label>
                )}
              </div>
            )}

            {/* Context Notice Banner */}
            <div className="p-2 rounded-lg bg-stone-900 border border-stone-800 text-[11px] text-stone-400 flex items-start gap-2">
              <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                {isEditingExistingSchedule ? (
                  <p className="text-amber-300 font-medium">
                    ✏️ Editing schedule #{currentScheduleId}: Reusing content will update draft fields in place. The schedule ID and database record will NOT be duplicated.
                  </p>
                ) : targetContext === 'schedule' ? (
                  <p className="text-stone-300 font-medium">
                    ➕ New schedule draft will be loaded in paused (disabled) state until explicitly enabled.
                  </p>
                ) : (
                  <p className="text-stone-300 font-medium">
                    📝 Content will be loaded into the active composer. You can review and edit before sending.
                  </p>
                )}
                <p className="text-stone-400">
                  🔒 Safety guarantee: Loading content will NEVER transmit messages or trigger source schedules.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-800">
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold border ${innerCardBg} hover:bg-stone-800/40 text-stone-300 transition`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmApply}
            disabled={!inspectedItem}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Content to Draft</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export interface ContentReuseButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
  variant?: 'subtle' | 'compact' | 'primary';
}

export const ContentReuseButton: React.FC<ContentReuseButtonProps> = ({
  onClick,
  label = 'Reuse by ID',
  className = '',
  variant = 'subtle'
}) => {
  const baseClasses =
    variant === 'compact'
      ? 'px-2.5 py-1 text-[11px] rounded-lg'
      : variant === 'primary'
      ? 'px-3 py-1.5 text-xs rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
      : 'px-2.5 py-1 text-xs rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${baseClasses} ${className}`}
      title="Reuse content from an existing post, schedule, or template by ID"
    >
      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
      <span>{label}</span>
    </button>
  );
};
