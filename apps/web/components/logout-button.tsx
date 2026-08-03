"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "../lib/supabase/auth";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      className="linkish"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await signOut();
          router.replace("/login");
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
