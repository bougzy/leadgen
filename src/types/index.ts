import { z } from 'zod';

// ======= UNIFIED ACCOUNT (Growth OS Core Entity) =======
// Replaces both Lead and ClientSite with a single lifecycle-aware entity.

export type LifecycleStage =
  | 'prospect'      // Not yet contacted (was Lead status='new')
  | 'contacted'     // First outreach sent (was Lead status='contacted')
  | 'engaged'       // Showed interest / replied (was Lead status='responded')
  | 'qualified'     // Meeting / proposal stage (was Lead status='qualified')
  | 'won'           // Deal closed / onboarding (was Lead status='closed', ClientSite status='onboarding')
  | 'active_client' // Actively managed client (was ClientSite status='active')
  | 'paused'        // Client on hold (was ClientSite status='paused')
  | 'churned';      // Lost / cancelled (was Lead status='rejected', ClientSite status='churned')

export type PipelineStage = 'prospect' | 'outreach' | 'engaged' | 'meeting' | 'proposal' | 'won' | 'lost';

export interface Account {
  id: string;
  // Identity
  businessName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  industry: string;
  location: string;
  address?: string;
  website?: string;
  // Online Presence
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
  gbpUrl?: string;
  gbpPlaceId?: string;
  // Scoring
  tags: string[];
  leadScore: number;
  healthIndex?: number;
  // Lifecycle
  lifecycleStage: LifecycleStage;
  pipelineStage: PipelineStage;
  // Outreach
  unsubscribed?: boolean;
  excludeFromSequences?: boolean;
  lastContacted?: string;
  // Client Fields (populated when lifecycleStage is won/active_client/paused)
  services: string[];
  serviceArea: string[];
  monthlyFee?: number;
  contractStartDate?: string;
  // Meta
  dealValue?: number;
  notes: string;
  source?: 'manual' | 'search' | 'csv_import' | 'enrichment';
  customData?: Record<string, unknown>;
  deletedAt?: string;
  dateAdded: string;
  updatedAt: string;
}

// Backward compatibility aliases
/** @deprecated Use Account */
export type Lead = Account;
/** @deprecated Use ClientSite → Account */
export type ClientSite = Account;
/** @deprecated Use LifecycleStage */
export type LeadStatus = 'new' | 'contacted' | 'responded' | 'qualified' | 'closed' | 'rejected';
/** @deprecated Use LifecycleStage */
export type ClientSiteStatus = 'active' | 'onboarding' | 'paused' | 'churned';

// ======= LIFECYCLE HELPERS =======

export function statusToLifecycle(status: LeadStatus): LifecycleStage {
  const map: Record<LeadStatus, LifecycleStage> = {
    new: 'prospect', contacted: 'contacted', responded: 'engaged',
    qualified: 'qualified', closed: 'won', rejected: 'churned',
  };
  return map[status] ?? 'prospect';
}

export function lifecycleToStatus(stage: LifecycleStage): LeadStatus {
  const map: Record<LifecycleStage, LeadStatus> = {
    prospect: 'new', contacted: 'contacted', engaged: 'responded',
    qualified: 'qualified', won: 'closed', active_client: 'closed',
    paused: 'closed', churned: 'rejected',
  };
  return map[stage] ?? 'new';
}

export function clientStatusToLifecycle(status: ClientSiteStatus): LifecycleStage {
  const map: Record<ClientSiteStatus, LifecycleStage> = {
    onboarding: 'won', active: 'active_client', paused: 'paused', churned: 'churned',
  };
  return map[status] ?? 'active_client';
}

export function lifecycleToPipelineStage(stage: LifecycleStage): PipelineStage {
  const map: Record<LifecycleStage, PipelineStage> = {
    prospect: 'prospect', contacted: 'outreach', engaged: 'engaged',
    qualified: 'meeting', won: 'won', active_client: 'won',
    paused: 'won', churned: 'lost',
  };
  return map[stage] ?? 'prospect';
}

export const LIFECYCLE_STAGES: { value: LifecycleStage; label: string; color: string }[] = [
  { value: 'prospect', label: 'Prospect', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { value: 'contacted', label: 'Contacted', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: 'engaged', label: 'Engaged', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'qualified', label: 'Qualified', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { value: 'won', label: 'Won', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  { value: 'active_client', label: 'Active Client', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'paused', label: 'Paused', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  { value: 'churned', label: 'Churned', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
];

export function isClientStage(stage: LifecycleStage): boolean {
  return ['won', 'active_client', 'paused'].includes(stage);
}

// ======= CAMPAIGN =======
export interface Campaign {
  id: string;
  name: string;
  description: string;
  accountIds: string[];
  templateId?: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  emailStatuses: Record<string, EmailStatus>;
  createdAt: string;
  updatedAt: string;
}

export type EmailStatus = 'drafted' | 'sent' | 'opened' | 'clicked' | 'responded' | 'bounced';

// ======= EMAIL =======
export interface Email {
  id: string;
  accountId: string;
  campaignId?: string;
  subject: string;
  body: string;
  variation: 'short' | 'medium' | 'detailed';
  status: EmailStatus;
  templateUsed: string;
  abTestGroup?: 'A' | 'B';
  createdAt: string;
  sentAt?: string;
  scheduledAt?: string;
  openedAt?: string;
  clickedAt?: string;
  respondedAt?: string;
  bouncedAt?: string;
  trackingId?: string;
}

// ======= EMAIL TEMPLATE =======
export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subjectLines: string[];
  body: string;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt?: string;
  stats?: {
    sent: number;
    opened: number;
    responded: number;
  };
}

// ======= FOLLOW-UP SEQUENCE =======
export interface FollowUpSequence {
  id: string;
  name: string;
  steps: FollowUpStep[];
  isActive: boolean;
  createdAt: string;
}

export interface FollowUpStep {
  id: string;
  delayDays: number;
  subject: string;
  body: string;
  condition: 'no_reply' | 'no_open' | 'always';
}

// ======= SCHEDULED EMAIL =======
export interface ScheduledEmail {
  id: string;
  accountId: string;
  campaignId?: string;
  sequenceId?: string;
  stepIndex?: number;
  to: string;
  subject: string;
  body: string;
  scheduledAt: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sentAt?: string;
  error?: string;
  createdAt: string;
  smtpAccountId?: string;
}

// ======= UNSUBSCRIBE =======
export interface UnsubscribeRecord {
  id: string;
  email: string;
  accountId?: string;
  reason?: string;
  unsubscribedAt: string;
}

// ======= SMTP ACCOUNT (Multi-Provider) =======
export type SmtpProvider = 'gmail' | 'zoho' | 'outlook' | 'custom';

export interface SmtpAccount {
  id: string;
  label: string;
  provider: SmtpProvider;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  encryptedPassword: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  dailyLimit: number;
  isActive: boolean;
  sendCount: number;
  lastUsedAt?: string;
  createdAt: string;
}

export const SMTP_PRESETS: Record<SmtpProvider, Partial<SmtpAccount>> = {
  gmail: {
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    dailyLimit: 500,
  },
  zoho: {
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpSecure: true,
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapSecure: true,
    dailyLimit: 50,
  },
  outlook: {
    smtpHost: 'smtp-mail.outlook.com',
    smtpPort: 587,
    smtpSecure: false,
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    dailyLimit: 300,
  },
  custom: {
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    dailyLimit: 100,
  },
};

// ======= SEARCH CACHE =======
export interface SearchCache {
  id: string;
  query: string;
  location: string;
  results: SearchResult[];
  cachedAt: string;
  expiresAt: string;
}

// ======= INBOX REPLY (IMAP-detected) =======
export type ReplyCategory = 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'auto_reply' | 'unknown';

export interface InboxReply {
  id: string;
  fromEmail: string;
  fromName?: string;
  subject: string;
  bodySnippet: string;
  messageId: string;
  inReplyTo?: string;
  matchedEmailId?: string;
  matchedAccountId?: string;
  replyCategory: ReplyCategory;
  isRead: boolean;
  receivedAt: string;
  detectedAt: string;
  accountId: string;
}

// ======= USER SETTINGS =======
export interface UserSettings {
  id: string;
  name: string;
  email: string;
  phone: string;
  businessAddress: string;
  serviceOffering: string;
  valueProp: string;
  targetLocation: string;
  dailyEmailGoal: number;
  dailySendLimit: number;
  warmupEnabled: boolean;
  warmupDayCount: number;
  followUpDays: number;
  darkMode: boolean;
  googleApiKey?: string;
  smtpEmail?: string;
  smtpPassword?: string;
  onboardingComplete?: boolean;
  unsubscribeMessage: string;
  imapPollingEnabled: boolean;
  imapPollingIntervalMinutes: number;
}

export interface SearchResult {
  placeId: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  types?: string[];
  tags: string[];
  leadScore: number;
  emails: string[];
  websiteAnalysis?: {
    isUp: boolean;
    isMobile: boolean;
    loadTimeMs: number;
    hasEmail: boolean;
  };
}

export interface Suggestion {
  id: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  text: string;
  action: string;
  accountIds?: string[];
  icon: string;
}

export interface ActivityItem {
  id: string;
  type: 'lead_added' | 'email_sent' | 'email_opened' | 'email_bounced' | 'response_received' | 'campaign_created' | 'lead_status_changed' | 'follow_up_sent' | 'email_scheduled';
  description: string;
  timestamp: string;
  accountId?: string;
  campaignId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ======= SEND LOG (for daily limits) =======
export interface SendLog {
  id: string;
  date: string; // YYYY-MM-DD
  count: number;
}

// ======= NOTIFICATION =======
export interface AppNotification {
  id: string;
  type: 'reply_received' | 'send_failed' | 'warmup_milestone' | 'daily_limit_reached' | 'bounce_detected';
  title: string;
  message: string;
  isRead: boolean;
  accountId?: string;
  actionUrl?: string;
  createdAt: string;
}

// ======= PAGINATION =======
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ======= AUTOMATION ENGINE =======

export type AutomationTaskType =
  | 'SEND_EMAIL'
  | 'FOLLOWUP_STEP'
  | 'SEND_REVIEW_REQUEST'
  | 'SEND_REVIEW_FOLLOWUP'
  | 'SEND_RETENTION_REMINDER'
  | 'CHECK_IMAP'
  | 'SMTP_RESET'
  | 'WARMUP_INCREMENT'
  | 'GENERATE_REPORT'
  | 'COMPUTE_ANALYTICS';

export interface AutomationTask {
  id: string;
  type: AutomationTaskType;
  accountId?: string;
  scheduledAt: string;
  payload: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  lastAttemptAt?: string;
  completedAt?: string;
  errorLog?: string[];
  createdAt: string;
}

// ======= EVENT BUS =======

export type SystemEventType =
  | 'email.sent' | 'email.opened' | 'email.clicked' | 'email.replied' | 'email.bounced'
  | 'pipeline.stage.changed' | 'lifecycle.changed'
  | 'review.received' | 'ranking.updated' | 'citation.updated'
  | 'reminder.sent' | 'referral.created' | 'account.converted'
  | 'task.completed' | 'task.failed';

export interface EventLogEntry {
  id: string;
  type: SystemEventType;
  accountId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ======= ANALYTICS =======

export interface AccountHealthMetrics {
  accountId: string;
  healthIndex: number;
  growthMomentum: number;
  conversionEfficiency: number;
  reputationRisk: number;
  computedAt: string;
}

export interface DashboardAnalytics {
  totalAccounts: number;
  byStage: Record<string, number>;
  emailMetrics: { sent: number; opened: number; clicked: number; replied: number; bounced: number; };
  conversionRate: number;
  avgLeadScore: number;
  pipelineValue: number;
  topIndustries: { industry: string; count: number; }[];
  automationHealth: { pending: number; processing: number; failed: number; deadLetter: number; };
  computedAt: string;
}

// ======= SYSTEM HEALTH =======

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  automationQueue: { pending: number; processing: number; failed: number; deadLetter: number; avgExecutionMs: number; };
  smtpHealth: { activeAccounts: number; totalSentToday: number; dailyLimitRemaining: number; failureRate: number; };
  databaseHealth: { connected: boolean; latencyMs: number; };
  workerStatus: { running: boolean; lastPollAt: string; tasksProcessedLast24h: number; };
  errorRate24h: number;
  lastCheckedAt: string;
}

// ======= AUDIT LOG =======

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ======= CONSTANTS =======

export const LEAD_STATUSES: { value: LeadStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: 'contacted', label: 'Contacted', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'responded', label: 'Responded', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'qualified', label: 'Qualified', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { value: 'closed', label: 'Closed', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
];

export const PIPELINE_STAGES: { value: PipelineStage; label: string; color: string }[] = [
  { value: 'prospect', label: 'Prospect', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' },
  { value: 'outreach', label: 'Outreach', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: 'engaged', label: 'Engaged', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'meeting', label: 'Meeting', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { value: 'proposal', label: 'Proposal', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  { value: 'won', label: 'Won', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
];

export const INDUSTRIES = [
  'Restaurant', 'Gym', 'Salon', 'Spa', 'Dental', 'Medical', 'Legal',
  'Real Estate', 'Auto Repair', 'Plumbing', 'Electrical', 'Landscaping',
  'Cleaning', 'Pet Services', 'Photography', 'Accounting', 'Retail', 'Other'
];

export const TAGS = [
  'no_website', 'bad_website', 'no_social', 'low_reviews',
  'not_mobile_friendly', 'slow_loading', 'outdated_design',
  'no_online_ordering', 'no_booking_system', 'poor_seo'
];

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'user-settings',
  name: '',
  email: '',
  phone: '',
  businessAddress: '',
  serviceOffering: 'Website development and digital marketing',
  valueProp: 'I help local businesses get more customers through modern websites and online presence.',
  targetLocation: '',
  dailyEmailGoal: 20,
  dailySendLimit: 50,
  warmupEnabled: true,
  warmupDayCount: 0,
  followUpDays: 5,
  darkMode: false,
  googleApiKey: '',
  smtpEmail: '',
  smtpPassword: '',
  onboardingComplete: false,
  unsubscribeMessage: 'If you don\'t want to receive emails from me, simply reply with "unsubscribe" and I\'ll remove you from my list immediately.',
  imapPollingEnabled: false,
  imapPollingIntervalMinutes: 5,
};

// ======= GBP AUDIT =======
export interface GbpAudit {
  id: string;
  accountId: string;
  reviewCount: number;
  averageRating: number;
  photoCount: number;
  postFrequency: 'none' | 'rarely' | 'monthly' | 'weekly' | 'daily';
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
  auditScore: number;
  issues: GbpAuditIssue[];
  createdAt: string;
}

export interface GbpAuditIssue {
  id: string;
  field: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  recommendation: string;
  resolved: boolean;
}

// ======= GBP POST =======
export type GbpPostType = 'update' | 'offer' | 'event' | 'product';

export interface GbpPost {
  id: string;
  accountId: string;
  templateId?: string;
  title: string;
  body: string;
  callToAction?: string;
  ctaUrl?: string;
  postType: GbpPostType;
  scheduledDate: string;
  status: 'draft' | 'scheduled' | 'published' | 'missed';
  publishedAt?: string;
  createdAt: string;
}

// ======= GBP POST TEMPLATE =======
export interface GbpPostTemplate {
  id: string;
  name: string;
  category: 'seasonal' | 'before_after' | 'service_spotlight' | 'tips' | 'promo' | 'holiday' | 'testimonial';
  title: string;
  body: string;
  callToAction?: string;
  isBuiltIn: boolean;
  createdAt: string;
}

// ======= REVIEW REQUEST =======
export interface ReviewRequest {
  id: string;
  accountId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  jobDate: string;
  jobDescription: string;
  reviewLink: string;
  status: 'pending' | 'initial_sent' | 'followup_sent' | 'completed' | 'declined';
  initialSentAt?: string;
  followupSentAt?: string;
  reviewReceivedAt?: string;
  createdAt: string;
}

// ======= CLIENT REVIEW =======
export type ReviewPlatform = 'google' | 'yelp' | 'homestars' | 'facebook' | 'bbb' | 'homeadvisor' | 'houzz' | 'other';

export interface ClientReview {
  id: string;
  accountId: string;
  platform: ReviewPlatform;
  reviewerName: string;
  rating: number;
  reviewText: string;
  reviewDate: string;
  responseText?: string;
  responseDraftText?: string;
  responseStatus: 'none' | 'draft' | 'posted';
  isNegative: boolean;
  socialPostGenerated: boolean;
  createdAt: string;
}

// ======= RANK KEYWORD =======
export interface RankingEntry {
  position: number | null;
  checkedAt: string;
  url?: string;
}

export interface RankKeyword {
  id: string;
  accountId: string;
  keyword: string;
  location: string;
  rankings: RankingEntry[];
  currentPosition?: number;
  previousPosition?: number;
  bestPosition?: number;
  createdAt: string;
  lastCheckedAt?: string;
}

// ======= COMPETITOR =======
export interface Competitor {
  id: string;
  accountId: string;
  businessName: string;
  website?: string;
  gbpUrl?: string;
  reviewCount: number;
  averageRating: number;
  photoCount: number;
  serviceAreas: string[];
  notes: string;
  lastUpdated: string;
  createdAt: string;
}

// ======= CITATION =======
export type CitationDirectory =
  | 'google' | 'yelp' | 'bbb' | 'homestars' | 'homeadvisor'
  | 'houzz' | 'yellow_pages' | 'apple_maps' | 'bing_places' | 'facebook';

export interface Citation {
  id: string;
  accountId: string;
  directory: CitationDirectory;
  url?: string;
  nameCorrect: boolean;
  addressCorrect: boolean;
  phoneCorrect: boolean;
  websiteCorrect: boolean;
  isListed: boolean;
  lastChecked: string;
  notes: string;
  createdAt: string;
}

// ======= SOCIAL CONTENT =======
export type SocialPlatform = 'instagram' | 'facebook' | 'nextdoor' | 'google' | 'twitter' | 'linkedin';

export interface SocialContent {
  id: string;
  accountId: string;
  templateId?: string;
  platform: SocialPlatform;
  title: string;
  body: string;
  hashtags: string[];
  scheduledDate: string;
  status: 'draft' | 'scheduled' | 'published' | 'missed';
  publishedAt?: string;
  linkedReviewId?: string;
  createdAt: string;
}

// ======= SOCIAL CONTENT TEMPLATE =======
export interface SocialContentTemplate {
  id: string;
  name: string;
  platform: SocialPlatform | 'all';
  category: 'before_after' | 'neighborhood' | 'recommendation' | 'review_repurpose' | 'seasonal_promo' | 'tip_content' | 'service_spotlight';
  title: string;
  body: string;
  hashtags: string[];
  isBuiltIn: boolean;
  createdAt: string;
}

// ======= REFERRAL RECORD =======
export interface ReferralRecord {
  id: string;
  accountId: string;
  referrerCustomerId: string;
  referrerName: string;
  referredName: string;
  referredEmail?: string;
  referredPhone?: string;
  referralCode: string;
  status: 'pending' | 'contacted' | 'converted' | 'expired';
  referrerDiscountApplied: boolean;
  referredDiscountApplied: boolean;
  convertedAt?: string;
  createdAt: string;
}

// ======= RETENTION REMINDER =======
export interface RetentionReminder {
  id: string;
  accountId: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  reminderType: 'seasonal_refresh' | 'maintenance' | 'followup' | 'anniversary';
  scheduledDate: string;
  message: string;
  status: 'pending' | 'sent' | 'cancelled';
  sentAt?: string;
  createdAt: string;
}

// ======= CLIENT CUSTOMER =======
export interface ClientCustomer {
  id: string;
  accountId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  firstJobDate?: string;
  lastJobDate?: string;
  totalJobs: number;
  totalRevenue: number;
  referralCode?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ======= CLIENT REPORT =======
export interface ClientReportMetrics {
  newReviews: number;
  averageRatingChange: number;
  rankingMovements: { keyword: string; previousPosition: number | null; currentPosition: number | null }[];
  emailsSent: number;
  leadsGenerated: number;
  socialPostsPublished: number;
  citationsFixed: number;
  referralsGenerated: number;
  retentionRemindersSent: number;
  reviewRequestsSent: number;
}

export interface ClientReport {
  id: string;
  accountId: string;
  month: string;
  metrics: ClientReportMetrics;
  summary: string;
  generatedAt: string;
}

// ======= CLIENT SITES CONSTANTS =======

export const CLIENT_SITE_STATUSES: { value: ClientSiteStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { value: 'onboarding', label: 'Onboarding', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { value: 'paused', label: 'Paused', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { value: 'churned', label: 'Churned', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
];

export const CITATION_DIRECTORIES: { value: CitationDirectory; label: string }[] = [
  { value: 'google', label: 'Google Business Profile' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'bbb', label: 'Better Business Bureau' },
  { value: 'homestars', label: 'Homestars' },
  { value: 'homeadvisor', label: 'HomeAdvisor' },
  { value: 'houzz', label: 'Houzz' },
  { value: 'yellow_pages', label: 'Yellow Pages' },
  { value: 'apple_maps', label: 'Apple Maps' },
  { value: 'bing_places', label: 'Bing Places' },
  { value: 'facebook', label: 'Facebook' },
];

export const REVIEW_PLATFORMS: { value: ReviewPlatform; label: string }[] = [
  { value: 'google', label: 'Google' },
  { value: 'yelp', label: 'Yelp' },
  { value: 'homestars', label: 'Homestars' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'bbb', label: 'BBB' },
  { value: 'homeadvisor', label: 'HomeAdvisor' },
  { value: 'houzz', label: 'Houzz' },
  { value: 'other', label: 'Other' },
];

export const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'nextdoor', label: 'Nextdoor' },
  { value: 'google', label: 'Google Business' },
  { value: 'twitter', label: 'Twitter/X' },
  { value: 'linkedin', label: 'LinkedIn' },
];

// ======= ZOD VALIDATION SCHEMAS =======

export const accountSchema = z.object({
  businessName: z.string().min(1, 'Business name is required'),
  industry: z.string().min(1, 'Industry is required'),
  location: z.string().min(1, 'Location is required'),
  contactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  contactPhone: z.string().optional(),
});

/** @deprecated Use accountSchema */
export const leadSchema = accountSchema;

export const emailSendSchema = z.object({
  to: z.string().email('Invalid recipient email'),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  body: z.string().min(1, 'Body is required'),
});

export const settingsSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  serviceOffering: z.string().min(1, 'Service offering is required'),
});
