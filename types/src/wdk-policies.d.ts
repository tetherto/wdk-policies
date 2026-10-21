/**
 * The transaction policy engine as an opt-in plugin for wdk-core. Attached to a wallet, it installs a middleware that
 * returns a governed proxy for every account retrieved from that wallet.
 *
 * A guardrail against in-process mistakes: it runs in the caller's own process, so code in that process can reach
 * around it. It is not a security boundary.
 */
export default class WdkPolicies {
    /**
     * Creates the plugin.
     *
     * @param {WdkPoliciesOptions} [options] - The engine settings.
     * @throws {PolicyConfigurationError} If `options` is not a plain object.
     * @throws {PolicyConfigurationError} If `maxConditionTimeoutMs` is not a finite positive number.
     * @throws {PolicyConfigurationError} If `policyExclusions` is not an array of non-empty strings.
     */
    constructor(options?: WdkPoliciesOptions);
    /** @private */
    private _engine;
    /** @private */
    private _wallets;
    /** @private */
    private _attached;
    /**
     * Governs every account retrieved from the given wallets of a WDK instance. Attaching the same wallet twice
     * installs one middleware. Register the plugin after any middleware whose effects it should govern.
     *
     * @param {WDK} wdk - The WDK instance whose accounts the plugin governs.
     * @param {...string} blockchains - The wallet identifiers, as passed to `registerWallet`.
     * @returns {WdkPolicies} The plugin, for chaining.
     */
    attach(wdk: WDK, ...blockchains: string[]): WdkPolicies;
    /**
     * Registers one or more policies. Calls stack; if a policy with the same id is registered twice into the same
     * binding, the second call replaces the first.
     *
     * @param {Policy | Policy[]} policies - The policies to register.
     * @param {RegisterPolicyOptions} [options] - Settings applied to the policies this call registers.
     * @returns {WdkPolicies} The plugin, for chaining.
     * @throws {PolicyConfigurationError} If any policy or option fails validation.
     * @throws {PolicyConfigurationError} If a policy binds to a wallet that was never attached.
     */
    register(policies: Policy | Policy[], options?: RegisterPolicyOptions): WdkPolicies;
    /**
     * Returns the method names the policy proxy hands through without evaluating.
     *
     * @returns {readonly string[]} The frozen resolved exclusion set.
     */
    getExclusions(): readonly string[];
    /**
     * Forgets the policies bound to the given wallets, or every policy if none are given.
     *
     * @param {string[]} [blockchains] - The wallet identifiers to forget.
     */
    dispose(blockchains?: string[]): void;
}
export type WDK = import("@tetherto/wdk").default;
export type Policy = import("./index.js").Policy;
export type RegisterPolicyOptions = import("./index.js").RegisterPolicyOptions;
/**
 * Settings for the plugin.
 */
export type WdkPoliciesOptions = {
    /**
     * - Upper bound, in milliseconds, on the per-condition timeout any single policy can be given through
     *   `register`. Defaults to 30000.
     */
    maxConditionTimeoutMs?: number;
    /**
     * - Additional method names the policy proxy hands through without evaluating, unioned with
     *   `DEFAULT_POLICY_EXCLUSIONS`. Append-only.
     */
    policyExclusions?: string[];
};
