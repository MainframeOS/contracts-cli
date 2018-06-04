#!/usr/bin/env node

const Web3 = require('web3')
const fs = require('fs-extra')
const path = require('path')
const Accounts = require('web3-eth-accounts')
const HDWalletProvider = require('truffle-hdwallet-provider')
const HDWalletProviderPK = require('truffle-hdwallet-provider-privkey')
const ProviderEngine = require('web3-provider-engine')
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc')
const LedgerWalletSubproviderFactory = require('ledger-wallet-provider').default
const { prompt } = require('inquirer')

const config = require('./config')
const contract = require('./contract')
const { log, capitalize } = require('./cli-utils')

const LEDGER_ROOT_PATH = `44'/60'/0'/0`

let web3
let ethNetwork = 'testnet' // testnet or mainnet
let account

const determineNetwork = async () => {
  const answers = await prompt([
    {
      type: 'list',
      name: 'network',
      message: 'Select Ethereum network: ',
      choices: ['testnet', 'mainnet'],
    },
  ])
  ethNetwork = answers.network
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

const decodeKeystore = async () => {
  const answers = await prompt([
    {
      type: 'input',
      name: 'keystorePath',
      message: 'Enter path of keystore file: ',
    },
    {
      type: 'input',
      name: 'password',
      message: 'Enter password to decrypt file: ',
    },
  ])
  const file = await fs.readJson(answers.keystorePath)
  const accounts = new Accounts()
  const decrypted = accounts.decrypt(file, answers.password)
  return decrypted.privateKey
}

const requestWalletAccessType = async () => {
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

        console.log(answers.accountSelect)

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
  if (!account) {
    account = await web3.eth.getCoinbase()
  }
  log.info(`Using account: ${account}`, 'blue')
}

const selectMethod = async (web3Contract, contractName) => {
  const contractAbi = web3Contract._jsonInterface
  const methods = contractAbi.reduce((acc, m) => {
    if (m.name && m.type === 'function') acc.push(m.name)
    return acc
  }, [])
  log.header(`${capitalize(contractName)} Contract`)
  const answers = await prompt([
    {
      type: 'list',
      name: 'method',
      message: 'Select contract action: ',
      choices: methods,
    },
  ])
  return answers.method
}

const selectContractName = async () => {
  const contractNames = await availableContracts()
  const answers = await prompt([
    {
      type: 'list',
      name: 'contract',
      message: 'Select contract: ',
      choices: contractNames,
    },
  ])
  return answers.contract
}

const availableContracts = async () => {
  const filePath = path.resolve(__dirname, 'abi')
  const files = fs.readdirSync(filePath).reduce((acc, file) => {
    if (file.endsWith('.json')) {
      acc.push(file.replace('.json', ''))
    }
    return acc
  }, [])
  return files
}

const getWeb3Contract = async (name, web3, ethNetwork) => {
  const filePath = path.resolve(__dirname, 'abi', `${name}.json`)
  const abi = await fs.readJson(filePath)
  return await contract.getWeb3Contract(name, abi, web3, ethNetwork)
}

const requestContractMethod = async (web3, ethNetwork) => {
  const contractName = await selectContractName()
  const web3Contract = await getWeb3Contract(contractName, web3, ethNetwork)
  const methodName = await selectMethod(web3Contract, contractName)
  await contract.callMethod(
    web3Contract,
    contractName,
    methodName,
    account,
    ethNetwork,
  )
}

const initialize = async () => {
  try {
    await determineNetwork()
    await requestWalletAccessType()
    await requestContractMethod(web3, ethNetwork)
  } catch (err) {
    if (
      err.message &&
      err.message.includes('Failed to subscribe to new newBlockHeaders')
    ) {
      log.info(
        'Please visit etherscan to check transaction status for transactions signed by a ledger',
      )
    } else {
      log.warn('Error: ' + err.message)
      log.info(err.stack)
      process.exit()
    }
  }
}

initialize()
