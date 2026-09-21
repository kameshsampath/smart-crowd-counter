let pending: Promise<unknown> = Promise.resolve()
export function withLibraryLock<Result>(action: () => Promise<Result>): Promise<Result> {
    const result = pending.then(action, action)
    pending = result.catch(() => undefined)
    return result
}