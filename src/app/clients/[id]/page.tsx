'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  getAccount,
  updateAccount,
  getLatestGbpAudit,
  getGbpPostsByAccount,
  getRankKeywordsByAccount,
  getSocialContentsByAccount,
  getClientReviewsByAccount,
  getClientCustomersByAccount,
  getReferralsByAccount,
  getRetentionRemindersByAccount,
} from '@/lib/db';
import { generateId } from '@/lib/utils';
import type { Account, LifecycleStage, GbpAudit, GbpPost, RankKeyword, SocialContent, ClientReview, ClientCustomer, ReferralRecord, RetentionReminder } from '@/types';
import { LIFECYCLE_STAGES, INDUSTRIES } from '@/types';

const CLIENT_LIFECYCLE_STAGES = LIFECYCLE_STAGES.filter(s =>
  ['won', 'active_client', 'paused', 'churned'].includes(s.value)
);
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface ModuleSummary {
  gbpAudit: GbpAudit | undefined;
  gbpPosts: GbpPost[];
  keywords: RankKeyword[];
  socialContents: SocialContent[];
  reviews: ClientReview[];
  customers: ClientCustomer[];
  referrals: ReferralRecord[];
  reminders: RetentionReminder[];
}

const NAV_TABS = [
  { key: 'overview', label: 'Overview', icon: '📊', suffix: '' },
  { key: 'gbp', label: 'GBP', icon: '📍', suffix: '/gbp' },
  { key: 'seo', label: 'SEO', icon: '🔍', suffix: '/seo' },
  { key: 'social', label: 'Social', icon: '📱', suffix: '/social' },
  { key: 'outreach', label: 'Outreach', icon: '📧', suffix: '/outreach' },
  { key: 'reviews', label: 'Reviews', icon: '⭐', suffix: '/reviews' },
  { key: 'retention', label: 'Retention', icon: '🔄', suffix: '/retention' },
  { key: 'reports', label: 'Reports', icon: '📈', suffix: '/reports' },
];

export default function ClientDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { addToast } = useToast();
  const id = params.id as string;

  const [client, setClient] = useState<Account | null>(null);
  const [summary, setSummary] = useState<ModuleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Account>>({});

  const loadData = useCallback(async () => {
    try {
      const clientData = await getAccount(id);
      if (!clientData) {
        setNotFound(true);
        return;
      }
      setClient(clientData);

      const [gbpAudit, gbpPosts, keywords, socialContents, reviews, customers, referrals, reminders] = await Promise.all([
        getLatestGbpAudit(id),
        getGbpPostsByAccount(id),
        getRankKeywordsByAccount(id),
        getSocialContentsByAccount(id),
        getClientReviewsByAccount(id),
        getClientCustomersByAccount(id),
        getReferralsByAccount(id),
        getRetentionRemindersByAccount(id),
      ]);

      setSummary({ gbpAudit, gbpPosts, keywords, socialContents, reviews, customers, referrals, reminders });
    } catch (err) {
      console.error('Failed to load client data:', err);
      addToast('Failed to load client data', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  function startEditing() {
    if (!client) return;
    setEditForm({
      businessName: client.businessName,
      contactName: client.contactName,
      contactEmail: client.contactEmail || '',
      contactPhone: client.contactPhone || '',
      industry: client.industry,
      location: client.location,
      address: client.address,
      website: client.website || '',
      gbpUrl: client.gbpUrl || '',
      lifecycleStage: client.lifecycleStage,
      notes: client.notes,
      monthlyFee: client.monthlyFee,
    });
    setEditing(true);
  }

  async function handleSaveEdit() {
    if (!client) return;
    try {
      const updated: Account = {
        ...client,
        businessName: (editForm.businessName || client.businessName).trim(),
        contactName: (editForm.contactName || client.contactName || '').trim(),
        contactEmail: editForm.contactEmail?.trim() || undefined,
        contactPhone: editForm.contactPhone?.trim() || undefined,
        industry: editForm.industry || client.industry,
        location: (editForm.location || client.location).trim(),
        address: (editForm.address || client.address || '').trim(),
        website: editForm.website?.trim() || undefined,
        gbpUrl: editForm.gbpUrl?.trim() || undefined,
        lifecycleStage: editForm.lifecycleStage || client.lifecycleStage,
        notes: (editForm.notes ?? client.notes).trim(),
        monthlyFee: editForm.monthlyFee,
        updatedAt: new Date().toISOString(),
      };
      await updateAccount(updated);
      setClient(updated);
      setEditing(false);
      addToast('Client updated successfully');
    } catch (err) {
      console.error('Failed to update client:', err);
      addToast('Failed to update client', 'error');
    }
  }

  if (loading) return <LoadingSpinner />;

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <span className="text-5xl mb-4">🔍</span>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Client Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">This client site does not exist or has been deleted.</p>
        <Link href="/clients" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          Back to Clients
        </Link>
      </div>
    );
  }

  if (!client) return null;

  const statusInfo = LIFECYCLE_STAGES.find(s => s.value === client.lifecycleStage);
  const tabs = NAV_TABS.map(tab => ({
    ...tab,
    href: `/clients/${id}${tab.suffix}`,
  }));

  // Compute module metrics
  const gbpScore = summary?.gbpAudit?.auditScore;
  const lastPostDate = summary?.gbpPosts
    ?.filter(p => p.publishedAt)
    .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime())[0]?.publishedAt;

  const keywordCount = summary?.keywords?.length ?? 0;
  const avgPosition = keywordCount > 0
    ? (summary!.keywords.reduce((sum, kw) => sum + (kw.currentPosition ?? 0), 0) / keywordCount)
    : null;

  const totalSocialPosts = summary?.socialContents?.length ?? 0;
  const postsThisMonth = summary?.socialContents?.filter(p => {
    const d = new Date(p.scheduledDate);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length ?? 0;

  const totalReviews = summary?.reviews?.length ?? 0;
  const avgRating = totalReviews > 0
    ? (summary!.reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews)
    : null;
  const negativeCount = summary?.reviews?.filter(r => r.isNegative).length ?? 0;

  const customerCount = summary?.customers?.length ?? 0;
  const activeReferrals = summary?.referrals?.filter(r => r.status === 'pending' || r.status === 'contacted').length ?? 0;
  const pendingReminders = summary?.reminders?.filter(r => r.status === 'pending').length ?? 0;

  return (
    <div>
      {/* Back Link */}
      <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mb-4 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        Back to Clients
      </Link>

      {/* Client Header */}
      {!editing ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{client.businessName}</h1>
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                  {client.industry}
                </span>
                {statusInfo && (
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
                    {statusInfo.label}
                  </span>
                )}
              </div>

              {client.location && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  📍 {client.location}
                  {client.address && client.address !== client.location ? ` — ${client.address}` : ''}
                </p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                {client.contactName && (
                  <span>👤 {client.contactName}</span>
                )}
                {client.contactEmail && (
                  <a href={`mailto:${client.contactEmail}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    ✉ {client.contactEmail}
                  </a>
                )}
                {client.contactPhone && (
                  <a href={`tel:${client.contactPhone}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                    📞 {client.contactPhone}
                  </a>
                )}
                {client.monthlyFee != null && (
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    ${client.monthlyFee.toLocaleString()}/mo
                  </span>
                )}
              </div>

              {client.website && (
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block">
                  {client.website}
                </a>
              )}
            </div>

            <button
              onClick={startEditing}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              Edit Client
            </button>
          </div>
        </div>
      ) : (
        /* Inline Edit Mode */
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-300 dark:border-blue-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit Client</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Name</label>
                <input
                  type="text"
                  value={editForm.businessName || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, businessName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={editForm.contactName || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, contactName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.contactEmail || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, contactEmail: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editForm.contactPhone || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, contactPhone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Industry</label>
                <select
                  value={editForm.industry || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, industry: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
                <input
                  type="text"
                  value={editForm.location || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lifecycle Stage</label>
                <select
                  value={editForm.lifecycleStage || 'active_client'}
                  onChange={e => setEditForm(prev => ({ ...prev, lifecycleStage: e.target.value as LifecycleStage }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                  {CLIENT_LIFECYCLE_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label>
                <input
                  type="url"
                  value={editForm.website || ''}
                  onChange={e => setEditForm(prev => ({ ...prev, website: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monthly Fee ($)</label>
                <input
                  type="number"
                  value={editForm.monthlyFee ?? ''}
                  onChange={e => setEditForm(prev => ({ ...prev, monthlyFee: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="1"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <textarea
                value={editForm.notes || ''}
                onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <nav className="flex gap-1 overflow-x-auto pb-1 mb-6">
        {tabs.map(tab => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              pathname === tab.href
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {tab.icon} {tab.label}
          </Link>
        ))}
      </nav>

      {/* Module Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* GBP Health */}
        <Link
          href={`/clients/${id}/gbp`}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">📍</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">GBP Health</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Audit Score</span>
              <span className={`text-sm font-semibold ${gbpScore != null ? (gbpScore >= 80 ? 'text-green-600 dark:text-green-400' : gbpScore >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400') : 'text-gray-400 dark:text-gray-500'}`}>
                {gbpScore != null ? `${gbpScore}/100` : 'No audit yet'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Last Post</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {lastPostDate
                  ? new Date(lastPostDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : 'No posts yet'}
              </span>
            </div>
          </div>
        </Link>

        {/* Local SEO */}
        <Link
          href={`/clients/${id}/seo`}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🔍</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">Local SEO</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Keywords Tracked</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{keywordCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Avg. Position</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {avgPosition != null ? avgPosition.toFixed(1) : '--'}
              </span>
            </div>
          </div>
        </Link>

        {/* Social Media */}
        <Link
          href={`/clients/${id}/social`}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">📱</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">Social Media</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Posts</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{totalSocialPosts}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">This Month</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{postsThisMonth}</span>
            </div>
          </div>
        </Link>

        {/* B2B Outreach */}
        <Link
          href={`/clients/${id}/outreach`}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">📧</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">B2B Outreach</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Linked Leads</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">--</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Emails Sent</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">--</span>
            </div>
          </div>
        </Link>

        {/* Reviews */}
        <Link
          href={`/clients/${id}/reviews`}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">⭐</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">Reviews</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Reviews</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{totalReviews}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Avg. Rating</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {avgRating != null ? avgRating.toFixed(1) : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Negative</span>
              <span className={`text-sm font-semibold ${negativeCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {negativeCount}
              </span>
            </div>
          </div>
        </Link>

        {/* Retention */}
        <Link
          href={`/clients/${id}/retention`}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
        >
          <div className="flex items-center gap-3 mb-4">
            <span className="text-2xl">🔄</span>
            <h3 className="font-semibold text-gray-900 dark:text-white">Retention</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Customers</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{customerCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Active Referrals</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{activeReferrals}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Pending Reminders</span>
              <span className={`text-sm font-semibold ${pendingReminders > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>
                {pendingReminders}
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
