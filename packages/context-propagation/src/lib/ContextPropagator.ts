import { AsyncLocalStorage } from 'node:async_hooks'

export class ContextPropagator<T> {
  private readonly storage: AsyncLocalStorage<T> | undefined = this.createStorage()

  /**
   * Run a callback with "context" — any code within the callback can call getContext() on the same
   * ContextPropagator instance and read it back. Implemented via AsyncLocalStorage, so it survives
   * await boundaries and arbitrary call-stack depth.
   *
   * Convenient for things like correlation IDs, where you'd rather not thread the value through
   * every function call.
   */
  public runWithContext<R>(context: T, callback: () => R): R {
    if (!this.storage) {
      return callback()
    }
    return this.storage.run(context, callback)
  }

  /**
   * Read the current context, or `undefined` if not in a `runWithContext` continuation.
   */
  public getContext(): T | undefined {
    return this.storage?.getStore()
  }

  /**
   * Set the context for the rest of the current async continuation, without needing to wrap a
   * callback. Useful inside framework hooks (e.g. Fastify `onRequest`) where you want every
   * subsequent handler in the request chain to see the context but you don't control the
   * surrounding call stack. Has no effect outside Node.
   */
  public enterWith(context: T): void {
    this.storage?.enterWith(context)
  }

  private createStorage(): AsyncLocalStorage<T> | undefined {
    // Skip on non-Node runtimes (Metro / RN). AsyncLocalStorage is Node-only.
    if (typeof process === 'undefined' || !process.versions?.node) {
      return undefined
    }
    return new AsyncLocalStorage<T>()
  }
}
