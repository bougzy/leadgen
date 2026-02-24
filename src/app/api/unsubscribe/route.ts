import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { randomUUID } from 'crypto';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const email = searchParams.get("email");
  const id = searchParams.get("id");

  if (!email) {
    return new NextResponse(
      renderHTML("Invalid Request", "No email address was provided. Please use the unsubscribe link from your email."),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const db = await getDb();

    // Add to unsubscribes collection
    await db.collection('unsubscribes').replaceOne(
      { email },
      { id: randomUUID(), email, unsubscribedAt: new Date().toISOString() },
      { upsert: true }
    );

    // Mark lead as unsubscribed
    await db.collection('leads').updateMany(
      { email },
      { $set: { unsubscribed: true } }
    );

    // Add activity
    await db.collection('activities').insertOne({
      id: randomUUID(),
      type: 'lead_status_changed',
      description: `${email} unsubscribed`,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Silent fail — still show success to user
  }

  return new NextResponse(
    renderHTML("Unsubscribed Successfully", "You have been unsubscribed and will no longer receive emails from us."),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function renderHTML(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background-color: #0f172a; color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .card { max-width: 480px; width: 90%; background-color: #1e293b; border-radius: 12px; padding: 48px 36px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 12px; color: #f8fafc; }
    p { font-size: 16px; line-height: 1.6; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#x2709;</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
