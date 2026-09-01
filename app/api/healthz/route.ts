export const dynamic = "force-dynamic";

export function GET() {
  return new Response("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}
