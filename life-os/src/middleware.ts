import { NextResponse, type NextRequest } from "next/server";
import { readCookie, signSession } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const password = process.env.LIFEOS_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/health")) return NextResponse.next();
  const token = readCookie(req.headers.get("cookie"), "lifeos_session");
  if (token === (await signSession(password))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch|manifest|sw.js).*)"],
};
