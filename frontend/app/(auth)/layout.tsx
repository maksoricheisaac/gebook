/**
 * Coquille des pages d'authentification (connexion, inscription).
 *
 * Groupe de routes séparé de `(site)` : contrairement au reste du site
 * public, ces pages n'affichent ni l'en-tête marketing ni le pied de page de
 * quatre colonnes — `AuthLayout` (le panneau formulaire/panneau d'encre)
 * occupe déjà tout l'écran, et les deux chromes empilés autour n'ajoutaient
 * qu'une navigation redondante avant un formulaire qui doit rester le point
 * de focalisation unique de la page.
 */
export default function AuthGroupLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="contenu" className="flex flex-1 flex-col">
      {children}
    </main>
  );
}
