#!/usr/bin/env node

const Web3 = require('web3')
const fs = require('fs-extra')
const path = require('path')
const got = require('got')

const config = require('../config')
const { estimateGas, getRecomendedGasPrice } = require('../helpers')
const { log, capitalize } = require('../cli-utils')

const BATCH_AMOUNT = 40
const SEND_AMOUNT = 0 // TODO: put real amount
const MAX_GAS_PRICE = 50 // TODO: put real amount in Gwei
const ESTIMATE_INTERVAL = 30000 // 30 seconds in milliseconds
const SENDER_ADDRESS = '0x6E6Bda8B1ec708Bd4Ce4f000B464557657988806'
const NETWORK = process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
const AUTHORIZATION = process.env.AUTHORIZATION // TODO: get from secure AWS store
const PRIVATE_KEY = process.env.PRIVATE_KEY // TODO: get from secure AWS store
const API_URL = 'https://global-airdrop-distro.herokuapp.com'
const SUBSCRIBERS_URL = API_URL + '/subscribers'
const REGISTER_URL = API_URL + '/register'

if (AUTHORIZATION == null || AUTHORIZATION === '') {
  throw new Error('Missing AUTHORIZATION environment variable for HTTP header')
}
if (PRIVATE_KEY == null || PRIVATE_KEY === '') {
  throw new Error('Missing PRIVATE_KEY environment variable')
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
  if (res.body.ok) {
    return res.body.result
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

  let entries
  try {
    entries = await fetchNextBatch()
    if (entries.length === 0) {
      clearInterval(estimateTimer)
      console.log('No more entries from API - DONE!')
      return
    }

    const recipients = entries.map(e => e.address)
    const amounts = entries.map(() => SEND_AMOUNT)
    const args = [SENDER_ADDRESS, recipients, amounts]
    const gasLimit = await estimateGas(
      web3Contract,
      'distributeTokens',
      account,
      args,
    )
    const receipt = await web3Contract.methods.distributeTokens(...args).send({
      from: account,
      gas: gasLimit,
      gasPrice: gasPrice,
    })
    const txs = entries.map(e => ({
      token: e.token,
      txid: receipt.transactionHash,
    }))
    await commitBatch(txs)
    console.log('transaction processed')
  } catch (err) {
    console.warn('Error processing transations', err, entries)
  }

  processingTransactions = false
}

const runEstimate = async () => {
  if (!processingTransactions) {
    const gasPrice = await getRecomendedGasPrice()
    console.log('current gas price:', gasPrice)
    if (gasPrice <= MAX_GAS_PRICE) {
      processTransactions(gasPrice)
    }
  }
}

const setup = async () => {
  // Setup distribution contract and account
  provider = new Web3.providers.HttpProvider(config.rpcUrl[NETWORK])
  web3 = new Web3(provider)

  const abi = await fs.readJson(
    path.resolve(__dirname, '../', 'abi', `MainframeDistribution.json`),
  )
  web3Contract = new web3.eth.Contract(
    abi,
    config.contractAddresses.MainframeDistribution[NETWORK],
  )
  account = web3.eth.accounts.privateKeyToAccount(PRIVATE_KEY)
  console.log('using account:', account.address)

  // Setup interval to keep script alive, should get cleared once the API doesn't return any entry
  estimateTimer = setInterval(runEstimate, ESTIMATE_INTERVAL)
  runEstimate()
}

setup()
