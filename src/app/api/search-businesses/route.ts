import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import * as dbServer from '@/lib/db-server';
import crypto from 'crypto';
import type { SearchCache } from '@/types';

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  types?: string[];
}

export async function POST(req: NextRequest) {
  try {
    // ---- Rate limiting: 5 req / min per IP ----
    const ip = getClientIp(req);
    const rl = rateLimit(ip, 5, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 },
      );
    }

    const { query, location, apiKey } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Google API key is required. Add it in Settings.' }, { status: 400 });
    }
    if (!query || !location) {
      return NextResponse.json({ error: 'Query and location are required.' }, { status: 400 });
    }

    // ---- Cache check ----
    const cacheKey = crypto.createHash('sha256')
      .update(`${query.toLowerCase()}:${location.toLowerCase()}`)
      .digest('hex');
    const cached = await dbServer.getSearchCache(query, location);
    if (cached) {
      return NextResponse.json({ results: cached.results, fromCache: true });
    }

    const searchText = `${query} in ${location}`;

    // Step 1: Text Search to find businesses
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchText)}&type=establishment&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status === 'REQUEST_DENIED') {
      return NextResponse.json({ error: 'Invalid API key or Places API not enabled.' }, { status: 401 });
    }
    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      return NextResponse.json({ error: `Google API error: ${searchData.status}` }, { status: 500 });
    }

    const places = searchData.results || [];
    if (places.length === 0) {
      return NextResponse.json({ results: [], fromCache: false });
    }

    // Step 2: Get details for each place (phone, website)
    const results: PlaceResult[] = [];

    // Fetch details in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < Math.min(places.length, 20); i += batchSize) {
      const batch = places.slice(i, i + batchSize);
      const detailPromises = batch.map(async (place: { place_id: string; name: string; formatted_address: string; rating?: number; user_ratings_total?: number; types?: string[] }) => {
        try {
          const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,types&key=${apiKey}`;
          const detailRes = await fetch(detailUrl);
          const detailData = await detailRes.json();

          if (detailData.status === 'OK' && detailData.result) {
            const d = detailData.result;
            return {
              placeId: place.place_id,
              name: d.name || place.name,
              address: d.formatted_address || place.formatted_address,
              phone: d.formatted_phone_number || undefined,
              website: d.website || undefined,
              rating: d.rating || place.rating,
              reviewCount: d.user_ratings_total || place.user_ratings_total || 0,
              types: d.types || place.types,
            };
          }

          // Fallback to basic search data
          return {
            placeId: place.place_id,
            name: place.name,
            address: place.formatted_address,
            rating: place.rating,
            reviewCount: place.user_ratings_total || 0,
            types: place.types,
          };
        } catch {
          return {
            placeId: place.place_id,
            name: place.name,
            address: place.formatted_address,
            rating: place.rating,
            reviewCount: place.user_ratings_total || 0,
            types: place.types,
          };
        }
      });

      const batchResults = await Promise.all(detailPromises);
      results.push(...batchResults);
    }

    // ---- Save to cache ----
    const cacheEntry: SearchCache = {
      id: cacheKey,
      query: query.toLowerCase(),
      location: location.toLowerCase(),
      results: results as unknown as SearchCache['results'],
      cachedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    await dbServer.setSearchCache(cacheEntry);

    return NextResponse.json({ results, fromCache: false });
  } catch (err) {
    console.error('Search error:', err);
    return NextResponse.json({ error: 'Failed to search businesses.' }, { status: 500 });
  }
}
