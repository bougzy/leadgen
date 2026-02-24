import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const dnsPromises = dns.promises;

const COMMON_DKIM_SELECTORS = ['google', 'default', 'selector1', 'selector2', 'k1'];

interface DeliverabilityResult {
  spf: { found: boolean; record?: string };
  dkim: { found: boolean; selector?: string };
  dmarc: { found: boolean; record?: string; policy?: string };
  mx: { found: boolean; records?: string[] };
  score: number;
  recommendations: string[];
}

async function checkSPF(domain: string): Promise<{ found: boolean; record?: string }> {
  try {
    const records = await dnsPromises.resolveTxt(domain);
    for (const recordParts of records) {
      const record = recordParts.join('');
      if (record.startsWith('v=spf1')) {
        return { found: true, record };
      }
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

async function checkDKIM(domain: string): Promise<{ found: boolean; selector?: string }> {
  for (const selector of COMMON_DKIM_SELECTORS) {
    try {
      const records = await dnsPromises.resolveTxt(`${selector}._domainkey.${domain}`);
      if (records && records.length > 0) {
        return { found: true, selector };
      }
    } catch {
      // Selector not found, try next
    }
  }
  return { found: false };
}

async function checkDMARC(domain: string): Promise<{ found: boolean; record?: string; policy?: string }> {
  try {
    const records = await dnsPromises.resolveTxt(`_dmarc.${domain}`);
    for (const recordParts of records) {
      const record = recordParts.join('');
      if (record.startsWith('v=DMARC1')) {
        // Extract policy from record
        const policyMatch = record.match(/p=([^;]+)/);
        const policy = policyMatch ? policyMatch[1].trim() : undefined;
        return { found: true, record, policy };
      }
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

async function checkMX(domain: string): Promise<{ found: boolean; records?: string[] }> {
  try {
    const mxRecords = await dnsPromises.resolveMx(domain);
    if (mxRecords && mxRecords.length > 0) {
      const records = mxRecords
        .sort((a, b) => a.priority - b.priority)
        .map((r) => r.exchange);
      return { found: true, records };
    }
    return { found: false };
  } catch {
    return { found: false };
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 requests per minute
  const clientIp = getClientIp(req);
  const { success, remaining } = rateLimit(clientIp, 5, 60_000);

  if (!success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before trying again.' },
      {
        status: 429,
        headers: { 'X-RateLimit-Remaining': String(remaining) },
      },
    );
  }

  try {
    const body = await req.json();
    const { domain } = body;

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json(
        { error: 'A valid domain is required.' },
        { status: 400 },
      );
    }

    // Sanitize domain: remove protocol, paths, and whitespace
    const cleanDomain = domain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .toLowerCase();

    if (!cleanDomain || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleanDomain)) {
      return NextResponse.json(
        { error: 'Invalid domain format.' },
        { status: 400 },
      );
    }

    // Run all checks in parallel
    const [spf, dkim, dmarc, mx] = await Promise.all([
      checkSPF(cleanDomain),
      checkDKIM(cleanDomain),
      checkDMARC(cleanDomain),
      checkMX(cleanDomain),
    ]);

    // Calculate score: MX=20, SPF=30, DKIM=25, DMARC=25
    let score = 0;
    if (mx.found) score += 20;
    if (spf.found) score += 30;
    if (dkim.found) score += 25;
    if (dmarc.found) score += 25;

    // Build recommendations
    const recommendations: string[] = [];
    if (!mx.found) {
      recommendations.push('No MX records found. Ensure your domain has mail exchange records configured.');
    }
    if (!spf.found) {
      recommendations.push('No SPF record found. Add a TXT record with "v=spf1" to authorize mail servers for your domain.');
    }
    if (!dkim.found) {
      recommendations.push('No DKIM record found for common selectors. Configure DKIM signing with your email provider.');
    }
    if (!dmarc.found) {
      recommendations.push('No DMARC record found. Add a TXT record at _dmarc.yourdomain.com with "v=DMARC1" to set a DMARC policy.');
    }
    if (dmarc.found && dmarc.policy === 'none') {
      recommendations.push('DMARC policy is set to "none". Consider upgrading to "quarantine" or "reject" for better protection.');
    }
    if (score === 100) {
      recommendations.push('All checks passed. Your domain has excellent email deliverability configuration.');
    }

    const result: DeliverabilityResult = {
      spf,
      dkim,
      dmarc,
      mx,
      score,
      recommendations,
    };

    return NextResponse.json(result, {
      headers: { 'X-RateLimit-Remaining': String(remaining) },
    });
  } catch (err) {
    console.error('Deliverability check error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
