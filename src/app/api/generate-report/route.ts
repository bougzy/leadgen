import { NextRequest, NextResponse } from 'next/server';
import * as db from '@/lib/db-server';
import type { ClientReportMetrics } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const accountId = body.accountId || body.clientSiteId;
    const { month } = body;

    if (!accountId || !month) {
      return NextResponse.json({ error: 'accountId and month required' }, { status: 400 });
    }

    // Parse month boundaries
    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1).toISOString();
    const endDate = new Date(year, mon, 0, 23, 59, 59).toISOString();

    // Gather data from all modules
    const [reviews, keywords, citations, socialContents, referrals, reminders, reviewRequests] = await Promise.all([
      db.getClientReviewsByAccount(accountId),
      db.getRankKeywordsByAccount(accountId),
      db.getCitationsByAccount(accountId),
      db.getSocialContentsByAccount(accountId),
      db.getReferralsByAccount(accountId),
      db.getRetentionRemindersByAccount(accountId),
      db.getReviewRequestsByAccount(accountId),
    ]);

    // Filter to this month
    const monthReviews = reviews.filter(r => r.reviewDate >= startDate && r.reviewDate <= endDate);
    const monthSocial = socialContents.filter(s => s.publishedAt && s.publishedAt >= startDate && s.publishedAt <= endDate);
    const monthReferrals = referrals.filter(r => r.createdAt >= startDate && r.createdAt <= endDate);
    const monthReminders = reminders.filter(r => r.sentAt && r.sentAt >= startDate && r.sentAt <= endDate);
    const monthRequests = reviewRequests.filter(r => r.createdAt >= startDate && r.createdAt <= endDate);

    // Calculate previous month for comparison
    const prevMonth = mon === 1 ? 12 : mon - 1;
    const prevYear = mon === 1 ? year - 1 : year;
    const prevStartDate = new Date(prevYear, prevMonth - 1, 1).toISOString();
    const prevEndDate = new Date(prevYear, prevMonth, 0, 23, 59, 59).toISOString();
    const prevReviews = reviews.filter(r => r.reviewDate >= prevStartDate && r.reviewDate <= prevEndDate);

    const avgRating = monthReviews.length > 0 ? monthReviews.reduce((sum, r) => sum + r.rating, 0) / monthReviews.length : 0;
    const prevAvgRating = prevReviews.length > 0 ? prevReviews.reduce((sum, r) => sum + r.rating, 0) / prevReviews.length : 0;

    // Citation fixes: count citations marked correct this month
    const citationsCorrect = citations.filter(c => c.isListed && c.nameCorrect && c.addressCorrect && c.phoneCorrect && c.websiteCorrect).length;

    // Ranking movements
    const rankingMovements = keywords.map(kw => ({
      keyword: kw.keyword,
      previousPosition: kw.previousPosition ?? null,
      currentPosition: kw.currentPosition ?? null,
    }));

    const metrics: ClientReportMetrics = {
      newReviews: monthReviews.length,
      averageRatingChange: avgRating - prevAvgRating,
      rankingMovements,
      emailsSent: 0, // Would need to query leads linked to this client
      leadsGenerated: 0,
      socialPostsPublished: monthSocial.length,
      citationsFixed: citationsCorrect,
      referralsGenerated: monthReferrals.length,
      retentionRemindersSent: monthReminders.length,
      reviewRequestsSent: monthRequests.length,
    };

    // Generate summary text
    const summaryParts: string[] = [];
    if (metrics.newReviews > 0) summaryParts.push(`${metrics.newReviews} new reviews received`);
    if (metrics.socialPostsPublished > 0) summaryParts.push(`${metrics.socialPostsPublished} social posts published`);
    if (metrics.referralsGenerated > 0) summaryParts.push(`${metrics.referralsGenerated} referrals generated`);
    if (metrics.reviewRequestsSent > 0) summaryParts.push(`${metrics.reviewRequestsSent} review requests sent`);
    const summary = summaryParts.length > 0 
      ? `This month: ${summaryParts.join(', ')}.`
      : 'No significant activity recorded this month.';

    return NextResponse.json({ metrics, summary });
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
