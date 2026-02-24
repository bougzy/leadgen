import { NextRequest, NextResponse } from 'next/server';
import { createSession, verifySession, SESSION_COOKIE_NAME } from '@/lib/auth';

// POST /api/auth — Login
export async function POST(req: NextRequest) {
  try {
    const authPassword = process.env.AUTH_PASSWORD || '';

    // Dev mode: no password configured, allow access
    if (!authPassword) {
      return NextResponse.json({ success: true, noAuth: true });
    }

    const body = await req.json();
    const { password } = body as { password?: string };

    if (!password || password !== authPassword) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Password matches — create session
    const token = await createSession();

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err) {
    console.error('Auth POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/auth — Check auth status
export async function GET(req: NextRequest) {
  const authPassword = process.env.AUTH_PASSWORD || '';

  // If no password is configured, auth is not required
  if (!authPassword) {
    return NextResponse.json({
      authenticated: true,
      authRequired: false,
    });
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({
      authenticated: false,
      authRequired: true,
    });
  }

  const valid = await verifySession(token);

  return NextResponse.json({
    authenticated: valid,
    authRequired: true,
  });
}

// DELETE /api/auth — Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // Expire immediately
  });

  return response;
}
