-- is_final: зафиксирован ли курс в бухгалтерском документе
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_final" BOOLEAN NOT NULL DEFAULT false;
