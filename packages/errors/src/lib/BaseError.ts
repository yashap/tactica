export abstract class BaseError extends Error {
  public override readonly cause?: Error

  constructor(message?: string, maybeCause?: unknown) {
    super(message)
    this.name = new.target.name
    this.cause = maybeCause instanceof Error ? maybeCause : undefined
  }
}
