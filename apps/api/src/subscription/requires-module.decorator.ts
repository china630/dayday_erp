import { SetMetadata } from "@nestjs/common";
import { REQUIRES_MODULE_KEY } from "./subscription.constants";

/** Помечает класс/метод контроллера — требуется доступ по правилам SubscriptionAccessService. */
export const RequiresModule = (name: string) =>
  SetMetadata(REQUIRES_MODULE_KEY, name);
