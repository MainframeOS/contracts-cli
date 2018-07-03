const fs = require('fs-extra')
const Accounts = require('web3-eth-accounts')
const Web3 = require('web3')
const HDWalletProvider = require('truffle-hdwallet-provider')
const HDWalletProviderPK = require('truffle-hdwallet-provider-privkey')
const ProviderEngine = require('web3-provider-engine')
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc')
const LedgerWalletSubproviderFactory = require('ledger-wallet-provider').default
const { prompt } = require('inquirer')

const config = require('./config')

const LEDGER_ROOT_PATH = `44'/60'/0'/0`

const decodeKeystore = async path => {
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

const requestAccountSelection = async accounts => {
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

const openWallet = async ethNetwork => {
  const answers = await prompt([
    {
      type: 'list',
      name: 'wallet',
      message: 'Wallet source:',
      choices: ['Private Key', 'Mnemonic', 'Ledger', 'Keystore File'],
    },
  ])
  let provider
  switch (answers.wallet) {
    case 'Private Key':
      const key = await requestPrivateKey()
      provider = new HDWalletProviderPK(key, config.rpcUrl[ethNetwork])
      web3 = new Web3(provider)
      break
    case 'Keystore File':
      let decodedKey = await decodeKeystore()
      if (decodedKey.slice(0, 2) === '0x') {
        decodedKey = decodedKey.slice(2, decodedKey.length)
      }
      provider = new HDWalletProviderPK(decodedKey, config.rpcUrl[ethNetwork])
      web3 = new Web3(provider)
      break
    case 'Mnemonic':
      const mnemonic = await requestMnemonic()
      provider = new HDWalletProvider(mnemonic, config.rpcUrl[ethNetwork])
      web3 = new Web3(provider)
      break
    case 'Ledger':
      let engine = new ProviderEngine()
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

        switch (choices.indexOf(answers.accountSelect)) {
          case 0:
            // Select ledger account from list
            const listAccounts = await ledgerWalletSubProvider.ledger.getMultipleAccounts(
              LEDGER_ROOT_PATH,
              0,
              10,
            )
            const accountAddresses = Object.values(listAccounts)
            const accountPaths = Object.keys(listAccounts)
            const account = Object.values(listAccounts)
            accountIndex = await requestAccountSelection(accountAddresses)
            selectedPath = accountPaths[accountIndex]
            break

          case 1:
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
        engine.addProvider(
          new RpcSubprovider({ rpcUrl: config.rpcUrl[ethNetwork] }),
        )
        engine.start()
      } catch (err) {
        console.log(err)
        console.log(`Error connecting to Ledger, please make sure:\n
        - You have entered your pin and unlocked your ledger\n
        - Selected Ethereum wallet\n
        - Have browser support turned off`)
        process.exit()
      }
      break
  }
  return web3
}

module.exports = { openWallet }
