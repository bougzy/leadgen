import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { keyword, location, clientDomain } = await req.json();
    
    if (!keyword || !location) {
      return NextResponse.json({ error: 'keyword and location required' }, { status: 400 });
    }

    const query = encodeURIComponent(`${keyword} ${location}`);
    const url = `https://www.google.com/search?q=${query}&num=100&gl=us`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch search results', position: null }, { status: 200 });
    }

    const html = await response.text();
    
    // Parse organic results from Google HTML
    const results: { position: number; title: string; url: string }[] = [];
    // Match href patterns in search results
    const directLinkRegex = /href="(https?:\/\/(?!www\.google\.com|accounts\.google\.com|support\.google\.com|maps\.google\.com|translate\.google\.com|play\.google\.com)[^"]+)"/g;
    
    let match;
    const seen = new Set<string>();
    
    // Try direct links first
    while ((match = directLinkRegex.exec(html)) !== null) {
      const resultUrl = decodeURIComponent(match[1]);
      const domain = new URL(resultUrl).hostname;
      if (!seen.has(domain) && !resultUrl.includes('google.com') && !resultUrl.includes('googleapis.com') && !resultUrl.includes('gstatic.com')) {
        seen.add(domain);
        results.push({ position: results.length + 1, title: domain, url: resultUrl });
      }
      if (results.length >= 100) break;
    }

    // Find client position
    let position: number | null = null;
    let matchedUrl: string | null = null;
    
    if (clientDomain) {
      const cleanDomain = clientDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
      for (const r of results) {
        const resultDomain = r.url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
        if (resultDomain.includes(cleanDomain) || cleanDomain.includes(resultDomain)) {
          position = r.position;
          matchedUrl = r.url;
          break;
        }
      }
    }

    return NextResponse.json({
      position,
      url: matchedUrl,
      topResults: results.slice(0, 10),
      totalResults: results.length,
    });
  } catch (error) {
    console.error('SERP scrape error:', error);
    return NextResponse.json({ error: 'Scraping failed', position: null }, { status: 200 });
  }
}
