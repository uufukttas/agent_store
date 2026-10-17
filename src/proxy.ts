import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// `api/webhooks` ve `api/internal` oturum çerezi taşımaz: Anthropic ve zamanlanmış fonksiyon
// çağırır. Kendi doğrulamaları var (webhook imzası, CRON_SECRET), burada giriş istenirse
// istekler /login'e yönlenir. Matcher statik olmak zorunda, dışarıdan içe aktarılamaz.
export const config = {
  matcher: [
    "/((?!api/webhooks|api/internal|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
