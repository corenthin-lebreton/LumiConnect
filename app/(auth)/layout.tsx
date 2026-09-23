import pkg from "@/package.json";

export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-12">{children}</div>
      <footer
        className={
          "flex justify-between border-t border-line px-7 py-[18px] font-mono text-[0.6875rem] " +
          "tracking-[0.06em] text-muted-foreground"
        }
      >
        <span>LUMIXEN · USAGE INTERNE</span>
        <span>v{pkg.version}</span>
      </footer>
    </div>
  );
}
