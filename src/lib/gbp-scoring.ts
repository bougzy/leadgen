import type { GbpAudit, GbpAuditIssue } from '@/types';
import { v4 as uuid } from 'uuid';

interface AuditInput {
  reviewCount: number;
  averageRating: number;
  photoCount: number;
  postFrequency: GbpAudit['postFrequency'];
  servicesListed: boolean;
  hoursSet: boolean;
  bookingEnabled: boolean;
  qAndAActive: boolean;
  categoriesSet: boolean;
  descriptionLength: number;
  websiteLinked: boolean;
  phoneCorrect: boolean;
  addressCorrect: boolean;
  coverPhotoSet: boolean;
  logoSet: boolean;
}

export function calculateGbpAuditScore(input: AuditInput): { score: number; issues: GbpAuditIssue[] } {
  let score = 0;
  const issues: GbpAuditIssue[] = [];

  // Reviews (max 10)
  if (input.reviewCount >= 50) score += 10;
  else if (input.reviewCount >= 20) score += 7;
  else if (input.reviewCount >= 10) score += 4;
  else {
    issues.push({ id: uuid(), field: 'reviewCount', severity: 'critical', message: `Only ${input.reviewCount} reviews — competitors average 30-50+`, recommendation: 'Launch a review acquisition campaign. Send review requests after every completed job.', resolved: false });
  }

  // Rating (max 10)
  if (input.averageRating >= 4.5) score += 10;
  else if (input.averageRating >= 4.0) score += 7;
  else if (input.averageRating >= 3.5) score += 4;
  else {
    issues.push({ id: uuid(), field: 'averageRating', severity: 'high', message: `Rating is ${input.averageRating} — below the 4.0 threshold customers trust`, recommendation: 'Respond professionally to negative reviews. Focus on service quality to earn 5-star reviews.', resolved: false });
  }

  // Photos (max 8)
  if (input.photoCount >= 20) score += 8;
  else if (input.photoCount >= 10) score += 5;
  else if (input.photoCount >= 5) score += 3;
  else {
    issues.push({ id: uuid(), field: 'photoCount', severity: 'high', message: `Only ${input.photoCount} photos — competitors average 20-50`, recommendation: 'Add before/after photos, team photos, equipment, and completed work. Aim for 25+ photos.', resolved: false });
  }

  // Post frequency (max 10)
  const postScores: Record<string, number> = { daily: 10, weekly: 10, monthly: 6, rarely: 3, none: 0 };
  score += postScores[input.postFrequency] || 0;
  if (input.postFrequency === 'none' || input.postFrequency === 'rarely') {
    issues.push({ id: uuid(), field: 'postFrequency', severity: 'high', message: `Posts are ${input.postFrequency} — Google favors active businesses`, recommendation: 'Post at least weekly. Use seasonal promotions, job highlights, and tips content.', resolved: false });
  }

  // Boolean fields (5 pts each, max 35)
  const boolChecks: { field: keyof AuditInput; points: number; message: string; rec: string }[] = [
    { field: 'servicesListed', points: 5, message: 'Services not listed on GBP', rec: 'Add all services with descriptions and pricing.' },
    { field: 'hoursSet', points: 5, message: 'Business hours not set', rec: 'Set accurate business hours including special hours for holidays.' },
    { field: 'bookingEnabled', points: 5, message: 'Booking not enabled', rec: 'Enable booking through GBP or link to your booking page.' },
    { field: 'qAndAActive', points: 5, message: 'Q&A section inactive', rec: 'Seed Q&A with common customer questions and answers.' },
    { field: 'categoriesSet', points: 5, message: 'Business categories not fully set', rec: 'Set primary and secondary categories accurately.' },
    { field: 'websiteLinked', points: 5, message: 'Website not linked', rec: 'Link your website in the GBP profile.' },
    { field: 'phoneCorrect', points: 5, message: 'Phone number may be incorrect', rec: 'Verify phone number matches your actual business line.' },
    { field: 'addressCorrect', points: 5, message: 'Address may be incorrect', rec: 'Verify address matches across all directory listings.' },
    { field: 'coverPhotoSet', points: 5, message: 'No cover photo set', rec: 'Add a professional cover photo showcasing your business.' },
    { field: 'logoSet', points: 4, message: 'No logo uploaded', rec: 'Upload a clear, professional logo.' },
  ];

  for (const check of boolChecks) {
    if (input[check.field]) {
      score += check.points;
    } else {
      issues.push({ id: uuid(), field: check.field, severity: check.points >= 5 ? 'medium' : 'low', message: check.message, recommendation: check.rec, resolved: false });
    }
  }

  // Description length (max 8)
  if (input.descriptionLength >= 750) score += 8;
  else if (input.descriptionLength >= 500) score += 5;
  else if (input.descriptionLength >= 250) score += 3;
  else {
    issues.push({ id: uuid(), field: 'descriptionLength', severity: 'medium', message: `Description is ${input.descriptionLength} chars — recommend 750+`, recommendation: 'Write a detailed business description with keywords, services, and service area.', resolved: false });
  }

  // Sort issues by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { score: Math.min(100, score), issues };
}
