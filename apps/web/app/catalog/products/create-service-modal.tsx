"use client";

import { ProductModal } from "./product-modal";

/** Модалка создания услуги: только название, НДС, цена; на бэкенд уходит `isService: true`. */
export function CreateServiceModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <ProductModal open={open} productId={null} createAs="service" onClose={onClose} onSaved={onSaved} />
  );
}
