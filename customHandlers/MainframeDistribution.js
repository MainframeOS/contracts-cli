const csv = require('csv-parser')
const fs = require('fs')
const { prompt } = require('inquirer')
const utils = require('web3-utils')

const config = require('../config')
const tokenAbi = require('../abi/MainframeDistribution.json')
const { log } = require('../cli-utils')
const { GAS_PRICE } = require('../constants')

const distributeTokens = async (web3Contract, ethNetwork, account) => {
  const data = await parseCSV()
  await validateDistribution(data, account, ethNetwork)
  const gasLimit = await estimateGas(
    web3Contract,
    account,
    data.recipients,
    data.amounts,
  )
  log.info('Pending transaction...', 'blue')
  const transaction = await web3Contract.methods
    .distributeTokens(account, data.recipients, data.amounts)
    .send({
      from: account,
      gas: gasLimit,
      gasPrice: GAS_PRICE,
    })
  log.success('Transaction complete!')
  console.log(transaction)
}

const parseCSV = async () => {
  const answers = await prompt([
    {
      type: 'input',
      name: 'filePath',
      message: 'Enter file path of csv containing distribution data: ',
    },
  ])
  const filePath = answers.filePath
  return new Promise((resolve, reject) => {
    const recipients = []
    const amounts = []
    fs.createReadStream(filePath)
      .pipe(csv({ headers: ['address', 'tokens'] }))
      .on('data', data => {
        recipients.push(data.address)
        amounts.push(utils.toWei(data.tokens, config.tokenDecimals))
      })
      .on('end', () => {
        resolve({ recipients, amounts })
      })
      .on('error', reject)
  })
}

const estimateGas = async (web3Contract, account, recipients, amounts) => {
  const estimatedGas = await web3Contract.methods
    .distributeTokens(account, recipients, amounts)
    .estimateGas({ from: account })
  log.info(`estimatd gas: ${estimatedGas}`, 'blue')
  const answers = await prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed with estimated gas: ',
    },
  ])
  if (!answers.confirm) {
    log.warn('Distribution terminated')
    process.exit()
  } else {
    return estimatedGas
  }
}

const validateDistribution = async (data, fromAccount, ethNetwork) => {
  const dataForDisplay = data.recipients.reduce((string, r, i) => {
    const amount = data.amounts[i]
    return (string += `${r} : ${utils.fromWei(amount, config.tokenDecimals)}\n`)
  }, '')
  log.info(`
    Distribute Tokens

    Network: ${ethNetwork}
    From account: ${fromAccount}
    Data:\n\n${dataForDisplay}
  `)
  const answers = await prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Confirm data is correct and proceed with distribution: ',
    },
  ])
  if (!answers.confirm) {
    log.warn('Distribution terminated')
    process.exit()
  }
}

module.exports = { distributeTokens }
