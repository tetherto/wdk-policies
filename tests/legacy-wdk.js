'use strict'

import WDK from '@tetherto/wdk'

import WdkPolicies from '../index.js'

export { DEFAULT_POLICY_EXCLUSIONS, DENIAL_CODES, PolicyConfigurationError, PolicyViolationError } from '../index.js'

/**
 * The API wdk-core had while the engine lived in it, rebuilt on wdk-core plus this package. The engine's own test
 * suite imports this instead of core, and nothing else in the suite changes.
 *
 * Core applied policies after every middleware, so a middleware always received the original account, whenever it was
 * registered. To keep that order, the middlewares registered here run inside one middleware installed ahead of the
 * plugin's, and their return values are ignored, as core ignored them.
 */
export default class LegacyWDK extends WDK {
  constructor (seed, options) {
    super(seed)

    this._policies = new WdkPolicies(options)

    this._legacyMiddlewares = new Map()

    this._legacyWallets = new Set()

    this._core = { registerMiddleware: (blockchain, middleware) => super.registerMiddleware(blockchain, middleware) }
  }

  registerWallet (blockchain, WalletManager, config) {
    super.registerWallet(blockchain, WalletManager, config)

    if (!this._legacyWallets.has(blockchain)) {
      this._legacyWallets.add(blockchain)

      super.registerMiddleware(blockchain, async (account) => {
        for (const middleware of this._legacyMiddlewares.get(blockchain) ?? []) {
          await middleware(account)
        }
      })
    }

    this._policies.attach(this._core, blockchain)

    return this
  }

  registerMiddleware (blockchain, middleware) {
    if (!this._legacyMiddlewares.has(blockchain)) {
      this._legacyMiddlewares.set(blockchain, [])
    }

    this._legacyMiddlewares.get(blockchain).push(middleware)

    return this
  }

  registerPolicy (policies, options) {
    this._policies.register(policies, options)

    return this
  }

  getPolicyExclusions () {
    return this._policies.getExclusions()
  }

  dispose (blockchains) {
    super.dispose(blockchains)

    this._policies.dispose(blockchains)
  }
}
