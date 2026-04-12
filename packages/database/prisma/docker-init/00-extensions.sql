-- Требование схемы: uuid_generate_v4() в Prisma @default(dbgenerated(...))
-- (дублируется в первой миграции; безвредно при IF NOT EXISTS)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
