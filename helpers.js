const got = require('got')

const estimateGas = async (web3Contract, method, account, args) => {
  return await web3Contract.methods[method](...args).estimateGas({
    from: account,
  })
}

const getRecomendedGasPrice = async () => {
  const res = await got('https://ethgasstation.info/json/ethgasAPI.json', {
    json: true,
  })
  const gweiPrice = res.body.average / 10
  return gweiPrice
}

module.exports = { estimateGas, getRecomendedGasPrice }
