import type { Lead, Campaign, Email, Suggestion } from '@/types';

function daysSince(dateStr?: string): number {
  if (!dateStr) return Infinity;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getSuggestions(
  leads: Lead[],
  campaigns: Campaign[],
  emails: Email[],
  followUpDays: number = 5
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Urgent: Responses to handle
  const responses = leads.filter(l => l.status === 'responded');
  if (responses.length > 0) {
    suggestions.push({
      id: 'respond-to-leads',
      priority: 'urgent',
      text: `${responses.length} lead${responses.length > 1 ? 's' : ''} responded — follow up now!`,
      action: '/leads?status=responded',
      leadIds: responses.map(l => l.id),
      icon: '🔥',
    });
  }

  // High: Uncontacted high-score leads
  const highScoreNew = leads.filter(l => l.leadScore >= 70 && l.status === 'new');
  if (highScoreNew.length > 0) {
    suggestions.push({
      id: 'contact-high-score',
      priority: 'high',
      text: `Contact ${highScoreNew.length} high-priority lead${highScoreNew.length > 1 ? 's' : ''} (score 70+)`,
      action: '/leads?status=new&minScore=70',
      leadIds: highScoreNew.map(l => l.id),
      icon: '🎯',
    });
  }

  // Medium: Follow-ups needed
  const needsFollowUp = leads.filter(
    l => l.status === 'contacted' && daysSince(l.lastContacted) >= followUpDays
  );
  if (needsFollowUp.length > 0) {
    suggestions.push({
      id: 'follow-up',
      priority: 'medium',
      text: `Follow up with ${needsFollowUp.length} lead${needsFollowUp.length > 1 ? 's' : ''} from ${followUpDays}+ days ago`,
      action: '/leads?status=contacted',
      leadIds: needsFollowUp.map(l => l.id),
      icon: '📧',
    });
  }

  // Medium: New leads to score
  const newLeads = leads.filter(l => l.status === 'new');
  if (newLeads.length > 10 && highScoreNew.length === 0) {
    suggestions.push({
      id: 'review-new-leads',
      priority: 'medium',
      text: `Review ${newLeads.length} new leads and start reaching out`,
      action: '/leads?status=new',
      leadIds: newLeads.map(l => l.id),
      icon: '📋',
    });
  }

  // Low: Qualified leads to close
  const qualified = leads.filter(l => l.status === 'qualified');
  if (qualified.length > 0) {
    suggestions.push({
      id: 'close-qualified',
      priority: 'low',
      text: `${qualified.length} qualified lead${qualified.length > 1 ? 's' : ''} ready to close`,
      action: '/leads?status=qualified',
      leadIds: qualified.map(l => l.id),
      icon: '💰',
    });
  }

  // Low: Active campaigns to monitor
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  if (activeCampaigns.length > 0) {
    const totalLeads = activeCampaigns.reduce((sum, c) => sum + c.leadIds.length, 0);
    suggestions.push({
      id: 'monitor-campaigns',
      priority: 'low',
      text: `${activeCampaigns.length} active campaign${activeCampaigns.length > 1 ? 's' : ''} with ${totalLeads} leads`,
      action: '/campaigns',
      icon: '📊',
    });
  }

  // If no leads at all
  if (leads.length === 0) {
    suggestions.push({
      id: 'add-first-lead',
      priority: 'high',
      text: 'Add your first lead to get started!',
      action: '/leads',
      icon: '🚀',
    });
  }

  // Sort by priority
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

export function getStats(leads: Lead[], emails: Email[]) {
  const total = leads.length;
  const byStatus = {
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    responded: leads.filter(l => l.status === 'responded').length,
    qualified: leads.filter(l => l.status === 'qualified').length,
    closed: leads.filter(l => l.status === 'closed').length,
    rejected: leads.filter(l => l.status === 'rejected').length,
  };

  const emailsSent = emails.filter(e => e.status === 'sent' || e.status === 'responded').length;
  const emailsResponded = emails.filter(e => e.status === 'responded').length;
  const responseRate = emailsSent > 0 ? Math.round((emailsResponded / emailsSent) * 100) : 0;

  const avgScore = total > 0 ? Math.round(leads.reduce((sum, l) => sum + l.leadScore, 0) / total) : 0;

  return { total, byStatus, emailsSent, emailsResponded, responseRate, avgScore };
}

export function getChartData(emails: Email[], days: number = 30) {
  const now = new Date();
  const data: { date: string; sent: number; responses: number }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const sent = emails.filter(e => {
      if (!e.sentAt) return false;
      return e.sentAt.startsWith(dateStr);
    }).length;

    const responses = emails.filter(e => {
      if (!e.respondedAt) return false;
      return e.respondedAt.startsWith(dateStr);
    }).length;

    data.push({ date: dayLabel, sent, responses });
  }

  return data;
}

export function getBestSendTimes(emails: Email[]): { day: string; hour: string; openRate: number }[] {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Group emails by day of week and hour
  const buckets: Record<string, { sent: number; opened: number }> = {};

  for (const email of emails) {
    if (!email.sentAt) continue;
    const sentDate = new Date(email.sentAt);
    const day = dayNames[sentDate.getDay()];
    const hour = sentDate.getHours();
    const key = `${day}-${hour}`;

    if (!buckets[key]) buckets[key] = { sent: 0, opened: 0 };
    buckets[key].sent++;
    if (email.openedAt) buckets[key].opened++;
  }

  // Calculate open rates and sort
  return Object.entries(buckets)
    .filter(([, data]) => data.sent >= 2) // need at least 2 emails for meaningful data
    .map(([key, data]) => {
      const [day, hourStr] = key.split('-');
      const hour = parseInt(hourStr);
      const hourLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
      return {
        day,
        hour: hourLabel,
        openRate: Math.round((data.opened / data.sent) * 100),
      };
    })
    .sort((a, b) => b.openRate - a.openRate)
    .slice(0, 5);
}
