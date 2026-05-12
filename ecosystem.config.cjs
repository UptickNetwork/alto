/**
 * PM2 进程配置：在仓库根目录执行 `pm2 restart ecosystem.config.cjs --update-env`
 * 生产环境请改用环境变量或本地覆盖，勿提交真实私钥。
 */
const fs = require("node:fs")
const path = require("node:path")

const loadDotEnv = () => {
    const envPath = path.resolve(__dirname, ".env")
    if (!fs.existsSync(envPath)) {
        return
    }

    const content = fs.readFileSync(envPath, "utf8")
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed === "" || trimmed.startsWith("#")) {
            continue
        }

        const separator = trimmed.indexOf("=")
        if (separator <= 0) {
            continue
        }

        const key = trimmed.slice(0, separator).trim()
        const value = trimmed.slice(separator + 1).trim()
        if (process.env[key] === undefined) {
            process.env[key] = value
        }
    }
}

loadDotEnv()

module.exports = {
    apps: [
        {
            name: "alto",
            script: "./alto",
            interpreter: "bash",
            cwd: __dirname,
            args: [
                "--entrypoints",
                process.env.ALTO_ENTRYPOINTS ??
                    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
                "--min-executor-balance",
                process.env.ALTO_MIN_EXECUTOR_BALANCE ?? "50000000000000000",
                "--bundler-initial-commission",
                process.env.ALTO_BUNDLER_INITIAL_COMMISSION ?? "15",
                "--transaction-underpriced-multiplier",
                process.env.ALTO_TRANSACTION_UNDERPRICED_MULTIPLIER ?? "170",
                "--send-handle-ops-retry-count",
                process.env.ALTO_SEND_HANDLE_OPS_RETRY_COUNT ?? "4",
                "--executor-refill-interval",
                process.env.ALTO_EXECUTOR_REFILL_INTERVAL ?? "120",
                "--rpc-url",
                process.env.ALTO_RPC_URL ?? "http://54.254.15.166:10545",
                "--network-name",
                process.env.ALTO_NETWORK_NAME ?? "uptick-local",
                "--port",
                process.env.ALTO_PORT ?? "3000",
                "--log-level",
                process.env.ALTO_LOG_LEVEL ?? "debug"
            ],
            env: {
                // Sensitive keys: strongly recommended to inject from CI/CD secret manager.
                ALTO_EXECUTOR_PRIVATE_KEYS:
                    process.env.ALTO_EXECUTOR_PRIVATE_KEYS ??
                    "replace-with-executor-private-keys-comma-separated",
                ALTO_UTILITY_PRIVATE_KEY:
                    process.env.ALTO_UTILITY_PRIVATE_KEY ??
                    "replace-with-utility-private-key",

                ALTO_AUTH_MODE: process.env.ALTO_AUTH_MODE ?? "api-key",
                ALTO_AUTH_API_KEYS:
                    process.env.ALTO_AUTH_API_KEYS ??
                    "replace-with-key-a,replace-with-key-b",
                ALTO_AUTH_PROTECTED_METHODS:
                    process.env.ALTO_AUTH_PROTECTED_METHODS ??
                    "eth_sendUserOperation,pimlico_sendUserOperationNow,boost_sendUserOperation",
                ALTO_AUTH_RATE_LIMIT_WINDOW_MS:
                    process.env.ALTO_AUTH_RATE_LIMIT_WINDOW_MS ?? "1000",
                ALTO_AUTH_RATE_LIMIT_MAX_REQUESTS:
                    process.env.ALTO_AUTH_RATE_LIMIT_MAX_REQUESTS ?? "10",
                ALTO_AUTH_GAS_QUOTA_DAILY_LIMIT:
                    process.env.ALTO_AUTH_GAS_QUOTA_DAILY_LIMIT ?? "50000000",
                ALTO_REDIS_MEMPOOL_URL:
                    process.env.ALTO_REDIS_MEMPOOL_URL ??
                    "redis://127.0.0.1:6379",
                ALTO_AUTH_API_KEY_POLICIES_REDIS_KEY:
                    process.env.ALTO_AUTH_API_KEY_POLICIES_REDIS_KEY ??
                    "auth:api-key-policies",
                ALTO_AUTH_API_KEY_POLICIES_CACHE_MS:
                    process.env.ALTO_AUTH_API_KEY_POLICIES_CACHE_MS ?? "3000"
            },
            autorestart: true,
            max_restarts: 20,
            restart_delay: 3000
        }
    ]
};
