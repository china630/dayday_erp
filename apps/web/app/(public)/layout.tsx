/** Гостевые страницы (портал счёта): без AppShell — см. `app/layout.tsx`. */
export default function PublicRouteGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
