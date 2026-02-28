'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getAllAccounts, getSettings, addEmail, updateAccount, addActivity, addScheduledEmail, getTodaySendCount, incrementSendLog, isEmailUnsubscribed, getActiveSmtpAccounts } from '@/lib/db';
import { generateEmails } from '@/lib/templates';
import type { GeneratedEmail } from '@/lib/templates';
import { getScoreColor, getScoreBgColor, getScoreLabel } from '@/lib/scoring';
import { generateId, createActivity, copyToClipboard, createMailtoLink, createGmailLink, appendUnsubscribeFooter, getWarmupLimit } from '@/lib/utils';
import type { Account, UserSettings, ScheduledEmail, SmtpAccount } from '@/types';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';

function EmailContent() {
  const searchParams = useSearchParams();
  const { addToast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [smtpAccounts, setSmtpAccounts] = useState<SmtpAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [activeVariation, setActiveVariation] = useState<number>(0);
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);

  // Schedule send state
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [l, s, smtpAccts] = await Promise.all([getAllAccounts(), getSettings(), getActiveSmtpAccounts()]);
        setAccounts(l);
        setSettings(s);
        setSmtpAccounts(smtpAccts);
        const paramId = searchParams.get('accountId') || searchParams.get('leadId');
        if (paramId && l.find(account => account.id === paramId)) {
          setSelectedAccountId(paramId);
        }
      } catch (err) {
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [searchParams]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  function handleGenerate() {
    if (!selectedAccount || !settings) return;
    setGenerating(true);
    setTimeout(() => {
      const emails = generateEmails(selectedAccount, settings);
      setGeneratedEmails(emails);
      setActiveVariation(0);
      if (emails.length > 0) {
        setEditedSubject(emails[0].subject);
        setEditedBody(emails[0].body);
      }
      setIsEditing(false);
      setGenerating(false);
    }, 500);
  }

  function handleVariationChange(idx: number) {
    setActiveVariation(idx);
    if (generatedEmails[idx]) {
      setEditedSubject(generatedEmails[idx].subject);
      setEditedBody(generatedEmails[idx].body);
    }
    setIsEditing(false);
  }

  async function handleCopy() {
    const text = `Subject: ${editedSubject}\n\n${editedBody}`;
    const ok = await copyToClipboard(text);
    if (ok) addToast('Email copied to clipboard');
    else addToast('Failed to copy', 'error');
  }

  function handleOpenGmail() {
    if (!selectedAccount) return;
    window.open(createGmailLink(selectedAccount.contactEmail || '', editedSubject, editedBody), '_blank');
  }

  function handleOpenMailto() {
    if (!selectedAccount) return;
    window.location.href = createMailtoLink(selectedAccount.contactEmail || '', editedSubject, editedBody);
  }

  async function saveEmailAndUpdateAccount(trackingId?: string) {
    if (!selectedAccount || !settings) return;
    const email = {
      id: generateId(),
      accountId: selectedAccount.id,
      subject: editedSubject,
      body: editedBody,
      variation: generatedEmails[activeVariation]?.variation || 'medium' as const,
      status: 'sent' as const,
      templateUsed: generatedEmails[activeVariation]?.templateUsed || 'custom',
      createdAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      trackingId,
    };
    await addEmail(email);
    const updatedAccount = {
      ...selectedAccount,
      lifecycleStage: selectedAccount.lifecycleStage === 'prospect' ? 'contacted' as const : selectedAccount.lifecycleStage,
      lastContacted: new Date().toISOString(),
    };
    await updateAccount(updatedAccount);
    await addActivity(createActivity('email_sent', `Sent email to ${selectedAccount.businessName}`, selectedAccount.id));
    setAccounts(prev => prev.map(a => a.id === updatedAccount.id ? updatedAccount : a));
  }

  async function handleMarkSent() {
    if (!selectedAccount || !settings) return;
    try {
      await saveEmailAndUpdateAccount();
      const templateId = generatedEmails[activeVariation]?.templateUsed;
      if (templateId) {
        const { updateTemplateStats } = await import('@/lib/db');
        await updateTemplateStats(templateId, 'sent');
      }
      addToast('Email marked as sent');
    } catch {
      addToast('Failed to save email', 'error');
    }
  }

  async function handleSendEmail() {
    if (!selectedAccount || !settings) return;
    if (!selectedAccount.contactEmail) {
      addToast('This account has no email address', 'error');
      return;
    }
    if (smtpAccounts.length === 0 && (!settings.smtpEmail || !settings.smtpPassword)) {
      addToast('Configure SMTP accounts in Settings first', 'error');
      return;
    }

    // Verify email before sending
    try {
      const verifyRes = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedAccount.contactEmail }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.valid) {
        addToast(`Invalid email: ${verifyData.reason}`, 'error');
        return;
      }
    } catch {
      // If verification fails, continue with sending (non-blocking)
    }

    // Check unsubscribe list
    const unsubscribed = await isEmailUnsubscribed(selectedAccount.contactEmail);
    if (unsubscribed) {
      addToast('This email address has unsubscribed and cannot receive emails', 'error');
      return;
    }

    // Check daily send limit (warmup-aware)
    const todayCount = await getTodaySendCount();
    const effectiveLimit = settings.warmupEnabled
      ? Math.min(settings.dailySendLimit, getWarmupLimit(settings.warmupDayCount))
      : settings.dailySendLimit;
    if (todayCount >= effectiveLimit) {
      addToast(`Daily send limit reached (${todayCount}/${effectiveLimit}). Try again tomorrow.`, 'error');
      return;
    }

    setSending(true);
    try {
      const trackingId = generateId();

      // Append CAN-SPAM unsubscribe footer
      const bodyWithFooter = appendUnsubscribeFooter(
        editedBody,
        selectedAccount.contactEmail,
        settings.unsubscribeMessage,
        settings.businessAddress,
        trackingId
      );

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedAccount.contactEmail,
          subject: editedSubject,
          body: bodyWithFooter,
          ...(smtpAccounts.length > 0
            ? { smtpAccountId: smtpAccounts[0].id }
            : { smtpEmail: settings.smtpEmail, smtpPassword: settings.smtpPassword }),
          trackingId,
        }),
      });
      const data = await res.json();
      if (data.bounced) {
        // Mark email as bounced
        const bouncedEmail = {
          id: generateId(),
          accountId: selectedAccount.id,
          subject: editedSubject,
          body: editedBody,
          variation: generatedEmails[activeVariation]?.variation || 'medium' as const,
          status: 'bounced' as const,
          templateUsed: generatedEmails[activeVariation]?.templateUsed || 'custom',
          createdAt: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          bouncedAt: new Date().toISOString(),
        };
        await addEmail(bouncedEmail);
        await addActivity(createActivity('email_bounced', `Email to ${selectedAccount.businessName} bounced: ${data.bounceType}`, selectedAccount.id));
        addToast(`Email bounced (${data.bounceType}): ${data.error}`, 'error');
        setSending(false);
        return;
      }
      if (data.error) {
        addToast(data.error, 'error');
      } else {
        await saveEmailAndUpdateAccount(trackingId);
        const templateId = generatedEmails[activeVariation]?.templateUsed;
        if (templateId) {
          const { updateTemplateStats } = await import('@/lib/db');
          await updateTemplateStats(templateId, 'sent');
        }
        // Increment daily send log
        const todayDate = new Date().toISOString().split('T')[0];
        await incrementSendLog(todayDate);
        addToast(`Email sent to ${selectedAccount.contactEmail}!`);
      }
    } catch {
      addToast('Failed to send email', 'error');
    } finally {
      setSending(false);
    }
  }

  async function handleScheduleSend() {
    if (!selectedAccount || !settings) return;
    if (!selectedAccount.contactEmail) {
      addToast('This account has no email address', 'error');
      return;
    }
    if (!scheduleDateTime) {
      addToast('Please select a date and time', 'error');
      return;
    }

    const scheduledDate = new Date(scheduleDateTime);
    if (scheduledDate <= new Date()) {
      addToast('Scheduled time must be in the future', 'error');
      return;
    }

    // Verify email before scheduling
    try {
      const verifyRes = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: selectedAccount.contactEmail }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.valid) {
        addToast(`Invalid email: ${verifyData.reason}`, 'error');
        return;
      }
    } catch {
      // If verification fails, continue (non-blocking)
    }

    // Check unsubscribe list
    const unsubscribed = await isEmailUnsubscribed(selectedAccount.contactEmail);
    if (unsubscribed) {
      addToast('This email address has unsubscribed and cannot receive emails', 'error');
      return;
    }

    try {
      const trackingId = generateId();

      // Append CAN-SPAM unsubscribe footer
      const bodyWithFooter = appendUnsubscribeFooter(
        editedBody,
        selectedAccount.contactEmail,
        settings.unsubscribeMessage,
        settings.businessAddress,
        trackingId
      );

      const scheduled: ScheduledEmail = {
        id: generateId(),
        accountId: selectedAccount.id,
        to: selectedAccount.contactEmail,
        subject: editedSubject,
        body: bodyWithFooter,
        scheduledAt: scheduledDate.toISOString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      await addScheduledEmail(scheduled);
      await addActivity(createActivity('email_scheduled', `Scheduled email to ${selectedAccount.businessName} for ${scheduledDate.toLocaleString()}`, selectedAccount.id));
      addToast(`Email scheduled for ${scheduledDate.toLocaleString()}`);
      setShowSchedulePicker(false);
      setScheduleDateTime('');
    } catch {
      addToast('Failed to schedule email', 'error');
    }
  }

  if (loading) return <LoadingSpinner />;

  // Compute minimum datetime for the picker (now, formatted for datetime-local input)
  const now = new Date();
  const minDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Email Generator</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">Generate personalized cold emails from templates</p>
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon="✉️" title="No Accounts Available" description="Add some accounts first, then come back to generate emails." actionLabel="Go to Accounts" onAction={() => window.location.href = '/leads'} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left panel */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select an Account</label>
              <select value={selectedAccountId} onChange={e => { setSelectedAccountId(e.target.value); setGeneratedEmails([]); }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4">
                <option value="">Choose an account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.businessName} — {a.industry} ({a.leadScore}pts)</option>)}
              </select>

              {selectedAccount && (
                <div className="space-y-3">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <h3 className="font-semibold text-gray-900 dark:text-white">{selectedAccount.businessName}</h3>
                    {selectedAccount.contactName && <p className="text-sm text-gray-600 dark:text-gray-400">{selectedAccount.contactName}</p>}
                    <p className="text-sm text-gray-600 dark:text-gray-400">{selectedAccount.industry} · {selectedAccount.location}</p>
                    {selectedAccount.contactEmail && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedAccount.contactEmail}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${getScoreColor(selectedAccount.leadScore)} ${getScoreBgColor(selectedAccount.leadScore)}`}>Score: {selectedAccount.leadScore}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{getScoreLabel(selectedAccount.leadScore)}</span>
                  </div>
                  {selectedAccount.tags.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Issues:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedAccount.tags.map(tag => (
                          <span key={tag} className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs">{tag.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={handleGenerate} disabled={generating}
                    className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                    {generating ? 'Generating...' : 'Generate Emails'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="lg:col-span-2">
            {generatedEmails.length === 0 ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-12">
                <EmptyState icon="✍️" title="No Email Generated Yet" description={selectedAccount ? 'Click "Generate Emails" to create personalized email variations.' : 'Select an account from the left panel to get started.'} />
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
                <div className="flex border-b border-gray-200 dark:border-gray-800">
                  {generatedEmails.map((email, idx) => (
                    <button key={idx} onClick={() => handleVariationChange(idx)}
                      className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeVariation === idx
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
                      {email.variation.charAt(0).toUpperCase() + email.variation.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="p-6">
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</label>
                    {isEditing ? (
                      <input type="text" value={editedSubject} onChange={e => setEditedSubject(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
                    ) : (
                      <p className="text-gray-900 dark:text-white font-medium">{editedSubject}</p>
                    )}
                  </div>
                  <div className="mb-6">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Body</label>
                    {isEditing ? (
                      <textarea value={editedBody} onChange={e => setEditedBody(e.target.value)} rows={12}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono" />
                    ) : (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{editedBody}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setIsEditing(!isEditing)} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium">{isEditing ? 'Done Editing' : 'Edit'}</button>
                    <button onClick={handleSendEmail} disabled={sending || !selectedAccount?.contactEmail}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                      {sending ? 'Sending...' : 'Send Email'}
                    </button>
                    <button onClick={() => setShowSchedulePicker(!showSchedulePicker)} disabled={!selectedAccount?.contactEmail}
                      className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                      Schedule Send
                    </button>
                    <button onClick={handleCopy} className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Copy Email</button>
                    <button onClick={handleOpenGmail} className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">Open in Gmail</button>
                    <button onClick={handleOpenMailto} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm font-medium">Open in Mail</button>
                    <button onClick={handleMarkSent} className="px-3 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium">Mark as Sent</button>
                  </div>

                  {/* Schedule Send Picker */}
                  {showSchedulePicker && (
                    <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-2">Schedule Email Send</h4>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Date & Time</label>
                          <input
                            type="datetime-local"
                            value={scheduleDateTime}
                            onChange={e => setScheduleDateTime(e.target.value)}
                            min={minDateTime}
                            className="w-full px-3 py-2 border border-purple-300 dark:border-purple-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <button onClick={handleScheduleSend}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium">
                          Confirm Schedule
                        </button>
                        <button onClick={() => { setShowSchedulePicker(false); setScheduleDateTime(''); }}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmailsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <EmailContent />
    </Suspense>
  );
}
