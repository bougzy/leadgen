'use client';

import { useEffect, useState } from 'react';
import { getScheduledEmails, getAllLeads, updateScheduledEmail } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import type { ScheduledEmail, Lead } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

type TabKey = 'failed' | 'pending' | 'sent';

const TAB_CONFIG: { key: TabKey; label: string }[] = [
  { key: 'failed', label: 'Failed' },
  { key: 'pending', label: 'Pending' },
  { key: 'sent', label: 'Sent' },
];

const STATUS_BADGE: Record<ScheduledEmail['status'], string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

type ErrorCategory = 'Authentication' | 'Bounced' | 'Rate Limited' | 'Timeout' | 'Other' | 'Unknown';

const ERROR_CATEGORY_BADGE: Record<ErrorCategory, string> = {
  'Authentication': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Bounced': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'Rate Limited': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'Timeout': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  'Other': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  'Unknown': 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

function getErrorCategory(error?: string): ErrorCategory {
  if (!error) return 'Unknown';
  if (error.includes('auth') || error.includes('AUTHENTICATIONFAILED') || error.includes('Invalid login')) return 'Authentication';
  if (/\b(550|551|552|553|554)\b/.test(error)) return 'Bounced';
  if (error.includes('rate') || error.includes('limit')) return 'Rate Limited';
  if (error.includes('timeout') || error.includes('ETIMEDOUT')) return 'Timeout';
  return 'Other';
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ScheduledPage() {
  const { addToast } = useToast();
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [emails, allLeads] = await Promise.all([
          getScheduledEmails(),
          getAllLeads(),
        ]);
        setScheduledEmails(emails);
        setLeads(allLeads);
        // Auto-select failed tab if there are failed emails, otherwise pending
        const hasFailed = emails.some(e => e.status === 'failed');
        setActiveTab(prev => prev ?? (hasFailed ? 'failed' : 'pending'));
      } catch (err) {
        console.error('Failed to load scheduled emails:', err);
        addToast('Failed to load scheduled emails', 'error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const leadsById = leads.reduce<Record<string, Lead>>((acc, lead) => {
    acc[lead.id] = lead;
    return acc;
  }, {});

  const pendingEmails = scheduledEmails.filter(e => e.status === 'pending');
  const sentEmails = scheduledEmails.filter(e => e.status === 'sent');
  const failedEmails = scheduledEmails.filter(e => e.status === 'failed');

  const tabEmails: Record<TabKey, ScheduledEmail[]> = {
    pending: pendingEmails,
    sent: sentEmails,
    failed: failedEmails,
  };

  const resolvedTab = activeTab ?? 'pending';
  const currentEmails = tabEmails[resolvedTab];

  async function handleCancel(email: ScheduledEmail) {
    setActionLoadingId(email.id);
    try {
      const updated: ScheduledEmail = { ...email, status: 'cancelled' };
      await updateScheduledEmail(updated);
      setScheduledEmails(prev => prev.map(e => e.id === email.id ? updated : e));
      addToast('Scheduled email cancelled');
    } catch {
      addToast('Failed to cancel email', 'error');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRetry(email: ScheduledEmail) {
    setActionLoadingId(email.id);
    try {
      const updated: ScheduledEmail = { ...email, status: 'pending', error: undefined };
      await updateScheduledEmail(updated);
      setScheduledEmails(prev => prev.map(e => e.id === email.id ? updated : e));
      addToast('Email re-queued for sending');
    } catch {
      addToast('Failed to retry email', 'error');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRetryAllFailed() {
    const failed = scheduledEmails.filter(e => e.status === 'failed');
    if (failed.length === 0) return;
    setRetryingAll(true);
    try {
      let count = 0;
      for (const email of failed) {
        const updated: ScheduledEmail = { ...email, status: 'pending', error: undefined };
        await updateScheduledEmail(updated);
        setScheduledEmails(prev => prev.map(e => e.id === email.id ? updated : e));
        count++;
      }
      addToast(`Re-queued ${count} emails for sending`);
    } catch {
      addToast('Failed to retry some emails', 'error');
    } finally {
      setRetryingAll(false);
    }
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Scheduled Emails</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">View and manage your scheduled email queue</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Scheduled</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{scheduledEmails.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Pending</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{pendingEmails.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-sm font-medium text-green-600 dark:text-green-400">Sent</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{sentEmails.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{failedEmails.length}</p>
        </div>
      </div>

      {scheduledEmails.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No Scheduled Emails"
          description="You haven't scheduled any emails yet. Go to the Email Generator to schedule emails for your leads."
          actionLabel="Go to Emails"
          onAction={() => window.location.href = '/emails'}
        />
      ) : (
        <>
          {/* Tabs */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="flex border-b border-gray-200 dark:border-gray-800">
              {TAB_CONFIG.map(tab => {
                const count = tabEmails[tab.key].length;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      resolvedTab === tab.key
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Retry All Failed button */}
            {resolvedTab === 'failed' && failedEmails.length > 0 && (
              <div className="px-4 pt-4 flex justify-end">
                <button
                  onClick={handleRetryAllFailed}
                  disabled={retryingAll}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {retryingAll ? 'Retrying...' : `Retry All Failed (${failedEmails.length})`}
                </button>
              </div>
            )}

            {/* Email Cards */}
            <div className="p-4">
              {currentEmails.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    No {resolvedTab} emails
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentEmails.map(email => {
                    const lead = leadsById[email.leadId];
                    const isFollowUp = email.sequenceId != null && email.stepIndex != null;
                    const errorCategory = email.status === 'failed' ? getErrorCategory(email.error) : null;

                    return (
                      <div
                        key={email.id}
                        className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {/* Subject */}
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {email.subject}
                            </h3>

                            {/* Recipient */}
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              To: <span className="font-medium text-gray-800 dark:text-gray-200">{email.to}</span>
                            </p>

                            {/* Lead Name */}
                            {lead && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                Lead: <span className="font-medium text-gray-700 dark:text-gray-300">{lead.name}</span>
                                {lead.contactName && (
                                  <span className="text-gray-400 dark:text-gray-500"> ({lead.contactName})</span>
                                )}
                              </p>
                            )}

                            {/* Scheduled Date */}
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                              Scheduled: {formatDateTime(email.scheduledAt)}
                            </p>

                            {/* Sent timestamp */}
                            {email.status === 'sent' && email.sentAt && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                                Sent: {formatDateTime(email.sentAt)}
                              </p>
                            )}

                            {/* Error message (truncated to 100 chars) */}
                            {email.status === 'failed' && email.error && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
                                Error: {email.error.length > 100 ? email.error.slice(0, 100) + '...' : email.error}
                              </p>
                            )}

                            {/* Error category badge */}
                            {email.status === 'failed' && errorCategory && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1.5 ${ERROR_CATEGORY_BADGE[errorCategory]}`}>
                                {errorCategory}
                              </span>
                            )}

                            {/* SMTP Account ID */}
                            {email.status === 'failed' && email.smtpAccountId && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                SMTP Account: <span className="font-mono text-gray-600 dark:text-gray-300">{email.smtpAccountId}</span>
                              </p>
                            )}

                            {/* Follow-up sequence info */}
                            {isFollowUp && (
                              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                                Follow-up sequence step {(email.stepIndex! + 1)}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            {/* Status Badge */}
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[email.status]}`}>
                              {email.status.charAt(0).toUpperCase() + email.status.slice(1)}
                            </span>

                            {/* Action Buttons */}
                            {resolvedTab === 'pending' && (
                              <button
                                onClick={() => handleCancel(email)}
                                disabled={actionLoadingId === email.id}
                                className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {actionLoadingId === email.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            )}

                            {resolvedTab === 'failed' && (
                              <button
                                onClick={() => handleRetry(email)}
                                disabled={actionLoadingId === email.id || retryingAll}
                                className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {actionLoadingId === email.id ? 'Retrying...' : 'Retry'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
