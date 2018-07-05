#!/usr/bin/env node

// usage (from repo root): ./scripts/distribution.js --tokenholder=<ADDRESS> --amount=<NUMBER OF MFT TO SEND> --batchsize=<NUMBER OF RECIPIENTS PER BATCH> --maxprice=<MAX GAS PRICE IN GWEI> --authorization=<AUTHORIZATION HEADER> --key=<PRIVATE KEY>

const Web3 = require('web3')
const HDWalletProviderPK = require('truffle-hdwallet-provider-privkey')
const fs = require('fs-extra')
const path = require('path')
const got = require('got')
const { argv } = require('yargs')

const config = require('../config')
const { estimateGas, getRecomendedGasPrice } = require('../helpers')
const { log, capitalize } = require('../cli-utils')

const BATCH_AMOUNT = argv.batchsize || 40
const SEND_AMOUNT = argv.amount
const MAX_GAS_PRICE = argv.maxprice
const ESTIMATE_INTERVAL = argv.interval || 30000 // 30 seconds in milliseconds
const SENDER_ADDRESS = argv.tokenholder
const NETWORK = argv.network === 'mainnet' ? 'mainnet' : 'testnet'
const AUTHORIZATION = argv.authorization
const PRIVATE_KEY = argv.key
const API_URL = 'http://localhost:3000' // 'https://global-airdrop-distro.herokuapp.com'
const SUBSCRIBERS_URL = API_URL + '/subscribers'
const REGISTER_URL = API_URL + '/register'

if (SEND_AMOUNT == null) {
  throw new Error('Missing `amount` argument')
}
if (MAX_GAS_PRICE == null) {
  throw new Error('Missing `maxprice` (max gas in Gwei) argument')
}
if (SENDER_ADDRESS == null || SENDER_ADDRESS === '') {
  throw new Error('Missing `tokenholder` (address) argument')
}
if (AUTHORIZATION == null || AUTHORIZATION === '') {
  throw new Error('Missing `authorization` (HTTP header for API) argument')
}
if (PRIVATE_KEY == null || PRIVATE_KEY === '') {
  throw new Error('Missing `key` (wallet private key) argument')
}

let web3
let provider
let account
let web3Contract
let estimateTimer
let processingTransactions = false

const fetchNextBatch = async () => {
  const res = await got(SUBSCRIBERS_URL + '?page=1&pageSize=' + BATCH_AMOUNT, {
    headers: { authorization: AUTHORIZATION },
    json: true,
  })
  console.log('fetchNextBatch res', res.body)
  if (res.body.ok) {
    return {
      entries: res.body.result,
      hasMore: res.body.pendingSubscribers !== 0,
    }
  } else {
    throw new Error('Invalid response body')
  }
}

const commitBatch = async txs => {
  await got.post(REGISTER_URL, {
    body: { txs },
    headers: { authorization: AUTHORIZATION },
    json: true,
  })
}

const processTransactions = async gasPrice => {
  processingTransactions = true
  console.log('process transactions with gas price:', gasPrice)

  try {
    const { entries, hasMore } = await fetchNextBatch()
    if (entries.length === 0) {
      if (hasMore) {
        // empty batch - cancel processing
        console.log('no entry in latest batch from API')
        processingTransactions = false
      } else {
        // all entries are processed
        clearInterval(estimateTimer)
        console.log('no more entries from API - DONE!')
        process.exit(0)
      }
      return
    }

    console.log('entries from API:', entries.length)
    const recipients = entries.map(e => e.address)
    const amounts = entries.map(() => SEND_AMOUNT)
    const args = [SENDER_ADDRESS, recipients, amounts]
    const gasLimit = await estimateGas(
      web3Contract,
      'distributeTokens',
      account,
      args,
    )
    console.log('running distribution with gas limit:', gasLimit)
    const receipt = await web3Contract.methods.distributeTokens(...args).send({
      from: account,
      gas: gasLimit,
      gasPrice: gasPrice,
    })
    console.log('transaction processed:', receipt.transactionHash)
    const txs = entries.map(e => ({
      token: e.token,
      txid: receipt.transactionHash,
    }))
    await commitBatch(txs)
    console.log('transaction committed to API for recipients:', recipients)
  } catch (err) {
    console.warn('error processing transations:', err)
  }

  processingTransactions = false
}

const runEstimate = async () => {
  if (!processingTransactions) {
    const gasPrice = await getRecomendedGasPrice()
    console.log('current gas price:', gasPrice)
    if (gasPrice <= MAX_GAS_PRICE) {
      processTransactions(gasPrice)
    } else {
      console.log('gas price above limit:', MAX_GAS_PRICE)
    }
  }
}

const setup = async () => {
  // Setup distribution contract and account
  provider = new HDWalletProviderPK(PRIVATE_KEY, config.rpcUrl[NETWORK])
  web3 = new Web3(provider)

  const abi = await fs.readJson(
    path.resolve(__dirname, '../', 'abi', `MainframeDistribution.json`),
  )
  web3Contract = new web3.eth.Contract(
    abi,
    config.contractAddresses.MainframeDistribution[NETWORK],
  )
  account = await web3.eth.getCoinbase()
  console.log('using account:', account)

  // Setup interval to keep script alive, should get cleared once the API doesn't return any entry
  estimateTimer = setInterval(runEstimate, ESTIMATE_INTERVAL)
  runEstimate()
}

setup()
