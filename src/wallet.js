// @flow

import fs from 'fs-extra'
import Accounts from 'web3-eth-accounts'
import Web3 from 'web3'
import HDWalletProvider from 'truffle-hdwallet-provider'
import HDWalletProviderPK from 'truffle-hdwallet-provider-privkey'
import ProviderEngine from 'web3-provider-engine'
import RpcSubprovider from 'web3-provider-engine/subproviders/rpc'
import LedgerWalletSubproviderFactory from 'ledger-wallet-provider'
import { prompt } from 'inquirer'

import type { EthNetwork } from './types'
import { log } from './cli-utils'

const LEDGER_ROOT_PATH = `44'/60'/0'/0`

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
): Promise<Web3> => {
  const answers = await prompt([
    {
      type: 'list',
      name: 'wallet',
      message: 'Wallet source:',
      choices: ['Private Key', 'Mnemonic', 'Ledger', 'Keystore File'],
    },
  ])
  let provider
  let web3
  switch (answers.wallet) {
    case 'Private Key': {
      const key = await requestPrivateKey()
      provider = new HDWalletProviderPK(key, rpcUrl)
      web3 = new Web3(provider)
      break
    }
    case 'Keystore File': {
      let decodedKey = await decodeKeystore()
      if (decodedKey.slice(0, 2) === '0x') {
        decodedKey = decodedKey.slice(2, decodedKey.length)
      }
      provider = new HDWalletProviderPK(decodedKey, rpcUrl)
      web3 = new Web3(provider)
      break
    }
    case 'Mnemonic': {
      const mnemonic = await requestMnemonic()
      provider = new HDWalletProvider(mnemonic, rpcUrl)
      web3 = new Web3(provider)
      break
    }
    case 'Ledger':
    default: {
      const engine = new ProviderEngine()
      web3 = new Web3(engine)
      try {
        const ledgerWalletSubProvider = await LedgerWalletSubproviderFactory()

        // If needing to select high index account on ledger ask for input

        const choices = ['select from first 10', 'enter account index']
        const answers = await prompt([
          {
            type: 'list',
            name: 'accountSelect',
            message: 'Ledger account select: ',
            choices,
          },
        ])

        let selectedPath

        if (choices.indexOf(answers.accountSelect) === 0) {
          // Select ledger account from list
          const listAccounts: {
            [string]: string,
          } = await ledgerWalletSubProvider.ledger.getMultipleAccounts(
            LEDGER_ROOT_PATH,
            0,
            10,
          )
          const accountAddresses = Object.values(listAccounts)
          const accountPaths = Object.keys(listAccounts)
          // $FlowFixMe: Object.values return Array<any>
          const accountIndex = await requestAccountSelection(accountAddresses)
          selectedPath = accountPaths[accountIndex]
        } else {
          // Select ledger account from input index
          const ledgerIndexAnswers = await prompt([
            {
              type: 'input',
              name: 'accountIndex',
              message: 'Ledger account select: ',
            },
          ])
          const accounts = await ledgerWalletSubProvider.ledger.getMultipleAccounts(
            LEDGER_ROOT_PATH,
            Number(ledgerIndexAnswers.accountIndex) - 1,
            1,
          )
          selectedPath = Object.keys(accounts)[0]
        }

        // Set selected account as provider
        const networkId = ethNetwork === 'testnet' ? 3 : 1
        const ledgerWalletSelectedProvider = await LedgerWalletSubproviderFactory(
          () => networkId,
          selectedPath,
        )
        engine.addProvider(ledgerWalletSelectedProvider)
        engine.addProvider(new RpcSubprovider({ rpcUrl }))
        engine.start()
      } catch (err) {
        log.warn(err)
        log.info(`Error connecting to Ledger, please make sure:\n
        - You have entered your pin and unlocked your ledger\n
        - Selected Ethereum wallet\n
        - Have browser support turned off`)
        process.exit()
      }
    }
  }
  return web3
}
