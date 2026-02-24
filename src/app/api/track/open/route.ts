import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");

  if (id) {
    try {
      const db = await getDb();
      // Update the email document: set openedAt if not already set
      await db.collection('emails').updateOne(
        { trackingId: id, openedAt: { $exists: false } },
        { $set: { openedAt: new Date().toISOString(), status: 'opened' } }
      );
      // Also update template stats
      const email = await db.collection('emails').findOne({ trackingId: id }, { projection: { _id: 0 } });
      if (email?.templateUsed) {
        await db.collection('templates').updateOne(
          { id: email.templateUsed },
          { $inc: { 'stats.opened': 1 } }
        );
      }
    } catch {
      // Silent fail — tracking should never break the user experience
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
