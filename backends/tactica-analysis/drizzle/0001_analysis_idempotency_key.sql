ALTER TABLE "Analysis" ADD COLUMN "idempotencyKey" text;--> statement-breakpoint
CREATE UNIQUE INDEX "Analysis_idempotencyKey_key" ON "Analysis" USING btree ("idempotencyKey");