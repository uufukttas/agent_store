import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedEmail } from "@/lib/auth/email";
import { getAllowedEmailDomain, getPublicEnv } from "@/lib/env";

const LOGIN_PATH = "/login";

/** Oturumu yeniler; girişsiz veya izinsiz alan adlı kullanıcıyı giriş sayfasına yollar. */
export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(toSet) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser Supabase'e sorar; getSession çerezdeki değere güvenir, burada kullanılmaz.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowed = isAllowedEmail(user?.email, getAllowedEmailDomain());
  if (user && !allowed) await supabase.auth.signOut();

  const onLogin = request.nextUrl.pathname === LOGIN_PATH;
  const target = !allowed && !onLogin ? LOGIN_PATH : allowed && onLogin ? "/" : null;
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  return redirect;
}
