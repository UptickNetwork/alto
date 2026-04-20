<p align="center"><a href="https://docs.pimlico/reference/bundler"><img width="1000" title="Alto" src='https://i.imgur.com/qgVAdjN.png' /></a></p>

# ⛰️ Alto ⛰️

![Node Version](https://img.shields.io/badge/node-20.x-green)

Alto is a Typescript implementation of the [ERC-4337 bundler specification](https://eips.ethereum.org/EIPS/eip-4337) developed by [Pimlico](https://pimlico.io), focused on transaction inclusion reliability.

## Getting started

For a full explanation of Alto, please visit our [docs page](https://docs.pimlico.io/infra/bundler)

#### Run an instance of Alto with the following commands:
```bash
pnpm install
pnpm build
./alto --entrypoints "0x5ff1...2789,0x0000...a032" --executor-private-keys "..." --utility-private-key "..." --min-balance "0" --rpc-url "http://localhost:8545" --network-name "local"



# test
./alto --entrypoints "0x0000000071727De22E5E9d8BAf0edAc6f37da032" \
--executor-private-keys "0x82d42d9eb73d7cfcb9086f069795d044eb31e19bdf82101625fcfd013fb0a1b8" \
--utility-private-key "0x4284b8ae15ccae976dc9cf8b6b38ef6b8cfa48bf8f69a205cef6098fb06a3399" \
--min-balance "0" \
--rpc-url "http://127.0.0.1:8545" \
--network-name "uptick-local" \
--port 3000 \
--log-level info


# 9000test
./alto --entrypoints "0x0000000071727De22E5E9d8BAf0edAc6f37da032" \
--executor-private-keys "0x82d42d9eb73d7cfcb9086f069795d044eb31e19bdf82101625fcfd013fb0a1b8" \
--utility-private-key "0x4284b8ae15ccae976dc9cf8b6b38ef6b8cfa48bf8f69a205cef6098fb06a3399" \
--min-balance "0" \
--rpc-url "http://54.254.15.166:10545" \
--network-name "uptick-local" \
--port 3000 \
--log-level debug

pm2 start ecosystem.config.cjs
```






[//]: # (executor)
[//]: # (#0xb04c94ceac8d4c3e895b30d9a876e7ff22d4ead0)
[//]: # (#{"address":"uptick1kpxffn4v34xraz2mxrv6sah8lu3df6ksurnpgk","base64PublicKey":"AoETJL6MEOFj61x7nRNjXcQRwlNo9wWSYT09BQ81ofv9","mnemonic":"still index soda metal file unfair wing physical skill harsh eternal notice warrior recycle call initial parent witness cage ride session spoil wasp stock","privateKey":"82d42d9eb73d7cfcb9086f069795d044eb31e19bdf82101625fcfd013fb0a1b8"})

[//]: # (utility)
[//]: # (0x9fe38466b52aa7fa39b8e5850aa0e397e7f7a55b)
[//]: # ({"address":"uptick1nl3cge4492nl5wdcukzs4g8rjlnl0f2mp6v5x2","base64PublicKey":"ArPsmqLHJBNiDFfgWDG3a4kXrcR1jxb29pFNHecKy1kb","mnemonic":"napkin member escape donor stick powder chaos dizzy erupt clump orphan buffalo capital slice always gloom exit satoshi blue creek call spice tank blind","privateKey":"4284b8ae15ccae976dc9cf8b6b38ef6b8cfa48bf8f69a205cef6098fb06a3399"})
To find a list of all options, run:
```bash
./alto help
```

A helper script for running Alto locally with an Anvil node can be found at [scripts/run-local-instance.sh](scripts/README.md).

A comprehensive guide for self-hosting Alto can be found [here](https://docs.pimlico.io/infra/bundler/self-host).

#### Run the test suite with the following commands:
```bash
pnpm build
pnpm test # note: foundry must be installed on the machine for this to work
```

## Prerequisites

- :gear: [NodeJS](https://nodejs.org/) (LTS)
- :toolbox: [Pnpm](https://pnpm.io/)

## How to run E2E tests

- pnpm run test

## How to test bundler specs

- Run Geth node or any other node that support debug_traceCall
- Clone [bundler-spec-tests](https://github.com/eth-infinitism/bundler-spec-tests) repo.
- build & run bundler with `--environment development --bundleMode manual --safeMode true`


## License

Distributed under the GPL-3.0 License. See [LICENSE](./LICENSE) for more information.

## Contact

Feel free to ask any questions in our [Telegram group](https://t.me/pimlicoHQ)

## Acknowledgements

- [Eth-Infinitism bundler](https://github.com/eth-infinitism/bundler)
- [Lodestar](https://github.com/ChainSafe/lodestar)
