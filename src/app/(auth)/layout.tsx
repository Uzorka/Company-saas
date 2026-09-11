/**
 * Auth layout. Identical single column at every width, max 400px, vertically
 * centred — the design specifies no responsive variation here at all.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="grid size-[30px] place-items-center rounded-lg bg-brand-600 text-[13px] font-semibold text-white">
            H
          </span>
          <span className="text-small font-semibold">Heron</span>
        </div>
        {children}
      </div>
    </div>
  );
}
