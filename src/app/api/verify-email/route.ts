import { NextRequest, NextResponse } from 'next/server';
import dns from 'dns/promises';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ valid: false, reason: 'No email provided' }, { status: 400 });
    }

    // Syntax check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ valid: false, reason: 'Invalid email format' });
    }

    const domain = email.split('@')[1];

    // MX record check
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return NextResponse.json({ valid: false, reason: 'No MX records found for domain' });
      }
      return NextResponse.json({ valid: true, mxRecords: mxRecords.length, domain });
    } catch {
      return NextResponse.json({ valid: false, reason: `Domain "${domain}" does not accept email` });
    }
  } catch {
    return NextResponse.json({ valid: false, reason: 'Verification failed' }, { status: 500 });
  }
}
