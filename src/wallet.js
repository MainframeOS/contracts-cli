// @flow

import fs from 'fs-extra'
import Accounts from 'web3-eth-accounts'
import Web3 from 'web3'
import HDWalletProvider from 'truffle-hdwallet-provider'
import HDWalletProviderPK from 'truffle-hdwallet-provider-privkey'
import ProviderEngine from 'web3-provider-engine'
import RpcSubprovider from 'web3-provider-engine/subproviders/rpc'
import Transport from '@ledgerhq/hw-transport-node-hid'
import createLedgerSubprovider from '@ledgerhq/web3-subprovider'
import { prompt } from 'inquirer'

import type { EthNetwork } from './types'
import { log } from './cli-utils'

const decodeKeystore = async (path?: string) => {
  const questions = [
    {
      type: 'input',
      name: 'password',
      message: 'Enter password to decrypt file: ',
    },
  ]
  if (!path) {
    questions.unshift({
      type: 'input',
      name: 'keystorePath',
      message: 'Enter path of keystore file: ',
    })
  }
  const answers = await prompt(questions)
  const file = await fs.readJson(path || answers.keystorePath)
  const accounts = new Accounts()
  const decrypted = accounts.decrypt(file, answers.password)
  return decrypted.privateKey
}

const requestPrivateKey = async () => {
  const answers = await prompt([
    {
      type: 'password',
      name: 'privateKey',
      message: 'Enter private key: ',
    },
  ])
  return answers.privateKey
}

const requestMnemonic = async () => {
  const answers = await prompt([
    {
      type: 'password',
      name: 'mnemonic',
      message: 'Enter mnemonic passphrase: ',
    },
  ])
  return answers.mnemonic
}

const requestAccountSelection = async (accounts: Array<string>) => {
  const answers = await prompt([
    {
      type: 'list',
      name: 'account',
      message: 'Select ETH account: ',
      choices: accounts,
    },
  ])
  return accounts.indexOf(answers.account)
}

export const openWallet = async (
  ethNetwork: EthNetwork,
  rpcUrl: string,
): Promise<{ web3: Web3, account: string }> => {
  const answers = await prompt([
    {
      type: 'list',
      name: 'wallet',
      message: 'Wallet source:',
      choices: ['Private Key', 'Mnemonic', 'Ledger', 'Keystore File'],
    },
  ])
  if (answers.wallet === 'Ledger') {
    const engine = new ProviderEngine()
    const web3 = new Web3(engine)
    try {
      const ledgerIndexAnswers = await prompt([
        {
          type: 'input',
          name: 'accountIndex',
          default: 0,
          message: 'Ledger accounts selection offset: ',
        },
      ])
      const networkId = ethNetwork === 'testnet' ? 3 : 1
      const getTransport = () => Transport.create()
      const ledgerWalletSelectedProvider = createLedgerSubprovider(
        //$FlowFixMe Transport type
        getTransport,
        {
          networkId,
          accountsLength: 5,
          accountsOffset: Number(ledgerIndexAnswers.accountIndex),
        },
      )
      engine.addProvider(ledgerWalletSelectedProvider)
      engine.addProvider(new RpcSubprovider({ rpcUrl }))
      engine.start()
      const accounts = await web3.eth.getAccounts()
      const accountIndex = await requestAccountSelection(accounts)
      const account = accounts[accountIndex]
      return { web3, account }
    } catch (err) {
      log.warn(err)
      log.info(`Error connecting to Ledger, please make sure:\n
      - You have entered your pin and unlocked your ledger\n
      - Selected Ethereum wallet\n
      - Have browser support turned off`)
      throw err
    }
  } else {
    let provider
    switch (answers.wallet) {
      case 'Keystore File': {
        let decodedKey = await decodeKeystore()
        if (decodedKey.slice(0, 2) === '0x') {
          decodedKey = decodedKey.slice(2, decodedKey.length)
        }
        provider = new HDWalletProviderPK(decodedKey, rpcUrl)
        break
      }
      case 'Mnemonic': {
        const mnemonic = await requestMnemonic()
        provider = new HDWalletProvider(mnemonic, rpcUrl)
        break
      }
      case 'Private Key':
      default: {
        const key = await requestPrivateKey()
        provider = new HDWalletProviderPK(key, rpcUrl)
        break
      }
    }
    const web3 = new Web3(provider)
    const account = await web3.eth.getCoinbase()
    return { web3, account }
  }
}
