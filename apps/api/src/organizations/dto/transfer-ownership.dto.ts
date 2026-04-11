import { IsUUID } from "class-validator";

export class TransferOwnershipDto {
  /** Пользователь, уже состоящий в организации; станет OWNER, текущий OWNER — ADMIN. */
  @IsUUID()
  newOwnerUserId!: string;
}
