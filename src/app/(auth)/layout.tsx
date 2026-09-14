import { DemoNotice } from "@/components/demo-notice";
import { NavProgress } from "@/components/shell/nav-progress";
import { BrandMark } from "@/components/brand-mark";

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
    // The demo banner sits above the centred column rather than inside it: the
    // design fixes the card at 400px, and the notice is about the deployment,
    // not about the form.
    <div className="flex min-h-screen flex-col bg-canvas">
      <NavProgress />
      <DemoNotice />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex items-center">
            <BrandMark />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
