# contracts-cli

A command line tool for interacting with smart contracts

## Prerequisites

- [Node](https://nodejs.org/en/) v8+
- [Yarn](https://yarnpkg.com/lang/en/docs/install)

## Setup

from inside contracts-cli directory run:

```
❯ yarn
❯ yarn build
❯ yarn link
```

## Run

to start the cli run `contracts-cli` from the command line passing an Ethereum client JSON-RPC URL and a relative path to a folder containing JSON ABI files of contracts you wish to interact with, e.g:

```
contracts-cli --abi-dir=./abi --rpc-url=https://ropsten.infura.io/FWLG9Y
```

other optional inputs include:

```
--testnet
--config-path=<path to config file, example below>
```

### Config file (Optional)

Here you can set contract addresses you frequently interact with to save entering them in the cli each time, they just need a mapping to the names of your JSON ABI files, e.g:

```
{
  "contractAddresses": {
    "MyTokenContract": {
      "testnet": "0xe16f1563984209fe47f8236f8b01a03f03f957e4",
      "mainnet": "0xab2c7238198ad8b389666574f2d8bc411a4b7428"
    },
    "OtherContract": {
      "testnet": "0xcefd4590d131480f100ac58b845314a978b0ec70",
      "mainnet": "0xb2d2130530d77418b3e367fe162808887526e74d"
    },
  },
  rpcUrl: {
    "testnet": "https://ropsten.infura.io/<KEY>",
    "mainnet": "https://mainnet.infura.io/<KEY>"
  }
}
```

## Usage

**1. Select a wallet provider**

- Keystore JSON file
- Private key
- Mnemonic phrase
- Ledger wallet (ensure ledger is unlocked, eth wallet is selected and browser support set to no)

**2. Select a contract to interact with**

- You can add new contracts by dropping contract abi JSON files into `abi` folder, you can also optionally set addresses for contracts in `config.json`, if no address is set you will be prompted to provide one on contract selection.

**3. Select or set contract address**

**3. Select contract method**

**4. Enter arguments and confirm**

- when passing uint values, you will have the option for unit conversion, possible units can be found [here](https://github.com/ethereum/wiki/wiki/JavaScript-API#web3towei)
