"use client";

import { useActionState } from "react";
import { CheckCircle2, CreditCard, ExternalLink, FlaskConical, Info } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { FormError } from "@/src/components/ui/field";
import { formatDateTime, formatPrice } from "@/src/lib/format";
import {
  simulatePaymentAction,
  startPaymentAction,
  type PaymentFormState,
} from "@/src/lib/payment-actions";
import {
  isPaymentInFlight,
  paymentStatusLabel,
  SIMULATION_PROVIDER_CODE,
  type Payment,
} from "@/src/lib/payment-shared";

const initialState: PaymentFormState = {};

/** Statuts de commande depuis lesquels une tentative de paiement est recevable. */
const PAYABLE_ORDER_STATUSES = ["pending", "awaiting_payment", "failed"];

/**
 * Règlement d'une commande.
 *
 * Le composant n'annonce JAMAIS un paiement qui n'a pas eu lieu. « Payée » ne
 * s'affiche que lorsque l'API a confirmé le règlement, à la suite d'une
 * notification signée du prestataire.
 *
 * Tant que le seul prestataire installé est celui de simulation, l'écran le dit
 * explicitement, et le dit AVANT le bouton plutôt qu'après : le visiteur doit
 * savoir ce qui va se passer avant de cliquer, pas le découvrir ensuite. Le
 * bloc de simulation est visuellement traité comme ce qu'il est — un outil de
 * développement, hachuré et à part — pour ne jamais être confondu avec un
 * moyen de paiement réel.
 */
export function PaymentPanel({
  orderNumber,
  orderStatus,
  totalAmount,
  paidAt,
  payments,
}: {
  orderNumber: string;
  orderStatus: string;
  totalAmount: string;
  paidAt: string | null;
  payments: Payment[];
}) {
  const [startState, startAction, startPending] = useActionState(
    startPaymentAction,
    initialState,
  );
  const [simulateState, simulateAction, simulatePending] = useActionState(
    simulatePaymentAction,
    initialState,
  );

  const inFlight = payments.find(isPaymentInFlight);
  const lastAttempt = payments[0];

  if (orderStatus === "paid") {
    return (
      <section className="border-success/30 bg-success-muted rounded-lg border p-6">
        <div className="flex items-start gap-3.5">
          <CheckCircle2 aria-hidden className="text-success mt-0.5 size-6 shrink-0" />
          <div>
            <h2 className="type-h3 text-secondary">Paiement confirmé</h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
              {formatPrice(totalAmount)} réglés
              {paidAt ? ` le ${formatDateTime(paidAt)}` : ""}. Vos formats numériques
              seront ajoutés à votre bibliothèque dès son ouverture.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!PAYABLE_ORDER_STATUSES.includes(orderStatus)) {
    return (
      <section className="border-border bg-card rounded-lg border p-6">
        <div className="text-muted-foreground flex items-start gap-3.5 text-sm">
          <Info aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p>
            Cette commande n’attend plus de paiement. Son statut actuel est indiqué en
            haut de page.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border border-b p-6">
        <h2 className="type-h3 text-secondary">Régler la commande</h2>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-muted-foreground text-sm">Montant à payer</span>
          <span className="font-heading text-secondary tnum text-2xl font-semibold">
            {formatPrice(totalAmount)}
          </span>
        </div>
        {lastAttempt && (
          <p className="type-caption mt-2">
            Dernière tentative : {paymentStatusLabel(lastAttempt.status)}.
          </p>
        )}
      </div>

      <div className="p-6">
        {/*
         * Avertissement affiché AVANT toute action, et non après. Le paiement en
         * ligne n'est pas raccordé : le dire ici évite qu'un lecteur clique en
         * croyant régler son achat.
         */}
        <div className="border-border-strong bg-paper-100 mb-5 rounded-md border border-dashed p-4">
          <p className="text-secondary flex items-start gap-2 text-sm font-semibold">
            <FlaskConical aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
            Le paiement en ligne n’est pas encore ouvert
          </p>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
            Votre commande est bien enregistrée et vos exemplaires sont réservés. Le
            raccordement aux prestataires de paiement — Mobile Money d’abord — est en
            cours. Aucun montant ne peut être débité pour le moment.
          </p>
        </div>

        {!inFlight && (
          <form action={startAction}>
            <input type="hidden" name="orderNumber" value={orderNumber} />
            <Button type="submit" size="lg" isLoading={startPending}>
              {!startPending && <CreditCard aria-hidden />}
              {startPending ? "Ouverture…" : "Ouvrir une tentative de paiement"}
            </Button>
            <div className="mt-3">
              <FormError message={startState.error} />
            </div>
          </form>
        )}

        {inFlight?.checkoutUrl && (
          <a
            href={inFlight.checkoutUrl}
            className="text-primary inline-flex items-center gap-2 text-sm font-semibold hover:underline"
          >
            <ExternalLink aria-hidden className="size-4" />
            Reprendre le paiement chez le prestataire
          </a>
        )}

        {inFlight?.providerCode === SIMULATION_PROVIDER_CODE && (
          <div className="border-warning/40 bg-warning-muted/50 mt-5 rounded-md border p-4">
            <p className="text-secondary flex items-start gap-2 text-sm font-semibold">
              <FlaskConical aria-hidden className="text-warning mt-0.5 size-4 shrink-0" />
              Prestataire de simulation — environnement de développement
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-pretty">
              Les boutons ci-dessous demandent au prestataire de simulation d’émettre une
              notification, exactement comme le ferait un vrai prestataire. Aucun montant
              n’est débité.
            </p>

            <form action={simulateAction} className="mt-4 flex flex-wrap gap-3">
              <input type="hidden" name="paymentId" value={inFlight.id} />
              <input type="hidden" name="orderNumber" value={orderNumber} />
              <Button
                type="submit"
                name="outcome"
                value="successful"
                variant="secondary"
                size="sm"
                disabled={simulatePending}
              >
                Simuler un règlement réussi
              </Button>
              <Button
                type="submit"
                name="outcome"
                value="failed"
                variant="outline"
                size="sm"
                disabled={simulatePending}
              >
                Simuler un échec
              </Button>
            </form>
            <div className="mt-3">
              <FormError message={simulateState.error} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
