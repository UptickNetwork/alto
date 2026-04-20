/**
 * PM2 进程配置：在仓库根目录执行 `pm2 start ecosystem.config.cjs`
 * 生产环境请改用环境变量或本地覆盖，勿提交真实私钥。
 */
module.exports = {
    apps: [
        {
            name: "alto-uptick",
            cwd: __dirname,
            script: "src/esm/cli/alto.js",
            args: [
                "run",
                "--entrypoints",
                "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
                "--executor-private-keys",
                "0x82d42d9eb73d7cfcb9086f069795d044eb31e19bdf82101625fcfd013fb0a1b8",
                "--utility-private-key",
                "0x4284b8ae15ccae976dc9cf8b6b38ef6b8cfa48bf8f69a205cef6098fb06a3399",
                "--min-balance",
                "0",
                "--rpc-url",
                "http://54.254.15.166:10545",
                "--network-name",
                "uptick-local",
                "--port",
                "3010",
                "--log-level",
                "info"
            ],
            interpreter: "node"
        }
    ]
}
