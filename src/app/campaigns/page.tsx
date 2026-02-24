'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAllCampaigns, getAllLeads, addCampaign, updateCampaign, deleteCampaign, addActivity, updateLead, getSettings, addEmail, getTodaySendCount, incrementSendLog, isEmailUnsubscribed, getEmailsByLead, updateEmail, getActiveSmtpAccounts } from '@/lib/db';
import { generateEmails } from '@/lib/templates';
import { generateId, createActivity, formatDate, copyToClipboard, appendUnsubscribeFooter, getWarmupLimit } from '@/lib/utils';
import type { Lead, Campaign, UserSettings, EmailStatus, SmtpAccount } from '@/types';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';

export default function CampaignsPage() {
  const { addToast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [smtpAccounts, setSmtpAccounts] = useState<SmtpAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  const [viewingCampaign, setViewingCampaign] = useState<Campaign | null>(null);
  const [campaignLeads, setCampaignLeads] = useState<Lead[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [c, l, s, accounts] = await Promise.all([getAllCampaigns(), getAllLeads(), getSettings(), getActiveSmtpAccounts()]);
      setCampaigns(c.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      setLeads(l);
      setSettings(s);
      setSmtpAccounts(accounts);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleCreate() {
    if (!newName.trim() || selectedLeadIds.size === 0) {
      addToast('Please enter a name and select leads', 'error');
      return;
    }
    try {
      const emailStatuses: Record<string, EmailStatus> = {};
      selectedLeadIds.forEach(id => { emailStatuses[id] = 'drafted'; });
      const campaign: Campaign = {
        id: generateId(), name: newName.trim(), description: newDesc.trim(),
        leadIds: Array.from(selectedLeadIds), status: 'active', emailStatuses,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      // Cross-campaign deduplication warning
      const activeCampaigns = campaigns.filter(c => c.status === 'active');
      const duplicateLeads: string[] = [];
      for (const id of Array.from(selectedLeadIds)) {
        for (const ac of activeCampaigns) {
          if (ac.leadIds.includes(id) && (ac.emailStatuses[id] === 'drafted' || ac.emailStatuses[id] === 'sent')) {
            const lead = leads.find(l => l.id === id);
            if (lead) duplicateLeads.push(lead.name);
            break;
          }
        }
      }
      if (duplicateLeads.length > 0) {
        const proceed = confirm(`Warning: ${duplicateLeads.length} lead(s) are already in active campaigns:\n${duplicateLeads.slice(0, 5).join(', ')}${duplicateLeads.length > 5 ? `... and ${duplicateLeads.length - 5} more` : ''}\n\nContinue anyway?`);
        if (!proceed) return;
      }

      await addCampaign(campaign);
      await addActivity(createActivity('campaign_created', `Created campaign: ${campaign.name}`, undefined, campaign.id));
      addToast('Campaign created');
      setShowCreate(false); setNewName(''); setNewDesc(''); setSelectedLeadIds(new Set());
      loadData();
    } catch { addToast('Failed to create campaign', 'error'); }
  }

  async function handleDeleteCampaign(id: string) {
    if (!confirm('Delete this campaign?')) return;
    try { await deleteCampaign(id); addToast('Campaign deleted'); loadData(); }
    catch { addToast('Failed to delete campaign', 'error'); }
  }

  function handleView(campaign: Campaign) {
    setViewingCampaign(campaign);
    setCampaignLeads(leads.filter(l => campaign.leadIds.includes(l.id)));
  }

  async function handleEmailStatusChange(campaignId: string, leadId: string, status: EmailStatus) {
    const campaign = campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    const updated = { ...campaign, emailStatuses: { ...campaign.emailStatuses, [leadId]: status }, updatedAt: new Date().toISOString() };
    const allStatuses = Object.values(updated.emailStatuses);
    if (allStatuses.every(s => s === 'sent' || s === 'responded')) updated.status = 'completed';
    await updateCampaign(updated);
    if (status === 'sent') {
      const lead = leads.find(l => l.id === leadId);
      if (lead && lead.status === 'new') await updateLead({ ...lead, status: 'contacted', lastContacted: new Date().toISOString() });
      await addActivity(createActivity('email_sent', `Sent email to ${lead?.name || 'lead'} (campaign: ${campaign.name})`, leadId, campaignId));
    }
    if (status === 'responded') {
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        const leadEmails = await getEmailsByLead(leadId);
        const lastSent = leadEmails.filter(e => e.sentAt).sort((a, b) => new Date(b.sentAt!).getTime() - new Date(a.sentAt!).getTime())[0];
        if (lastSent) {
          await updateEmail({ ...lastSent, respondedAt: new Date().toISOString(), status: 'responded' });
        }
        if (lead.status === 'contacted' || lead.status === 'new') {
          await updateLead({ ...lead, status: 'responded' });
          setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'responded' } : l));
        }
        await addActivity(createActivity('response_received', `${lead.name} responded!`, leadId, campaignId));
      }
    }
    setCampaigns(prev => prev.map(c => c.id === campaignId ? updated : c));
    setViewingCampaign(updated);
    addToast(`Status updated to ${status}`);
  }

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, remaining: 0 });

  async function handleGenerateAndCopy(lead: Lead) {
    if (!settings) return;
    const emails = generateEmails(lead, settings);
    if (emails.length > 0) {
      const email = emails[1];
      const ok = await copyToClipboard(`Subject: ${email.subject}\n\n${email.body}`);
      if (ok) addToast(`Email for ${lead.name} copied!`);
    }
  }

  async function handleSendToLead(lead: Lead, campaignId: string) {
    if (!settings || !lead.email) {
      addToast(lead.email ? 'Configure SMTP accounts in Settings' : `${lead.name} has no email address`, 'error');
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
        body: JSON.stringify({ email: lead.email }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.valid) {
        addToast(`${lead.name}: Invalid email - ${verifyData.reason}`, 'error');
        return;
      }
    } catch {
      // If verification fails, continue with sending (non-blocking)
    }

    // Check unsubscribe list
    const unsubscribed = await isEmailUnsubscribed(lead.email);
    if (unsubscribed) {
      addToast(`${lead.name} has unsubscribed and cannot receive emails`, 'error');
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

    setSendingId(lead.id);
    try {
      const emails = generateEmails(lead, settings);
      const email = emails[1]; // medium variation
      const trackingId = generateId();

      // Append CAN-SPAM unsubscribe footer
      const bodyWithFooter = appendUnsubscribeFooter(
        email.body,
        lead.email,
        settings.unsubscribeMessage,
        settings.businessAddress,
        trackingId
      );

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.email, subject: email.subject, body: bodyWithFooter,
          ...(smtpAccounts.length > 0
            ? { smtpAccountId: smtpAccounts[0].id }
            : { smtpEmail: settings.smtpEmail, smtpPassword: settings.smtpPassword }),
          trackingId,
        }),
      });
      const data = await res.json();
      if (data.error) { addToast(data.error, 'error'); return; }
      await handleEmailStatusChange(campaignId, lead.id, 'sent');
      // Save Email record to IndexedDB
      await addEmail({
        id: generateId(),
        leadId: lead.id,
        campaignId,
        subject: email.subject,
        body: bodyWithFooter,
        variation: 'medium',
        status: 'sent',
        templateUsed: email.templateUsed,
        trackingId,
        createdAt: new Date().toISOString(),
        sentAt: new Date().toISOString(),
      });
      // Increment daily send log
      const todayDate = new Date().toISOString().split('T')[0];
      await incrementSendLog(todayDate);
      addToast(`Sent to ${lead.name}`);
    } catch { addToast('Failed to send', 'error'); }
    finally { setSendingId(null); }
  }

  async function handleSendAll() {
    if (!viewingCampaign || !settings) {
      addToast('Configure SMTP accounts in Settings first', 'error');
      return;
    }
    if (smtpAccounts.length === 0 && (!settings.smtpEmail || !settings.smtpPassword)) {
      addToast('Configure SMTP accounts in Settings first', 'error');
      return;
    }
    const unsent = campaignLeads.filter(l => l.email && viewingCampaign.emailStatuses[l.id] === 'drafted');
    if (unsent.length === 0) { addToast('No unsent emails with addresses', 'info'); return; }
    if (!confirm(`Send emails to ${unsent.length} leads?`)) return;
    setBulkSending(true);
    let sent = 0;
    let skippedUnsubscribed = 0;
    let limitReached = false;

    for (const lead of unsent) {
      // Check daily send limit before each send (warmup-aware)
      const todayCount = await getTodaySendCount();
      const effectiveLimit = settings.warmupEnabled
        ? Math.min(settings.dailySendLimit, getWarmupLimit(settings.warmupDayCount))
        : settings.dailySendLimit;
      const remaining = effectiveLimit - todayCount;
      setBulkProgress({ current: sent + 1, total: unsent.length, remaining });

      if (todayCount >= effectiveLimit) {
        addToast(`Daily send limit reached (${effectiveLimit}). Pausing bulk send.`, 'error');
        limitReached = true;
        break;
      }

      // Check unsubscribe list for each lead
      if (lead.email) {
        const unsubscribed = await isEmailUnsubscribed(lead.email);
        if (unsubscribed) {
          skippedUnsubscribed++;
          continue;
        }
      }

      try {
        const emails = generateEmails(lead, settings);
        // A/B testing: alternate between Group A (variation 0 subject) and Group B (variation 1 subject)
        const abGroup: 'A' | 'B' = sent % 2 === 0 ? 'A' : 'B';
        const email = abGroup === 'A' ? emails[0] : emails[1];
        const trackingId = generateId();

        // Append CAN-SPAM unsubscribe footer using the selected variation's body
        const bodyWithFooter = appendUnsubscribeFooter(
          email.body,
          lead.email!,
          settings.unsubscribeMessage,
          settings.businessAddress,
          trackingId
        );

        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: lead.email, subject: email.subject, body: bodyWithFooter,
            ...(smtpAccounts.length > 0
              ? { smtpAccountId: smtpAccounts[0].id }
              : { smtpEmail: settings.smtpEmail, smtpPassword: settings.smtpPassword }),
            trackingId,
          }),
        });
        const data = await res.json();
        if (!data.error) {
          await handleEmailStatusChange(viewingCampaign.id, lead.id, 'sent');
          // Save Email record with A/B test group
          await addEmail({
            id: generateId(),
            leadId: lead.id,
            campaignId: viewingCampaign.id,
            subject: email.subject,
            body: bodyWithFooter,
            variation: abGroup === 'A' ? 'short' : 'medium',
            status: 'sent',
            templateUsed: email.templateUsed,
            trackingId,
            abTestGroup: abGroup,
            createdAt: new Date().toISOString(),
            sentAt: new Date().toISOString(),
          });
          // Increment daily send log
          const todayDate = new Date().toISOString().split('T')[0];
          await incrementSendLog(todayDate);
          sent++;
        }
        // 3 second delay between emails to avoid rate limits
        if (sent < unsent.length) await new Promise(r => setTimeout(r, 3000));
      } catch { /* skip failed */ }
    }
    setBulkSending(false);
    setBulkProgress({ current: 0, total: 0, remaining: 0 });
    let message = `Sent ${sent}/${unsent.length} emails`;
    if (skippedUnsubscribed > 0) message += ` (${skippedUnsubscribed} skipped - unsubscribed)`;
    if (limitReached) message += ' (paused: daily limit reached)';
    addToast(message);
  }

  function toggleLeadSelection(id: string) {
    setSelectedLeadIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  if (loading) return <LoadingSpinner />;

  const getStatusCounts = (campaign: Campaign) => {
    const statuses = Object.values(campaign.emailStatuses);
    return { drafted: statuses.filter(s => s === 'drafted').length, sent: statuses.filter(s => s === 'sent').length, responded: statuses.filter(s => s === 'responded').length, total: statuses.length };
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Campaigns</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{campaigns.length} campaigns</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium w-full sm:w-auto">+ New Campaign</button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState icon="📣" title="No Campaigns Yet" description="Create a campaign to organize your outreach and track emails to multiple leads." actionLabel="Create Campaign" onAction={() => setShowCreate(true)} />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(campaign => {
            const counts = getStatusCounts(campaign);
            const progress = counts.total > 0 ? Math.round(((counts.sent + counts.responded) / counts.total) * 100) : 0;
            return (
              <div key={campaign.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{campaign.name}</h3>
                    {campaign.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{campaign.description}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    campaign.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                    campaign.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                    campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>{campaign.status}</span>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>{counts.total} leads</span><span>{progress}% sent</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="flex gap-2 text-xs text-gray-500 dark:text-gray-400 mb-4">
                  <span>{counts.drafted} drafted</span><span>·</span><span>{counts.sent} sent</span><span>·</span><span>{counts.responded} responded</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span>{formatDate(campaign.createdAt)}</span>
                  <div className="flex gap-2">
                    <button onClick={() => handleView(campaign)} className="px-2 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded font-medium">View</button>
                    <button onClick={() => handleDeleteCampaign(campaign.id)} className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded font-medium">Delete</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Campaign Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create New Campaign" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campaign Name *</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="e.g., Miami Restaurants - Feb 2026" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" placeholder="Brief description..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Select Leads ({selectedLeadIds.size} selected)</label>
            <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              {leads.filter(l => l.status !== 'closed' && l.status !== 'rejected').map(lead => (
                <label key={lead.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                  <input type="checkbox" checked={selectedLeadIds.has(lead.id)} onChange={() => toggleLeadSelection(lead.id)} className="rounded" />
                  <span className="text-sm text-gray-900 dark:text-white">{lead.name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{lead.industry} · {lead.leadScore}pts</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
            <button onClick={handleCreate} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Create Campaign</button>
          </div>
        </div>
      </Modal>

      {/* View Campaign Modal */}
      <Modal isOpen={!!viewingCampaign} onClose={() => setViewingCampaign(null)} title={viewingCampaign?.name || ''} size="xl">
        {viewingCampaign && (
          <div>
            <div className="flex items-center justify-between mb-4">
              {/* Bulk send progress indicator */}
              {bulkSending && bulkProgress.total > 0 && (
                <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>
                    Sending {bulkProgress.current}/{bulkProgress.total} ({bulkProgress.remaining} remaining today)
                  </span>
                </div>
              )}
              {!bulkSending && <div />}
              <button onClick={handleSendAll} disabled={bulkSending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50">
                {bulkSending ? 'Sending...' : 'Send All Unsent'}
              </button>
            </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Lead</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Industry</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Score</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">Email Status</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaignLeads.map(lead => {
                  const emailStatus = viewingCampaign.emailStatuses[lead.id] || 'drafted';
                  return (
                    <tr key={lead.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2.5">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{lead.name}</div>
                        {lead.email && <div className="text-xs text-gray-500">{lead.email}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-gray-600 dark:text-gray-400">{lead.industry}</td>
                      <td className="px-3 py-2.5 text-center text-sm font-bold">{lead.leadScore}</td>
                      <td className="px-3 py-2.5 text-center">
                        <select value={emailStatus} onChange={e => handleEmailStatusChange(viewingCampaign.id, lead.id, e.target.value as EmailStatus)}
                          className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-xs text-gray-900 dark:text-white">
                          <option value="drafted">Drafted</option><option value="sent">Sent</option><option value="responded">Responded</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {lead.email && emailStatus === 'drafted' && (
                            <button onClick={() => handleSendToLead(lead, viewingCampaign.id)} disabled={sendingId === lead.id}
                              className="px-2 py-1 text-xs font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50">
                              {sendingId === lead.id ? 'Sending...' : 'Send'}
                            </button>
                          )}
                          <button onClick={() => handleGenerateAndCopy(lead)} className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">Copy</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
