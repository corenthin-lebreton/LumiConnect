"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DeletingWatcher({ hasDeleting }: { hasDeleting: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!hasDeleting) return;
    const interval = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [hasDeleting, router]);

  return null;
}
