// Google Places API search provider implementation

import type { SearchProvider, BusinessSearchResult } from './index';

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
}

interface PlaceDetails {
  formatted_phone_number?: string;
  website?: string;
}

export class GooglePlacesProvider implements SearchProvider {
  name = 'google-places';

  async search(query: string, location: string): Promise<BusinessSearchResult[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not configured');

    const searchQuery = `${query} in ${location}`;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Places API error: ${res.status}`);

    const data = await res.json();
    const places: PlaceResult[] = data.results || [];

    // Fetch details for top results in batches
    const results: BusinessSearchResult[] = [];
    const batch = places.slice(0, 20);
    const batchSize = 5;

    for (let i = 0; i < batch.length; i += batchSize) {
      const chunk = batch.slice(i, i + batchSize);
      const details = await Promise.all(
        chunk.map((p) => this.getDetails(p.place_id, apiKey).catch(() => null)),
      );

      for (let j = 0; j < chunk.length; j++) {
        const place = chunk[j];
        const detail = details[j];
        results.push({
          name: place.name,
          address: place.formatted_address,
          phone: detail?.formatted_phone_number,
          website: detail?.website,
          rating: place.rating,
          reviewCount: place.user_ratings_total,
          placeId: place.place_id,
          types: place.types,
        });
      }
    }

    return results;
  }

  private async getDetails(placeId: string, apiKey: string): Promise<PlaceDetails | null> {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.result || null;
  }
}
