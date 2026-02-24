import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import nodemailer from 'nodemailer';
import { encrypt } from '@/lib/crypto';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import * as db from '@/lib/db-server';
import type { SmtpAccount, SmtpProvider } from '@/types';
import { SMTP_PRESETS } from '@/types';

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 requests per minute
    const ip = getClientIp(req);
    const rl = rateLimit(ip, 10, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 },
      );
    }

    const body = await req.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: 'Missing action parameter.' }, { status: 400 });
    }

    // ----------------------------------------------------------------
    // ADD — create a new SMTP account
    // ----------------------------------------------------------------
    if (action === 'add') {
      const {
        provider,
        email,
        username,
        password,
        label,
        smtpHost,
        smtpPort,
        smtpSecure,
        imapHost,
        imapPort,
        imapSecure,
        dailyLimit,
      } = body;

      if (!provider || !email || !password) {
        return NextResponse.json(
          { error: 'Provider, email, and password are required.' },
          { status: 400 },
        );
      }

      const preset = SMTP_PRESETS[provider as SmtpProvider] || SMTP_PRESETS.custom;

      const accountId = randomUUID();
      const account: SmtpAccount = {
        id: accountId,
        label: label || `${provider} - ${email}`,
        provider: provider as SmtpProvider,
        email,
        smtpHost: smtpHost || preset.smtpHost || '',
        smtpPort: smtpPort ?? preset.smtpPort ?? 587,
        smtpSecure: smtpSecure ?? preset.smtpSecure ?? false,
        username: username || email,
        encryptedPassword: encrypt(password),
        imapHost: imapHost || preset.imapHost,
        imapPort: imapPort ?? preset.imapPort,
        imapSecure: imapSecure ?? preset.imapSecure,
        dailyLimit: dailyLimit ?? preset.dailyLimit ?? 100,
        isActive: true,
        sendCount: 0,
        createdAt: new Date().toISOString(),
      };

      await db.addSmtpAccount(account);

      return NextResponse.json({ success: true, accountId });
    }

    // ----------------------------------------------------------------
    // TEST — verify SMTP connection
    // ----------------------------------------------------------------
    if (action === 'test') {
      const { smtpHost, smtpPort, smtpSecure, username, password } = body;

      if (!smtpHost || !username || !password) {
        return NextResponse.json(
          { error: 'SMTP host, username, and password are required for testing.' },
          { status: 400 },
        );
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort ?? 587,
        secure: smtpSecure ?? false,
        auth: {
          user: username,
          pass: password,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
      });

      try {
        await transporter.verify();
        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    // ----------------------------------------------------------------
    // DELETE — remove an SMTP account
    // ----------------------------------------------------------------
    if (action === 'delete') {
      const { id } = body;

      if (!id) {
        return NextResponse.json({ error: 'Account ID is required.' }, { status: 400 });
      }

      await db.deleteSmtpAccount(id);

      return NextResponse.json({ success: true });
    }

    // ----------------------------------------------------------------
    // TOGGLE ACTIVE — enable or disable an account
    // ----------------------------------------------------------------
    if (action === 'toggleActive') {
      const { id, isActive } = body;

      if (!id || typeof isActive !== 'boolean') {
        return NextResponse.json(
          { error: 'Account ID and isActive (boolean) are required.' },
          { status: 400 },
        );
      }

      const account = await db.getSmtpAccount(id);
      if (!account) {
        return NextResponse.json({ error: 'SMTP account not found.' }, { status: 404 });
      }

      await db.updateSmtpAccount({ ...account, isActive });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    console.error('SMTP accounts API error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
