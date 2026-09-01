import { AdminAppSidebar } from "@/src/components/admin/admin-app-sidebar";
import { AdminTopbar } from "@/src/components/admin/admin-topbar";
import { SidebarInset, SidebarProvider } from "@/src/components/ui/sidebar";
import { Toaster } from "@/src/components/ui/sonner";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import type { CurrentUser } from "@/src/lib/auth-shared";

/**
 * Coquille du back-office : barre latérale (repliable), topbar, contenu —
 * bâtie sur `SidebarProvider`/`SidebarInset` (shadcn/ui `sidebar-04`), qui
 * prend en charge ce que cette coquille gérait auparavant à la main : l'état
 * de repli (persisté par cookie, posé par `SidebarProvider` lui-même — plus
 * fiable que le `localStorage` précédent) et le panneau mobile (un `Sheet`,
 * automatique sous `md`, qui remplace `AdminMobileNav`).
 *
 * `TooltipProvider` : requis par `SidebarMenuButton`'s `tooltip` prop (rail
 * replié), que le bloc `sidebar-04` ne fournit pas lui-même.
 */
export function AdminShell({
  user,
  isPlatformAdmin,
  children,
}: {
  user: CurrentUser;
  isPlatformAdmin: boolean;
  children: React.ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AdminAppSidebar isPlatformAdmin={isPlatformAdmin} />

        <SidebarInset>
          <AdminTopbar user={user} />

          <main id="contenu" className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:py-10">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </SidebarInset>

        <Toaster position="top-right" richColors closeButton />
      </SidebarProvider>
    </TooltipProvider>
  );
}
