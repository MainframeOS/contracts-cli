const { log } = require('./cli-utils')
const request = require('request-promise')

const estimateGas = async (web3Contract, method, account, args) => {
  return await web3Contract.methods[method](...args).estimateGas({
    from: account,
  })
}

const getRecomendedGasPrice = async () => {
  const res = await request('https://ethgasstation.info/json/ethgasAPI.json')
  const json = JSON.parse(res)
  const gweiPrice = json.average / 10
  return gweiPrice
}

module.exports = { estimateGas, getRecomendedGasPrice }
