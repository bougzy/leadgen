import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'leadgen-session';

// Routes that never require authentication
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/track',
  '/api/unsubscribe',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname.startsWith('/icons/') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.webmanifest')
  );
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

async function isValidSession(token: string): Promise<boolean> {
  try {
    const key = process.env.ENCRYPTION_KEY || 'b49191699185b32bc97228352f3219d8f2b9c6e836ad3a27a454c06ede0e4d45';
    if (!key) return false;
    const secret = new TextEncoder().encode(key);
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Always allow static assets ---
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // --- Always allow public paths ---
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // --- /api/db routes: also enforce x-api-secret header ---
  if (pathname.startsWith('/api/db')) {
    const apiSecret = request.headers.get('x-api-secret');
    const expectedSecret = process.env.API_SECRET || '66727526705ef4998bfaebd2d49ba7827e3c8198585d0a2ed855e353cdd9de78';

    // If API_SECRET is configured, enforce it
    if (expectedSecret && apiSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // --- Auth check for all protected routes ---
  const authPassword = process.env.AUTH_PASSWORD || '';

  // If no AUTH_PASSWORD is set, auth is disabled (dev mode) — allow everything
  if (!authPassword) {
    return NextResponse.next();
  }

  // Check for session cookie
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token || !(await isValidSession(token))) {
    // Unauthenticated request
    if (isApiRoute(pathname)) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Redirect page requests to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
