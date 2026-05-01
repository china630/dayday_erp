/** Явная 404 для App Router (статический `/_not-found`). */
export const dynamic = "force-static";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-2 bg-slate-100 p-8 text-slate-800">
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="text-sm text-slate-600">Page not found.</p>
    </main>
  );
}
