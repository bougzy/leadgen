import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { gbpUrl } = await req.json();
    
    if (!gbpUrl) {
      return NextResponse.json({ error: 'gbpUrl required' }, { status: 400 });
    }

    // Attempt to fetch and parse public reviews
    // This is best-effort — Google heavily protects review data
    const response = await fetch(gbpUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ reviews: [], message: 'Could not fetch reviews. Please add reviews manually.' });
    }

    const html = await response.text();
    const reviews: { reviewerName: string; rating: number; reviewText: string; reviewDate: string }[] = [];
    
    // Try to extract review data from JSON-LD or embedded data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    if (jsonLdMatch) {
      for (const match of jsonLdMatch) {
        try {
          const json = JSON.parse(match.replace(/<\/?script[^>]*>/g, ''));
          if (json.review && Array.isArray(json.review)) {
            for (const r of json.review) {
              reviews.push({
                reviewerName: r.author?.name || 'Anonymous',
                rating: r.reviewRating?.ratingValue || 5,
                reviewText: r.reviewBody || '',
                reviewDate: r.datePublished || new Date().toISOString(),
              });
            }
          }
        } catch { /* ignore parse errors */ }
      }
    }

    return NextResponse.json({
      reviews,
      message: reviews.length > 0 
        ? `Found ${reviews.length} reviews. Please verify the data.`
        : 'Could not extract reviews automatically. Please add reviews manually.',
    });
  } catch (error) {
    console.error('Review scrape error:', error);
    return NextResponse.json({ reviews: [], message: 'Scraping failed. Please add reviews manually.' });
  }
}
