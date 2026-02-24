'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getAllEmails, getAllLeads, getAllInboxReplies, updateInboxReply } from '@/lib/db';
import { formatRelativeDate, classifyReply } from '@/lib/utils';
import type { ReplyCategory } from '@/lib/utils';
import type { Email, Lead, InboxReply } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Pagination from '@/components/ui/Pagination';

// ========== Types ==========

type FilterType = 'all' | 'opened' | 'clicked' | 'responded' | 'bounced' | 'pending' | 'replies';
type SortType = 'newest' | 'oldest' | 'most_engaged';

interface EmailWithLead extends Email {
  lead?: Lead;
}

// ========== Helpers ==========

function getEngagementScore(email: Email): number {
  let score = 0;
  if (email.sentAt) score += 1;
  if (email.openedAt) score += 2;
  if (email.clickedAt) score += 3;
  if (email.respondedAt) score += 4;
  return score;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ========== Filter Tabs Config ==========

const FILTERS: { key: FilterType; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: '📬' },
  { key: 'opened', label: 'Opened', icon: '👁' },
  { key: 'clicked', label: 'Clicked', icon: '🔗' },
  { key: 'responded', label: 'Responded', icon: '💬' },
  { key: 'bounced', label: 'Bounced', icon: '⚠️' },
  { key: 'pending', label: 'Pending', icon: '⏳' },
  { key: 'replies', label: 'Replies', icon: '📩' },
];

// ========== Status Badge Component ==========

function StatusBadge({ label, date, color }: { label: string; date?: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
      {date && (
        <span className="opacity-75 font-normal">
          {formatShortDate(date)}
        </span>
      )}
    </span>
  );
}

// ========== Stats Bar Component ==========

function StatsBar({ emails }: { emails: Email[] }) {
  const totalSent = emails.filter(e => e.sentAt).length;
  const opened = emails.filter(e => e.openedAt).length;
  const clicked = emails.filter(e => e.clickedAt).length;
  const replied = emails.filter(e => e.respondedAt).length;

  const openRate = totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0;
  const clickRate = totalSent > 0 ? Math.round((clicked / totalSent) * 100) : 0;
  const replyRate = totalSent > 0 ? Math.round((replied / totalSent) * 100) : 0;

  const stats = [
    { label: 'Total Sent', value: totalSent.toString(), accent: 'text-blue-600 dark:text-blue-400' },
    { label: 'Open Rate', value: `${openRate}%`, accent: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Click Rate', value: `${clickRate}%`, accent: 'text-purple-600 dark:text-purple-400' },
    { label: 'Reply Rate', value: `${replyRate}%`, accent: 'text-amber-600 dark:text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map(s => (
        <div
          key={s.label}
          className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center"
        >
          <p className={`text-2xl font-bold ${s.accent}`}>{s.value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

// ========== Reply Classification Helpers ==========

const REPLY_CATEGORY_LABELS: Record<ReplyCategory, string> = {
  interested: 'Interested',
  not_interested: 'Not Interested',
  out_of_office: 'Out of Office',
  unsubscribe: 'Unsubscribe',
  auto_reply: 'Auto Reply',
  unknown: 'Unknown',
};

const REPLY_CATEGORY_COLORS: Record<ReplyCategory, string> = {
  interested: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  not_interested: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  out_of_office: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  unsubscribe: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  auto_reply: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

// ========== Email Card Component ==========

function EmailCard({ email, isExpanded, onToggle }: { email: EmailWithLead; isExpanded: boolean; onToggle: () => void }) {
  const bodyPreview = email.body.replace(/<[^>]*>/g, '').slice(0, 100) + (email.body.length > 100 ? '...' : '');
  const [replyText, setReplyText] = useState('');
  const [replyCategory, setReplyCategory] = useState<ReplyCategory | null>(null);
  const [showClassifier, setShowClassifier] = useState(false);

  const handleClassify = useCallback(() => {
    if (!replyText.trim()) return;
    const category = classifyReply(replyText);
    setReplyCategory(category);
  }, [replyText]);

  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors"
    >
      {/* Clickable header area */}
      <button
        onClick={onToggle}
        className="w-full text-left p-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset rounded-xl"
      >
        {/* Top row: Lead info + A/B badge */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {email.lead?.name || 'Unknown Lead'}
              </h3>
              {email.lead?.industry && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {email.lead.industry}
                </span>
              )}
              {email.abTestGroup && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                  email.abTestGroup === 'A'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                }`}>
                  A/B: {email.abTestGroup}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-medium truncate">
              {email.subject}
            </p>
          </div>
          {/* Expand/collapse chevron */}
          <svg
            className={`w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Status badges row */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {email.sentAt && (
            <StatusBadge
              label="Sent"
              date={email.sentAt}
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            />
          )}
          {email.openedAt && (
            <StatusBadge
              label="Opened"
              date={email.openedAt}
              color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            />
          )}
          {email.clickedAt && (
            <StatusBadge
              label="Clicked"
              date={email.clickedAt}
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
            />
          )}
          {email.respondedAt && (
            <StatusBadge
              label="Responded"
              date={email.respondedAt}
              color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
            />
          )}
          {email.bouncedAt && (
            <StatusBadge
              label="Bounced"
              date={email.bouncedAt}
              color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
            />
          )}
          {email.sentAt && !email.openedAt && !email.clickedAt && !email.respondedAt && !email.bouncedAt && (
            <StatusBadge
              label="Pending"
              color="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            />
          )}
        </div>

        {/* Body preview (shown when collapsed) */}
        {!isExpanded && (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
            {bodyPreview}
          </p>
        )}
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800">
          <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {email.body.replace(/<[^>]*>/g, '')}
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
            <span>Created {formatRelativeDate(email.createdAt)}</span>
            {email.variation && (
              <span className="capitalize">Variation: {email.variation}</span>
            )}
            {email.templateUsed && (
              <span>Template: {email.templateUsed}</span>
            )}
          </div>

          {/* Reply Classifier */}
          {email.sentAt && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setShowClassifier(!showClassifier)}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
              >
                {showClassifier ? 'Hide Reply Classifier' : 'Classify Reply'}
              </button>
              {showClassifier && (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={e => { setReplyText(e.target.value); setReplyCategory(null); }}
                    placeholder="Paste the reply you received here..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClassify}
                      disabled={!replyText.trim()}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Analyze Reply
                    </button>
                    {replyCategory && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${REPLY_CATEGORY_COLORS[replyCategory]}`}>
                        {REPLY_CATEGORY_LABELS[replyCategory]}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== Reply Card Component ==========

function ReplyCard({
  reply,
  onToggleRead,
}: {
  reply: InboxReply;
  onToggleRead: (reply: InboxReply) => void;
}) {
  const snippet =
    reply.bodySnippet.length > 200
      ? reply.bodySnippet.slice(0, 200) + '...'
      : reply.bodySnippet;

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-xl border transition-colors ${
        reply.isRead
          ? 'border-gray-200 dark:border-gray-800'
          : 'border-blue-300 dark:border-blue-700'
      }`}
    >
      <div className="p-4">
        {/* Top row: From + category badge */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {!reply.isRead && (
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
              )}
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {reply.fromName || reply.fromEmail}
              </h3>
              {reply.fromName && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  &lt;{reply.fromEmail}&gt;
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-medium truncate">
              {reply.subject}
            </p>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${REPLY_CATEGORY_COLORS[reply.replyCategory]}`}
          >
            {REPLY_CATEGORY_LABELS[reply.replyCategory]}
          </span>
        </div>

        {/* Body snippet */}
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-3">
          {snippet}
        </p>

        {/* Footer: date, lead link, mark read */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            <span>{formatShortDate(reply.receivedAt)}</span>
            {reply.matchedLeadId && (
              <a
                href={`/leads/${reply.matchedLeadId}`}
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                View Lead
              </a>
            )}
          </div>
          <button
            onClick={() => onToggleRead(reply)}
            className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {reply.isRead ? 'Mark as unread' : 'Mark as read'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================================
// Inbox Page Component
// ==========================================================

export default function InboxPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [inboxReplies, setInboxReplies] = useState<InboxReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('newest');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Load data
  useEffect(() => {
    async function load() {
      try {
        const [e, l, r] = await Promise.all([
          getAllEmails(),
          getAllLeads(),
          getAllInboxReplies(),
        ]);
        setEmails(e);
        setLeads(l);
        setInboxReplies(r);
      } catch (err) {
        console.error('Failed to load inbox data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Build lead lookup map
  const leadMap = useMemo(() => {
    const map = new Map<string, Lead>();
    leads.forEach(l => map.set(l.id, l));
    return map;
  }, [leads]);

  // Enrich emails with lead data
  const enrichedEmails: EmailWithLead[] = useMemo(() => {
    return emails.map(e => ({
      ...e,
      lead: leadMap.get(e.leadId),
    }));
  }, [emails, leadMap]);

  // Filter
  const filteredEmails = useMemo(() => {
    let result = enrichedEmails;

    // Status filter
    switch (filter) {
      case 'opened':
        result = result.filter(e => e.openedAt);
        break;
      case 'clicked':
        result = result.filter(e => e.clickedAt);
        break;
      case 'responded':
        result = result.filter(e => e.respondedAt);
        break;
      case 'bounced':
        result = result.filter(e => e.bouncedAt);
        break;
      case 'pending':
        result = result.filter(e => e.sentAt && !e.openedAt && !e.clickedAt && !e.respondedAt && !e.bouncedAt);
        break;
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(e =>
        (e.lead?.name || '').toLowerCase().includes(q) ||
        e.subject.toLowerCase().includes(q)
      );
    }

    return result;
  }, [enrichedEmails, filter, search]);

  // Sort
  const sortedEmails = useMemo(() => {
    const sorted = [...filteredEmails];
    switch (sort) {
      case 'newest':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'oldest':
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case 'most_engaged':
        sorted.sort((a, b) => getEngagementScore(b) - getEngagementScore(a));
        break;
    }
    return sorted;
  }, [filteredEmails, sort]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filter, search, sort, pageSize]);

  // Paginate sorted emails
  const emailTotalPages = Math.ceil(sortedEmails.length / pageSize);
  const paginatedEmails = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedEmails.slice(start, start + pageSize);
  }, [sortedEmails, page, pageSize]);

  // Unread replies count
  const unreadRepliesCount = useMemo(
    () => inboxReplies.filter(r => !r.isRead).length,
    [inboxReplies]
  );

  // Filter counts for badges
  const filterCounts = useMemo(() => {
    return {
      all: enrichedEmails.length,
      opened: enrichedEmails.filter(e => e.openedAt).length,
      clicked: enrichedEmails.filter(e => e.clickedAt).length,
      responded: enrichedEmails.filter(e => e.respondedAt).length,
      bounced: enrichedEmails.filter(e => e.bouncedAt).length,
      pending: enrichedEmails.filter(e => e.sentAt && !e.openedAt && !e.clickedAt && !e.respondedAt && !e.bouncedAt).length,
      replies: inboxReplies.length,
    };
  }, [enrichedEmails, inboxReplies]);

  // Filtered replies (supports search)
  const filteredReplies = useMemo(() => {
    if (!search.trim()) return inboxReplies;
    const q = search.toLowerCase().trim();
    return inboxReplies.filter(r =>
      r.fromEmail.toLowerCase().includes(q) ||
      (r.fromName || '').toLowerCase().includes(q) ||
      r.subject.toLowerCase().includes(q)
    );
  }, [inboxReplies, search]);

  // Paginate replies
  const replyTotalPages = Math.ceil(filteredReplies.length / pageSize);
  const paginatedReplies = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredReplies.slice(start, start + pageSize);
  }, [filteredReplies, page, pageSize]);

  // Toggle read status on a reply
  const handleToggleRead = useCallback(async (reply: InboxReply) => {
    const updated: InboxReply = { ...reply, isRead: !reply.isRead };
    try {
      await updateInboxReply(updated);
      setInboxReplies(prev => prev.map(r => (r.id === reply.id ? updated : r)));
    } catch (err) {
      console.error('Failed to update reply:', err);
    }
  }, []);

  // Loading
  if (loading) return <LoadingSpinner />;

  // Empty state
  if (emails.length === 0) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Inbox</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">All email engagement in one place</p>
          </div>
        </div>
        <EmptyState
          icon="📭"
          title="No Emails Yet"
          description="Your inbox is empty. Generate and send emails to leads to start tracking engagement here."
          actionLabel="Generate Emails"
          onAction={() => window.location.href = '/emails'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Inbox</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1 text-sm sm:text-base">All email engagement in one place</p>
      </div>

      {/* Stats Bar */}
      <StatsBar emails={emails} />

      {/* Search + Sort Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by lead name or subject..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort dropdown */}
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortType)}
          className="px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="most_engaged">Most Engaged</option>
        </select>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => {
          const count = filterCounts[f.key];
          const isActive = filter === f.key;
          const isReplies = f.key === 'replies';
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
              <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold ${
                isActive
                  ? 'bg-blue-500 text-white'
                  : isReplies && unreadRepliesCount > 0
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}>
                {isReplies && !isActive && unreadRepliesCount > 0 ? unreadRepliesCount : count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Results count */}
      {filter === 'replies' ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing {filteredReplies.length} repl{filteredReplies.length !== 1 ? 'ies' : 'y'}
          {unreadRepliesCount > 0 && (
            <span> ({unreadRepliesCount} unread)</span>
          )}
          {search && (
            <span> matching &ldquo;<span className="font-medium text-gray-700 dark:text-gray-300">{search}</span>&rdquo;</span>
          )}
        </p>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing {sortedEmails.length} of {enrichedEmails.length} email{enrichedEmails.length !== 1 ? 's' : ''}
          {search && (
            <span> matching &ldquo;<span className="font-medium text-gray-700 dark:text-gray-300">{search}</span>&rdquo;</span>
          )}
        </p>
      )}

      {/* Replies List */}
      {filter === 'replies' ? (
        filteredReplies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">📭</span>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No replies yet</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md">
              {search
                ? 'No replies match your search query. Try a different search term.'
                : 'Replies detected via IMAP polling will appear here. Make sure IMAP is configured for your email accounts.'}
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedReplies.map(reply => (
                <ReplyCard key={reply.id} reply={reply} onToggleRead={handleToggleRead} />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={replyTotalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              total={filteredReplies.length}
            />
          </>
        )
      ) : (
        /* Email Cards */
        sortedEmails.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">🔍</span>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">No matching emails</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md">
              Try adjusting your search query or changing the active filter to find what you&apos;re looking for.
            </p>
            <button
              onClick={() => { setSearch(''); setFilter('all'); }}
              className="mt-4 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {paginatedEmails.map(email => (
                <EmailCard
                  key={email.id}
                  email={email}
                  isExpanded={expandedId === email.id}
                  onToggle={() => setExpandedId(expandedId === email.id ? null : email.id)}
                />
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={emailTotalPages}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              total={sortedEmails.length}
            />
          </>
        )
      )}
    </div>
  );
}
