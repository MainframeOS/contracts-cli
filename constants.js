const utils = require('web3-utils')

const GAS_LIMIT = process.env.GAS_LIMIT || 1000000
const GAS_PRICE = utils.toWei(process.env.GAS_PRICE || '20', 'gwei')

module.exports = {
  GAS_LIMIT,
  GAS_PRICE,
}
