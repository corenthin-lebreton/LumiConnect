import { TopNav } from "@/components/layout/top-nav";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <TopNav />
      <main className="relative flex-1">
        <div className="mx-auto w-full max-w-[100rem] px-4 py-7 md:px-6 md:py-9">
          {children}
        </div>
      </main>
    </div>
  );
}
