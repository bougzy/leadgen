// Central Analytics Layer — computes dashboard metrics, account health,
// and conversion analytics from raw data.

import type { Account, DashboardAnalytics, AccountHealthMetrics, Email } from '@/types';

// ─── Dashboard Analytics ─────────────────────────────────────────────────────

export function computeDashboardAnalytics(
  accounts: Account[],
  emails: Email[],
): DashboardAnalytics {
  const byStage: Record<string, number> = {};
  let totalScore = 0;
  let pipelineValue = 0;
  const industryCounts = new Map<string, number>();

  for (const a of accounts) {
    byStage[a.lifecycleStage] = (byStage[a.lifecycleStage] || 0) + 1;
    totalScore += a.leadScore ?? 0;

    if (a.monthlyFee && ['won', 'active_client'].includes(a.lifecycleStage)) {
      pipelineValue += a.monthlyFee;
    }

    if (a.industry) {
      industryCounts.set(a.industry, (industryCounts.get(a.industry) || 0) + 1);
    }
  }

  const emailMetrics = { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };
  for (const e of emails) {
    if (e.sentAt) emailMetrics.sent++;
    if (e.openedAt) emailMetrics.opened++;
    if (e.clickedAt) emailMetrics.clicked++;
    if (e.respondedAt) emailMetrics.replied++;
    if (e.status === 'bounced') emailMetrics.bounced++;
  }

  const totalAccounts = accounts.length;
  const wonCount = (byStage['won'] || 0) + (byStage['active_client'] || 0);
  const conversionRate = totalAccounts > 0 ? wonCount / totalAccounts : 0;
  const avgLeadScore = totalAccounts > 0 ? totalScore / totalAccounts : 0;

  const topIndustries = Array.from(industryCounts.entries())
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalAccounts,
    byStage,
    emailMetrics,
    conversionRate,
    avgLeadScore,
    pipelineValue,
    topIndustries,
    automationHealth: { pending: 0, processing: 0, failed: 0, deadLetter: 0 },
    computedAt: new Date().toISOString(),
  };
}

// ─── Account Health Metrics ──────────────────────────────────────────────────

export function computeAccountHealth(
  account: Account,
  emails: Email[],
): AccountHealthMetrics {
  const acctEmails = emails.filter((e) => e.accountId === account.id);
  const sentEmails = acctEmails.filter((e) => e.sentAt);
  const openedEmails = acctEmails.filter((e) => e.openedAt);
  const repliedEmails = acctEmails.filter((e) => e.respondedAt);

  // Health Index: 0-100 composite score
  let healthIndex = 50; // baseline

  // Engagement signals boost health
  if (sentEmails.length > 0) {
    const openRate = openedEmails.length / sentEmails.length;
    const replyRate = repliedEmails.length / sentEmails.length;
    healthIndex += openRate * 20;
    healthIndex += replyRate * 30;
  }

  // Active stages boost health
  const activeStages = ['engaged', 'qualified', 'won', 'active_client'];
  if (activeStages.includes(account.lifecycleStage)) {
    healthIndex += 15;
  }

  // Recency of contact matters
  if (account.lastContacted) {
    const daysSinceContact = (Date.now() - new Date(account.lastContacted).getTime()) / 86_400_000;
    if (daysSinceContact < 7) healthIndex += 10;
    else if (daysSinceContact > 30) healthIndex -= 10;
    else if (daysSinceContact > 60) healthIndex -= 20;
  }

  healthIndex = Math.max(0, Math.min(100, Math.round(healthIndex)));

  // Growth Momentum: rate of lifecycle progression
  const growthMomentum = computeGrowthMomentum(account);

  // Conversion Efficiency: how effectively outreach converts
  const conversionEfficiency = sentEmails.length > 0
    ? repliedEmails.length / sentEmails.length
    : 0;

  // Reputation Risk: high for churned/bounced, low for engaged
  let reputationRisk = 0;
  const bouncedEmails = acctEmails.filter((e) => e.status === 'bounced');
  if (sentEmails.length > 0) {
    reputationRisk = bouncedEmails.length / sentEmails.length;
  }
  if (['churned', 'paused'].includes(account.lifecycleStage)) {
    reputationRisk = Math.min(1, reputationRisk + 0.3);
  }

  return {
    accountId: account.id,
    healthIndex,
    growthMomentum: Math.round(growthMomentum * 100) / 100,
    conversionEfficiency: Math.round(conversionEfficiency * 100) / 100,
    reputationRisk: Math.round(reputationRisk * 100) / 100,
    computedAt: new Date().toISOString(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAGE_ORDER = ['prospect', 'contacted', 'engaged', 'qualified', 'won', 'active_client'];

function computeGrowthMomentum(account: Account): number {
  const stageIndex = STAGE_ORDER.indexOf(account.lifecycleStage);
  if (stageIndex < 0) return 0;

  // Normalize: 0 (prospect) to 1 (active_client)
  const baseScore = stageIndex / (STAGE_ORDER.length - 1);

  // Boost for recent activity
  if (account.lastContacted) {
    const daysSince = (Date.now() - new Date(account.lastContacted).getTime()) / 86_400_000;
    if (daysSince < 3) return Math.min(1, baseScore + 0.2);
    if (daysSince < 7) return Math.min(1, baseScore + 0.1);
  }

  return baseScore;
}

// ─── Batch Analytics ─────────────────────────────────────────────────────────

export function computeConversionFunnel(accounts: Account[]): { stage: string; count: number; percentage: number }[] {
  const total = accounts.length || 1;

  return STAGE_ORDER.map((stage) => {
    const count = accounts.filter((a) => a.lifecycleStage === stage).length;
    return { stage, count, percentage: Math.round((count / total) * 100) };
  });
}

export function computeEmailPerformance(emails: Email[]): {
  totalSent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
} {
  const sent = emails.filter((e) => e.sentAt);
  const totalSent = sent.length;
  if (totalSent === 0) return { totalSent: 0, openRate: 0, clickRate: 0, replyRate: 0, bounceRate: 0 };

  return {
    totalSent,
    openRate: sent.filter((e) => e.openedAt).length / totalSent,
    clickRate: sent.filter((e) => e.clickedAt).length / totalSent,
    replyRate: sent.filter((e) => e.respondedAt).length / totalSent,
    bounceRate: sent.filter((e) => e.status === 'bounced').length / totalSent,
  };
}
