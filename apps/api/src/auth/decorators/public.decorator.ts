import { SetMetadata } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../constants";

/** Маршрут без JWT (логин, refresh; GET /api/health в контроллере; legacy GET /health — middleware в main). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
