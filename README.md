# @tetherto/wdk-policies

**Note**: This package is currently in beta and **not production ready**. Please test thoroughly in development environments before using it.

Transaction policies for [WDK](https://docs.wdk.tether.io/): rules that `ALLOW` or `DENY` write-facing operations on the accounts a `WDK` instance hands out. Matching `DENY`s throw a `PolicyViolationError` before the underlying method runs.

**What it is, and what it is not.** The engine runs in your own process, beside the accounts it governs. It is a guardrail against mistakes in your own code: a wrong amount, a call to the wrong method. It is not a security boundary: code in the same process can reach the underlying account, and it never sees the key.

This package used to be part of `@tetherto/wdk`. It is opt-in now: installing core no longer installs it.

## Installation

```bash
npm install @tetherto/wdk @tetherto/wdk-policies
```

## Quick Start

```javascript
import WDK from '@tetherto/wdk'
import WdkPolicies, { PolicyViolationError } from '@tetherto/wdk-policies'
import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

const wdk = new WDK(seedPhrase)
  .registerWallet('ethereum', WalletManagerEvm, { provider: '...' })

const policies = new WdkPolicies()
  .attach(wdk, 'ethereum')
  .register({
    id: 'value-cap',
    name: 'Cap value at 1 ETH',
    scope: 'project',
    rules: [{
      name: 'allow-under-1-eth',
      operation: 'sendTransaction',
      action: 'ALLOW',
      conditions: [({ args }) => BigInt(args[0].value) <= 10n ** 18n]
    }]
  })

const account = await wdk.getAccount('ethereum', 0)

try {
  await account.sendTransaction({ to: '0x…', value: 5n * 10n ** 18n })
} catch (err) {
  if (err instanceof PolicyViolationError) {
    console.log(err.policyId, err.ruleName, err.reason)
  }
}

// Run the same evaluation without executing the transaction.
const result = await account.simulate.sendTransaction({ to: '0x…', value: 1n })
// → { decision: 'ALLOW' | 'DENY', policy_id, matched_rule, reason, trace }
```

`account.simulate` evaluates only the operation you call. It does not execute it, so it can't see the calls that operation would make internally — simulating `getSwapProtocol(label).swap(...)` checks the `swap` operation, not the `sendTransaction` the swap would issue at run time. A real `swap()` evaluates both only for protocols registered via `account.registerProtocol`; a `wdk.registerProtocol` protocol runs on the raw account, so its internal calls are not evaluated.

> **Breaking change:** on an account that is (or may become) policy-governed, protocols read through `getXProtocol` are built against the enforced proxy, which hides `_`-prefixed members. Protocols whose constructors read such members — including the published `@tetherto/wdk-protocol-*` packages (Velora, Aave, USDT0), which read `account._config` — must be registered with `wdk.registerProtocol` rather than `account.registerProtocol`, or `getXProtocol`/`simulate.getXProtocol` will throw. Protocols registered via `wdk.registerProtocol` are built against the raw account, so their internal account calls are **not** policy-evaluated.

`attach(wdk, ...blockchains)` installs a middleware on each wallet through `wdk.registerMiddleware`, which returns a governed proxy for every account retrieved from it. Attach after any middleware whose effects should be governed too. A middleware registered after `attach` receives the governed account, which refuses new functions and accessors. A policy can only bind to a wallet that has been attached.

## Migrating from `@tetherto/wdk` 1.0.0-beta.21 and earlier

| Before, in core | Now |
|---|---|
| `new WDK(seed, { maxConditionTimeoutMs, policyExclusions })` | `new WDK(seed)` and `new WdkPolicies({ maxConditionTimeoutMs, policyExclusions })` |
| `wdk.registerPolicy(policies, options)` | `new WdkPolicies().attach(wdk, 'ethereum', …).register(policies, options)` |
| `wdk.getPolicyExclusions()` | `policies.getExclusions()` |
| `wdk.dispose(blockchains)` cleared the policies too | `policies.dispose(blockchains)` |
| `import { PolicyViolationError, PolicyConfigurationError, DEFAULT_POLICY_EXCLUSIONS, DENIAL_CODES } from '@tetherto/wdk'` | the same names from `@tetherto/wdk-policies` |

Policies, rules, conditions, the evaluation context, simulation, denial codes and errors are unchanged.

## Policies

Policies have two scopes — `project` and `account`. A project-scope policy applies globally by default, or only to the wallets named in its `wallet` field (`wallet: 'ethereum'` or `wallet: ['ethereum', 'ton']`). The `wallet` value is the same string passed to `registerWallet`. It might be a chain name like `"ethereum"`, but it could equally be `"treasury-cold"` or any label the consumer chose; the engine treats it as an opaque key. An account-scope policy must declare a `wallet` and targets specific accounts within it, identified by either the full `account.path` (`accounts: ["m/44'/60'/0'/0/0"]` for the first Ethereum account) or integer index (`accounts: [0, 1]`) — index entries match accounts retrieved via `wdk.getAccount(wallet, index)`; path entries match either retrieval style. Evaluation is narrowest-first with `DENY` winning across scopes. Account-scope `ALLOW` rules can opt into `override_broader_scope: true` to short-circuit broader policies for explicit exceptions (e.g., treasury accounts). Conditions can be sync or async and may carry user-owned state via closures. Templates (`@tetherto/wdk-policy-templates`) and a portal UI for editing policies are coming in later phases.

### Account policy paths

A string entry in `accounts` matches an account only when it exactly equals the account's `path` — and `path` is the full BIP-44 derivation path, `m/44'/60'/0'/0/0` for the first Ethereum account, not the `"0'/0/0"` suffix you hand to `getAccountByPath`. Select by that suffix and the match fails silently: it never equals the real path, so the policy does not attach, and unless another policy applies the account stays ungoverned — `keyPair` readable, writes unchecked, no error. The prefix varies by chain, wallet configuration, and signer, so never assume it; read the account's own `path` and select on that:

```javascript
const account = await wdk.getAccount('ethereum', 0)

policies.register({
  id: 'block-signing',
  name: 'Block signing for this account',
  scope: 'account',
  wallet: 'ethereum',
  accounts: [account.path],
  rules: [{ name: 'deny-sign', operation: 'sign', action: 'DENY', conditions: [] }]
})

// A handle taken before the policy was registered is ungoverned; fetch again.
const governed = await wdk.getAccount('ethereum', 0)
await governed.sign('message') // throws PolicyViolationError
```

### Condition context

Every condition receives a single frozen context object with four fields: `operation` (the intercepted operation name), `wallet` (the identifier the account belongs to — the same string passed to `registerWallet`), `account` (a read-only view exposing reads and quotes but no signing or write methods), and `args` (the full argument array the call was made with, snapshotted at evaluation time).

Arguments are read positionally through `args`, which works for every operation shape — including multi-argument ones:

```javascript
// sendTransaction(tx) — the transaction is args[0]
conditions: [({ args }) => BigInt(args[0].value) <= 10n ** 18n]

// swidge(options, config) — slippage lives on options, the fee caps on config
conditions: [({ args }) => args[0].slippage <= 0.05]
conditions: [({ args }) => args[1] !== undefined && args[1].maxProtocolFeeBps <= 50]
```

Index positionally against the operation's real signature, and remember that trailing arguments are often optional — `swidge`'s `config` is. Reading a field off an argument that wasn't passed throws, and reading one that lives on a different argument silently yields `undefined`, which compares falsy: either way the rule stops guarding what you think it guards. Check the argument exists before reaching into it.

> **Breaking change:** `context.params`, a shortcut for `args[0]`, has been removed. It was invisible past the first argument, so multi-argument operations had to reach for `args` anyway. Migrate positional access to `args`:
>
> ```javascript
> // Before
> conditions: [({ params }) => params.to === '0x…']
>
> // After
> conditions: [({ args }) => args[0].to === '0x…']
> ```

### Method coverage

Coverage is **deny-by-default at the proxy layer**. The engine does not carry a list of methods it governs; it carries a list of methods it *doesn't*, and governs everything else.

That inversion is deliberate. Under an inclusion list, a wallet method the list has never heard of — a newly shipped `payLightningInvoice`, say — passes straight through to the signer with no evaluation and no error. The policy silently does not apply. Under deny-by-default the same unknown method is governed, so the worst case is a loud `PolicyViolationError` telling you to write a rule, instead of an unpoliced transfer.

```js
import { DEFAULT_POLICY_EXCLUSIONS } from '@tetherto/wdk-policies'
```

`DEFAULT_POLICY_EXCLUSIONS` is a frozen array of method names that bypass the engine: balance and allowance lookups, `quote*` estimates, protocol capability queries, and lifecycle methods like `dispose` and `toReadOnlyAccount`. Its contents come from an audit of every `wdk-wallet-*` and `wdk-protocol-*` package in the org — see [`docs/policy-exclusions-audit.md`](docs/policy-exclusions-audit.md), which records how each method was classified and why. Anything absent from that list is governed.

Three rules worth knowing:

- **Accessors are never intercepted.** Only callable methods are wrapped, and the proxy classifies members through their property descriptors, so a getter is never invoked just to decide whether to wrap it.
- **Inherited methods are governed.** The proxy walks the prototype chain, so a method declared on a base account class is intercepted the same as an own method.
- **Accounts with no policies registered are untouched.** The proxy is not applied at all, so ungoverned use costs nothing.
- **Governed calls are asynchronous.** Evaluation is async, so a governed method returns a Promise even if the underlying method is synchronous. Every value-moving method in the WDK wallet packages is already `async`; if you call a synchronous method on a governed account, `await` it.
- **Governed arguments must be structured-cloneable.** The engine snapshots arguments so a caller cannot mutate them between evaluation and execution. An argument carrying a function (a callback, say) throws `PolicyConfigurationError`, and a class instance reaches the wallet as a plain object. Exclude such a method, or keep its arguments plain.

A rule may not name an excluded method: the proxy never wraps one, so the rule could not fire, and `register` rejects it with `PolicyConfigurationError` rather than registering a guardrail that silently does nothing.

#### Appending your own exclusions

Some legitimate reads are wallet-specific and did not qualify for the default list. Append them at construction:

```javascript
const policies = new WdkPolicies({
  policyExclusions: ['syncWalletBalance']
})

policies.getExclusions()  // frozen readonly string[] — defaults ∪ yours
```

`policyExclusions` is append-only — entries cannot be removed from the defaults, because removing one would gate a read call that consumers reasonably expect to work. Names are matched globally by method name, not per wallet. A name that matches nothing on any registered wallet is accepted without error, so you can add an exclusion ahead of the wallet release that introduces the method.

Spark is the one package in the org shipping a read that needs this: `syncWalletBalance` mutates local state and triggers server-side work, so it is governed by default. `getSingleUseDepositAddress` and `getStaticDepositAddress` are deliberately **not** offered as exclusions despite their `get*` names — both create remote state. If you need them callable, register an `ALLOW` rule so the call is still evaluated and traced.

#### Migrating from the inclusion-list model

Before this change the engine governed a fixed 22-method list. Now it governs everything outside the exclusion set, which means **more methods reach the engine than before**. If you registered policies against the old model:

- Calls that used to pass through unpoliced may now throw `PolicyViolationError` with `reason: 'no-applicable-rule'`. That is the bug being fixed — those calls were never evaluated.
- For a genuine read the default list missed, add it to `policyExclusions`.
- For a write you want to permit, register an `ALLOW` rule for it. Prefer this over an exclusion: the call stays evaluated, traced, and visible to `account.simulate`.
- A rule's `operation` may now name **any** method, not just one of the old 22. Rules for methods like `payLightningInvoice` register and fire normally.

### Default-deny semantics

The engine is **default-deny on governed accounts**. As soon as any policy applies to an account, the engine wraps **every callable method on that account**, walking the full prototype chain, except the reads and lifecycle methods listed in the exclusion set (see [Method coverage](#method-coverage)). Any call to a wrapped method whose operation is not addressed by an `ALLOW` rule throws `PolicyViolationError` with `code: 'NO_APPLICABLE_RULE'`.

This is intentional: a "cap transfer at $100" policy must not be sidesteppable by `sendTransaction({ to: token, data: <ERC-20 transfer calldata> })`, `approve(spender, MAX)`, an off-chain `signTypedData` Permit, or an ERC-7702 `delegate` to an attacker contract. The engine closes those bypasses by treating any unaddressed money-movement op on a governed account as DENY.

If you want permissive semantics on a specific account (allow anything that isn't explicitly denied), register a wildcard ALLOW rule as a baseline and layer specific DENYs on top:

```javascript
policies.register({
  id: 'permissive-baseline',
  name: 'Permissive baseline',
  scope: 'project',
  rules: [
    { name: 'allow-all', operation: '*', action: 'ALLOW', conditions: [] },
    { name: 'block-bad', operation: 'sendTransaction', action: 'DENY', conditions: [({ args }) => isSanctioned(args[0].to)] }
  ]
})
```

Accounts that have **no** registered policies are not governed — the proxy is not applied, and method calls go straight to the underlying account at zero cost.

#### Telling the denial paths apart

`PolicyViolationError` carries a machine-readable `code` alongside the human-readable `reason`, and `operation` names the blocked method. Branch on `code` — `reason` holds your own rule text when a rule fires, so it isn't a stable discriminator:

| `code` | What happened |
| --- | --- |
| `RULE_DENIED` | A `DENY` rule matched. `policyId` and `ruleName` identify it; `reason` is the rule's `reason` (or its name). |
| `NO_APPLICABLE_RULE` | No registered rule addresses this operation at all — the default-deny case above. |
| `GOVERNED_BUT_UNMATCHED` | Rules address the operation, but none of their conditions matched. |

```javascript
try {
  await account.swap({ /* … */ })
} catch (err) {
  if (err.code === 'NO_APPLICABLE_RULE') {
    // Nothing allows swaps yet — add a rule or a catch-all baseline.
  }
}
```

Both default-deny codes produce an error message that names the cause, explains why the engine denies unmatched operations, and includes the catch-all snippet above ready to paste. A `RULE_DENIED` error keeps the terse `Policy violation: <policy>/<rule>: <reason>` form — you wrote that rule and know what it means.

The engine wraps accounts through an ES `Proxy` so internal SDK code that uses `this.method()` naturally bypasses enforcement — nested-call escape (e.g. `bridge` internally calling `sendTransaction`) works without any async-context tracking. The same code path runs on every JavaScript runtime that supports `Proxy`, including Bare.

Policy enforcement applies to the **surface of the proxy** returned by `getAccount` / `getAccountByPath`. Reaching for underscore-prefixed fields (e.g. `protocol._account`) bypasses enforcement by design — treat them as private. The same applies to account-level operations invoked from inside a protocol's own methods (e.g. `bridge.bridge(...)` internally calling `this._account.sendTransaction(...)`), which is the documented nested-call escape; it lets protocols use the account they were constructed with without re-entering the engine on every internal step.


## Compatibility

Requires `@tetherto/wdk` 1.0.0-beta.22 or later, the first release whose middlewares may return a replacement account. Runs on Node.js and Bare.

## License

Apache-2.0
