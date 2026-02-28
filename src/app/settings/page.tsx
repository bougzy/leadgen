'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSettings, saveSettings, exportAllData, importAllData, clearAllData, addAccount, addActivity, getAllSmtpAccounts } from '@/lib/db';
import { generateSampleLeads, createActivity } from '@/lib/utils';
import type { UserSettings, SmtpAccount, SmtpProvider } from '@/types';
import { DEFAULT_SETTINGS, SMTP_PRESETS } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';

const PROVIDER_COLORS: Record<SmtpProvider, string> = {
  gmail: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  zoho: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  outlook: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  custom: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
};

const PROVIDER_HELP: Record<SmtpProvider, string> = {
  gmail: 'Go to Google Account > Security > 2-Step Verification > App Passwords',
  zoho: 'Go to Zoho Mail > Settings > Security > App Passwords',
  outlook: 'Go to Microsoft Account > Security > App Passwords',
  custom: '',
};

interface NewAccountForm {
  provider: SmtpProvider;
  label: string;
  email: string;
  username: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  dailyLimit: number;
}

function defaultNewAccount(provider: SmtpProvider = 'gmail'): NewAccountForm {
  const preset = SMTP_PRESETS[provider];
  return {
    provider,
    label: '',
    email: '',
    username: '',
    password: '',
    smtpHost: preset.smtpHost || '',
    smtpPort: preset.smtpPort || 587,
    smtpSecure: preset.smtpSecure ?? false,
    imapHost: preset.imapHost || '',
    imapPort: preset.imapPort || 993,
    imapSecure: preset.imapSecure ?? true,
    dailyLimit: preset.dailyLimit || 100,
  };
}

export default function SettingsPage() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // SMTP accounts state
  const [smtpAccounts, setSmtpAccounts] = useState<SmtpAccount[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccount, setNewAccount] = useState<NewAccountForm>(defaultNewAccount());
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadSmtpAccounts = useCallback(async () => {
    try {
      const accounts = await getAllSmtpAccounts();
      setSmtpAccounts(accounts);
    } catch (err) {
      console.error('Failed to load SMTP accounts:', err);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try { const s = await getSettings(); setSettings(s); }
      catch (err) { console.error('Failed to load settings:', err); }
      finally { setLoading(false); }
    }
    load();
    loadSmtpAccounts();
  }, [loadSmtpAccounts]);

  async function handleSave() {
    setSaving(true);
    try { await saveSettings(settings); addToast('Settings saved'); }
    catch { addToast('Failed to save settings', 'error'); }
    finally { setSaving(false); }
  }

  async function handleTestConnection() {
    if (!newAccount.smtpHost || !newAccount.username || !newAccount.password) {
      addToast('Fill in SMTP host, username, and password first', 'error');
      return;
    }
    setTestingConnection(true);
    try {
      const res = await fetch('/api/smtp-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          smtpHost: newAccount.smtpHost,
          smtpPort: newAccount.smtpPort,
          smtpSecure: newAccount.smtpSecure,
          username: newAccount.username || newAccount.email,
          password: newAccount.password,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('Connection successful! SMTP server is reachable.');
      } else {
        addToast(data.error || 'Connection failed', 'error');
      }
    } catch {
      addToast('Failed to test connection', 'error');
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleSaveAccount() {
    if (!newAccount.email || !newAccount.password) {
      addToast('Email and password are required', 'error');
      return;
    }
    setSavingAccount(true);
    try {
      const res = await fetch('/api/smtp-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          provider: newAccount.provider,
          email: newAccount.email,
          username: newAccount.username || newAccount.email,
          password: newAccount.password,
          label: newAccount.label || `${newAccount.provider.charAt(0).toUpperCase() + newAccount.provider.slice(1)} - ${newAccount.email}`,
          smtpHost: newAccount.smtpHost,
          smtpPort: newAccount.smtpPort,
          smtpSecure: newAccount.smtpSecure,
          imapHost: newAccount.imapHost,
          imapPort: newAccount.imapPort,
          imapSecure: newAccount.imapSecure,
          dailyLimit: newAccount.dailyLimit,
        }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('Account added successfully');
        setNewAccount(defaultNewAccount());
        setShowAddForm(false);
        await loadSmtpAccounts();
      } else {
        addToast(data.error || 'Failed to add account', 'error');
      }
    } catch {
      addToast('Failed to save account', 'error');
    } finally {
      setSavingAccount(false);
    }
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm('Are you sure you want to remove this email account?')) return;
    setDeletingId(id);
    try {
      const res = await fetch('/api/smtp-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('Account removed');
        await loadSmtpAccounts();
      } else {
        addToast(data.error || 'Failed to remove account', 'error');
      }
    } catch {
      addToast('Failed to remove account', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    setTogglingId(id);
    try {
      const res = await fetch('/api/smtp-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggleActive', id, isActive }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(isActive ? 'Account activated' : 'Account deactivated');
        await loadSmtpAccounts();
      } else {
        addToast(data.error || 'Failed to update account', 'error');
      }
    } catch {
      addToast('Failed to update account', 'error');
    } finally {
      setTogglingId(null);
    }
  }

  function handleProviderChange(provider: SmtpProvider) {
    const preset = SMTP_PRESETS[provider];
    setNewAccount(prev => ({
      ...prev,
      provider,
      smtpHost: preset.smtpHost || '',
      smtpPort: preset.smtpPort || 587,
      smtpSecure: preset.smtpSecure ?? false,
      imapHost: preset.imapHost || '',
      imapPort: preset.imapPort || 993,
      imapSecure: preset.imapSecure ?? true,
      dailyLimit: preset.dailyLimit || 100,
    }));
  }

  async function handleExport() {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `leadgen-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      addToast('Data exported successfully');
    } catch { addToast('Failed to export data', 'error'); }
  }

  async function handleImport() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importAllData(data);
        addToast('Data imported successfully');
        window.location.reload();
      } catch { addToast('Failed to import data', 'error'); }
    };
    input.click();
  }

  async function handleClearAll() {
    if (!confirm('Are you sure you want to delete ALL data? This cannot be undone.')) return;
    if (!confirm('Really delete everything? Last chance!')) return;
    try { await clearAllData(); addToast('All data cleared'); window.location.reload(); }
    catch { addToast('Failed to clear data', 'error'); }
  }

  async function handleLoadSample() {
    try {
      const samples = generateSampleLeads();
      for (const account of samples) await addAccount(account);
      await addActivity(createActivity('lead_added', `Loaded ${samples.length} sample accounts`));
      addToast(`Loaded ${samples.length} sample accounts`);
    } catch { addToast('Failed to load sample data', 'error'); }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Configure your profile and preferences</p>
      </div>

      {/* Profile */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Your Profile</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your Name</label>
              <input type="text" value={settings.name} onChange={e => setSettings(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Your Email</label>
              <input type="email" value={settings.email} onChange={e => setSettings(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="you@example.com" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
            <input type="tel" value={settings.phone} onChange={e => setSettings(prev => ({ ...prev, phone: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="305-555-0123" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Address</label>
            <input type="text" value={settings.businessAddress} onChange={e => setSettings(prev => ({ ...prev, businessAddress: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="123 Main St, Miami, FL 33101" />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Required for CAN-SPAM compliance. Appears in email footers.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Offering</label>
            <input type="text" value={settings.serviceOffering} onChange={e => setSettings(prev => ({ ...prev, serviceOffering: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="Website development and digital marketing" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Value Proposition</label>
            <textarea value={settings.valueProp} onChange={e => setSettings(prev => ({ ...prev, valueProp: e.target.value }))} rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="I help local businesses get more customers through..." />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This appears in your emails as {'{value_prop}'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Location</label>
            <input type="text" value={settings.targetLocation} onChange={e => setSettings(prev => ({ ...prev, targetLocation: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="Miami, FL" />
          </div>
        </div>
      </div>

      {/* Google Places API */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Google Places API</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Required for searching businesses. Get a free key from Google Cloud Console (includes $200/month free credit).</p>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
          <input type="password" value={settings.googleApiKey || ''} onChange={e => setSettings(prev => ({ ...prev, googleApiKey: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="AIzaSy..." />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enable &quot;Places API&quot; and &quot;Places API (New)&quot; in your Google Cloud project.</p>
        </div>
        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-xs font-semibold text-green-800 dark:text-green-200 mb-1">Zero Cost</p>
          <p className="text-xs text-green-700 dark:text-green-300">Google provides $200/month free credit. A search of 20 results costs ~$0.37. Results are cached for 7 days — repeat searches cost nothing.</p>
        </div>
      </div>

      {/* Email Accounts */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Email Accounts</h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">{smtpAccounts.length} configured</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Add multiple email accounts for sending. Supports Gmail, Zoho, Outlook, and custom SMTP servers. Accounts rotate automatically to spread sending across providers.
        </p>

        {/* Account list */}
        {smtpAccounts.length > 0 && (
          <div className="space-y-3 mb-4">
            {smtpAccounts.map(account => (
              <div key={account.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PROVIDER_COLORS[account.provider]}`}>
                      {account.provider.charAt(0).toUpperCase() + account.provider.slice(1)}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{account.email}</span>
                    {account.isActive ? (
                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-green-500" title="Active" />
                    ) : (
                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-gray-400" title="Inactive" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {account.sendCount} / {account.dailyLimit}
                    </span>
                    <button
                      onClick={() => handleToggleActive(account.id, !account.isActive)}
                      disabled={togglingId === account.id}
                      className={`px-2 py-1 rounded text-xs font-medium disabled:opacity-50 ${
                        account.isActive
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
                          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                      }`}
                    >
                      {togglingId === account.id ? '...' : account.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteAccount(account.id)}
                      disabled={deletingId === account.id}
                      className="px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                    >
                      {deletingId === account.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
                {account.label && account.label !== `${account.provider} - ${account.email}` && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{account.label}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {smtpAccounts.length === 0 && !showAddForm && (
          <div className="text-center py-6 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">No email accounts configured yet.</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Add an account to start sending emails.</p>
          </div>
        )}

        {/* Add Account button */}
        {!showAddForm && (
          <button
            onClick={() => { setNewAccount(defaultNewAccount()); setShowAddForm(true); }}
            className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 text-sm font-medium"
          >
            Add Account
          </button>
        )}

        {/* Add Account form */}
        {showAddForm && (
          <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New Email Account</h3>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">Cancel</button>
            </div>

            <div className="space-y-3">
              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <select
                  value={newAccount.provider}
                  onChange={e => handleProviderChange(e.target.value as SmtpProvider)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  <option value="gmail">Gmail</option>
                  <option value="zoho">Zoho</option>
                  <option value="outlook">Outlook</option>
                  <option value="custom">Custom SMTP</option>
                </select>
              </div>

              {/* Provider-specific help */}
              {PROVIDER_HELP[newAccount.provider] && (
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-xs text-amber-800 dark:text-amber-200">{PROVIDER_HELP[newAccount.provider]}</p>
                </div>
              )}

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Label</label>
                <input
                  type="text"
                  value={newAccount.label}
                  onChange={e => setNewAccount(prev => ({ ...prev, label: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  placeholder="My Gmail"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={newAccount.email}
                  onChange={e => {
                    const email = e.target.value;
                    setNewAccount(prev => ({
                      ...prev,
                      email,
                      username: prev.username === '' || prev.username === prev.email ? email : prev.username,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  placeholder="you@gmail.com"
                />
              </div>

              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  value={newAccount.username}
                  onChange={e => setNewAccount(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  placeholder="Usually the same as your email"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Defaults to your email address if left empty.</p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">App Password</label>
                <input
                  type="password"
                  value={newAccount.password}
                  onChange={e => setNewAccount(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                  placeholder="xxxx xxxx xxxx xxxx"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Use an App Password, not your regular password. The password is encrypted before storage.</p>
              </div>

              {/* Custom SMTP fields */}
              {newAccount.provider === 'custom' && (
                <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">SMTP Server Settings</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Host</label>
                      <input
                        type="text"
                        value={newAccount.smtpHost}
                        onChange={e => setNewAccount(prev => ({ ...prev, smtpHost: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Port</label>
                      <input
                        type="number"
                        value={newAccount.smtpPort}
                        onChange={e => setNewAccount(prev => ({ ...prev, smtpPort: parseInt(e.target.value) || 587 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newAccount.smtpSecure}
                      onChange={e => setNewAccount(prev => ({ ...prev, smtpSecure: e.target.checked }))}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <label className="text-sm text-gray-700 dark:text-gray-300">Use SSL/TLS (port 465 typically uses SSL)</label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IMAP Host</label>
                      <input
                        type="text"
                        value={newAccount.imapHost}
                        onChange={e => setNewAccount(prev => ({ ...prev, imapHost: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        placeholder="imap.example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IMAP Port</label>
                      <input
                        type="number"
                        value={newAccount.imapPort}
                        onChange={e => setNewAccount(prev => ({ ...prev, imapPort: parseInt(e.target.value) || 993 }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Daily limit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Daily Send Limit</label>
                <input
                  type="number"
                  min={1}
                  max={2000}
                  value={newAccount.dailyLimit}
                  onChange={e => setNewAccount(prev => ({ ...prev, dailyLimit: parseInt(e.target.value) || 100 }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum emails per day for this account. Pre-filled based on provider defaults.</p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection || !newAccount.email || !newAccount.password}
                  className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testingConnection ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  onClick={handleSaveAccount}
                  disabled={savingAccount || !newAccount.email || !newAccount.password}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingAccount ? 'Saving...' : 'Save Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* IMAP Reply Detection */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">IMAP Reply Detection</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Automatically detect replies from your inbox and update lead statuses.</p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.imapPollingEnabled}
              onChange={e => setSettings(prev => ({ ...prev, imapPollingEnabled: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable IMAP Polling</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Periodically check your inbox for replies to sent emails</p>
            </div>
          </label>
          {settings.imapPollingEnabled && (
            <div className="ml-7">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Polling Interval (minutes)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={settings.imapPollingIntervalMinutes}
                onChange={e => setSettings(prev => ({ ...prev, imapPollingIntervalMinutes: Math.min(60, Math.max(1, parseInt(e.target.value) || 5)) }))}
                className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>
          )}
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-200">Automatically detects replies from your inbox. Requires IMAP host configured on at least one account.</p>
          </div>
        </div>
      </div>

      {/* Outreach Settings */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Outreach Settings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Daily Email Goal</label>
            <input type="number" min={1} max={100} value={settings.dailyEmailGoal} onChange={e => setSettings(prev => ({ ...prev, dailyEmailGoal: parseInt(e.target.value) || 20 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Follow-up After (days)</label>
            <input type="number" min={1} max={30} value={settings.followUpDays} onChange={e => setSettings(prev => ({ ...prev, followUpDays: parseInt(e.target.value) || 5 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Daily Send Limit</label>
            <input type="number" min={1} max={200} value={settings.dailySendLimit} onChange={e => setSettings(prev => ({ ...prev, dailySendLimit: Math.min(200, Math.max(1, parseInt(e.target.value) || 50)) }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Maximum emails you can send per day (1-200). Prevents account suspension.</p>
          </div>
          <div className="flex items-center">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={settings.warmupEnabled} onChange={e => setSettings(prev => ({ ...prev, warmupEnabled: e.target.checked, warmupDayCount: e.target.checked ? prev.warmupDayCount : 0 }))}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Warmup</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">Gradually increase daily sends to build sender reputation</p>
              </div>
            </label>
          </div>
        </div>
        {settings.warmupEnabled && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Warmup is active. Day {settings.warmupDayCount} of warmup. Send limits will gradually increase from 5 to your daily limit as your sender reputation builds.
            </p>
          </div>
        )}
      </div>

      {/* Unsubscribe Message */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Unsubscribe Message</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">This message is appended to the footer of every outgoing email for CAN-SPAM compliance.</p>
        <div>
          <textarea value={settings.unsubscribeMessage} onChange={e => setSettings(prev => ({ ...prev, unsubscribeMessage: e.target.value }))} rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            placeholder='If you don&apos;t want to receive emails from me, simply reply with "unsubscribe" and I&apos;ll remove you from my list immediately.' />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">A clear opt-out mechanism is required by CAN-SPAM law for commercial emails.</p>
        </div>
      </div>

      <div className="mb-8">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Data Management */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Data Management</h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <button onClick={handleExport} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium">Export All Data (JSON)</button>
            <button onClick={handleImport} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium">Import Data (JSON)</button>
            <button onClick={handleLoadSample} className="px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 text-sm font-medium">Load Sample Data (15 leads)</button>
          </div>
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button onClick={handleClearAll} className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 text-sm font-medium">Clear All Data</button>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This will permanently delete all leads, campaigns, emails, and settings.</p>
          </div>
        </div>
      </div>

      {/* Template Variables */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Template Variables</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">These variables are automatically replaced in your email templates:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {[
            ['{business_name}', 'Lead business name'], ['{contact_name}', 'Contact person name'],
            ['{first_name}', 'Contact first name'], ['{industry}', 'Lead industry'],
            ['{location}', 'Lead location'], ['{website}', 'Lead website URL'],
            ['{your_name}', 'Your name'], ['{your_email}', 'Your email'],
            ['{service_offering}', 'Your service offering'], ['{value_prop}', 'Your value proposition'],
          ].map(([variable, desc]) => (
            <div key={variable} className="flex items-center gap-2 py-1">
              <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-blue-600 dark:text-blue-400">{variable}</code>
              <span className="text-gray-600 dark:text-gray-400 text-xs">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
