import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Permanent tutors → partners unification */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/tutors" || pathname.startsWith("/admin/tutors/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/partners";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/tutors", "/admin/tutors/:path*"],
};
