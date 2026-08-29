"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

import { useCart } from "@/src/components/providers/cart-provider";
import { DELIVERY_REQUIREMENTS } from "@/src/components/catalog/format-selector";
import { Button } from "@/src/components/ui/button";
import { FormError } from "@/src/components/ui/field";
import { cartLineSubtotal, cartTotal, groupByTenant } from "@/src/lib/cart-shared";
import { checkoutCartAction } from "@/src/lib/order-actions";
import { formatPrice, deliveryTypeLabel, formatTypeLabel } from "@/src/lib/format";
import { resolveAssetUrl } from "@/src/lib/assets";

/**
 * Panier (mission — Tâches 4/5).
 *
 * Composant client unique pour toute la page : le panier lui-même
 * (`localStorage`, `useCart()`) n'existe que côté client, et le checkout a
 * besoin d'un contrôle direct de l'ordre des opérations (vider le panier
 * seulement après un succès confirmé — voir `checkoutCartAction`).
 */
export function CartClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const cart = useCart();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | undefined>();
  const [delivery, setDelivery] = useState<Record<string, string>>({});

  if (cart.lines.length === 0) {
    return (
      <div className="border-border bg-card mx-auto max-w-lg rounded-xl border border-dashed p-10 text-center">
        <ShoppingBag aria-hidden className="text-ink-300 mx-auto size-10" />
        <p className="text-secondary mt-4 font-semibold">Votre panier est vide.</p>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Parcourez le catalogue pour ajouter des œuvres.
        </p>
        <Button asChild className="mt-5">
          <Link href="/livres">Parcourir le catalogue</Link>
        </Button>
      </div>
    );
  }

  const groups = groupByTenant(cart.lines);
  const total = cartTotal(cart.lines);

  // Une seule adresse/contact pour toute la commande (l'API n'en accepte
  // qu'une par commande, quel que soit le nombre de lignes) : la plus
  // exigeante des lignes du panier détermine ce qui est demandé.
  const requirement = cart.lines
    .map((line) => DELIVERY_REQUIREMENTS[line.deliveryType])
    .reduce<"address" | "contact" | undefined>((acc, req) => {
      if (acc === "address" || req === "address")
        return req === "address" ? "address" : acc;
      return acc ?? req;
    }, undefined);

  const handleCheckout = (): void => {
    if (!isAuthenticated) {
      router.push(`/connexion?retour=${encodeURIComponent("/panier")}`);
      return;
    }

    setError(undefined);
    setFieldErrors(undefined);

    startTransition(async () => {
      const result = await checkoutCartAction(
        cart.lines.map((line) => ({
          workFormatId: line.workFormatId,
          quantity: line.quantity,
        })),
        delivery,
      );

      if (!result.orderNumber) {
        setError(result.error ?? "Une erreur est survenue. Veuillez réessayer.");
        setFieldErrors(result.fieldErrors);
        return;
      }

      cart.clear();
      router.push(`/paiement/${result.orderNumber}`);
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.tenantSlug}>
            <h2 className="type-h3 text-secondary mb-3">{group.tenantName}</h2>
            <ul className="divide-border border-border divide-y rounded-lg border">
              {group.lines.map((line) => {
                const cover = resolveAssetUrl(line.coverPath);
                return (
                  <li key={line.workFormatId} className="flex gap-4 p-4">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element -- vignette de panier, pas d'optimisation nécessaire
                      <img
                        src={cover}
                        alt=""
                        className="ring-border bg-paper-100 h-20 w-14 shrink-0 rounded object-cover ring-1"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="bg-paper-200 text-ink-500 grid h-20 w-14 shrink-0 place-items-center rounded text-xs"
                      >
                        —
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/livres/${line.workSlug}`}
                        className="text-secondary line-clamp-2 text-sm font-semibold hover:underline"
                      >
                        {line.workTitle}
                      </Link>
                      <p className="type-caption mt-1">
                        {line.authorName} ·{" "}
                        {line.formatLabel ?? formatTypeLabel(line.formatType)}
                      </p>
                      <p className="type-caption">
                        {deliveryTypeLabel(line.deliveryType)}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <div className="border-border inline-flex items-center rounded-md border">
                          <button
                            type="button"
                            aria-label="Diminuer la quantité"
                            className="hover:bg-paper-100 grid size-8 place-items-center"
                            onClick={() =>
                              cart.setQuantity(line.workFormatId, line.quantity - 1)
                            }
                          >
                            <Minus aria-hidden className="size-3.5" />
                          </button>
                          <span className="tnum w-8 text-center text-sm font-medium">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Augmenter la quantité"
                            className="hover:bg-paper-100 grid size-8 place-items-center"
                            onClick={() =>
                              cart.setQuantity(line.workFormatId, line.quantity + 1)
                            }
                          >
                            <Plus aria-hidden className="size-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          className="text-destructive inline-flex items-center gap-1 text-sm hover:underline"
                          onClick={() => cart.removeItem(line.workFormatId)}
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                          Supprimer
                        </button>
                      </div>
                    </div>

                    <span className="text-secondary tnum shrink-0 text-sm font-semibold">
                      {formatPrice(cartLineSubtotal(line))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <aside className="border-border bg-card h-fit rounded-xl border p-6">
        <h2 className="type-h3 text-secondary mb-4">Total</h2>
        <div className="border-border flex items-baseline justify-between border-b pb-4">
          <span className="text-muted-foreground text-sm">
            {cart.itemCount} article{cart.itemCount > 1 ? "s" : ""}
          </span>
          <span className="font-heading text-secondary tnum text-2xl font-semibold">
            {formatPrice(total)}
          </span>
        </div>

        {requirement && isAuthenticated && (
          <div className="mt-5">
            <DeliveryFieldsControlled
              requirement={requirement}
              values={delivery}
              onChange={setDelivery}
              fieldErrors={fieldErrors}
            />
          </div>
        )}

        <FormError message={error} />

        <div className="mt-5 space-y-3">
          <Button
            type="button"
            size="lg"
            className="w-full"
            isLoading={isPending}
            onClick={handleCheckout}
          >
            {isAuthenticated ? "Passer au paiement" : "Se connecter pour continuer"}
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/livres">Continuer mes achats</Link>
          </Button>
        </div>
      </aside>
    </div>
  );
}

/**
 * Version contrôlée de `DeliveryFields` (non gérée par un `<form>` natif ici,
 * puisque le checkout du panier appelle `checkoutCartAction` directement
 * plutôt que via `useActionState`/`<form action>` — voir le commentaire de
 * `checkoutCartAction`).
 */
function DeliveryFieldsControlled({
  requirement,
  values,
  onChange,
  fieldErrors,
}: {
  requirement: "address" | "contact";
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  fieldErrors?: Record<string, string[]>;
}) {
  const set = (name: string, value: string): void =>
    onChange({ ...values, [name]: value });

  const firstError = (name: string) => fieldErrors?.[name]?.[0];

  return (
    <fieldset className="border-border bg-paper-100/70 space-y-4 rounded-lg border p-4">
      <legend className="text-secondary px-1 text-sm font-semibold">
        {requirement === "address"
          ? "Où livrer votre commande ?"
          : "Qui vient retirer la commande ?"}
      </legend>

      <LabeledInput
        label="Nom du destinataire"
        error={firstError("recipientName")}
        value={values.recipientName ?? ""}
        onChange={(v) => set("recipientName", v)}
      />
      <LabeledInput
        label="Téléphone"
        error={firstError("deliveryPhone")}
        value={values.deliveryPhone ?? ""}
        onChange={(v) => set("deliveryPhone", v)}
      />

      {requirement === "address" && (
        <>
          <LabeledInput
            label="Pays"
            error={firstError("deliveryCountry")}
            value={values.deliveryCountry ?? "Congo"}
            onChange={(v) => set("deliveryCountry", v)}
          />
          <LabeledInput
            label="Ville"
            error={firstError("deliveryCity")}
            value={values.deliveryCity ?? ""}
            onChange={(v) => set("deliveryCity", v)}
          />
          <LabeledInput
            label="Adresse"
            error={firstError("deliveryAddress")}
            value={values.deliveryAddress ?? ""}
            onChange={(v) => set("deliveryAddress", v)}
          />
        </>
      )}
    </fieldset>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-secondary mb-1 block text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border focus:ring-ring/40 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-[3px] focus:outline-none"
      />
      {error && <span className="text-destructive mt-1 block text-xs">{error}</span>}
    </label>
  );
}
