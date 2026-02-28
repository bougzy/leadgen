// Google Business Profile reputation provider (web scraping implementation)

import type { ReputationProvider, ReputationSnapshot, ReviewData } from './index';

export class GoogleReputationProvider implements ReputationProvider {
  name = 'google-gbp';

  async getReputation(gbpUrl: string): Promise<ReputationSnapshot> {
    const result: ReputationSnapshot = {};

    try {
      const res = await fetch(gbpUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadGen/1.0)' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return result;
      const html = await res.text();

      // Extract rating
      const ratingMatch = html.match(/(\d+\.?\d*)\s*(?:stars?|out of 5)/i)
        || html.match(/aria-label="(\d+\.?\d*)\s/);
      if (ratingMatch) {
        result.averageRating = parseFloat(ratingMatch[1]);
      }

      // Extract review count
      const countMatch = html.match(/([\d,]+)\s*(?:reviews?|Google reviews)/i);
      if (countMatch) {
        result.reviewCount = parseInt(countMatch[1].replace(/,/g, ''), 10);
      }

      // Extract reviews from JSON-LD if available
      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
      if (jsonLdMatch) {
        const reviews: ReviewData[] = [];
        for (const match of jsonLdMatch) {
          try {
            const jsonStr = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
            const jsonData = JSON.parse(jsonStr);
            if (jsonData.review && Array.isArray(jsonData.review)) {
              for (const r of jsonData.review) {
                reviews.push({
                  reviewerName: r.author?.name || 'Anonymous',
                  rating: r.reviewRating?.ratingValue || 0,
                  reviewText: r.reviewBody || '',
                  reviewDate: r.datePublished,
                });
              }
            }
          } catch { /* skip invalid JSON-LD */ }
        }
        if (reviews.length > 0) result.reviews = reviews;
      }
    } catch { /* scraping is best-effort */ }

    return result;
  }
}
