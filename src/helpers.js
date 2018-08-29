// @flow
import type Web3Contract from 'web3-eth-contract'
import got from 'got'

export const estimateGas = async (
  web3Contract: Web3Contract,
  method: string,
  account: string,
  args: Array<any>,
) => {
  return await web3Contract.methods[method](...args).estimateGas({
    from: account,
  })
}

export const getRecomendedGasPriceGwei = async (): Promise<number> => {
  const res = await got('https://ethgasstation.info/json/ethgasAPI.json', {
    json: true,
  })
  const gweiPrice = res.body.average / 10
  return gweiPrice
}
