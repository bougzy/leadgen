import { NextResponse } from "next/server";

// Deprecated — tracking events go directly to MongoDB now.
export async function GET() {
  return NextResponse.json({ events: [], deprecated: true });
}
