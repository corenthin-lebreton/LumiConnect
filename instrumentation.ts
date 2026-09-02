export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobLoop } = await import("@/lib/job-runner");
    startJobLoop();
  }
}
