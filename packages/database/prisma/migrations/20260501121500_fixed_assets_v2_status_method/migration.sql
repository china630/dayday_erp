-- Fixed Assets v2: status + depreciation method

CREATE TYPE "FixedAssetDepreciationMethod" AS ENUM ('STRAIGHT_LINE');
CREATE TYPE "FixedAssetStatus" AS ENUM ('ACTIVE', 'DISPOSED');

ALTER TABLE "fixed_assets"
ADD COLUMN "depreciation_method" "FixedAssetDepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
ADD COLUMN "status" "FixedAssetStatus" NOT NULL DEFAULT 'ACTIVE';
