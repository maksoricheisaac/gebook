import { CartProvider } from "@/src/components/providers/cart-provider";
import { SiteFooter } from "@/src/components/layout/site-footer";
import { SiteHeader } from "@/src/components/layout/site-header";
import { Toaster } from "@/src/components/ui/sonner";

/**
 * Coquille du site public et de l'espace lecteur.
 *
 * Isolée dans un groupe de routes `(site)` pour que l'administration puisse
 * avoir la sienne. Avant, l'en-tête marketing et son pied de page de quatre
 * colonnes s'affichaient aussi au-dessus des tableaux du back-office : deux
 * usages très différents habillés du même chrome.
 *
 * `CartProvider`/`Toaster` (mission — Tâche 4) : jusqu'ici, seul `AdminShell`
 * montait un `<Toaster>` — aucune confirmation visuelle n'existait côté site
 * public. Le panier en a besoin (« Ajouté au panier »), donc les deux sont
 * montés ici plutôt que dans chaque page qui en a besoin.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <CartProvider>
      <SiteHeader />
      <main id="contenu" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
      <Toaster position="top-right" richColors closeButton />
    </CartProvider>
  );
}
