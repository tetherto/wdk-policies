// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict'

import PolicyEngine from './policy-engine.js'

/** @typedef {import('@tetherto/wdk').default} WDK */
/** @typedef {import('./policy-engine.js').Policy} Policy */
/** @typedef {import('./policy-engine.js').RegisterPolicyOptions} RegisterPolicyOptions */

/**
 * Settings for the plugin, the same ones the engine took when it lived in core.
 *
 * @typedef {Object} WdkPoliciesOptions
 * @property {number} [maxConditionTimeoutMs] - Upper bound, in milliseconds, on the per-condition timeout any single policy can be given through `register`. Defaults to 30000.
 * @property {string[]} [policyExclusions] - Additional method names the policy proxy hands through without evaluating, unioned with `DEFAULT_POLICY_EXCLUSIONS`. Append-only.
 */

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
   * @throws {PolicyConfigurationError} If `options` is not a plain object, `maxConditionTimeoutMs` is not a finite positive number, or `policyExclusions` is not an array of non-empty strings.
   */
  constructor (options) {
    /** @private */
    this._engine = new PolicyEngine(options)

    /** @private */
    this._wallets = new Set()

    /** @private */
    this._attached = new WeakMap()
  }

  /**
   * Governs every account retrieved from the given wallets of a WDK instance. Attaching the same wallet twice installs
   * one middleware. Register the plugin after any middleware whose effects it should govern.
   *
   * @param {WDK} wdk - The WDK instance.
   * @param {...string} blockchains - The wallet identifiers, as passed to `registerWallet`.
   * @returns {WdkPolicies} The plugin, for chaining.
   */
  attach (wdk, ...blockchains) {
    const attached = this._attached.get(wdk) ?? new Set()

    this._attached.set(wdk, attached)

    for (const blockchain of blockchains) {
      this._wallets.add(blockchain)

      if (attached.has(blockchain)) continue

      attached.add(blockchain)

      wdk.registerMiddleware(blockchain, (account, context) => this._engine.applyPoliciesTo(account, context))
    }

    return this
  }

  /**
   * Registers one or more policies, exactly as `wdk.registerPolicy` did when the engine was part of core.
   *
   * @param {Policy | Policy[]} policies - A single policy or an array of policies.
   * @param {RegisterPolicyOptions} [options] - Settings applied to the policies this call registers.
   * @returns {WdkPolicies} The plugin, for chaining.
   * @throws {PolicyConfigurationError} If any policy or option fails validation, or a policy binds to a wallet that was never attached.
   */
  register (policies, options) {
    this._engine.register(policies, options, { knownWallets: this._wallets })

    return this
  }

  /**
   * Returns the method names the policy proxy hands through without evaluating.
   *
   * @returns {readonly string[]} The frozen resolved exclusion set.
   */
  getExclusions () {
    return this._engine.getExclusions()
  }

  /**
   * Forgets the policies bound to the given wallets, or every policy if none are given.
   *
   * @param {string[]} [blockchains] - The wallet identifiers to forget.
   */
  dispose (blockchains) {
    for (const blockchain of [...this._wallets]) {
      if (!blockchains || blockchains.includes(blockchain)) {
        this._wallets.delete(blockchain)
        this._engine.disposeWallet(blockchain)
      }
    }

    if (!blockchains) {
      this._engine.disposeAll()
    }
  }
}
