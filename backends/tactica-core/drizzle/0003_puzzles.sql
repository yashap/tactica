CREATE TYPE "public"."PuzzleSeverity" AS ENUM('inaccuracy', 'mistake', 'blunder');--> statement-breakpoint
CREATE TABLE "Puzzle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"userId" uuid NOT NULL,
	"gameId" uuid NOT NULL,
	"ply" integer NOT NULL,
	"fen" text NOT NULL,
	"playerColor" "ChessColor" NOT NULL,
	"playedMoveUci" text NOT NULL,
	"playedMoveSan" text NOT NULL,
	"bestMoveUci" text NOT NULL,
	"bestMoveSan" text NOT NULL,
	"acceptableMovesUci" jsonb NOT NULL,
	"engineLines" jsonb NOT NULL,
	"evalBefore" jsonb NOT NULL,
	"evalAfter" jsonb NOT NULL,
	"winProbBefore" double precision NOT NULL,
	"winProbAfter" double precision NOT NULL,
	"severity" "PuzzleSeverity" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Game" ADD COLUMN "moveEvals" jsonb;--> statement-breakpoint
ALTER TABLE "Puzzle" ADD CONSTRAINT "Puzzle_gameId_Game_id_fk" FOREIGN KEY ("gameId") REFERENCES "public"."Game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "Puzzle_userId_idx" ON "Puzzle" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Puzzle_gameId_idx" ON "Puzzle" USING btree ("gameId");--> statement-breakpoint
CREATE UNIQUE INDEX "Puzzle_gameId_ply_key" ON "Puzzle" USING btree ("gameId","ply");--> statement-breakpoint
CREATE INDEX "Puzzle_userId_createdAt_idx" ON "Puzzle" USING btree ("userId","createdAt");