import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';
import type { Lead, ActivityItem } from '@/types';
import { calculateLeadScore } from './scoring';

export function generateId(): string {
  return uuidv4();
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function createActivity(
  type: ActivityItem['type'],
  description: string,
  leadId?: string,
  campaignId?: string
): ActivityItem {
  return {
    id: generateId(),
    type,
    description,
    timestamp: new Date().toISOString(),
    leadId,
    campaignId,
  };
}

export function parseCSV(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

export function csvRowToLead(row: Record<string, string>): Lead {
  const tags: string[] = [];
  const website = row.website || row.url || '';

  if (!website) tags.push('no_website');
  if (row.tags) {
    tags.push(...row.tags.split(';').map(t => t.trim()).filter(Boolean));
  }

  const lead: Lead = {
    id: generateId(),
    name: row.name || row.business_name || row.business || '',
    contactName: row.contact_name || row.contact || row.first_name || '',
    industry: row.industry || row.category || 'Other',
    location: row.location || row.city || row.address || '',
    website: website || undefined,
    email: row.email || undefined,
    phone: row.phone || row.telephone || undefined,
    tags,
    leadScore: 0,
    notes: row.notes || '',
    status: 'new',
    pipelineStage: 'prospect',
    source: 'csv_import',
    dateAdded: new Date().toISOString(),
  };

  lead.leadScore = calculateLeadScore(lead);
  return lead;
}

export function leadsToCSV(leads: Lead[]): string {
  const headers = ['name', 'contact_name', 'industry', 'location', 'website', 'email', 'phone', 'tags', 'score', 'status', 'notes', 'date_added'];
  const rows = leads.map(l => [
    l.name,
    l.contactName || '',
    l.industry,
    l.location,
    l.website || '',
    l.email || '',
    l.phone || '',
    l.tags.join(';'),
    l.leadScore.toString(),
    l.status,
    l.notes.replace(/,/g, ';'),
    l.dateAdded,
  ]);

  return [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
}

export function createMailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function createGmailLink(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export function processSpintax(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (match, content) => {
    // Only process if it looks like spintax (contains |) and not a template variable
    if (!content.includes('|')) return match;
    const options = content.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
}

export function getWarmupLimit(dayCount: number): number {
  if (dayCount <= 3) return 5;
  if (dayCount <= 7) return 10;
  if (dayCount <= 14) return 20;
  if (dayCount <= 21) return 35;
  return 50;
}

export function appendUnsubscribeFooter(
  body: string,
  recipientEmail: string,
  unsubMessage: string,
  businessAddress: string,
  trackingId?: string,
  baseUrl?: string
): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'https://leadgen.vercel.app';
  const unsubLink = `${base}/api/unsubscribe?email=${encodeURIComponent(recipientEmail)}${trackingId ? `&id=${encodeURIComponent(trackingId)}` : ''}`;
  return `${body}\n\n---\n${unsubMessage}\nUnsubscribe: ${unsubLink}\n${businessAddress}`;
}

export type ReplyCategory = 'interested' | 'not_interested' | 'out_of_office' | 'unsubscribe' | 'auto_reply' | 'unknown';

export function classifyReply(replyText: string): ReplyCategory {
  const text = replyText.toLowerCase();

  // Out of office
  if (text.includes('out of office') || text.includes('on vacation') || text.includes('away from') ||
      text.includes('on leave') || text.includes('will be back') || text.includes('auto-reply') ||
      text.includes('automatic reply') || text.includes('i am currently away') ||
      text.includes('maternity leave') || text.includes('paternity leave')) {
    return 'out_of_office';
  }

  // Unsubscribe
  if (text.includes('unsubscribe') || text.includes('remove me') || text.includes('stop emailing') ||
      text.includes('opt out') || text.includes('don\'t contact') || text.includes('do not contact') ||
      text.includes('take me off') || text.includes('stop sending')) {
    return 'unsubscribe';
  }

  // Auto-reply
  if (text.includes('this is an automated') || text.includes('do not reply to this') ||
      text.includes('this mailbox is not monitored') || text.includes('noreply') ||
      text.includes('no-reply') || text.length < 20) {
    return 'auto_reply';
  }

  // Not interested
  if (text.includes('not interested') || text.includes('no thanks') || text.includes('no thank you') ||
      text.includes('not looking') || text.includes('don\'t need') || text.includes('already have') ||
      text.includes('not for us') || text.includes('not a good fit') || text.includes('pass on this') ||
      text.includes('decline') || text.includes('no need')) {
    return 'not_interested';
  }

  // Interested
  if (text.includes('interested') || text.includes('tell me more') || text.includes('sounds good') ||
      text.includes('let\'s talk') || text.includes('set up a call') || text.includes('schedule a') ||
      text.includes('love to learn') || text.includes('would like to') || text.includes('can you send') ||
      text.includes('more information') || text.includes('sounds great') || text.includes('let\'s connect') ||
      text.includes('i\'d like') || text.includes('when are you') || text.includes('what times') ||
      text.includes('book a') || text.includes('available for') || text.includes('free to chat')) {
    return 'interested';
  }

  return 'unknown';
}

// Sample data generator for testing
export function generateSampleLeads(): Lead[] {
  const samples: Partial<Lead>[] = [
    { name: "Joe's Pizza", contactName: 'Joe Romano', industry: 'Restaurant', location: 'Miami, FL', tags: ['no_website', 'low_reviews'], email: 'joe@joespizza.com' },
    { name: 'Fit Factory Gym', contactName: 'Sarah Chen', industry: 'Gym', location: 'Miami, FL', website: 'http://fitfactorygym.com', tags: ['bad_website', 'not_mobile_friendly'], email: 'info@fitfactory.com' },
    { name: 'Luxe Hair Salon', contactName: 'Maria Lopez', industry: 'Salon', location: 'Miami Beach, FL', tags: ['no_website', 'no_social'], phone: '305-555-0123' },
    { name: 'Downtown Dental', contactName: 'Dr. James Park', industry: 'Dental', location: 'Miami, FL', website: 'http://downtowndental.com', tags: ['outdated_design', 'slow_loading'], email: 'info@downtowndental.com' },
    { name: 'Ocean View Spa', contactName: 'Lisa Wang', industry: 'Spa', location: 'Miami Beach, FL', tags: ['no_website', 'no_social', 'low_reviews'] },
    { name: 'Mike\'s Auto Repair', contactName: 'Mike Johnson', industry: 'Auto Repair', location: 'Coral Gables, FL', website: 'http://mikesauto.com', tags: ['bad_website'], email: 'mike@mikesauto.com' },
    { name: 'Green Thumb Landscaping', contactName: 'Carlos Diaz', industry: 'Landscaping', location: 'Miami, FL', tags: ['no_website', 'no_social'], phone: '305-555-0456' },
    { name: 'Paws & Claws Pet Care', contactName: 'Emily Brown', industry: 'Pet Services', location: 'Doral, FL', tags: ['no_website', 'low_reviews'], email: 'emily@pawsclaws.com' },
    { name: 'Flash Photography', contactName: 'David Kim', industry: 'Photography', location: 'Miami, FL', website: 'http://flashphoto.com', tags: ['not_mobile_friendly', 'poor_seo'], email: 'david@flashphoto.com' },
    { name: 'Bright Smile Dental', contactName: 'Dr. Ana Garcia', industry: 'Dental', location: 'Hialeah, FL', tags: ['no_website', 'low_reviews'] },
    { name: 'The Burger Joint', contactName: 'Tom Wilson', industry: 'Restaurant', location: 'Miami, FL', website: 'http://burgerjoint.com', tags: ['bad_website', 'no_online_ordering'], email: 'tom@burgerjoint.com' },
    { name: 'Zen Yoga Studio', contactName: 'Priya Patel', industry: 'Gym', location: 'Coconut Grove, FL', tags: ['no_website', 'no_booking_system'] },
    { name: 'Quick Clean Services', contactName: 'Rosa Martinez', industry: 'Cleaning', location: 'Miami, FL', tags: ['no_website', 'no_social'], phone: '305-555-0789' },
    { name: 'Smith & Associates Law', contactName: 'John Smith', industry: 'Legal', location: 'Brickell, FL', website: 'http://smithlaw.com', tags: ['outdated_design', 'poor_seo'], email: 'john@smithlaw.com' },
    { name: 'Fresh Bites Cafe', contactName: 'Nina Perez', industry: 'Restaurant', location: 'Wynwood, FL', tags: ['no_website', 'no_social', 'no_online_ordering'] },
  ];

  return samples.map(s => {
    const lead: Lead = {
      id: generateId(),
      name: s.name!,
      contactName: s.contactName,
      industry: s.industry!,
      location: s.location!,
      website: s.website,
      email: s.email,
      phone: s.phone,
      tags: s.tags || [],
      leadScore: 0,
      notes: '',
      status: 'new',
      pipelineStage: 'prospect',
      source: 'manual',
      dateAdded: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
    };
    lead.leadScore = calculateLeadScore(lead);
    return lead;
  });
}
