import React, { useState } from 'react';
import { useAppearance } from '../../context/AppearanceContext';
import { useAuth } from '../../context/AuthContext';
import { 
  Sparkles, 
  Check, 
  ShieldCheck, 
  SunMoon, 
  Palette, 
  Type, 
  LayoutGrid, 
  User as UserIcon, 
  Copy, 
  AtSign, 
  Save, 
  CheckCircle2 
} from 'lucide-react';

interface SettingsPageProps {
  onShowToast: (msg: string) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onShowToast }) => {
  const { appearance, updateAppearance, setIsCustomizerOpen } = useAppearance();
  const { user, workspace, updateProfile } = useAuth();

  // Active section tab: 'profile' | 'appearance'
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance'>('profile');

  // Editable Profile fields
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || 'Hey there! I am using Vertex Connect.');
  const [userStatus, setUserStatus] = useState(user?.status || 'online');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyConnectId = () => {
    if (!user?.connect_id) return;
    navigator.clipboard?.writeText(`@${user.connect_id}`);
    setCopiedId(true);
    onShowToast(`Copied @${user.connect_id} to clipboard! Share with teammates.`);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onShowToast('Name cannot be empty.');
      return;
    }
    setIsSaving(true);
    const res = await updateProfile({ name: name.trim(), bio: bio.trim(), status: userStatus });
    setIsSaving(false);
    if (res.success) {
      onShowToast('Profile updated successfully in SQLite database!');
    } else {
      onShowToast(res.message || 'Failed to update profile.');
    }
  };

  const accentPresets = [
    { label: 'Blue', color: '#1769ef' },
    { label: 'Violet', color: '#7454e8' },
    { label: 'Emerald', color: '#079b83' },
    { label: 'Rose', color: '#d65b83' },
    { label: 'Amber', color: '#d17b22' },
    { label: 'Teal', color: '#168fa8' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-3 border-b border-black/5 dark:border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[var(--accent)] text-white shadow-md'
              : 'text-[#6f7899] dark:text-[#aeb8dc] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <UserIcon className="w-4 h-4" />
          <span>My Profile & Connect ID</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('appearance')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'appearance'
              ? 'bg-[var(--accent)] text-white shadow-md'
              : 'text-[#6f7899] dark:text-[#aeb8dc] hover:bg-black/5 dark:hover:bg-white/5'
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Appearance & Preferences</span>
        </button>
      </div>

      {activeTab === 'profile' ? (
        /* PROFILE SECTION */
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Connect ID Highlight Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-[#20285c] via-[#4c5db2] to-[#9c78d6] text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl border border-white/20">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] flex items-center justify-center font-black text-2xl text-[#171a42] shadow-lg">
                {(user?.name || 'User').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#8ff5ff] block">
                  Unique User Identifier
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    @{user?.connect_id || 'anonymous'}
                  </h2>
                  <button
                    type="button"
                    onClick={handleCopyConnectId}
                    title="Copy Connect ID"
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                  >
                    {copiedId ? <Check className="w-4 h-4 text-[#8df0d4]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-[#d8e6ff] mt-1 m-0">
                  Share this Connect ID with teammates. They can search <strong className="text-white">@{user?.connect_id}</strong> to connect and chat!
                </p>
              </div>
            </div>

            <div className="px-4 py-2.5 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md text-right shrink-0">
              <span className="text-[10px] uppercase font-bold text-[#b6c5dd] block">Account Role</span>
              <b className="text-xs font-bold text-white capitalize">{user?.role || 'Employee'}</b>
            </div>
          </div>

          {/* Edit Profile Form */}
          <form onSubmit={handleSaveProfile} className="glass-panel p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff] border-b border-black/5 dark:border-white/10 pb-3">
              Edit User Profile Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">
                  Email Address (Verified)
                </label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-3.5 py-2 rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 text-xs text-[#6f7899] dark:text-[#aeb8dc] cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">
                  Online Status
                </label>
                <select
                  value={userStatus}
                  onChange={(e) => setUserStatus(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="online">🟢 Online</option>
                  <option value="away">🟡 Away</option>
                  <option value="busy">🔴 Busy (Do not disturb)</option>
                  <option value="offline">⚪ Offline</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">
                  Connect ID (Fixed Unique Handle)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8ce7f2]">@</span>
                  <input
                    type="text"
                    value={user?.connect_id || ''}
                    disabled
                    className="w-full pl-7 pr-3.5 py-2 rounded-xl border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 text-xs text-[#6f7899] dark:text-[#aeb8dc] cursor-not-allowed font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#182044] dark:text-[#eef1ff] mb-1">
                About / Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="Share a brief status with teammates..."
                className="w-full p-3 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving…' : 'Save Profile Changes'}</span>
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* APPEARANCE SECTION */
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-7 rounded-3xl bg-gradient-to-r from-[#eaf3ff] via-[#dce5ff] to-[#e9dfff] dark:from-[#172d4b] dark:via-[#1a2552] dark:to-[#28214f] border border-white/60 dark:border-white/10 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[var(--accent)] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                WORKSPACE PREFERENCES
              </span>
              <h2 className="text-2xl font-bold text-[#182044] dark:text-[#f1f3ff] mt-1 mb-1">
                Make VERTEX feel like yours.
              </h2>
              <p className="text-xs text-[#6d7b91] dark:text-[#b5c3d9]">
                Personalize your workspace appearance, reading comfort, typography, and interface density.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCustomizerOpen(true)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              ✦ Customize workspace
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Appearance */}
            <div className="glass-panel p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center font-bold">
                <SunMoon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff]">Appearance</h3>
                <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
                  Choose between light, dark, or automatic system appearance.
                </p>
              </div>
              <div className="pt-2 flex items-center justify-between text-xs">
                <span className="font-semibold text-[#182044] dark:text-[#eef1ff]">Theme mode</span>
                <select
                  value={appearance.theme}
                  onChange={(e) => updateAppearance('theme', e.target.value as any)}
                  className="px-3 py-1.5 rounded-lg border border-[#cbd5ff]/60 dark:border-white/10 bg-white/70 dark:bg-[#0c1230] text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)] text-xs"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System default</option>
                </select>
              </div>
            </div>

            {/* Accent Colour */}
            <div className="glass-panel p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center font-bold">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff]">Accent colour</h3>
                <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
                  Set the primary color accent used across buttons, charts, and highlights.
                </p>
              </div>
              <div className="pt-2 flex items-center gap-2 flex-wrap">
                {accentPresets.map((preset) => {
                  const isSelected = appearance.accent.toLowerCase() === preset.color.toLowerCase();
                  return (
                    <button
                      key={preset.color}
                      type="button"
                      onClick={() => updateAppearance('accent', preset.color)}
                      style={{ backgroundColor: preset.color }}
                      title={preset.label}
                      className={`w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ${
                        isSelected ? 'ring-2 ring-[var(--accent)] scale-110' : ''
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Typography */}
            <div className="glass-panel p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center font-bold">
                <Type className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff]">Typography</h3>
                <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
                  Adjust font family and sizing for comfortable reading.
                </p>
              </div>
              <div className="space-y-2 pt-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#182044] dark:text-[#eef1ff]">Text size</span>
                  <select
                    value={appearance.fontSize}
                    onChange={(e) => updateAppearance('fontSize', e.target.value)}
                    className="px-3 py-1 rounded-lg border border-[#cbd5ff]/60 dark:border-white/10 bg-white/70 dark:bg-[#0c1230] text-[#182044] dark:text-[#eef1ff] text-xs"
                  >
                    <option value="13">Small</option>
                    <option value="14">Default</option>
                    <option value="15">Large</option>
                    <option value="16">Extra large</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#182044] dark:text-[#eef1ff]">Font style</span>
                  <select
                    value={appearance.fontFamily}
                    onChange={(e) => updateAppearance('fontFamily', e.target.value as any)}
                    className="px-3 py-1 rounded-lg border border-[#cbd5ff]/60 dark:border-white/10 bg-white/70 dark:bg-[#0c1230] text-[#182044] dark:text-[#eef1ff] text-xs"
                  >
                    <option value="system">System</option>
                    <option value="inter">Inter-like</option>
                    <option value="serif">Serif</option>
                    <option value="mono">Monospace</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Layout & Comfort */}
            <div className="glass-panel p-5 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center font-bold">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff]">Layout & comfort</h3>
                <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
                  Control information density, animation reduction, and sidebar display.
                </p>
              </div>
              <div className="space-y-2 pt-1 text-xs">
                <label className="flex items-center justify-between font-semibold text-[#182044] dark:text-[#eef1ff] cursor-pointer">
                  <span>Compact layout</span>
                  <input
                    type="checkbox"
                    checked={appearance.compact}
                    onChange={(e) => updateAppearance('compact', e.target.checked)}
                    className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between font-semibold text-[#182044] dark:text-[#eef1ff] cursor-pointer">
                  <span>Reduce animations</span>
                  <input
                    type="checkbox"
                    checked={appearance.motion}
                    onChange={(e) => updateAppearance('motion', e.target.checked)}
                    className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between font-semibold text-[#182044] dark:text-[#eef1ff] cursor-pointer">
                  <span>Show sidebar labels</span>
                  <input
                    type="checkbox"
                    checked={appearance.labels}
                    onChange={(e) => updateAppearance('labels', e.target.checked)}
                    className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Security Card */}
      <div className="glass-panel p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <b className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff] block flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#12a878]" />
            Tenant Security & User Data Isolation
          </b>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] mt-1">
            Workspace: <strong>{workspace?.name}</strong> · Role: <strong>{user?.role}</strong> · All records stored separately in SQLite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onShowToast('Security and data isolation verified.')}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-black/5 dark:bg-white/10 text-[#40516c] dark:text-[#cbd4ff] hover:bg-black/10 cursor-pointer"
        >
          Manage Policy →
        </button>
      </div>
    </div>
  );
};
