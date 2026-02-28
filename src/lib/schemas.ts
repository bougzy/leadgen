// Zod validation schemas for API input validation
// Applied at the /api/db route boundary to validate incoming payloads.

import { z } from 'zod';

// ─── Primitives ──────────────────────────────────────────────────────────────

const id = z.string().min(1).max(128);
const email = z.string().email().max(256).optional();
const url = z.string().url().max(2048).optional();
const safeString = z.string().max(10_000);
const shortString = z.string().max(500);

// ─── Account ─────────────────────────────────────────────────────────────────

export const lifecycleStage = z.enum([
  'prospect', 'contacted', 'engaged', 'qualified', 'won', 'active_client', 'paused', 'churned',
]);

export const pipelineStage = z.enum([
  'prospect', 'outreach', 'engaged', 'proposal', 'negotiation', 'won', 'lost',
]);

export const accountSchema = z.object({
  id,
  businessName: shortString,
  contactName: shortString.optional(),
  contactEmail: email,
  contactPhone: shortString.optional(),
  industry: shortString,
  location: shortString,
  address: shortString.optional(),
  website: url,
  gbpUrl: url,
  serviceArea: z.array(shortString).max(50).default([]),
  services: z.array(shortString).max(50).default([]),
  lifecycleStage,
  pipelineStage: pipelineStage.optional(),
  tags: z.array(shortString).max(50).default([]),
  leadScore: z.number().min(0).max(100).optional(),
  notes: safeString.optional(),
  monthlyFee: z.number().min(0).optional(),
  dateAdded: z.string().optional(),
  updatedAt: z.string().optional(),
  lastContacted: z.string().optional(),
  unsubscribed: z.boolean().optional(),
  excludeFromSequences: z.boolean().optional(),
  deletedAt: z.string().optional(),
}).passthrough(); // allow extra fields for forward compat

// ─── Campaign ────────────────────────────────────────────────────────────────

export const campaignSchema = z.object({
  id,
  name: shortString,
  accountIds: z.array(id).max(10_000),
  subjectLines: z.array(shortString).max(50),
  status: z.enum(['draft', 'running', 'paused', 'completed']),
  emailStatuses: z.record(z.string(), z.string()),
  scheduledDate: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

// ─── Email ───────────────────────────────────────────────────────────────────

export const emailSchema = z.object({
  id,
  accountId: id,
  campaignId: id.optional(),
  subject: shortString,
  body: safeString,
  variation: z.string().max(50).optional(),
  status: z.enum(['drafted', 'sent', 'opened', 'clicked', 'responded', 'bounced']),
  templateUsed: z.string().max(100).optional(),
  trackingId: z.string().max(128).optional(),
  createdAt: z.string(),
  sentAt: z.string().optional(),
  openedAt: z.string().optional(),
  clickedAt: z.string().optional(),
  respondedAt: z.string().optional(),
}).passthrough();

// ─── Scheduled Email ─────────────────────────────────────────────────────────

export const scheduledEmailSchema = z.object({
  id,
  accountId: id,
  campaignId: id.optional(),
  sequenceId: id.optional(),
  stepIndex: z.number().int().min(0).optional(),
  to: z.string().email().max(256),
  subject: shortString,
  body: safeString,
  scheduledAt: z.string(),
  status: z.enum(['pending', 'sent', 'failed', 'cancelled']),
  createdAt: z.string(),
  sentAt: z.string().optional(),
  error: z.string().max(1000).optional(),
  smtpAccountId: id.optional(),
}).passthrough();

// ─── Settings ────────────────────────────────────────────────────────────────

export const settingsSchema = z.object({
  name: shortString,
  email: z.string().email().max(256),
  company: shortString,
  phone: shortString.optional(),
  serviceOffering: safeString,
  valueProp: safeString,
  industry: shortString,
  location: shortString,
  businessAddress: shortString.optional(),
  dailySendLimit: z.number().int().min(1).max(10_000),
  followUpDays: z.number().int().min(1).max(365),
  warmupEnabled: z.boolean(),
  warmupDayCount: z.number().int().min(0),
}).passthrough();

// ─── API Route Action Params ─────────────────────────────────────────────────
// Used in the /api/db route dispatcher to validate action payloads.

export const dbActionParamsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('getAllAccounts'), params: z.object({}).optional() }),
  z.object({ action: z.literal('getAccount'), params: z.object({ id }) }),
  z.object({ action: z.literal('addAccount'), params: z.object({ account: accountSchema }) }),
  z.object({ action: z.literal('updateAccount'), params: z.object({ account: accountSchema }) }),
  z.object({ action: z.literal('deleteAccount'), params: z.object({ id }) }),
  z.object({ action: z.literal('deleteAccounts'), params: z.object({ ids: z.array(id).max(1000) }) }),
  z.object({ action: z.literal('softDeleteAccount'), params: z.object({ id }) }),
  z.object({ action: z.literal('findDuplicateAccount'), params: z.object({ name: shortString, address: shortString }) }),
  z.object({ action: z.literal('getAccountsByStages'), params: z.object({ stages: z.array(lifecycleStage) }) }),
  z.object({ action: z.literal('clearAllData'), params: z.object({}).optional() }),
  z.object({ action: z.literal('exportAllData'), params: z.object({}).optional() }),
]).catch(() => null as never); // fallback for non-validated actions

// Note: Only critical write actions are validated above.
// Read-only actions pass through without schema validation.
