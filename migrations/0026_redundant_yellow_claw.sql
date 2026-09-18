ALTER TYPE "public"."payment_provider" ADD VALUE 'flutterwave';--> statement-breakpoint
ALTER TABLE "currency_rates" ALTER COLUMN "conversion_rate" SET DATA TYPE numeric(16, 6);--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "banner_image" text;--> statement-breakpoint
ALTER TABLE "destinations" ADD COLUMN "is_top" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "banner_image" text;--> statement-breakpoint
ALTER TABLE "regions" ADD COLUMN "is_top" boolean DEFAULT false NOT NULL;