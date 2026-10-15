"use client";

import { useActionState } from "react";
import { tr } from "@/messages/tr";
import { login, type LoginState } from "./actions";

const field =
  "h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
        {tr.login.email}
        <input name="email" type="email" autoComplete="username" required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
        {tr.login.password}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={field}
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md bg-indigo-700 px-4 text-sm font-medium text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 disabled:opacity-60"
      >
        {pending ? tr.login.pending : tr.login.submit}
      </button>
    </form>
  );
}
