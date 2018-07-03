#!/usr/bin/env node

const Web3 = require('web3')
const fs = require('fs-extra')
const path = require('path')
const { prompt } = require('inquirer')

const config = require('./config')
const contract = require('./contract')
const { openWallet } = require('./wallets')
const { log, capitalize } = require('./cli-utils')

let web3
let account
let ethNetwork = 'testnet' // testnet or mainnet

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
    web3 = await openWallet(ethNetwork)
    account = await web3.eth.getCoinbase()

    log.info(`Using account: ${account}`, 'blue')
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
