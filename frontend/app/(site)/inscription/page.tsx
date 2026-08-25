import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthLayout } from "@/src/components/auth/auth-layout";
import { RegisterForm } from "@/src/components/auth/register-form";
import { getCurrentUser, resolveDestination } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Créer un compte",
  description: "Créez votre compte lecteur GeBook pour commander et suivre vos ouvrages.",
  robots: { index: false, follow: true },
};

export default async function RegisterPage(props: PageProps<"/inscription">) {
  const { retour } = await props.searchParams;
  const retourPath =
    typeof retour === "string" && retour.startsWith("/") ? retour : undefined;

  const user = await getCurrentUser();
  if (user) {
    redirect(retourPath ?? (await resolveDestination(user.roles)));
  }

  return (
    <AuthLayout
      aside="welcome"
      title="Créez votre compte lecteur."
      description="Quelques informations suffisent. Le compte est gratuit et sans engagement."
      footer={
        <p className="text-muted-foreground text-sm">
          Vous avez déjà un compte ?{" "}
          <Link
            href={
              retourPath
                ? `/connexion?retour=${encodeURIComponent(retourPath)}`
                : "/connexion"
            }
            className="text-primary font-semibold underline-offset-4 hover:underline"
          >
            Se connecter
          </Link>
        </p>
      }
    >
      <RegisterForm retour={retourPath} />
    </AuthLayout>
  );
}
