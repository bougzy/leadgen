// Provider Abstraction Layer
// Defines interfaces for external service integrations so implementations
// can be swapped without changing consuming code.

// ─── Search Provider ─────────────────────────────────────────────────────────

export interface BusinessSearchResult {
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  placeId?: string;
  types?: string[];
}

export interface SearchProvider {
  name: string;
  search(query: string, location: string): Promise<BusinessSearchResult[]>;
}

// ─── Email Sender Provider ───────────────────────────────────────────────────

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailSenderProvider {
  name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

// ─── Review/Reputation Provider ──────────────────────────────────────────────

export interface ReviewData {
  reviewerName: string;
  rating: number;
  reviewText: string;
  reviewDate?: string;
}

export interface ReputationSnapshot {
  averageRating?: number;
  reviewCount?: number;
  reviews?: ReviewData[];
}

export interface ReputationProvider {
  name: string;
  getReputation(identifier: string): Promise<ReputationSnapshot>;
}

// ─── SERP Provider ───────────────────────────────────────────────────────────

export interface SerpResult {
  position: number | null;
  url?: string;
  topResults: { position: number; url: string; title: string }[];
  totalResults?: number;
}

export interface SerpProvider {
  name: string;
  checkRanking(keyword: string, location: string, targetDomain?: string): Promise<SerpResult>;
}

// ─── Provider Registry ───────────────────────────────────────────────────────

class ProviderRegistry {
  private searchProviders = new Map<string, SearchProvider>();
  private emailProviders = new Map<string, EmailSenderProvider>();
  private reputationProviders = new Map<string, ReputationProvider>();
  private serpProviders = new Map<string, SerpProvider>();

  private defaultSearch: string | null = null;
  private defaultEmail: string | null = null;
  private defaultReputation: string | null = null;
  private defaultSerp: string | null = null;

  // Search
  registerSearch(provider: SearchProvider, isDefault = false): void {
    this.searchProviders.set(provider.name, provider);
    if (isDefault || !this.defaultSearch) this.defaultSearch = provider.name;
  }

  getSearch(name?: string): SearchProvider | undefined {
    return this.searchProviders.get(name || this.defaultSearch || '');
  }

  // Email
  registerEmail(provider: EmailSenderProvider, isDefault = false): void {
    this.emailProviders.set(provider.name, provider);
    if (isDefault || !this.defaultEmail) this.defaultEmail = provider.name;
  }

  getEmail(name?: string): EmailSenderProvider | undefined {
    return this.emailProviders.get(name || this.defaultEmail || '');
  }

  // Reputation
  registerReputation(provider: ReputationProvider, isDefault = false): void {
    this.reputationProviders.set(provider.name, provider);
    if (isDefault || !this.defaultReputation) this.defaultReputation = provider.name;
  }

  getReputation(name?: string): ReputationProvider | undefined {
    return this.reputationProviders.get(name || this.defaultReputation || '');
  }

  // SERP
  registerSerp(provider: SerpProvider, isDefault = false): void {
    this.serpProviders.set(provider.name, provider);
    if (isDefault || !this.defaultSerp) this.defaultSerp = provider.name;
  }

  getSerp(name?: string): SerpProvider | undefined {
    return this.serpProviders.get(name || this.defaultSerp || '');
  }
}

export const providers = new ProviderRegistry();
