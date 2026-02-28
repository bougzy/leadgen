import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { gbpUrl } = await req.json();
    
    if (!gbpUrl) {
      return NextResponse.json({ error: 'gbpUrl required' }, { status: 400 });
    }

    const response = await fetch(gbpUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch GBP page', data: null }, { status: 200 });
    }

    const html = await response.text();
    
    // Try to extract data from the page
    // This is best-effort — Google Maps pages are complex and may not always be parseable
    const data: Record<string, unknown> = {};
    
    // Try to find rating
    const ratingMatch = html.match(/(\d\.\d)\s*stars?/i) || html.match(/"ratingValue":\s*"?(\d\.?\d?)"?/);
    if (ratingMatch) data.averageRating = parseFloat(ratingMatch[1]);
    
    // Try to find review count
    const reviewMatch = html.match(/(\d[\d,]*)\s*review/i) || html.match(/"reviewCount":\s*"?(\d+)"?/);
    if (reviewMatch) data.reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
    
    // Try to find phone
    const phoneMatch = html.match(/(\+?\d[\d\s()-]{7,})/);
    if (phoneMatch) data.phone = phoneMatch[1].trim();

    return NextResponse.json({
      data: Object.keys(data).length > 0 ? data : null,
      message: Object.keys(data).length > 0 
        ? 'Partial data extracted. Please verify and fill in missing fields manually.'
        : 'Could not extract data automatically. Please enter audit data manually.',
    });
  } catch (error) {
    console.error('GBP scrape error:', error);
    return NextResponse.json({ error: 'Scraping failed', data: null }, { status: 200 });
  }
}
