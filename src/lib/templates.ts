import type { Lead, UserSettings, EmailTemplate } from '@/types';
import { processSpintax } from './utils';

export interface GeneratedEmail {
  subject: string;
  body: string;
  variation: 'short' | 'medium' | 'detailed';
  templateUsed: string;
}

const BUILT_IN_TEMPLATES: EmailTemplate[] = [
  {
    id: 'tpl-no-website',
    name: 'No Website',
    category: 'no_website',
    subjectLines: [
      'Quick question about {business_name}',
      'Noticed {business_name} isn\'t online yet',
      '{business_name} - potential customers are missing you',
      'Helping {industry} businesses like {business_name} get found online',
      'A quick idea for {business_name}',
    ],
    body: `Hi {contact_name},

I was looking for {industry} in {location} and came across {business_name}.

I noticed you don't have a website, which means when people search for {industry} in your area, they're finding your competitors instead.

{value_prop}

Would you be open to a quick 10-minute call to discuss?

Best,
{your_name}`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tpl-bad-website',
    name: 'Bad Website',
    category: 'bad_website',
    subjectLines: [
      'Your {business_name} website might need an update',
      'Noticed something about {business_name}',
      'Quick website audit for {business_name}',
      '{business_name} - a small fix that could bring more customers',
      'Honest feedback on {business_name}\'s online presence',
    ],
    body: `Hi {contact_name},

Came across {business_name} while researching {industry} in {location}.

Took a quick look at your website and noticed a few things that might be costing you customers:
- Not mobile-friendly (60% of visitors use phones)
- Slow loading times
- Outdated design

{value_prop}

Interested in a free 10-minute audit?

Best,
{your_name}`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tpl-no-social',
    name: 'No Social Media',
    category: 'no_social',
    subjectLines: [
      '{business_name} - social media opportunity',
      'Noticed {business_name} isn\'t on Instagram',
      'Quick question about {business_name}\'s marketing',
      '{industry} businesses are getting customers from social media',
      'A growth idea for {business_name}',
    ],
    body: `Hi {contact_name},

{business_name} has great potential, but I noticed you're not active on social media.

{industry} businesses posting consistently typically see 40-50% more customer engagement.

{value_prop}

Would you like to chat about it?

Best,
{your_name}`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tpl-low-reviews',
    name: 'Low Reviews',
    category: 'low_reviews',
    subjectLines: [
      '{business_name} - quick way to get more reviews',
      'Noticed {business_name} has room for more reviews',
      'How {industry} businesses are getting 5-star reviews',
      '{business_name} - stand out from competitors',
      'A simple strategy for {business_name}',
    ],
    body: `Hi {contact_name},

I came across {business_name} in {location} and noticed you have room for more online reviews.

Businesses with 50+ reviews get 3x more clicks than those with fewer. Right now, your competitors might be winning customers just because they have more reviews.

{value_prop}

Quick 10-minute call to discuss a simple review strategy?

Best,
{your_name}`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'tpl-general',
    name: 'General Outreach',
    category: 'general',
    subjectLines: [
      'Quick idea for {business_name}',
      'Helping {industry} businesses grow in {location}',
      '{business_name} - growth opportunity',
      'Question about {business_name}',
      'A thought about {business_name}\'s online presence',
    ],
    body: `Hi {contact_name},

I came across {business_name} while looking at {industry} businesses in {location}.

I work with local businesses to help them attract more customers online. I noticed a few opportunities that could help {business_name} stand out.

{value_prop}

Would you be open to a brief chat?

Best,
{your_name}`,
    isBuiltIn: true,
    createdAt: new Date().toISOString(),
  },
];

export function getBuiltInTemplates(): EmailTemplate[] {
  return BUILT_IN_TEMPLATES;
}

function substituteVariables(
  text: string,
  lead: Lead,
  settings: UserSettings
): string {
  const vars: Record<string, string> = {
    '{business_name}': lead.name,
    '{contact_name}': lead.contactName || 'there',
    '{first_name}': lead.contactName?.split(' ')[0] || 'there',
    '{industry}': lead.industry.toLowerCase(),
    '{location}': lead.location,
    '{website}': lead.website || 'None',
    '{your_name}': settings.name || '[Your Name]',
    '{your_email}': settings.email || '[Your Email]',
    '{your_phone}': settings.phone || '[Your Phone]',
    '{service_offering}': settings.serviceOffering || '[Your Service]',
    '{value_prop}': settings.valueProp || 'I can help your business grow online.',
    '{target_location}': settings.targetLocation || lead.location,
  };

  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(key, value);
  }
  return result;
}

function pickBestTemplate(lead: Lead): EmailTemplate {
  // Pick template based on lead's tags
  if (lead.tags.includes('no_website') || (!lead.website || lead.website.trim() === '')) {
    return BUILT_IN_TEMPLATES.find(t => t.category === 'no_website')!;
  }
  if (lead.tags.includes('bad_website') || lead.tags.includes('not_mobile_friendly') || lead.tags.includes('outdated_design') || lead.tags.includes('slow_loading')) {
    return BUILT_IN_TEMPLATES.find(t => t.category === 'bad_website')!;
  }
  if (lead.tags.includes('no_social')) {
    return BUILT_IN_TEMPLATES.find(t => t.category === 'no_social')!;
  }
  if (lead.tags.includes('low_reviews')) {
    return BUILT_IN_TEMPLATES.find(t => t.category === 'low_reviews')!;
  }
  return BUILT_IN_TEMPLATES.find(t => t.category === 'general')!;
}

function makeShortVersion(body: string): string {
  // Take the first greeting, the core pitch (1-2 sentences), and CTA
  const lines = body.split('\n').filter(l => l.trim() !== '');
  if (lines.length <= 4) return body;

  const greeting = lines[0];
  // Find the most impactful sentence (usually mentions the problem)
  const pitchLine = lines.find(l =>
    l.includes('noticed') || l.includes('opportunity') || l.includes('potential')
  ) || lines[1];
  const cta = lines.find(l =>
    l.includes('call') || l.includes('chat') || l.includes('discuss') || l.includes('?')
  ) || lines[lines.length - 2];
  const signoff = lines[lines.length - 1];

  return `${greeting}\n\n${pitchLine}\n\n${cta}\n\n${signoff}`;
}

function makeDetailedVersion(body: string, lead: Lead, settings: UserSettings): string {
  const industryInsights: Record<string, string> = {
    'restaurant': 'Did you know that 97% of customers look up restaurants online before visiting? And 77% check the menu on their phone before deciding where to eat.',
    'gym': 'Research shows that 81% of gym members start their search online. A strong web presence directly impacts membership signups.',
    'salon': 'Studies show that 82% of salon clients book appointments online. Without a booking system, you could be losing clients to competitors.',
    'spa': 'The wellness industry is booming - 67% of spa clients discover new spas through online searches and social media.',
    'dental': 'Over 70% of patients choose their dentist based on online reviews and website quality.',
    'medical': 'Patient acquisition is shifting online - 77% of patients use search engines before booking medical appointments.',
    'real estate': 'In today\'s market, 97% of homebuyers start their search online. Your digital presence is your storefront.',
    'auto repair': 'When a car breaks down, 83% of people search for "auto repair near me" on their phone. Being found online is critical.',
    'plumbing': 'Emergency plumbing searches happen 24/7. 88% of local service searches result in a call within 24 hours.',
    'cleaning': 'The cleaning industry has seen a 150% increase in online bookings. Customers prefer to book and pay online.',
  };

  const insight = industryInsights[lead.industry.toLowerCase()] ||
    `Local businesses that invest in their online presence see an average of 40% more customer inquiries.`;

  return `${body.split('\n').slice(0, -2).join('\n')}

${insight}

I've helped other ${lead.industry.toLowerCase()} businesses in the ${lead.location} area achieve real results. ${settings.valueProp}

Would love to share some specific ideas for ${lead.name}. Can we set up a quick 10-minute call this week?

Best,
${settings.name || '[Your Name]'}`;
}

export function generateEmails(
  lead: Lead,
  settings: UserSettings,
  customTemplate?: EmailTemplate
): GeneratedEmail[] {
  const template = customTemplate || pickBestTemplate(lead);
  const subjectIndex = Math.floor(Math.random() * template.subjectLines.length);

  const fullBody = processSpintax(substituteVariables(template.body, lead, settings));
  const subject = processSpintax(substituteVariables(template.subjectLines[subjectIndex], lead, settings));

  const shortBody = makeShortVersion(fullBody);
  const detailedBody = makeDetailedVersion(fullBody, lead, settings);

  return [
    {
      subject,
      body: shortBody,
      variation: 'short',
      templateUsed: template.id,
    },
    {
      subject: substituteVariables(
        template.subjectLines[(subjectIndex + 1) % template.subjectLines.length],
        lead,
        settings
      ),
      body: fullBody,
      variation: 'medium',
      templateUsed: template.id,
    },
    {
      subject: substituteVariables(
        template.subjectLines[(subjectIndex + 2) % template.subjectLines.length],
        lead,
        settings
      ),
      body: detailedBody,
      variation: 'detailed',
      templateUsed: template.id,
    },
  ];
}

export function getAllSubjectLines(lead: Lead, settings: UserSettings): string[] {
  const template = pickBestTemplate(lead);
  return template.subjectLines.map(s => substituteVariables(s, lead, settings));
}
