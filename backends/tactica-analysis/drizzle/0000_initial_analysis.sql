CREATE TYPE "public"."AnalysisStatus" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ChessColor" AS ENUM('white', 'black');--> statement-breakpoint
CREATE TABLE "Analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"status" "AnalysisStatus" DEFAULT 'queued' NOT NULL,
	"pgn" text NOT NULL,
	"playerColor" "ChessColor" NOT NULL,
	"settings" jsonb,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE INDEX "Analysis_status_idx" ON "Analysis" USING btree ("status");