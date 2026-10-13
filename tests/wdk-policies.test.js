'use strict'

import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import WalletManager from '@tetherto/wdk-wallet'

import WDK from '@tetherto/wdk'

import WdkPolicies, { DEFAULT_POLICY_EXCLUSIONS, PolicyConfigurationError, PolicyViolationError } from '../index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const PATH = "m/44'/60'/0'/0/0"
const RECIPIENT = '0x1111111111111111111111111111111111111111'

const DUMMY_TX_HASH = '0xdummy-tx-hash'

const sendTransactionMock = jest.fn()
const getAccountMock = jest.fn()

const WalletManagerMock = jest.fn().mockImplementation(() => {
  return Object.create(WalletManager.prototype, {
    getAccount: { value: getAccountMock },
    dispose: { value: jest.fn() }
  })
})

const buildAccount = () => ({
  path: PATH,
  index: 0,
  sendTransaction: sendTransactionMock,
  toReadOnlyAccount: async () => ({ path: PATH, index: 0, getAddress: async () => '0xaddr' })
})

const SMALL_SENDS = {
  id: 'small-sends',
  name: 'small sends',
  scope: 'project',
  wallet: 'ethereum',
  rules: [{ name: 'up to 100', operation: 'sendTransaction', action: 'ALLOW', conditions: [({ args }) => args[0].value <= 100n] }]
}

describe('WdkPolicies', () => {
  let wdk

  beforeEach(() => {
    sendTransactionMock.mockReset().mockResolvedValue({ hash: DUMMY_TX_HASH })
    getAccountMock.mockReset().mockImplementation(async () => buildAccount())

    wdk = new WDK(SEED_PHRASE)
      .registerWallet('ethereum', WalletManagerMock, {})
      .registerWallet('ton', WalletManagerMock, {})
  })

  describe('attach', () => {
    test('should govern the accounts of the attached wallets', async () => {
      new WdkPolicies().attach(wdk, 'ethereum').register(SMALL_SENDS)

      const account = await wdk.getAccount('ethereum', 0)

      const result = await account.sendTransaction({ to: RECIPIENT, value: 100n })

      await expect(account.sendTransaction({ to: RECIPIENT, value: 101n })).rejects.toThrow(PolicyViolationError)

      expect(sendTransactionMock).toHaveBeenCalledTimes(1)
      expect(sendTransactionMock).toHaveBeenCalledWith({ to: RECIPIENT, value: 100n })
      expect(result).toEqual({ hash: DUMMY_TX_HASH })
    })

    test('should install one middleware when the same wallet is attached twice', async () => {
      const condition = jest.fn(() => true)

      new WdkPolicies().attach(wdk, 'ethereum').attach(wdk, 'ethereum').register({ ...SMALL_SENDS, rules: [{ ...SMALL_SENDS.rules[0], conditions: [condition] }] })

      const account = await wdk.getAccount('ethereum', 0)

      await account.sendTransaction({ to: RECIPIENT, value: 1n })

      expect(condition).toHaveBeenCalledTimes(1)
      expect(sendTransactionMock).toHaveBeenCalledWith({ to: RECIPIENT, value: 1n })
    })

    test('should leave the accounts of wallets that are not attached untouched', async () => {
      new WdkPolicies().attach(wdk, 'ethereum').register({ ...SMALL_SENDS, wallet: undefined })

      const account = await wdk.getAccount('ton', 0)

      const result = await account.sendTransaction({ to: RECIPIENT, value: 500n })

      expect(sendTransactionMock).toHaveBeenCalledWith({ to: RECIPIENT, value: 500n })
      expect(result).toEqual({ hash: DUMMY_TX_HASH })
    })
  })

  describe('register', () => {
    test('should throw if a policy binds to a wallet that was never attached', () => {
      const policies = new WdkPolicies().attach(wdk, 'ethereum')

      expect(() => policies.register({ ...SMALL_SENDS, wallet: 'ton' })).toThrow(PolicyConfigurationError)
      expect(() => policies.register({ ...SMALL_SENDS, wallet: 'ton' })).toThrow("registerPolicy: no wallet registered with identifier 'ton'.")
    })
  })

  describe('getExclusions', () => {
    test('should return the default exclusions followed by the configured ones', () => {
      const policies = new WdkPolicies({ policyExclusions: ['syncWalletBalance'] })

      const exclusions = policies.getExclusions()

      expect(exclusions).toEqual([...DEFAULT_POLICY_EXCLUSIONS, 'syncWalletBalance'])
    })
  })

  describe('dispose', () => {
    test('should forget the policies of the given wallets', async () => {
      const policies = new WdkPolicies().attach(wdk, 'ethereum').register(SMALL_SENDS)

      policies.dispose(['ethereum'])

      const account = await wdk.getAccount('ethereum', 0)

      const result = await account.sendTransaction({ to: RECIPIENT, value: 500n })

      expect(sendTransactionMock).toHaveBeenCalledWith({ to: RECIPIENT, value: 500n })
      expect(result).toEqual({ hash: DUMMY_TX_HASH })
    })
  })
})
