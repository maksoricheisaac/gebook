import type { Metadata } from "next";
import { OrderDetail } from "@/src/components/admin/order-detail";

export const metadata: Metadata = {
  title: "Détail de la commande",
};

export default async function AdminOrderDetailPage(
  props: PageProps<"/admin/commandes/[id]">,
) {
  const { id } = await props.params;

  return <OrderDetail orderId={id} />;
}
