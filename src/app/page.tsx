import { createClient } from "@/lib/supabase/server";
import { tr } from "@/messages/tr";
import { signOut } from "./actions";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <header className="flex items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <h1 className="text-xl font-semibold text-stone-900">{tr.home.title}</h1>
        <form action={signOut} className="flex items-center gap-3 text-sm text-stone-600">
          <span>
            {tr.home.signedInAs}: {user?.email}
          </span>
          <button
            type="submit"
            className="rounded-md border border-stone-300 px-3 py-1 hover:bg-stone-50"
          >
            {tr.home.signOut}
          </button>
        </form>
      </header>
      <section className="py-12">
        <h2 className="text-base font-semibold text-stone-900">{tr.home.emptyTitle}</h2>
        <p className="mt-1 text-sm text-stone-600">{tr.home.emptyBody}</p>
      </section>
    </main>
  );
}
