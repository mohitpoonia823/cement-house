-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "variantId" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "unit" TEXT NOT NULL,
    "purchasePrice" DECIMAL(10,2) NOT NULL,
    "salePrice" DECIMAL(10,2) NOT NULL,
    "minThreshold" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "maxThreshold" DECIMAL(12,3),
    "attributes" JSONB,
    "metadata" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_businessId_materialId_isActive_idx" ON "product_variants"("businessId", "materialId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_businessId_materialId_name_key" ON "product_variants"("businessId", "materialId", "name");

-- CreateIndex
CREATE INDEX "order_items_variantId_idx" ON "order_items"("variantId");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
