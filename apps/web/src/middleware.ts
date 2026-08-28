import { NextResponse, type NextRequest } from 'next/server';

/**
 * Coarse UX gating only — the API is the authorization authority. We decode
 * (NOT verify) the JWT payload for the role hint; a forged cookie gets a
 * useless shell whose every API call returns 401/403.
 */
const ROLE_HOME: Record<string, string> = {
  ADMIN: '/admin',
  VENDOR: '/vendor',
  DRIVER: '/driver',
};

function roleFromCookie(req: NextRequest): string | null {
  const token = req.cookies.get('access_token')?.value;
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: string;
    };
    return claims.role ?? null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = roleFromCookie(req);
  const home = role ? (ROLE_HOME[role] ?? '/login') : null;

  if (pathname === '/login') {
    return home ? NextResponse.redirect(new URL(home, req.url)) : NextResponse.next();
  }

  if (!role || !home) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/') loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(home, req.url));
  }

  const section = `/${pathname.split('/')[1]}`;
  if (['/admin', '/vendor', '/driver'].includes(section) && section !== home) {
    return NextResponse.redirect(new URL(home, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/admin/:path*', '/vendor/:path*', '/driver/:path*'],
};
