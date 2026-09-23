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
        <div className="mx-auto w-full max-w-[100rem] px-4 pt-[22px] pb-7 md:px-10 md:pt-8 md:pb-10">
          {children}
        </div>
      </main>
    </div>
  );
}
