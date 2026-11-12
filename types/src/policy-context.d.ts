/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */
/** @typedef {import('./policy-engine.js').PolicyContext} PolicyContext */
/**
 * The raw inputs from the wrapper used to build a frozen PolicyContext.
 *
 * @typedef {Object} BuildContextInput
 * @property {string} operation - The wrapped operation name (e.g. 'sendTransaction').
 * @property {string} wallet - The wallet identifier this account belongs to (the same string passed to `registerWallet`).
 * @property {IWalletAccountReadOnly} account - A read-only view of the wallet account.
 * @property {readonly unknown[]} args - The full argument array passed to the method.
 */
/**
 * Builds the immutable context object passed to every condition function.
 *
 * Each argument is passed through structuredClone so condition functions see
 * a snapshot taken at evaluation time. This prevents time-of-check /
 * time-of-use mutation: a caller mutating the original tx object after the
 * wrapper builds the context (e.g., concurrent middleware on a shared request
 * body) cannot change what the conditions already evaluated. Arguments that
 * aren't structured-cloneable fail closed — see {@link snapshotArgs}.
 *
 * @internal
 * @param {BuildContextInput} input - The raw inputs from the wrapper.
 * @returns {PolicyContext} A frozen context object.
 * @throws {PolicyConfigurationError} If any argument is not structured-cloneable.
 */
export function buildContext({ operation, wallet, account, args }: BuildContextInput): PolicyContext;
/**
 * Clones each argument so the result is isolated from later mutation of the
 * caller's originals.
 *
 * Besides building the condition context, the wrapper forwards a snapshot of
 * the arguments to the underlying wallet method. Cloning there closes a
 * time-of-check / time-of-use gap: policy evaluation is asynchronous, and
 * without an isolated copy a caller could mutate the original argument objects
 * across that await (e.g. flip `tx.to` / `tx.value` after the policy already
 * approved them) and have the mutated values reach the wallet. Each wrapped
 * call takes its own snapshot, so the forwarded copy is also independent from
 * the context the conditions see — a condition cannot mutate its way into the
 * executed call.
 *
 * Arguments that aren't structured-cloneable fail closed: snapshotting only
 * runs for governed accounts, so silently forwarding the raw value would hand
 * the wallet a shared mutable reference and re-open the very gap this exists
 * to close. Throwing forces the caller to pass cloneable arguments instead.
 *
 * @internal
 * @param {readonly unknown[]} args - The full argument array passed to the method.
 * @param {string} [operation] - The operation name, used only to enrich the error message.
 * @returns {unknown[]} A new array whose elements are per-argument snapshots.
 * @throws {PolicyConfigurationError} If any argument is not structured-cloneable.
 */
export function snapshotArgs(args: readonly unknown[], operation?: string): unknown[];
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type PolicyContext = import("./policy-engine.js").PolicyContext;
/**
 * The raw inputs from the wrapper used to build a frozen PolicyContext.
 */
export type BuildContextInput = {
    /**
     * - The wrapped operation name (e.g. 'sendTransaction').
     */
    operation: string;
    /**
     * - The wallet identifier this account belongs to (the same string passed to `registerWallet`).
     */
    wallet: string;
    /**
     * - A read-only view of the wallet account.
     */
    account: IWalletAccountReadOnly;
    /**
     * - The full argument array passed to the method.
     */
    args: readonly unknown[];
};
