import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const ALLOWED_SCHEMES = ["http:", "https:"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "Missing required query parameter: url" },
      { status: 400 }
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL format" },
      { status: 400 }
    );
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    return NextResponse.json(
      { error: "URL scheme not allowed. Only http and https are permitted." },
      { status: 400 }
    );
  }

  if (id) {
    try {
      const db = await getDb();
      await db.collection('emails').updateOne(
        { trackingId: id, clickedAt: { $exists: false } },
        { $set: { clickedAt: new Date().toISOString(), status: 'clicked' } }
      );
    } catch {
      // Silent fail
    }
  }

  return NextResponse.redirect(parsed.toString(), 302);
}
