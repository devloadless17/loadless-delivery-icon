import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from '@/i18n/config';

/**
 * The locale this REQUEST should render in.
 *
 * Admin is pinned to English by path, not by provider nesting: the operator
 * console stays English on a shared device where a driver last chose Arabic.
 * Deciding it here (rather than in a nested provider) is what lets the ROOT
 * layout put `dir` on <html> — and that is the only place `dir` actually
 * works, because Radix mounts dialogs and dropdowns in a portal on
 * document.body and Sonner reads document.documentElement.direction. A `dir`
 * on some nested wrapper leaves every dialog and toast rendering LTR.
 */
function localeFor(req: NextRequest): string {
  if (req.nextUrl.pathname.startsWith('/admin')) return 'en';
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  return isLocale(cookie) ? cookie : DEFAULT_LOCALE;
}

/** Handing the resolved locale to the layout as a request header. */
function withLocale(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-fd-locale', localeFor(req));
  return NextResponse.next({ request: { headers } });
}

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
    // A revoked session — a suspended account, a password another admin reset —
    // leaves its cookies sitting in the browser, and they still decode to a
    // role. Without this the person is bounced from /login to a console where
    // every request 401s, and back again: locked out with no way to sign in
    // short of clearing site data by hand.
    //
    // The client asks for this explicitly once a refresh has been refused. The
    // cookies are cleared here as well as by /auth/logout, so a failed logout
    // call cannot leave anybody trapped.
    if (req.nextUrl.searchParams.has('signedout')) {
      const res = withLocale(req);
      res.cookies.delete('access_token');
      res.cookies.delete({ name: 'refresh_token', path: '/api/v1/auth' });
      return res;
    }
    return home ? NextResponse.redirect(new URL(home, req.url)) : withLocale(req);
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

  return withLocale(req);
}

export const config = {
  matcher: ['/', '/login', '/admin/:path*', '/vendor/:path*', '/driver/:path*'],
};
