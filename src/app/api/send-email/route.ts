import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { textToTrackedHtml } from '@/lib/email-html';
import { createTransport } from '@/lib/smtp-transport';
import { decrypt } from '@/lib/crypto';
import * as dbServer from '@/lib/db-server';

const sendEmailSchema = z.object({
  to: z.string().email('Invalid recipient email address.'),
  subject: z.string().min(1, 'Subject is required.').max(998, 'Subject is too long.'),
  body: z.string().min(1, 'Email body is required.').max(50_000, 'Email body is too long.'),
  smtpEmail: z.string().email('Invalid SMTP email address.').optional(),
  smtpPassword: z.string().min(1, 'SMTP password is required.').optional(),
  smtpAccountId: z.string().optional(),
  replyTo: z.string().email('Invalid reply-to email address.').optional(),
  trackingId: z.string().optional(),
}).refine(
  data => data.smtpAccountId || (data.smtpEmail && data.smtpPassword),
  { message: 'Either smtpAccountId or smtpEmail+smtpPassword is required.' }
);

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit(ip, 10, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 },
      );
    }

    const rawBody = await req.json();
    const parsed = sendEmailSchema.safeParse(rawBody);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? 'Invalid request body.';
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { to, subject, body, smtpEmail, smtpPassword, smtpAccountId, replyTo, trackingId } = parsed.data;

    let transporter: nodemailer.Transporter;
    let senderEmail: string;
    let account: Awaited<ReturnType<typeof dbServer.getSmtpAccount>> | null = null;

    if (smtpAccountId) {
      // New path: use configured SMTP account from DB
      account = await dbServer.getSmtpAccount(smtpAccountId);
      if (!account) {
        return NextResponse.json({ error: 'SMTP account not found.' }, { status: 400 });
      }
      transporter = createTransport(account);
      senderEmail = account.email;
    } else {
      // Legacy path: use provided credentials directly (Gmail only)
      let legacyPass = smtpPassword!;
      try { legacyPass = decrypt(legacyPass); } catch { /* may be plaintext */ }
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: smtpEmail!, pass: legacyPass },
      });
      senderEmail = smtpEmail!;
    }

    // Determine the base URL for tracking links
    const proto = req.headers.get('x-forwarded-proto') || 'http';
    const host = req.headers.get('host') || 'localhost:3000';
    const baseUrl = `${proto}://${host}`;

    // Build the email payload
    const mailOptions: nodemailer.SendMailOptions = {
      from: senderEmail,
      to,
      replyTo: replyTo || senderEmail,
      subject,
      text: body,
    };

    if (trackingId) {
      mailOptions.html = textToTrackedHtml(body, trackingId, baseUrl);
    }

    await transporter.sendMail(mailOptions);

    // Increment send count for the account
    if (account) {
      await dbServer.updateSmtpAccount({
        ...account,
        sendCount: account.sendCount + 1,
        lastUsedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true, message: `Email sent to ${to}` });
  } catch (err: unknown) {
    console.error('Send email error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Detect bounces from SMTP errors
    const isBounce = message.includes('550') || message.includes('551') || message.includes('552') ||
      message.includes('553') || message.includes('554') || message.includes('mailbox not found') ||
      message.includes('user unknown') || message.includes('does not exist') ||
      message.includes('no such user') || message.includes('rejected');

    if (isBounce) {
      return NextResponse.json({
        error: `Email bounced: ${message}`,
        bounced: true,
        bounceType: message.includes('550') || message.includes('user unknown') ? 'hard' : 'soft'
      }, { status: 422 });
    }

    if (message.includes('Invalid login') || message.includes('AUTHENTICATIONFAILED')) {
      return NextResponse.json({ error: 'SMTP authentication failed. Check your email and App Password in Settings.' }, { status: 401 });
    }

    return NextResponse.json({ error: `Failed to send email: ${message}` }, { status: 500 });
  }
}
