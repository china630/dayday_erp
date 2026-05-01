import { redirect } from "next/navigation";

/** Хаб производства: сразу в реестр рецептов (навигация — через левое меню). */
export default function ManufacturingPage() {
  redirect("/manufacturing/recipes");
}
