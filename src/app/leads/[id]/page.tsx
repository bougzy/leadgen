'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getLead, getEmailsByLead, getAllActivities, getSettings } from '@/lib/db';
import { getScoreColor, getScoreBgColor, getScoreLabel } from '@/lib/scoring';
import { formatRelativeDate, formatDate } from '@/lib/utils';
import type { Lead, Email, ActivityItem, UserSettings } from '@/types';
import { LEAD_STATUSES, PIPELINE_STAGES } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

// Timeline item: a merged view of emails and activities
interface TimelineItem {
  id: string;
  type: 'email_sent' | 'email_opened' | 'email_clicked' | 'email_bounced' | 'response_received' | 'lead_added' | 'lead_status_changed' | 'follow_up_sent' | 'campaign_created' | 'email_scheduled';
  description: string;
  timestamp: string;
  email?: Email;
}

function getTimelineIcon(type: TimelineItem['type']): string {
  switch (type) {
    case 'email_sent': return '\u2709\uFE0F';
    case 'email_opened': return '\uD83D\uDC41\uFE0F';
    case 'email_clicked': return '\uD83D\uDD17';
    case 'email_bounced': return '\u26A0\uFE0F';
    case 'response_received': return '\uD83D\uDCAC';
    case 'follow_up_sent': return '\uD83D\uDD01';
    case 'lead_status_changed': return '\uD83D\uDD04';
    case 'lead_added': return '\u2795';
    case 'campaign_created': return '\uD83D\uDCE2';
    case 'email_scheduled': return '\u23F0';
    default: return '\uD83D\uDD35';
  }
}

function getTimelineColor(type: TimelineItem['type']): string {
  switch (type) {
    case 'email_sent': return 'bg-blue-500';
    case 'email_opened': return 'bg-green-500';
    case 'email_clicked': return 'bg-purple-500';
    case 'email_bounced': return 'bg-red-500';
    case 'response_received': return 'bg-emerald-500';
    case 'follow_up_sent': return 'bg-yellow-500';
    case 'lead_status_changed': return 'bg-orange-500';
    case 'lead_added': return 'bg-cyan-500';
    case 'campaign_created': return 'bg-indigo-500';
    case 'email_scheduled': return 'bg-violet-500';
    default: return 'bg-gray-500';
  }
}

const TAG_COLORS: Record<string, string> = {
  no_website: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  bad_website: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  no_social: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  low_reviews: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  not_mobile_friendly: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',
  slow_loading: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  outdated_design: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  no_online_ordering: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  no_booking_system: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  poor_seo: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
}

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [leadData, emailData, allActivities, settingsData] = await Promise.all([
          getLead(leadId),
          getEmailsByLead(leadId),
          getAllActivities(),
          getSettings(),
        ]);

        if (!leadData) {
          setNotFound(true);
          return;
        }

        setLead(leadData);
        setEmails(emailData);
        setActivities(allActivities.filter(a => a.leadId === leadId));
        setSettings(settingsData);
      } catch (err) {
        console.error('Failed to load lead data:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leadId]);

  if (loading) return <LoadingSpinner size="lg" />;

  if (notFound || !lead) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-6xl mb-4">🔍</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Lead Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">The lead you are looking for does not exist or has been removed.</p>
        <button onClick={() => router.push('/leads')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
          Back to Leads
        </button>
      </div>
    );
  }

  // Build the timeline by merging emails and activities
  const timelineItems: TimelineItem[] = [];

  // Add emails as timeline items
  emails.forEach(email => {
    timelineItems.push({
      id: `email-sent-${email.id}`,
      type: 'email_sent',
      description: `Email sent: "${email.subject}"`,
      timestamp: email.sentAt || email.createdAt,
      email,
    });

    if (email.openedAt) {
      timelineItems.push({
        id: `email-opened-${email.id}`,
        type: 'email_opened',
        description: `Email opened: "${email.subject}"`,
        timestamp: email.openedAt,
        email,
      });
    }

    if (email.clickedAt) {
      timelineItems.push({
        id: `email-clicked-${email.id}`,
        type: 'email_clicked',
        description: `Link clicked in: "${email.subject}"`,
        timestamp: email.clickedAt,
        email,
      });
    }

    if (email.respondedAt) {
      timelineItems.push({
        id: `email-responded-${email.id}`,
        type: 'response_received',
        description: `Response received for: "${email.subject}"`,
        timestamp: email.respondedAt,
        email,
      });
    }

    if (email.bouncedAt) {
      timelineItems.push({
        id: `email-bounced-${email.id}`,
        type: 'email_bounced',
        description: `Email bounced: "${email.subject}"`,
        timestamp: email.bouncedAt,
        email,
      });
    }
  });

  // Add activities as timeline items (avoid duplicating email events already covered)
  activities.forEach(activity => {
    // Skip email_sent activities since we already handle them from the emails array
    const isDuplicateEmailEvent =
      activity.type === 'email_sent' ||
      activity.type === 'email_opened' ||
      activity.type === 'email_bounced' ||
      activity.type === 'response_received';

    if (!isDuplicateEmailEvent) {
      timelineItems.push({
        id: `activity-${activity.id}`,
        type: activity.type,
        description: activity.description,
        timestamp: activity.timestamp,
      });
    }
  });

  // Sort descending by date
  timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const statusInfo = LEAD_STATUSES.find(s => s.value === lead.status);
  const stageInfo = PIPELINE_STAGES.find(s => s.value === lead.pipelineStage);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Quick Actions Bar */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.push('/leads')}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Leads
        </button>
        <div className="flex items-center gap-2">
          <Link
            href={`/emails?leadId=${lead.id}`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Generate Email
          </Link>
          <Link
            href={`/leads#${lead.id}`}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            Edit Lead
          </Link>
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{lead.name}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {lead.industry} &middot; {lead.location}
            </p>
            {lead.contactName && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Contact: {lead.contactName}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getScoreColor(lead.leadScore)} ${getScoreBgColor(lead.leadScore)}`}>
              Score: {lead.leadScore} &middot; {getScoreLabel(lead.leadScore)}
            </span>
            {statusInfo && (
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            )}
            {stageInfo && (
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${stageInfo.color}`}>
                {stageInfo.label}
              </span>
            )}
          </div>
        </div>

        {/* Date info */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>Added: {formatDate(lead.dateAdded)}</span>
          {lead.lastContacted && <span>Last contacted: {formatRelativeDate(lead.lastContacted)}</span>}
          {lead.source && <span>Source: {lead.source.replace('_', ' ')}</span>}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column — Contact Info, Tags, Deal Value, Notes */}
        <div className="lg:col-span-1 space-y-6">
          {/* Contact Info */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 uppercase tracking-wider">Contact Info</h2>
            <div className="space-y-3">
              {lead.email && (
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <a href={`mailto:${lead.email}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all">
                    {lead.email}
                  </a>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <a href={`tel:${lead.phone}`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    {lead.phone}
                  </a>
                </div>
              )}
              {lead.website && (
                <div className="flex items-start gap-3">
                  <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all">
                    {lead.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              {!lead.email && !lead.phone && !lead.website && (
                <p className="text-sm text-gray-400 dark:text-gray-500 italic">No contact info available</p>
              )}
            </div>
          </div>

          {/* Tags */}
          {lead.tags.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wider">Issues / Tags</h2>
              <div className="flex flex-wrap gap-2">
                {lead.tags.map(tag => (
                  <span key={tag} className={`px-2.5 py-1 rounded-full text-xs font-medium ${getTagColor(tag)}`}>
                    {tag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Deal Value */}
          {lead.dealValue !== undefined && lead.dealValue > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 uppercase tracking-wider">Deal Value</h2>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                ${lead.dealValue.toLocaleString()}
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wider">Notes</h2>
            {lead.notes ? (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">No notes yet.</p>
            )}
          </div>

          {/* Email Stats Summary */}
          {emails.length > 0 && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 uppercase tracking-wider">Email Stats</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{emails.length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sent</p>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{emails.filter(e => e.openedAt).length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Opened</p>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{emails.filter(e => e.clickedAt).length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Clicked</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{emails.filter(e => e.respondedAt).length}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Replied</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column — Timeline */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-6 uppercase tracking-wider">
              Activity Timeline
              {timelineItems.length > 0 && (
                <span className="ml-2 text-gray-400 dark:text-gray-500 font-normal normal-case">
                  ({timelineItems.length} event{timelineItems.length !== 1 ? 's' : ''})
                </span>
              )}
            </h2>

            {timelineItems.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3 opacity-50">📭</div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">No activity yet</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  Send an email or update this lead to see activity here.
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />

                <div className="space-y-6">
                  {timelineItems.map((item, index) => (
                    <div key={item.id} className="relative flex gap-4">
                      {/* Timeline dot */}
                      <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full ${getTimelineColor(item.type)} text-white text-sm shrink-0 shadow-sm`}>
                        <span className="text-xs">{getTimelineIcon(item.type)}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">
                            {item.description}
                          </p>
                          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0">
                            {formatRelativeDate(item.timestamp)}
                          </span>
                        </div>

                        {/* Email details */}
                        {item.email && item.type === 'email_sent' && (
                          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Subject</p>
                            <p className="text-sm text-gray-800 dark:text-gray-200">{item.email.subject}</p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                {item.email.variation}
                              </span>
                              {item.email.openedAt && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                  Opened
                                </span>
                              )}
                              {item.email.clickedAt && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                  Clicked
                                </span>
                              )}
                              {item.email.respondedAt && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                                  Replied
                                </span>
                              )}
                              {item.email.bouncedAt && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                  Bounced
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Timestamp detail for non-first items  */}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {new Date(item.timestamp).toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
