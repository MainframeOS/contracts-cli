#!/usr/bin/env node
// @flow

import path from 'path'
import program from 'commander'
import fs from 'fs-extra'

import { callContract } from './contract'
import { openWallet } from './wallet'
import { log } from './cli-utils'

program
  .version('0.1.0')
  .option('-c, --config-path <path>', 'Set path to config file')
  .option('-a, --abi-dir <path>', 'Set path to ABI folder')
  .option('-r, --rpc-url <url>', 'Set ethereum JSON RPC URL')
  .option('-t, --testnet', 'Flag to use testnet')
  .parse(process.argv)

const ethNetwork = program.testnet ? 'testnet' : 'mainnet' // testnet or mainnet
let config = {
  rpcUrl: {},
  abiDirPath: './abi',
}

if (program.configPath) {
  const configPath = path.resolve(process.cwd(), program.configPath)
  config = fs.readJsonSync(configPath)
}

if (program.rpcUrl) {
  config.rpcUrl[ethNetwork] = program.rpcUrl
}

if (program.abiDir) {
  config.abiDirPath = path.resolve(process.cwd(), program.abiDir)
} else {
  log.warn('No abi directory path provided')
  log.info(
    `please prpovide a relative path to the folder containing your contract ABI's, e.g. --abi-dir=./abi`,
  )
  process.exit()
}

if (!config.rpcUrl) {
  log.warn(
    'rpc url required, please set config file or pass as arg, e.g.: --rpc-url="https://ropsten.infura.io/FWLG9Y..."',
  )
  process.exit()
}

log.header(`\nEthereum ${ethNetwork}\n`)

const startCli = async () => {
  try {
    const { web3, account } = await openWallet(
      ethNetwork,
      config.rpcUrl[ethNetwork],
    )

    log.info(`Using account: ${account}`, 'blue')
    await callContract(web3, ethNetwork, config)
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

startCli()
