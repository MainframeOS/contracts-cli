#!/usr/bin/env node

const Web3 = require('web3')
const fs = require('fs-extra')
const path = require('path')
const Accounts = require('web3-eth-accounts')
const HDWalletProvider = require('truffle-hdwallet-provider')
const HDWalletProviderPK = require('truffle-hdwallet-provider-privkey')
const ProviderEngine = require('web3-provider-engine')
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc')
const { prompt } = require('inquirer')

const config = require('../config')
const { GAS_PRICE } = require('../constants')
const { getWeb3Contract } = require('../contract')
const { estimateGas, getRecomendedGasPrice } = require('../helpers')
const { decodeKeystore, openWallet } = require('../wallets')
const { log, capitalize } = require('../cli-utils')
const {
  parseCSV,
  formatDataForDisplay,
} = require('../customHandlers/MainframeDistribution')

let web3
let provider
let ethNetwork
let account

const BATCH_AMOUNT = 40

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

const unlockWallet = async () => {
  let decodedKey = await decodeKeystore('./keys/mf_distro')
  if (decodedKey.slice(0, 2) === '0x') {
    decodedKey = decodedKey.slice(2, decodedKey.length)
  }
  provider = new HDWalletProviderPK(decodedKey, config.rpcUrl[ethNetwork])
  web3 = new Web3(provider)
  account = await web3.eth.getCoinbase()
  console.log('using account: ', account)
}

const batchTransactionsFromCSV = async () => {
  const data = await parseCSV()
  const batches = []
  const batchCount = 0
  let currentBatch = {
    recipients: [],
    amounts: [],
  }
  data.recipients.forEach((r, i) => {
    if (!web3.utils.isAddress(r)) {
      throw new Error(`invalid address: ${isAddr}`)
    }
    currentBatch.recipients.push(r)
    currentBatch.amounts.push(data.amounts[i])
    if (currentBatch.recipients.length === BATCH_AMOUNT) {
      batches.push(currentBatch)
      currentBatch = {
        recipients: [],
        amounts: [],
      }
    }
  })
  return batches
}

const generateTransactions = async batches => {
  const filePath = path.resolve(
    __dirname,
    '../',
    'abi',
    `MainframeDistribution.json`,
  )
  const answers = await prompt([
    {
      type: 'input',
      name: 'address',
      message: `Enter token holder address: `,
    },
  ])
  if (!web3.utils.isAddress(answers.address)) {
    throw new Error(`invalid address: ${isAddr}`)
  }
  const abi = await fs.readJson(filePath)
  const web3Contract = await getWeb3Contract(
    'MainframeDistribution',
    abi,
    web3,
    ethNetwork,
  )
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const batchNum = i + 1
    log.info(`\nbatch number: ${batchNum}\n`, 'blue')
    log.info(formatDataForDisplay(batch))
    const args = [
      '0x6E6Bda8B1ec708Bd4Ce4f000B464557657988806',
      batch.recipients,
      batch.amounts,
    ]
    const gasLimit = await estimateGas(
      web3Contract,
      'distributeTokens',
      account,
      args,
    )
    const gasPrice = await getRecomendedGasPrice()
    log.info(`Estimated gas: ${gasLimit}`, 'blue')
    log.info(`Recommended gas price: ${gasPrice}`, 'blue')
    log.info('Pending transaction...', 'blue')
    const transaction = await web3Contract.methods
      .distributeTokens(
        '0x6E6Bda8B1ec708Bd4Ce4f000B464557657988806',
        batch.recipients,
        batch.amounts,
      )
      .send({
        from: account,
        gas: gasLimit,
        gasPrice: gasPrice,
      })
    log.success(`Batch ${batchNum} complete!`)
  }

  log.success(`Distribution complete!`)
}

const initialize = async () => {
  try {
    await determineNetwork()
    web3 = await openWallet(ethNetwork)
    account = await web3.eth.getCoinbase()
    log.info(`Using account: ${account}`, 'blue')
    const batches = await batchTransactionsFromCSV()
    await generateTransactions(batches)
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
