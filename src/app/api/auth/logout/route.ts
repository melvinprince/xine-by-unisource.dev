import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "analytics_session";

/**
 * POST /api/auth/logout
 *
 * Clears the session cookie and returns a redirect to /login.
 */
export async function POST() {
  const response = NextResponse.json(
    { success: true, redirect: "/login" },
    { status: 200 }
  );

  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}

/**
 * GET /api/auth/logout
 *
 * Convenience endpoint — clears cookie and redirects to /login.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const response = NextResponse.redirect(new URL("/login", origin));

  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}

