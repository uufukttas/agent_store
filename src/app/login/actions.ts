"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/auth/email";
import { getAllowedEmailDomain } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { tr } from "@/messages/tr";

export type LoginState = { error: string | null };

const schema = z.object({ email: z.email(), password: z.string().min(1) });

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: tr.login.invalidInput };

  const domain = getAllowedEmailDomain();
  if (!isAllowedEmail(parsed.data.email, domain))
    return { error: tr.login.domainNotAllowed(domain) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: tr.login.invalidCredentials };

  // Savunma katmanı: Supabase'in döndürdüğü e-posta da kontrol edilir.
  if (!isAllowedEmail(data.user.email, domain)) {
    await supabase.auth.signOut();
    return { error: tr.login.domainNotAllowed(domain) };
  }

  redirect("/");
}
