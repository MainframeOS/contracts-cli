#!/usr/bin/env node

// usage (from repo root): ./scrips/balanceChecker.js --tokenAddress=<ADDRESS> --csvPath=<PATH>

// CSV Format (column of addresses):
/*
0x5BDeaE22902c5175fC9b501523c8948bD8Fd69Ad
0x2826372A9B222B3d6BDd984Fb180cDddF25fB124
0x53c62EA41aB6B66F09Fe2e792215F712Bb572C86
0x538e994744596108B470a05a5F04Ad0F130EDDDF
0xCd2042348818e2b305447886935905686ED5F574
*/

const Web3 = require("web3")
const fs = require('fs')
const csv = require('csv-parser')
const utils = require('web3-utils')
const { argv } = require('yargs')

const config = require('../config')
const tokenABI = require('../abi/MainframeToken.json')

const parseCSV = async () => {
  const filePath = argv.csvPath
  return new Promise((resolve, reject) => {
    const addresses = []
    fs.createReadStream(filePath)
      .pipe(csv({ headers: ['address'] }))
      .on('data', data => {
        addresses.push(data.address)
      })
      .on('end', () => {
        resolve({ addresses })
      })
      .on('error', reject)
  })
}

const web3 = new Web3(
  new Web3.providers.HttpProvider(config.rpcUrl.mainnet)
)

const web3Contract = new web3.eth.Contract(
  tokenABI,
  argv.tokenAddress,
)

const fetchBalances = async () => {
  const data = await parseCSV()
	console.log('\nBalances:\n')
  data.addresses.forEach(async a => {
    const balance = await web3Contract.methods.balanceOf(a).call()
    console.log(`${a}: ${utils.fromWei(balance, 'ether')}`)
  })
}

fetchBalances()
