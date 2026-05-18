-- CreateEnum
CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderReturnStatus" AS ENUM ('NONE', 'PARTIAL', 'FULL');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('STORE', 'GODOWN', 'WAREHOUSE', 'YARD');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "defaultSettings" JSONB DEFAULT '{}',
ADD COLUMN     "enabledModules" JSONB DEFAULT '[]',
ADD COLUMN     "featureFlags" JSONB DEFAULT '{}',
ADD COLUMN     "stateCode" TEXT,
ALTER COLUMN "businessType" SET DEFAULT 'GENERAL_STORE';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "stateCode" TEXT;

-- AlterTable
ALTER TABLE "materials" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "batchNumber" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "grossWeight" DECIMAL(12,3),
ADD COLUMN     "imeiNumber" TEXT,
ADD COLUMN     "makingCharges" DECIMAL(10,2),
ADD COLUMN     "manufactureDate" TIMESTAMP(3),
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "material" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "netWeight" DECIMAL(12,3),
ADD COLUMN     "purity" DECIMAL(8,3),
ADD COLUMN     "rackLocation" TEXT,
ADD COLUMN     "serialNumber" TEXT,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "tareWeight" DECIMAL(12,3),
ADD COLUMN     "weight" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "cgstAmount" DECIMAL(12,2),
ADD COLUMN     "discountAmount" DECIMAL(12,2),
ADD COLUMN     "gstAmount" DECIMAL(12,2),
ADD COLUMN     "gstRate" DECIMAL(5,2),
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "igstAmount" DECIMAL(12,2),
ADD COLUMN     "sgstAmount" DECIMAL(12,2),
ADD COLUMN     "taxableAmount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billingSnapshot" JSONB,
ADD COLUMN     "cgstTotal" DECIMAL(12,2),
ADD COLUMN     "dueAmount" DECIMAL(12,2),
ADD COLUMN     "grandTotal" DECIMAL(12,2),
ADD COLUMN     "gstTotal" DECIMAL(12,2),
ADD COLUMN     "igstTotal" DECIMAL(12,2),
ADD COLUMN     "invoiceDiscount" DECIMAL(12,2),
ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "itemDiscountTotal" DECIMAL(12,2),
ADD COLUMN     "loadingCharges" DECIMAL(12,2),
ADD COLUMN     "paidAmount" DECIMAL(12,2),
ADD COLUMN     "returnStatus" "OrderReturnStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "returnedAmount" DECIMAL(12,2),
ADD COLUMN     "roundOff" DECIMAL(10,2),
ADD COLUMN     "sgstTotal" DECIMAL(12,2),
ADD COLUMN     "sourceLocationId" TEXT,
ADD COLUMN     "subtotal" DECIMAL(12,2),
ADD COLUMN     "taxableAmount" DECIMAL(12,2),
ADD COLUMN     "transportCharges" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'STORE',
    "address" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_stock" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "material_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "totalReturnAmount" DECIMAL(12,2) NOT NULL,
    "gstReversalAmount" DECIMAL(12,2) NOT NULL,
    "ledgerAdjustmentAmount" DECIMAL(12,2) NOT NULL,
    "status" "SalesReturnStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityReturned" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "taxableAmount" DECIMAL(12,2) NOT NULL,
    "gstAmount" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "cgstAmount" DECIMAL(12,2),
    "sgstAmount" DECIMAL(12,2),
    "igstAmount" DECIMAL(12,2),

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_businessId_isActive_name_idx" ON "locations"("businessId", "isActive", "name");

-- CreateIndex
CREATE INDEX "locations_businessId_isDefault_idx" ON "locations"("businessId", "isDefault");

-- CreateIndex
CREATE INDEX "material_stock_businessId_locationId_materialId_idx" ON "material_stock"("businessId", "locationId", "materialId");

-- CreateIndex
CREATE INDEX "material_stock_businessId_materialId_idx" ON "material_stock"("businessId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "material_stock_businessId_materialId_locationId_key" ON "material_stock"("businessId", "materialId", "locationId");

-- CreateIndex
CREATE INDEX "stock_transfers_businessId_createdAt_idx" ON "stock_transfers"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_transfers_businessId_fromLocationId_createdAt_idx" ON "stock_transfers"("businessId", "fromLocationId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_transfers_businessId_toLocationId_createdAt_idx" ON "stock_transfers"("businessId", "toLocationId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transferId_idx" ON "stock_transfer_items"("transferId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_materialId_idx" ON "stock_transfer_items"("materialId");

-- CreateIndex
CREATE INDEX "sales_returns_businessId_returnDate_createdAt_idx" ON "sales_returns"("businessId", "returnDate", "createdAt");

-- CreateIndex
CREATE INDEX "sales_returns_businessId_orderId_createdAt_idx" ON "sales_returns"("businessId", "orderId", "createdAt");

-- CreateIndex
CREATE INDEX "sales_returns_businessId_customerId_createdAt_idx" ON "sales_returns"("businessId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_businessId_returnNumber_key" ON "sales_returns"("businessId", "returnNumber");

-- CreateIndex
CREATE INDEX "sales_return_items_returnId_idx" ON "sales_return_items"("returnId");

-- CreateIndex
CREATE INDEX "sales_return_items_orderItemId_idx" ON "sales_return_items"("orderItemId");

-- CreateIndex
CREATE INDEX "sales_return_items_materialId_idx" ON "sales_return_items"("materialId");

-- CreateIndex
CREATE INDEX "orders_businessId_sourceLocationId_createdAt_idx" ON "orders"("businessId", "sourceLocationId", "createdAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_stock" ADD CONSTRAINT "material_stock_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_stock" ADD CONSTRAINT "material_stock_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_stock" ADD CONSTRAINT "material_stock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
