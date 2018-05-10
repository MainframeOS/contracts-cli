# contracts-cli

A command line tool for interacting with smart contracts

## Prerequisites

- [Node](https://nodejs.org/en/) v8+
- [Yarn](https://yarnpkg.com/lang/en/docs/install)

## Setup
from inside contracts-cli directory run:
```
❯ yarn
❯ yarn link
```

## Usage
to start the cli run `contracts-cli` from the command line

**1. Select network**
- testnet (Ropsten) or mainnet

**2. Select a wallet provider**
 - Keystore JSON file
 - Private key
 - Mnemonic phrase
 - Ledger wallet (ensure ledger is unlocked, eth wallet is selected and browser support set to no)

**3. Select a contract to interact with**
 - You can add new contracts by dropping contract abi JSON files into `abi` folder, you can also optionally set addresses for contracts in `config.json`, if no address is set you will be prompted to provide one on contract selection.

**4. Select contract method**

**5. Enter arguments and confirm**
 - when passing uint values, you will have the option for unit conversion, possible units can be found [here](https://github.com/ethereum/wiki/wiki/JavaScript-API#web3towei)

### Token Distribution

Using the `distributeTokens` function takes a csv file as input, you will be asked to provide a path to the file.

csv format:
```
0xe95289DB28Bbfd94f37f5Ad1F7De5ef7dAb169Be,10.5
0xF2aEEF21db3311Eb39E395d5dE1d218032d27CC9,230
0x81b7E08F65Bdf5648606c89998A9CC8164397647,3000.62
```
