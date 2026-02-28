import type { Account, Campaign, Email, Suggestion } from '@/types';

function daysSince(dateStr?: string): number {
  if (!dateStr) return Infinity;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getSuggestions(
  accounts: Account[],
  campaigns: Campaign[],
  emails: Email[],
  followUpDays: number = 5
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Urgent: Engaged accounts to handle
  const engaged = accounts.filter(a => a.lifecycleStage === 'engaged');
  if (engaged.length > 0) {
    suggestions.push({
      id: 'respond-to-accounts',
      priority: 'urgent',
      text: `${engaged.length} account${engaged.length > 1 ? 's' : ''} engaged — follow up now!`,
      action: '/leads?stage=engaged',
      accountIds: engaged.map(a => a.id),
      icon: '🔥',
    });
  }

  // High: Uncontacted high-score prospects
  const highScoreNew = accounts.filter(a => a.leadScore >= 70 && a.lifecycleStage === 'prospect');
  if (highScoreNew.length > 0) {
    suggestions.push({
      id: 'contact-high-score',
      priority: 'high',
      text: `Contact ${highScoreNew.length} high-priority account${highScoreNew.length > 1 ? 's' : ''} (score 70+)`,
      action: '/leads?stage=prospect&minScore=70',
      accountIds: highScoreNew.map(a => a.id),
      icon: '🎯',
    });
  }

  // Medium: Follow-ups needed
  const needsFollowUp = accounts.filter(
    a => a.lifecycleStage === 'contacted' && daysSince(a.lastContacted) >= followUpDays
  );
  if (needsFollowUp.length > 0) {
    suggestions.push({
      id: 'follow-up',
      priority: 'medium',
      text: `Follow up with ${needsFollowUp.length} account${needsFollowUp.length > 1 ? 's' : ''} from ${followUpDays}+ days ago`,
      action: '/leads?stage=contacted',
      accountIds: needsFollowUp.map(a => a.id),
      icon: '📧',
    });
  }

  // Medium: New prospects to score
  const prospects = accounts.filter(a => a.lifecycleStage === 'prospect');
  if (prospects.length > 10 && highScoreNew.length === 0) {
    suggestions.push({
      id: 'review-new-accounts',
      priority: 'medium',
      text: `Review ${prospects.length} new prospects and start reaching out`,
      action: '/leads?stage=prospect',
      accountIds: prospects.map(a => a.id),
      icon: '📋',
    });
  }

  // Low: Qualified accounts to close
  const qualified = accounts.filter(a => a.lifecycleStage === 'qualified');
  if (qualified.length > 0) {
    suggestions.push({
      id: 'close-qualified',
      priority: 'low',
      text: `${qualified.length} qualified account${qualified.length > 1 ? 's' : ''} ready to close`,
      action: '/leads?stage=qualified',
      accountIds: qualified.map(a => a.id),
      icon: '💰',
    });
  }

  // Low: Active campaigns to monitor
  const activeCampaigns = campaigns.filter(c => c.status === 'active');
  if (activeCampaigns.length > 0) {
    const totalAccounts = activeCampaigns.reduce((sum, c) => sum + c.accountIds.length, 0);
    suggestions.push({
      id: 'monitor-campaigns',
      priority: 'low',
      text: `${activeCampaigns.length} active campaign${activeCampaigns.length > 1 ? 's' : ''} with ${totalAccounts} accounts`,
      action: '/campaigns',
      icon: '📊',
    });
  }

  // If no accounts at all
  if (accounts.length === 0) {
    suggestions.push({
      id: 'add-first-account',
      priority: 'high',
      text: 'Add your first account to get started!',
      action: '/leads',
      icon: '🚀',
    });
  }

  // Sort by priority
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions;
}

export function getStats(accounts: Account[], emails: Email[]) {
  const total = accounts.length;
  const byStage = {
    prospect: accounts.filter(a => a.lifecycleStage === 'prospect').length,
    contacted: accounts.filter(a => a.lifecycleStage === 'contacted').length,
    engaged: accounts.filter(a => a.lifecycleStage === 'engaged').length,
    qualified: accounts.filter(a => a.lifecycleStage === 'qualified').length,
    won: accounts.filter(a => a.lifecycleStage === 'won').length,
    active_client: accounts.filter(a => a.lifecycleStage === 'active_client').length,
    churned: accounts.filter(a => a.lifecycleStage === 'churned').length,
  };

  const emailsSent = emails.filter(e => e.status === 'sent' || e.status === 'responded').length;
  const emailsResponded = emails.filter(e => e.status === 'responded').length;
  const responseRate = emailsSent > 0 ? Math.round((emailsResponded / emailsSent) * 100) : 0;

  const avgScore = total > 0 ? Math.round(accounts.reduce((sum, a) => sum + a.leadScore, 0) / total) : 0;

  return { total, byStage, emailsSent, emailsResponded, responseRate, avgScore };
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
