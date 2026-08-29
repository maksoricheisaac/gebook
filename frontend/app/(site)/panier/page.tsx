import type { Metadata } from "next";

import { CartClient } from "@/src/components/catalog/cart-client";
import { Container, PageHeader } from "@/src/components/layout/page-shell";
import { getCurrentUser } from "@/src/lib/auth";

export const metadata: Metadata = {
  title: "Panier",
  robots: { index: false, follow: false },
};

/**
 * Page panier (mission — Tâche 4).
 *
 * Accessible sans connexion — un visiteur peut composer son panier avant de
 * s'identifier ; seul le passage au paiement l'exige (`CartClient`, comme le
 * reste du parcours d'achat existant, `format-selector.tsx`).
 */
export default async function CartPage() {
  const user = await getCurrentUser();

  return (
    <Container size="wide" className="pb-20">
      <PageHeader
        eyebrow="Panier"
        title="Mes articles"
        description="Vérifiez votre sélection avant de passer au paiement. Les œuvres de plusieurs éditeurs peuvent cohabiter dans le même panier."
      />

      <div className="mt-10">
        <CartClient isAuthenticated={user !== null} />
      </div>
    </Container>
  );
}
