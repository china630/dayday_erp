import { redirect } from "next/navigation";

/** Создание сотрудника — только через модальное окно на `/employees`. */
export default function NewEmployeeRedirectPage() {
  redirect("/employees");
}
