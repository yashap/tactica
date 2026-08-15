CREATE TABLE "PuzzleAttempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"createdAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"userId" uuid NOT NULL,
	"puzzleId" uuid NOT NULL,
	"moveUci" text NOT NULL,
	"correct" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "PuzzleAttempt" ADD CONSTRAINT "PuzzleAttempt_puzzleId_Puzzle_id_fk" FOREIGN KEY ("puzzleId") REFERENCES "public"."Puzzle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "PuzzleAttempt_userId_idx" ON "PuzzleAttempt" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "PuzzleAttempt_puzzleId_idx" ON "PuzzleAttempt" USING btree ("puzzleId");