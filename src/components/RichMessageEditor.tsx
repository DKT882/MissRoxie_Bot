import React, { useState, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Eye,
  Check,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  Upload,
  AlertTriangle,
  CheckCircle2,
  X,
  Layers,
  Type,
  Image,
  Video,
  Film,
  FileText,
  Send,
  Sliders
} from 'lucide-react';
import { ComposerContentType, PostButtonStyle } from './RichPostComposer';

export interface RichMessageButton {
  id?: string;
  text: string;
  url: string;
  style?: PostButtonStyle;
}

export interface RichMessageConfigData {
  enabled: boolean;
  mode?: 'simple' | 'rich';
  contentType?: ComposerContentType;
  text?: string;
  mediaFileId?: string;
  mediaUploadId?: string;
  buttons?: Array<Array<{ text: string; url: string; style?: PostButtonStyle }>>;
  fallbackEnabled?: boolean;
  fallbackText?: string;
  fallbackButtonText?: string;
  triggerMode?: 'normal_join' | 'join_request' | 'both';
  pinAfterSend?: boolean;
  replyToLatest?: boolean;
  protectContent?: boolean;
}

export interface RichMessageEditorProps {
  title: string;
  subtitle?: string;
  description: string;
  badgeLabel?: string;
  config: RichMessageConfigData;
  defaultText?: string;
  groupTitle?: string;
  groupId?: number | string;
  isPrivateDm?: boolean;
  theme?: 'dark' | 'light';
  onChange: (updated: RichMessageConfigData) => void;
  onToggle?: (enabled: boolean) => Promise<void> | void;
  onSave: (overrideConfig?: RichMessageConfigData) => Promise<void> | void;
  onTest?: (targetUserId?: number) => Promise<void> | void;
  testLabel?: string;
  testPlaceholder?: string;
  isSaving?: boolean;
  isTesting?: boolean;
  notification?: { type: 'success' | 'error'; message: string } | null;
  onClearNotification?: () => void;
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

export const RichMessageEditor: React.FC<RichMessageEditorProps> = ({
  title,
  subtitle,
  description,
  badgeLabel,
  config,
  defaultText = 'Welcome {user} to {groupname}!',
  groupTitle = 'Telegram Group',
  groupId = '-100123456789',
  isPrivateDm = false,
  theme = 'dark',
  onChange,
  onToggle,
  onSave,
  onTest,
  testLabel = 'Send Test',
  testPlaceholder = 'Your Telegram User ID (e.g. 123456789)',
  isSaving = false,
  isTesting = false,
  notification,
  onClearNotification
}) => {
  const isDark = theme === 'dark';
  const themeCardBg = isDark ? 'bg-stone-900/90 border-stone-800' : 'bg-white border-stone-200';
  const themeInnerCardBg = isDark ? 'bg-stone-950/60 border-stone-800/80' : 'bg-stone-50 border-stone-200';
  const themeBorder = isDark ? 'border-stone-800' : 'border-stone-200';
  const themeMutedText = isDark ? 'text-stone-400' : 'text-stone-500';
  const themeInputBg = isDark
    ? 'bg-stone-950 border-stone-800 text-stone-100 placeholder:text-stone-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
    : 'bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  // Local state for media file upload
  const [localUploadStatus, setLocalUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [localUploadError, setLocalUploadError] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [testInputUserId, setTestInputUserId] = useState<string>('');

  const enabled = Boolean(config.enabled);
  const mode = config.mode || (config.buttons && config.buttons.length > 0 ? 'rich' : 'simple');
  const contentType = config.contentType || 'text';
  const text = config.text !== undefined && config.text !== null ? config.text : defaultText;
  const mediaFileId = config.mediaFileId || '';
  const mediaUploadId = config.mediaUploadId || '';
  const buttons = config.buttons || [];
  const fallbackEnabled = Boolean(config.fallbackEnabled);
  const fallbackText = config.fallbackText !== undefined ? config.fallbackText : '';
  const fallbackButtonText = config.fallbackButtonText !== undefined ? config.fallbackButtonText : '';
  const triggerMode = config.triggerMode || 'normal_join';

  const maxChars = contentType === 'text' ? 4096 : 1024;
  const isOverLimit = text.length > maxChars;

  // Handle Local File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const targetType = isGif ? 'animation' : contentType;

    setLocalUploadStatus('uploading');
    setLocalUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/dashboard/posts/upload-media?type=${targetType}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: getAuthHeaders(),
        body: formData
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to upload media file.');
      }

      setLocalUploadStatus('uploaded');
      setLocalFileName(data.filename || file.name);
      onChange({
        ...config,
        contentType: targetType,
        mediaFileId: `upload:${data.mediaUploadId}`,
        mediaUploadId: data.mediaUploadId
      });
    } catch (err: any) {
      setLocalUploadStatus('error');
      setLocalUploadError(err.message || 'File upload failed');
    }
  };

  const handleClearMedia = () => {
    setLocalUploadStatus('idle');
    setLocalUploadError(null);
    setLocalFileName(null);
    onChange({
      ...config,
      mediaFileId: '',
      mediaUploadId: undefined
    });
  };

  // Button management
  const handleAddButtonRow = () => {
    const newButtons = [...buttons, [{ text: 'New Button', url: 'https://' }]];
    onChange({
      ...config,
      mode: 'rich',
      buttons: newButtons
    });
  };

  const handleAddButtonToRow = (rowIndex: number) => {
    const newButtons = buttons.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        return [...row, { text: 'Button', url: 'https://' }];
      }
      return [...row];
    });
    onChange({
      ...config,
      buttons: newButtons
    });
  };

  const handleUpdateButton = (rowIndex: number, btnIndex: number, field: 'text' | 'url' | 'style', val: any) => {
    const newButtons = buttons.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        const newRow = [...row];
        newRow[btnIndex] = {
          ...newRow[btnIndex],
          [field]: field === 'style' ? (val || undefined) : (typeof val === 'string' ? val : (val ?? ''))
        };
        return newRow;
      }
      return [...row];
    });
    onChange({
      ...config,
      buttons: newButtons
    });
  };

  const handleRemoveButton = (rowIndex: number, btnIndex: number) => {
    const newButtons = buttons.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        const newRow = [...row];
        newRow.splice(btnIndex, 1);
        return newRow;
      }
      return [...row];
    }).filter(row => row.length > 0);

    onChange({
      ...config,
      buttons: newButtons
    });
  };

  const handleRemoveRow = (rowIndex: number) => {
    const newButtons = buttons.filter((_, rIdx) => rIdx !== rowIndex);
    onChange({
      ...config,
      buttons: newButtons
    });
  };

  // Dynamic placeholders replacement for live preview
  const livePreviewText = useMemo(() => {
    const raw = text || defaultText;
    const gName = groupTitle || 'Telegram Group';
    const gId = String(groupId || '-100123456789');
    return raw
      .replace(/{groupname}/gi, gName)
      .replace(/{group_id}/gi, gId)
      .replace(/{chat_title}/gi, gName)
      .replace(/{chat}/gi, gName)
      .replace(/{first_name}/gi, 'Alex')
      .replace(/{last_name}/gi, 'Smith')
      .replace(/{username}/gi, '@alexsmith')
      .replace(/{user_id}/gi, '987654321')
      .replace(/{id}/gi, '987654321')
      .replace(/{user}/gi, 'Alex Smith')
      .replace(/{name}/gi, 'Alex Smith')
      .replace(/{mention}/gi, '@alexsmith');
  }, [text, defaultText, groupTitle, groupId]);

  const handleRunTest = () => {
    if (!onTest) return;
    if (isPrivateDm) {
      const num = Number(testInputUserId.trim());
      onTest(num || undefined);
    } else {
      onTest();
    }
  };

  const handleToggle = (newEnabled: boolean) => {
    const updated = { ...config, enabled: newEnabled };
    onChange(updated);
    if (onToggle) {
      onToggle(newEnabled);
    }
  };

  return (
    <div className={`${themeCardBg} border rounded-2xl p-6 space-y-6 shadow-sm`}>
      {/* Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          {onClearNotification && (
            <button type="button" onClick={onClearNotification} className="opacity-70 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-800/60">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold flex items-center gap-2 text-stone-100">
              {title}
            </h3>
            {badgeLabel && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {badgeLabel}
              </span>
            )}
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                enabled
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-stone-500/10 text-stone-400 border border-stone-500/20'
              }`}
            >
              {enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className={`text-xs ${themeMutedText} mt-1`}>{description}</p>
        </div>

        {/* Enable / Disable Switch */}
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => handleToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          <span className="ml-2.5 text-xs font-semibold text-stone-300">
            {enabled ? 'Active' : 'Inactive'}
          </span>
        </label>
      </div>

      {/* Mode Selector (Simple vs Rich) */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          Message Mode
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange({ ...config, mode: 'simple' })}
            className={`p-3 rounded-xl border text-left transition-all ${
              mode === 'simple'
                ? 'bg-blue-600/15 border-blue-500 text-blue-300 shadow-sm'
                : `${themeInnerCardBg} ${themeBorder} ${themeMutedText} hover:text-stone-200 hover:border-stone-700`
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <span>📝 Simple Message</span>
              {mode === 'simple' && <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">Active</span>}
            </div>
            <p className="text-[11px] opacity-80 mt-1">Clean message text/media without button builder complexity.</p>
          </button>

          <button
            type="button"
            onClick={() => onChange({ ...config, mode: 'rich' })}
            className={`p-3 rounded-xl border text-left transition-all ${
              mode === 'rich'
                ? 'bg-purple-600/15 border-purple-500 text-purple-300 shadow-sm'
                : `${themeInnerCardBg} ${themeBorder} ${themeMutedText} hover:text-stone-200 hover:border-stone-700`
            }`}
          >
            <div className="text-xs font-bold flex items-center gap-1.5">
              <span>✨ Rich Interactive Post</span>
              {mode === 'rich' && <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">Active</span>}
            </div>
            <p className="text-[11px] opacity-80 mt-1">Multi-row interactive inline buttons with Telegram styles (Default, Primary 🔵, Success 🟢, Danger 🔴).</p>
          </button>
        </div>
      </div>

      {/* Content Type Selector */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">Content Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            { type: 'text' as const, label: '📝 Text Only', icon: Type },
            { type: 'photo' as const, label: '📷 Photo', icon: Image },
            { type: 'video' as const, label: '📹 Video', icon: Video },
            { type: 'animation' as const, label: '🎬 GIF', icon: Film },
            { type: 'document' as const, label: '📄 Document', icon: FileText }
          ].map(t => {
            const isSelected = contentType === t.type;
            const Icon = t.icon;
            return (
              <button
                key={t.type}
                type="button"
                onClick={() => onChange({ ...config, contentType: t.type })}
                className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm font-bold'
                    : `${themeInnerCardBg} ${themeBorder} ${themeMutedText} hover:text-stone-200 hover:border-stone-600`
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Media Input (if not text) */}
      {contentType !== 'text' && (
        <div className={`${themeInnerCardBg} border ${themeBorder} rounded-xl p-4 space-y-3`}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
              {contentType === 'photo'
                ? 'Photo Media Source'
                : contentType === 'video'
                ? 'Video Media Source'
                : contentType === 'animation'
                ? 'GIF / Animation Media Source'
                : 'Document Media Source'}
            </label>
            {(localFileName || mediaUploadId) && (
              <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Attached: {localFileName || mediaUploadId}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <input
                type="text"
                value={mediaFileId}
                onChange={e =>
                  onChange({
                    ...config,
                    mediaFileId: e.target.value,
                    mediaUploadId: e.target.value.startsWith('upload:') ? e.target.value.replace('upload:', '') : undefined
                  })
                }
                placeholder="Telegram file_id or https://... media URL"
                className={`w-full text-xs font-mono px-3 py-2 rounded-lg border ${themeInputBg}`}
              />
              <p className={`text-[11px] ${themeMutedText} mt-1`}>
                Paste a Telegram <code className="font-mono text-blue-400">file_id</code> or public <code className="font-mono text-blue-400">https://</code> URL.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label
                className={`cursor-pointer px-3 py-2 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                  localUploadStatus === 'uploading'
                    ? 'opacity-60 bg-stone-800 border-stone-700'
                    : 'bg-blue-600/10 text-blue-400 border-blue-500/30 hover:bg-blue-600/20'
                }`}
              >
                {localUploadStatus === 'uploading' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" /> Choose Local File
                  </>
                )}
                <input
                  type="file"
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
                />
              </label>

              {(mediaFileId || mediaUploadId) && (
                <button
                  type="button"
                  onClick={handleClearMedia}
                  className="px-2.5 py-2 rounded-lg text-xs border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear
                </button>
              )}
            </div>
          </div>

          {localUploadError && <p className="text-xs text-rose-400 font-medium">{localUploadError}</p>}
        </div>
      )}

      {/* Message Text / Caption */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
            {contentType === 'text' ? 'Message Text (HTML supported)' : 'Media Caption (HTML supported)'}
          </label>
          <span className={`text-[11px] font-mono ${isOverLimit ? 'text-rose-400 font-bold' : themeMutedText}`}>
            {text.length} / {maxChars}
          </span>
        </div>

        <textarea
          rows={4}
          value={text}
          onChange={e => onChange({ ...config, text: e.target.value })}
          placeholder={defaultText}
          className={`w-full text-xs font-mono px-3 py-2.5 rounded-xl border ${themeInputBg} focus:outline-none`}
        />

        {/* Dynamic Placeholder Helper Chips */}
        <div className="space-y-1.5 pt-1">
          <span className={`text-[11px] font-semibold ${themeMutedText} block`}>
            Dynamic Placeholders (click to append):
          </span>
          <div className="flex flex-wrap gap-1.5">
            {[
              { tag: '{groupname}', desc: 'Group Title' },
              { tag: '{first_name}', desc: 'First Name' },
              { tag: '{last_name}', desc: 'Last Name' },
              { tag: '{user}', desc: 'Display Name' },
              { tag: '{username}', desc: '@username' },
              { tag: '{mention}', desc: 'Mention Link' },
              { tag: '{user_id}', desc: 'User ID' },
              { tag: '{group_id}', desc: 'Group ID' }
            ].map(chip => (
              <button
                key={chip.tag}
                type="button"
                onClick={() => onChange({ ...config, text: `${text} ${chip.tag}` })}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono border ${themeBorder} ${themeInnerCardBg} hover:border-blue-500/50 hover:bg-blue-600/10 hover:text-blue-400 transition-all flex items-center gap-1`}
                title={chip.desc}
              >
                <span className="font-bold text-blue-400">{chip.tag}</span>
                <span className={`text-[10px] ${themeMutedText}`}>({chip.desc})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inline Buttons Builder (Rich Mode) */}
      {mode === 'rich' && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block">
                Inline URL Buttons
              </label>
              <p className={`text-[11px] ${themeMutedText}`}>
                Add interactive buttons with Telegram-supported button colors (Default, Primary 🔵, Success 🟢, Danger 🔴).
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddButtonRow}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/10 text-blue-400 border border-blue-500/30 hover:bg-blue-600/20 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add Button Row
            </button>
          </div>

          {buttons.length === 0 ? (
            <div className={`p-4 rounded-xl border ${themeBorder} ${themeInnerCardBg} text-center text-xs ${themeMutedText}`}>
              No inline buttons configured. Click <b>+ Add Button Row</b> to add buttons attached to this message.
            </div>
          ) : (
            <div className="space-y-3">
              {buttons.map((row, rIdx) => (
                <div key={rIdx} className={`p-3 rounded-xl border ${themeBorder} ${themeInnerCardBg} space-y-2`}>
                  <div className="flex items-center justify-between text-xs font-bold text-stone-400">
                    <span>Row {rIdx + 1}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddButtonToRow(rIdx)}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold"
                      >
                        <Plus className="w-3 h-3" /> Add Button
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(rIdx)}
                        className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                      >
                        Remove Row
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {row.map((btn, bIdx) => (
                      <div key={bIdx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-4">
                          <input
                            type="text"
                            value={btn.text ?? ''}
                            onChange={e => handleUpdateButton(rIdx, bIdx, 'text', e.target.value)}
                            placeholder="Button Text"
                            className={`w-full text-xs px-2.5 py-1.5 rounded-lg border ${themeInputBg}`}
                          />
                        </div>
                        <div className="sm:col-span-5">
                          <input
                            type="text"
                            value={btn.url ?? ''}
                            onChange={e => handleUpdateButton(rIdx, bIdx, 'url', e.target.value)}
                            placeholder="https://t.me/..."
                            className={`w-full text-xs font-mono px-2.5 py-1.5 rounded-lg border ${themeInputBg}`}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <select
                            value={btn.style || ''}
                            onChange={e => handleUpdateButton(rIdx, bIdx, 'style', e.target.value || undefined)}
                            className={`w-full text-xs px-2 py-1.5 rounded-lg border ${themeInputBg}`}
                          >
                            <option value="">Default</option>
                            <option value="primary">Primary 🔵</option>
                            <option value="success">Success 🟢</option>
                            <option value="danger">Danger 🔴</option>
                          </select>
                        </div>
                        <div className="sm:col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveButton(rIdx, bIdx)}
                            className="p-1.5 text-stone-500 hover:text-rose-400 transition-colors"
                            title="Remove Button"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delivery Trigger Mode (for Private Welcome DM) */}
      {isPrivateDm && (
        <div className={`p-4 rounded-xl border ${themeBorder} ${themeInnerCardBg} space-y-3 pt-3`}>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-stone-200 block">
              Delivery Trigger
            </label>
            <p className={`text-[11px] ${themeMutedText}`}>
              Choose when Roxie should send the private welcome message.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={() => onChange({ ...config, triggerMode: 'normal_join' })}
              className={`p-3 rounded-lg border text-left transition-all ${
                triggerMode === 'normal_join'
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-stone-800 bg-stone-900/40 text-stone-400 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="welcomeDmTriggerMode"
                  checked={triggerMode === 'normal_join'}
                  onChange={() => onChange({ ...config, triggerMode: 'normal_join' })}
                  className="text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span className="text-xs font-semibold text-stone-200">Normal Join</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1 pl-5">
                Sent when user joins the group directly or is approved.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onChange({ ...config, triggerMode: 'join_request' })}
              className={`p-3 rounded-lg border text-left transition-all ${
                triggerMode === 'join_request'
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-stone-800 bg-stone-900/40 text-stone-400 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="welcomeDmTriggerMode"
                  checked={triggerMode === 'join_request'}
                  onChange={() => onChange({ ...config, triggerMode: 'join_request' })}
                  className="text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span className="text-xs font-semibold text-stone-200">Join Request</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1 pl-5">
                Sent immediately when user submits a request to join.
              </p>
            </button>

            <button
              type="button"
              onClick={() => onChange({ ...config, triggerMode: 'both' })}
              className={`p-3 rounded-lg border text-left transition-all ${
                triggerMode === 'both'
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-stone-800 bg-stone-900/40 text-stone-400 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="welcomeDmTriggerMode"
                  checked={triggerMode === 'both'}
                  onChange={() => onChange({ ...config, triggerMode: 'both' })}
                  className="text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span className="text-xs font-semibold text-stone-200">Both</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1 pl-5">
                Sent on join request or normal join (deduplicated).
              </p>
            </button>
          </div>
        </div>
      )}

      {/* First-Contact Fallback Settings (for Private Welcome DM) */}
      {isPrivateDm && (
        <div className={`p-4 rounded-xl border ${themeBorder} ${themeInnerCardBg} space-y-3 pt-3`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-stone-200 block">
                Notify in Group if User Cannot Be Privately Contacted
              </label>
              <p className={`text-[11px] ${themeMutedText}`}>
                If a joining user has never started Roxie before, Telegram restricts direct private DMs. When enabled, Roxie sends a friendly in-group message with a &quot;Start Roxie&quot; button that immediately delivers their welcome DM upon clicking.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2">
              <input
                type="checkbox"
                checked={fallbackEnabled}
                onChange={e => onChange({ ...config, fallbackEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {fallbackEnabled && (
            <div className="space-y-3 pt-2 border-t border-stone-800/40">
              <div>
                <label className="text-xs font-semibold text-stone-300 block mb-1">
                  In-Group Fallback Text
                </label>
                <input
                  type="text"
                  value={fallbackText}
                  onChange={e => onChange({ ...config, fallbackText: e.target.value })}
                  placeholder="👋 Welcome {first_name}! Start Roxie privately to receive your personal welcome message."
                  className={`w-full text-xs px-3 py-2 rounded-lg border ${themeInputBg}`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-300 block mb-1">
                  Fallback Button Label
                </label>
                <input
                  type="text"
                  value={fallbackButtonText}
                  onChange={e => onChange({ ...config, fallbackButtonText: e.target.value })}
                  placeholder="💬 Start Roxie"
                  className={`w-full text-xs px-3 py-2 rounded-lg border ${themeInputBg}`}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Preview */}
      <div className="space-y-2 pt-3 border-t border-stone-800/60">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-300 block flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-blue-400" /> Telegram Live Preview
          </label>
          <span className={`text-[11px] ${themeMutedText}`}>
            Simulated member: <b className="text-stone-300">Alex Smith (@alexsmith)</b>
          </span>
        </div>

        <div className={`p-4 rounded-xl border ${themeBorder} ${isDark ? 'bg-stone-950/80' : 'bg-stone-100'} space-y-3 max-w-lg`}>
          <div className="flex items-center gap-2 pb-2 border-b border-stone-800/40 text-xs">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">
              R
            </div>
            <div>
              <div className="font-bold text-xs">Miss Roxie</div>
              <div className={`text-[10px] ${themeMutedText}`}>
                {isPrivateDm ? 'bot • Private Chat' : `bot • in ${groupTitle}`}
              </div>
            </div>
          </div>

          {contentType !== 'text' && (
            <div className={`p-3 rounded-lg border border-dashed ${themeBorder} text-center text-xs ${themeMutedText}`}>
              [{contentType.toUpperCase()} MEDIA PREVIEW]
              {localFileName && <span className="block text-[11px] text-blue-400 mt-0.5">{localFileName}</span>}
            </div>
          )}

          <div className="text-xs whitespace-pre-wrap leading-relaxed text-stone-200">
            {livePreviewText}
          </div>

          {mode === 'rich' && buttons.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {buttons.map((row, rIdx) => (
                <div key={rIdx} className="flex gap-1.5">
                  {row.map((btn, bIdx) => {
                    const btnPreviewText = (btn.text || 'Untitled Button')
                      .replace(/{groupname}/gi, groupTitle)
                      .replace(/{user}/gi, 'Alex Smith')
                      .replace(/{username}/gi, '@alexsmith');

                    const styleClasses =
                      btn.style === 'primary'
                        ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm'
                        : btn.style === 'success'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                        : btn.style === 'danger'
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm'
                        : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700';

                    return (
                      <div
                        key={bIdx}
                        className={`flex-1 text-center py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${styleClasses}`}
                      >
                        <span>{btnPreviewText || 'Button'}</span>
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-stone-800/60">
        {onTest ? (
          <div className="flex items-center gap-2 flex-1 max-w-md">
            {isPrivateDm && (
              <input
                type="text"
                value={testInputUserId}
                onChange={e => setTestInputUserId(e.target.value)}
                placeholder={testPlaceholder}
                className={`w-full text-xs font-mono px-3 py-2 rounded-xl border ${themeInputBg}`}
              />
            )}
            <button
              type="button"
              disabled={isTesting}
              onClick={handleRunTest}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 whitespace-nowrap transition-all ${
                isTesting
                  ? 'opacity-60 bg-stone-800 border-stone-700'
                  : 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700 hover:border-stone-600'
              }`}
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {testLabel}
            </button>
          </div>
        ) : (
          <div />
        )}

        <button
          type="button"
          disabled={isSaving || isOverLimit}
          onClick={() => onSave()}
          className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm flex items-center justify-center gap-2 transition-all ${
            isSaving || isOverLimit
              ? 'opacity-70 bg-blue-700 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 hover:shadow-md'
          }`}
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save Configuration
        </button>
      </div>
    </div>
  );
};
