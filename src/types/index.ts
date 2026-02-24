import { z } from 'zod';

// ======= LEAD =======
export interface Lead {
  id: string;
  name: string;
  contactName?: string;
  industry: string;
  location: string;
  website?: string;
  email?: string;
  phone?: string;
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
  tags: string[];
  leadScore: number;
  notes: string;
  status: LeadStatus;
  pipelineStage: PipelineStage;
  dealValue?: number;
  dateAdded: string;
  lastContacted?: string;
  unsubscribed?: boolean;
  excludeFromSequences?: boolean;
  source?: 'manual' | 'search' | 'csv_import' | 'enrichment';
  customData?: Record<string, unknown>;
}

export type LeadStatus = 'new' | 'contacted' | 'responded' | 'qualified' | 'closed' | 'rejected';
export type PipelineStage = 'prospect' | 'outreach' | 'engaged' | 'meeting' | 'proposal' | 'won' | 'lost';

// ======= CAMPAIGN =======
export interface Campaign {
  id: string;
  name: string;
  description: string;
  leadIds: string[];
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
  leadId: string;
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
  leadId: string;
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
  leadId?: string;
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
  matchedLeadId?: string;
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
  leadIds?: string[];
  icon: string;
}

export interface ActivityItem {
  id: string;
  type: 'lead_added' | 'email_sent' | 'email_opened' | 'email_bounced' | 'response_received' | 'campaign_created' | 'lead_status_changed' | 'follow_up_sent' | 'email_scheduled';
  description: string;
  timestamp: string;
  leadId?: string;
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
  leadId?: string;
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

// ======= ZOD VALIDATION SCHEMAS =======

export const leadSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  industry: z.string().min(1, 'Industry is required'),
  location: z.string().min(1, 'Location is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  phone: z.string().optional(),
});

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
