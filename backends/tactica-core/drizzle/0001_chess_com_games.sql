CREATE TYPE "public"."ChessColor" AS ENUM('white', 'black');--> statement-breakpoint
CREATE TYPE "public"."GameAnalysisStatus" AS ENUM('pending', 'analyzing', 'analyzed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."GameResult" AS ENUM('win', 'loss', 'draw');--> statement-breakpoint
CREATE TYPE "public"."GameSource" AS ENUM('chesscom', 'lichess');--> statement-breakpoint
CREATE TABLE "GameAccount" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"userId" uuid NOT NULL,
	"source" "GameSource" NOT NULL,
	"externalUsername" text NOT NULL,
	"syncCheckpoint" text,
	"lastSyncJobId" text,
	"lastSyncedAt" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "Game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"userId" uuid NOT NULL,
	"gameAccountId" uuid NOT NULL,
	"source" "GameSource" NOT NULL,
	"externalGameId" text NOT NULL,
	"pgn" text NOT NULL,
	"playedAt" timestamp (3) with time zone NOT NULL,
	"timeControl" text NOT NULL,
	"userColor" "ChessColor" NOT NULL,
	"opponentUsername" text NOT NULL,
	"result" "GameResult" NOT NULL,
	"analysisStatus" "GameAnalysisStatus" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Game" ADD CONSTRAINT "Game_gameAccountId_GameAccount_id_fk" FOREIGN KEY ("gameAccountId") REFERENCES "public"."GameAccount"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "GameAccount_userId_idx" ON "GameAccount" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "GameAccount_userId_source_key" ON "GameAccount" USING btree ("userId","source");--> statement-breakpoint
CREATE INDEX "Game_userId_idx" ON "Game" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Game_gameAccountId_idx" ON "Game" USING btree ("gameAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX "Game_userId_source_externalGameId_key" ON "Game" USING btree ("userId","source","externalGameId");--> statement-breakpoint
CREATE INDEX "Game_userId_playedAt_idx" ON "Game" USING btree ("userId","playedAt");