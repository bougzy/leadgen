import type { Lead } from '@/types';

export function calculateLeadScore(lead: Lead): number {
  let score = 0;

  // No website = highest opportunity
  if (!lead.website || lead.website.trim() === '') {
    score += 50;
  } else {
    // Has website but might be bad
    if (lead.tags.includes('bad_website')) score += 30;
    if (lead.tags.includes('not_mobile_friendly')) score += 15;
    if (lead.tags.includes('slow_loading')) score += 10;
    if (lead.tags.includes('outdated_design')) score += 10;
  }

  // Social media presence
  const socialEntries = lead.socialMedia
    ? Object.values(lead.socialMedia).filter(Boolean)
    : [];
  if (lead.tags.includes('no_social') || socialEntries.length === 0) {
    score += 25;
  } else if (socialEntries.length === 1) {
    score += 15;
  }

  // Reviews
  if (lead.tags.includes('low_reviews')) score += 20;

  // No online ordering (restaurant-specific)
  if (lead.tags.includes('no_online_ordering')) score += 15;

  // No booking system
  if (lead.tags.includes('no_booking_system')) score += 15;

  // Poor SEO
  if (lead.tags.includes('poor_seo')) score += 10;

  // Has email = easier to contact
  if (lead.email && lead.email.trim() !== '') score += 5;

  return Math.min(score, 100);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  if (score >= 40) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
  if (score >= 40) return 'bg-orange-100 dark:bg-orange-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Hot Lead';
  if (score >= 60) return 'Warm Lead';
  if (score >= 40) return 'Cool Lead';
  return 'Cold Lead';
}
