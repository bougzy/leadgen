import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// URL validation helpers – prevent SSRF by blocking private / internal IPs
// ---------------------------------------------------------------------------

const BLOCKED_IPV4_RANGES = [
  // 127.0.0.0/8  – loopback
  { start: 0x7f000000, end: 0x7fffffff },
  // 10.0.0.0/8   – private
  { start: 0x0a000000, end: 0x0affffff },
  // 172.16.0.0/12 – private
  { start: 0xac100000, end: 0xac1fffff },
  // 192.168.0.0/16 – private
  { start: 0xc0a80000, end: 0xc0a8ffff },
  // 0.0.0.0/8     – "this" network
  { start: 0x00000000, end: 0x00ffffff },
  // 169.254.0.0/16 – link-local
  { start: 0xa9fe0000, end: 0xa9feffff },
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  // Convert to unsigned 32-bit
  return num >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const num = ipv4ToInt(ip);
  if (num === null) return false;
  return BLOCKED_IPV4_RANGES.some((r) => num >= r.start && num <= r.end);
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Block well-known internal hostnames
  if (lower === 'localhost' || lower.endsWith('.local') || lower === '[::1]') {
    return true;
  }

  // Block IPv6 loopback
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') {
    return true;
  }

  // Block IPv4 addresses in private / loopback ranges
  if (isBlockedIpv4(lower)) {
    return true;
  }

  return false;
}

/** Validate the user-supplied URL and return a safe URL object or an error string. */
function validateUrl(raw: string): { url: URL; error?: never } | { url?: never; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: 'Invalid URL format.' };
  }

  // Only allow http(s)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Only http and https URLs are allowed.' };
  }

  if (isBlockedHost(parsed.hostname)) {
    return { error: 'Requests to private or internal addresses are not allowed.' };
  }

  return { url: parsed };
}

// Maximum allowed response body size: 5 MB
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // ---- Rate limiting: 20 req / min per IP ----
    const ip = getClientIp(req);
    const rl = rateLimit(ip, 20, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 },
      );
    }

    const { url: rawUrl } = await req.json();

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // ---- SSRF protection ----
    const validation = validateUrl(rawUrl);
    if (validation.error) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const url = validation.url!.href;

    const startTime = Date.now();
    let html = '';
    let isUp = false;
    let loadTimeMs = 0;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LeadGen/1.0; website-analyzer)',
        },
        redirect: 'follow',
      });

      clearTimeout(timeout);
      loadTimeMs = Date.now() - startTime;

      // ---- Content-Length guard ----
      const contentLength = res.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
        return NextResponse.json({
          isUp: true,
          isMobile: false,
          loadTimeMs,
          emails: [],
          tags: ['large_page'],
          pageTitle: '',
        });
      }

      if (res.ok) {
        isUp = true;

        // Stream the body with a size cap
        const reader = res.body?.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_RESPONSE_BYTES) {
              reader.cancel();
              break;
            }
            chunks.push(value);
          }
          const decoder = new TextDecoder();
          html = chunks.map((c) => decoder.decode(c, { stream: true })).join('');
        }
      }
    } catch {
      // Website down or unreachable
      return NextResponse.json({
        isUp: false,
        isMobile: false,
        loadTimeMs: Date.now() - startTime,
        emails: [],
        tags: ['bad_website'],
        pageTitle: '',
      });
    }

    // Analyze HTML
    const tags: string[] = [];

    // Check mobile-friendliness (viewport meta tag)
    const hasViewport = /meta[^>]*name=["']viewport["']/i.test(html);
    const isMobile = hasViewport;
    if (!hasViewport) {
      tags.push('not_mobile_friendly');
    }

    // Check load time
    if (loadTimeMs > 5000) {
      tags.push('slow_loading');
    }

    // Check for outdated signals
    const hasModernFramework = /react|vue|angular|next|nuxt|svelte/i.test(html);
    const hasModernCSS = /tailwind|bootstrap|flex|grid/i.test(html);
    const hasTableLayout = /<table[^>]*>[\s\S]*<td[\s\S]*<\/table>/i.test(html) && !hasModernCSS;
    if (hasTableLayout && !hasModernFramework) {
      tags.push('outdated_design');
    }

    // Check page size (too small = placeholder, too large = unoptimized)
    const pageSize = html.length;
    if (pageSize < 500) {
      tags.push('bad_website');
    }

    // If multiple issues, mark as bad website
    if (tags.length >= 2) {
      tags.push('bad_website');
    }

    // SSL check
    const isHttps = url.startsWith('https://');
    if (!isHttps) {
      tags.push('no_ssl');
    }

    // Meta description check
    const hasMetaDesc = /<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html)
      || /<meta[^>]*content=["'][^"']+["'][^>]*name=["']description["']/i.test(html);
    if (!hasMetaDesc) {
      tags.push('poor_seo');
    }

    // Social media links check
    const hasSocialLinks = /facebook\.com|instagram\.com|twitter\.com|linkedin\.com/i.test(html);
    if (!hasSocialLinks && !tags.includes('no_social')) {
      tags.push('no_social');
    }

    // Booking system check
    const hasBooking = /calendly|opentable|booksy|square|acuity|booking|appointment/i.test(html);
    if (!hasBooking && !tags.includes('no_booking_system')) {
      tags.push('no_booking_system');
    }

    // Contact forms check
    const hasForms = /<form/i.test(html);

    // Google Analytics check
    const hasAnalytics = /googletagmanager|google-analytics|gtag/i.test(html);

    // Extract emails
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const allEmails = html.match(emailRegex) || [];
    // Filter out common false positives
    const emails = [...new Set(allEmails)].filter(email =>
      !email.includes('example.com') &&
      !email.includes('sentry') &&
      !email.includes('webpack') &&
      !email.includes('wixpress') &&
      !email.endsWith('.png') &&
      !email.endsWith('.jpg') &&
      !email.endsWith('.js') &&
      !email.endsWith('.css') &&
      email.length < 50
    ).slice(0, 5);

    // Extract page title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim().slice(0, 100) : '';

    return NextResponse.json({
      isUp,
      isMobile,
      loadTimeMs,
      emails,
      tags: [...new Set(tags)],
      pageTitle,
      isHttps,
      hasMetaDesc,
      hasSocialLinks,
      hasBooking,
      hasForms,
      hasAnalytics,
    });
  } catch (err) {
    console.error('Analyze error:', err);
    return NextResponse.json({ error: 'Failed to analyze website.' }, { status: 500 });
  }
}
