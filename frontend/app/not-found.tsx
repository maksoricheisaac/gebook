import Link from "next/link";
import { Button } from "@/src/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <p className="text-primary text-sm font-semibold tracking-wide uppercase">
        Erreur 404
      </p>
      <h1 className="text-3xl sm:text-4xl">Page introuvable</h1>
      <p className="text-muted-foreground">
        La page demandée n&rsquo;existe pas ou n&rsquo;est plus disponible.
      </p>
      <Button asChild size="lg" className="mt-4">
        <Link href="/">Retour à l&rsquo;accueil</Link>
      </Button>
    </div>
  );
}
