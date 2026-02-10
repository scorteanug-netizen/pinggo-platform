import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/server/authCookie";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/dashboard", request.url));

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "1",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
