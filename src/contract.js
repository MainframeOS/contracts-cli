// @flow

import path from 'path'
import namehash from 'eth-ens-namehash'
import fs from 'fs-extra'
import { utils } from 'web3'
import type Web3 from 'web3'
import type Web3Contract from 'web3-eth-contract'
import { prompt } from 'inquirer'

import { log, capitalize } from './cli-utils'
import { estimateGas, getRecomendedGasPriceGwei } from './helpers'
import type { EthNetwork } from './types'

type TransactionOptions = {
  gasPrice: number,
  gasLimit: number,
  from: string,
}

const availableContracts = async (abiDirPath: string) => {
  const files = fs.readdirSync(abiDirPath).reduce((acc, file) => {
    if (file.endsWith('.json')) {
      acc.push(file.replace('.json', ''))
    }
    return acc
  }, [])
  return files
}

const selectContractName = async (abiDirPath: string) => {
  const contractNames = await availableContracts(abiDirPath)
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

const getContractAddress = async (
  contractName: string,
  ethNetwork: EthNetwork,
  config: Object,
) => {
  if (
    config.contractAddresses &&
    config.contractAddresses[contractName][ethNetwork]
  ) {
    const confirmAnswers = await prompt([
      {
        type: 'confirm',
        name: 'confirmConfigAddress',
        message: `Create contract with address: ${
          config.contractAddresses[contractName][ethNetwork]
        }`,
      },
    ])
    if (confirmAnswers.confirmConfigAddress) {
      return config.contractAddresses[contractName][ethNetwork]
    }
  }
  const answers = await prompt({
    type: 'input',
    name: 'address',
    message: 'Enter contract address',
  })
  return answers.address
}

const selectContractMethod = async (
  web3Contract: Web3Contract,
  contractName: string,
) => {
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

export const callContract = async (
  web3: Web3,
  ethNetwork: EthNetwork,
  config: Object = {},
) => {
  const contractName = await selectContractName(config.abiDirPath)
  const abiFilePath = path.resolve(config.abiDirPath, `${contractName}.json`)
  const abi = await fs.readJson(abiFilePath)
  const contractAddress = await getContractAddress(
    contractName,
    ethNetwork,
    config,
  )
  const web3Contract = new web3.eth.Contract(abi, contractAddress)
  const method = await selectContractMethod(web3Contract, contractName)

  const abiMethod = web3Contract._jsonInterface.find(m => m.name === method)
  const questions = abiMethod.inputs.map(m => {
    const q = {
      type: 'input',
      name: m.name,
      message: `Enter ${m.name} (${m.type}): `,
      extraQuestions: [],
    }
    // TODO: Ask extra questions inline

    // If uint, ask if it needs unit conversion
    if (m.type.slice(0, 4) === 'uint') {
      q.extraQuestions = [
        {
          type: 'confirm',
          name: 'confirmUnitConvert',
          message: `Do you need to convert unit? `,
        },
        {
          type: 'list',
          name: 'conversion',
          message: `Conversion type: `,
          choices: ['fromWei', 'toWei'],
        },
        {
          type: 'input',
          name: 'decimals',
          message: `Enter conversion unit (e.g. 'ether' (1e18 wei), 'gwei' (1e9 wei)): `,
        },
      ]
    } else if (m.type === 'bytes32') {
      q.extraQuestions = [
        {
          type: 'confirm',
          name: 'confirmTextToData',
          message: `Do you need to convert text to data? `,
        },
        {
          type: 'list',
          name: 'encodeType',
          message: `Hash type: `,
          choices: ['nameHash', 'sha3', 'toHex'],
        },
      ]
    }
    return q
  })
  const answers = await prompt(questions)
  const args = []
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    let arg = answers[q.name]
    if (q.extraQuestions) {
      const extraAnswers = await prompt(q.extraQuestions.slice(0, 1))
      if (extraAnswers.confirmUnitConvert) {
        const convertAnswers = await prompt(q.extraQuestions.slice(1, 3))
        arg = utils[convertAnswers.conversion](arg, convertAnswers.decimals)
      } else if (extraAnswers.confirmTextToData) {
        const dataAnswers = await prompt(q.extraQuestions.slice(1, 2))
        if (dataAnswers.encodeType === 'nameHash') {
          arg = namehash.hash(arg)
        } else {
          arg = utils[dataAnswers.encodeType](arg)
        }
      }
    }
    args.push(arg)
  }
  const readOnly =
    abiMethod.stateMutability === 'view' || abiMethod.constant === true
  const methodType = readOnly ? 'call' : 'send'
  const account = await web3.eth.getCoinbase()
  const gasLimit = await estimateGas(web3Contract, method, account, args)
  const gasPriceGwei = await getRecomendedGasPriceGwei()
  const gasPrice = utils.toWei(String(gasPriceGwei), 'gwei')

  const transactionOptions: TransactionOptions = {
    from: account,
    gasLimit,
    gasPrice,
  }

  if (methodType === 'send') {
    const validateMessage = `
      Network: ${ethNetwork}

      Calling method: ${method}
      On contract: ${web3Contract._address}
      With args: ${args.toString()}
      From account: ${account}
      Gas Limit: ${transactionOptions.gasLimit}
      Gas Price: ${transactionOptions.gasPrice}\n
      Are your sure you'd like to proceed with this transaction?
    `
    await validateTransaction(validateMessage)
    log.info('Pending transaction...', 'blue')
  }
  const transaction = await web3Contract.methods[method](...args)[methodType](
    transactionOptions,
  )
  log.success('Transaction Complete!')
  // eslint-disable-next-line no-console
  console.log('result:', transaction)
}

const validateTransaction = async message => {
  const answers = await prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: message,
    },
  ])
  if (!answers.confirm) {
    throw new Error('Transaction cancelled')
  }
}
