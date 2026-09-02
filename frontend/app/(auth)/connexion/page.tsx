import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthLayout } from "@/src/components/auth/auth-layout";
import { LoginForm } from "@/src/components/auth/login-form";
import { getCurrentUser, resolveDestination } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Accédez à vos commandes et à votre bibliothèque GeBook.",
  // Une page de connexion n'a rien à faire dans un index de recherche.
  robots: { index: false, follow: true },
};

export default async function LoginPage(props: PageProps<"/connexion">) {
  const { retour } = await props.searchParams;
  const retourPath =
    typeof retour === "string" && retour.startsWith("/") ? retour : undefined;

  const user = await getCurrentUser();
  if (user) {
    redirect(retourPath ?? (await resolveDestination(user.roles)));
  }

  return (
    <AuthLayout
      title="Content de vous revoir."
      description="Connectez-vous pour retrouver vos commandes et poursuivre vos achats."
      footer={
        <p className="text-muted-foreground text-sm">
          Pas encore de compte ?{" "}
          <Link
            href={
              retourPath
                ? `/inscription?retour=${encodeURIComponent(retourPath)}`
                : "/inscription"
            }
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            Créer un compte gratuit
          </Link>
        </p>
      }
    >
      <LoginForm retour={retourPath} />
    </AuthLayout>
  );
}
