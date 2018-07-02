const { prompt } = require('inquirer')
const { utils } = require('web3')

const config = require('./config')
const customHandlers = require('./customHandlers')
const { log } = require('./cli-utils')
const namehash = require('eth-ens-namehash')
const { GAS_LIMIT, GAS_PRICE } = require('./constants')

const getCustomHandler = (contractName, method) => {
  const customHandler = customHandlers[contractName]
  if (customHandler && customHandler[method]) {
    return customHandler[method]
  }
}

const getWeb3Contract = async (name, abi, web3, ethNetwork) => {
  let contractAddress
  if (config.contractAddresses && config.contractAddresses[name]) {
    contractAddress = config.contractAddresses[name][ethNetwork]
  } else {
    const answers = await prompt({
      type: 'input',
      name: 'address',
      message: 'Enter contract address',
    })
    contractAddress = answers.address
  }
  return new web3.eth.Contract(abi, contractAddress)
}

const callMethod = async (
  web3Contract,
  contractName,
  method,
  account,
  ethNetwork,
) => {
  const customHandler = getCustomHandler(contractName, method)
  if (customHandler) {
    await customHandler(web3Contract, ethNetwork, account)
    return
  }
  const abiMethod = web3Contract._jsonInterface.find(m => m.name == method)
  const questions = abiMethod.inputs.map(m => {
    const q = {
      type: 'input',
      name: m.name,
      message: `Enter ${m.name} (${m.type}): `,
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
          type: 'input',
          name: 'decimals',
          message: `Enter conversion unit (e.g. ether, gwei): `,
        },
        {
          type: 'list',
          name: 'conversion',
          message: `Conversion type: `,
          choices: ['fromWei', 'toWei'],
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
  for (i = 0; i < questions.length; i++) {
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

  if (methodType === 'send') {
    const validateMessage = `
      Network: ${ethNetwork}

      Calling method: ${method}
      On contract: ${web3Contract._address}
      With args: ${args}
      From account: ${account}\n
      Are your sure you'd like to proceed with this transaction?
    `
    await validateTransaction(validateMessage)
    log.info('Pending transaction...', 'blue')
  }
  const transaction = await web3Contract.methods[method](...args)[methodType]({
    from: account,
    gas: GAS_LIMIT,
    gasPrice: GAS_PRICE,
  })
  log.success('Transaction Complete!')
  console.log('result: ', transaction)
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

module.exports = { callMethod, getWeb3Contract }
