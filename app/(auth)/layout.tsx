export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="relative flex min-h-[100dvh] items-center justify-center px-4 py-12">
        {children}
      </div>
    </div>
  );
}
