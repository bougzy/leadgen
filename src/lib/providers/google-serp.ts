// Google SERP scraping provider implementation

import type { SerpProvider, SerpResult } from './index';

export class GoogleSerpProvider implements SerpProvider {
  name = 'google-serp';

  async checkRanking(keyword: string, location: string, targetDomain?: string): Promise<SerpResult> {
    const query = `${keyword} ${location}`.trim();
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20&gl=us`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Google search returned ${res.status}`);
    const html = await res.text();

    // Extract organic results
    const topResults: { position: number; url: string; title: string }[] = [];
    const resultRegex = /<a href="\/url\?q=(https?:\/\/[^&"]+)[^"]*"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;
    let match;
    let pos = 0;

    while ((match = resultRegex.exec(html)) !== null && pos < 20) {
      pos++;
      const resultUrl = decodeURIComponent(match[1]);
      const title = match[2].replace(/<[^>]+>/g, '');
      topResults.push({ position: pos, url: resultUrl, title });
    }

    // If regex failed, try alternative pattern
    if (topResults.length === 0) {
      const altRegex = /href="(https?:\/\/(?!www\.google)[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/g;
      let altMatch;
      pos = 0;
      while ((altMatch = altRegex.exec(html)) !== null && pos < 20) {
        pos++;
        const resultUrl = altMatch[1];
        const title = altMatch[2].replace(/<[^>]+>/g, '').trim();
        if (title) topResults.push({ position: pos, url: resultUrl, title });
      }
    }

    // Find target domain position
    let position: number | null = null;
    if (targetDomain) {
      const normalizedDomain = targetDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
      const found = topResults.find((r) => {
        const rDomain = r.url.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase();
        return rDomain.startsWith(normalizedDomain);
      });
      if (found) position = found.position;
    }

    // Total results estimate
    const totalMatch = html.match(/About ([\d,]+) results/);
    const totalResults = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : undefined;

    return { position, topResults, totalResults };
  }
}
