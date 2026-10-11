import { NextResponse, type NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  return NextResponse.redirect(new URL("/", request.url))
}

export const config = {
  matcher: ["/vendor/:path*", "/login"],
}