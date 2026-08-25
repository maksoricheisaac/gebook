import { SiteFooter } from "@/src/components/layout/site-footer";
import { SiteHeader } from "@/src/components/layout/site-header";

/**
 * Coquille du site public et de l'espace lecteur.
 *
 * Isolée dans un groupe de routes `(site)` pour que l'administration puisse
 * avoir la sienne. Avant, l'en-tête marketing et son pied de page de quatre
 * colonnes s'affichaient aussi au-dessus des tableaux du back-office : deux
 * usages très différents habillés du même chrome.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main id="contenu" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
