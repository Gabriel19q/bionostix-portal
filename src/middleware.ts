import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the login session on every request and keeps signed-out
// visitors away from the portal and admin areas.
// Old production addresses forward to the portal's own domain (preview deployments stay reachable)
const OLD_HOSTS = ["bionostix-portal.vercel.app", "bionostix-portal-bionostix-germany.vercel.app"];
const MAIN_HOST = "portal.bionostix-germany.de";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (OLD_HOSTS.includes(host)) {
    const url = request.nextUrl.clone();
    url.host = MAIN_HOST;
    url.protocol = "https";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verifies the login token (and refreshes it when it has expired) without an extra auth-server call.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ?? null;

  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/portal") || path.startsWith("/admin");
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
