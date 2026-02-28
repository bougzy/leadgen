import type { SocialPlatform } from '@/types';

const INDUSTRY_HASHTAGS: Record<string, string[]> = {
  'Cleaning': ['#cleaning', '#deepclean', '#carpetcleaning', '#professionalcleaning', '#cleaningtips', '#spotless', '#cleaningservice'],
  'Restaurant': ['#restaurant', '#foodie', '#localfood', '#diningout', '#foodlover', '#chef', '#eatlocal'],
  'Gym': ['#fitness', '#gym', '#workout', '#healthylifestyle', '#personaltraining', '#fitfam'],
  'Salon': ['#salon', '#hairstyle', '#beauty', '#haircare', '#hairdresser', '#beautysalon'],
  'Plumbing': ['#plumber', '#plumbing', '#plumbingservice', '#leakrepair', '#drainclean', '#emergencyplumber'],
  'Electrical': ['#electrician', '#electrical', '#electricalservice', '#wiring', '#homeelectrical'],
  'Landscaping': ['#landscaping', '#lawncare', '#gardening', '#outdoorliving', '#yardwork', '#landscape'],
  'Real Estate': ['#realestate', '#realtor', '#homesale', '#property', '#homebuyer', '#dreamhome'],
  'Dental': ['#dentist', '#dental', '#dentalcare', '#smile', '#oralhealth', '#teethcleaning'],
  'Auto Repair': ['#autorepair', '#mechanic', '#carrepair', '#autoshop', '#carcare', '#automotive'],
  'Pet Services': ['#petcare', '#doggrooming', '#petlover', '#dogsofinstagram', '#petsitter'],
  'Photography': ['#photographer', '#photography', '#photooftheday', '#portraitphotography'],
};

const PLATFORM_GENERIC: Record<SocialPlatform, string[]> = {
  instagram: ['#instagood', '#photooftheday', '#instalike', '#followme'],
  facebook: [],
  nextdoor: [],
  google: [],
  twitter: ['#trending'],
  linkedin: ['#business', '#networking', '#professional'],
};

export function getHashtagSuggestions(
  platform: SocialPlatform,
  industry: string,
  location: string,
  service?: string,
): string[] {
  const tags: string[] = [];

  // Industry tags
  const industryTags = INDUSTRY_HASHTAGS[industry] || [];
  tags.push(...industryTags.slice(0, 5));

  // Location tags
  const cleanLocation = location.replace(/[^a-zA-Z\s]/g, '').trim();
  if (cleanLocation) {
    const parts = cleanLocation.split(/\s+/);
    tags.push(`#${parts.join('').toLowerCase()}`);
    if (parts.length > 1) tags.push(`#${parts[0].toLowerCase()}`);
    tags.push(`#${cleanLocation.replace(/\s+/g, '').toLowerCase()}business`);
    tags.push(`#local${parts[0].toLowerCase()}`);
  }

  // Service tags
  if (service) {
    const cleanService = service.replace(/[^a-zA-Z\s]/g, '').trim().toLowerCase();
    tags.push(`#${cleanService.replace(/\s+/g, '')}`);
  }

  // Platform generic
  tags.push(...(PLATFORM_GENERIC[platform] || []));

  // Local business generic
  tags.push('#supportlocal', '#smallbusiness', '#localbusiness');

  // Deduplicate
  return [...new Set(tags)];
}
