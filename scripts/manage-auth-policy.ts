import Redis from "ioredis"

type Action = "set" | "get" | "del" | "list" | "validate"

const VALID_METHODS = new Set([
    "eth_chainId",
    "eth_supportedEntryPoints",
    "eth_estimateUserOperationGas",
    "eth_sendUserOperation",
    "boost_sendUserOperation",
    "eth_getUserOperationByHash",
    "eth_getUserOperationReceipt",
    "debug_bundler_clearState",
    "debug_bundler_clearMempool",
    "debug_bundler_dumpMempool",
    "debug_bundler_sendBundleNow",
    "debug_bundler_setBundlingMode",
    "debug_bundler_setReputation",
    "debug_bundler_dumpReputation",
    "debug_bundler_clearReputation",
    "debug_bundler_getStakeStatus",
    "pimlico_getUserOperationStatus",
    "pimlico_getUserOperationGasPrice",
    "pimlico_sendUserOperationNow",
    "pimlico_simulateAssetChange"
])

const getArgValue = (name: string): string | undefined => {
    const args = process.argv.slice(2)
    const index = args.indexOf(name)
    if (index === -1) {
        return undefined
    }
    return args[index + 1]
}

const requireArgValue = (name: string): string => {
    const value = getArgValue(name)
    if (!value) {
        throw new Error(`missing required argument ${name}`)
    }
    return value
}

const getAction = (): Action => {
    const action = getArgValue("--action")
    if (
        action === "set" ||
        action === "get" ||
        action === "del" ||
        action === "list" ||
        action === "validate"
    ) {
        return action
    }
    throw new Error("invalid --action, expected set|get|del|list|validate")
}

const getRedisUrl = (): string => {
    const redisUrl = process.env.ALTO_REDIS_MEMPOOL_URL ?? process.env.REDIS_URL
    if (!redisUrl) {
        throw new Error(
            "missing redis url, set ALTO_REDIS_MEMPOOL_URL or REDIS_URL"
        )
    }
    return redisUrl
}

const getPoliciesRedisKey = (): string => {
    return process.env.ALTO_AUTH_API_KEY_POLICIES_REDIS_KEY ?? "auth:api-key-policies"
}

const validatePolicyPayload = (payload: string): string[] => {
    const errors: string[] = []
    let parsed: unknown
    try {
        parsed = JSON.parse(payload)
    } catch {
        return ["invalid JSON"]
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return ["payload must be an object"]
    }

    const obj = parsed as Record<string, unknown>
    if ("methods" in obj) {
        if (!Array.isArray(obj.methods)) {
            errors.push("methods must be an array")
        } else {
            const invalidMethod = obj.methods.find(
                (method) =>
                    typeof method !== "string" || !VALID_METHODS.has(method)
            )
            if (invalidMethod !== undefined) {
                errors.push(`invalid method: ${String(invalidMethod)}`)
            }
        }
    }

    if (
        "rateLimitWindowMs" in obj &&
        (!Number.isInteger(obj.rateLimitWindowMs) ||
            Number(obj.rateLimitWindowMs) <= 0)
    ) {
        errors.push("rateLimitWindowMs must be a positive integer")
    }

    if (
        "rateLimitMaxRequests" in obj &&
        (!Number.isInteger(obj.rateLimitMaxRequests) ||
            Number(obj.rateLimitMaxRequests) <= 0)
    ) {
        errors.push("rateLimitMaxRequests must be a positive integer")
    }

    if ("gasQuotaDailyLimit" in obj) {
        try {
            const value = BigInt(obj.gasQuotaDailyLimit as string | number | bigint)
            if (value < 0n) {
                errors.push("gasQuotaDailyLimit must be >= 0")
            }
        } catch {
            errors.push("gasQuotaDailyLimit must be bigint-compatible")
        }
    }

    return errors
}

const run = async () => {
    const action = getAction()
    const apiKey = requireArgValue("--key")
    const redis = new Redis(getRedisUrl())
    const policiesKey = getPoliciesRedisKey()

    try {
        if (action === "validate") {
            const policies = await redis.hgetall(policiesKey)
            const entries = Object.entries(policies).sort(([a], [b]) =>
                a.localeCompare(b)
            )

            if (entries.length === 0) {
                console.log("no policies found")
                return
            }

            let hasErrors = false
            for (const [key, value] of entries) {
                const errors = validatePolicyPayload(value)
                if (errors.length === 0) {
                    console.log(`OK\t${key}`)
                    continue
                }
                hasErrors = true
                console.log(`INVALID\t${key}\t${errors.join("; ")}`)
            }

            if (hasErrors) {
                process.exit(2)
            }
            return
        }

        if (action === "list") {
            const policies = await redis.hgetall(policiesKey)
            const entries = Object.entries(policies).sort(([a], [b]) =>
                a.localeCompare(b)
            )
            if (entries.length === 0) {
                console.log("no policies found")
                return
            }

            for (const [key, value] of entries) {
                console.log(`${key}\t${value}`)
            }
            return
        }

        if (action === "set") {
            const policyPayload = requireArgValue("--policy")
            JSON.parse(policyPayload)
            await redis.hset(policiesKey, apiKey, policyPayload)
            console.log(`set policy for key ${apiKey}`)
            return
        }

        if (action === "get") {
            const policyPayload = await redis.hget(policiesKey, apiKey)
            if (!policyPayload) {
                console.log(`policy not found for key ${apiKey}`)
                return
            }
            console.log(policyPayload)
            return
        }

        await redis.hdel(policiesKey, apiKey)
        console.log(`deleted policy for key ${apiKey}`)
    } finally {
        await redis.quit()
    }
}

run().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
})
