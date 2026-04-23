import { RpcError, ValidationErrors, type BundlerRequest } from "@alto/types"
import type { FastifyRequest } from "fastify"
import Redis from "ioredis"
import type { AltoConfig } from "../../createConfig"

type RequestIdentity = {
    key: string
    source: "api-key" | "ip"
    apiKey: string | null
}

type RateLimitState = {
    windowStart: number
    count: number
}

type GasQuotaState = {
    dayKey: string
    gasUsed: bigint
}

type EffectivePolicy = {
    methods: Set<string>
    rateLimitWindowMs: number
    rateLimitMaxRequests: number
    gasQuotaDailyLimit: bigint
}

type CachedApiKeyPolicy = {
    fetchedAt: number
    policy: AltoConfig["authApiKeyPolicies"][string] | null
}

const REDIS_MAX_INTEGER = 9_223_372_036_854_775_807n

const getCurrentDayKey = () => new Date().toISOString().slice(0, 10)

const toRedisInteger = (value: bigint, fieldName: string): string => {
    if (value < 0n) {
        throw new Error(`${fieldName} must be non-negative`)
    }

    if (value > REDIS_MAX_INTEGER) {
        throw new Error(`${fieldName} exceeds Redis integer range`)
    }

    return value.toString()
}

const getUserOpGasBudget = (bundlerRequest: BundlerRequest): bigint | null => {
    const method = bundlerRequest.method
    if (
        method !== "eth_sendUserOperation" &&
        method !== "pimlico_sendUserOperationNow" &&
        method !== "boost_sendUserOperation"
    ) {
        return null
    }

    const userOp = bundlerRequest.params[0]
    const paymasterVerificationGasLimit =
        "paymasterVerificationGasLimit" in userOp &&
        userOp.paymasterVerificationGasLimit
            ? userOp.paymasterVerificationGasLimit
            : 0n
    const paymasterPostOpGasLimit =
        "paymasterPostOpGasLimit" in userOp && userOp.paymasterPostOpGasLimit
            ? userOp.paymasterPostOpGasLimit
            : 0n

    return (
        userOp.callGasLimit +
        userOp.verificationGasLimit +
        userOp.preVerificationGas +
        paymasterVerificationGasLimit +
        paymasterPostOpGasLimit
    )
}

export class RequestSecurity {
    private readonly config: AltoConfig
    private readonly validApiKeys: Set<string>
    private readonly protectedMethods: Set<string>
    private readonly redis: Redis | null
    private readonly rateLimitByIdentity: Map<string, RateLimitState>
    private readonly gasQuotaByIdentity: Map<string, GasQuotaState>
    private readonly apiKeyPolicyCache: Map<string, CachedApiKeyPolicy>

    constructor({ config }: { config: AltoConfig }) {
        this.config = config
        this.validApiKeys = new Set(config.authApiKeys)
        this.protectedMethods = new Set(config.authProtectedMethods)
        this.redis = config.redisMempoolUrl
            ? new Redis(config.redisMempoolUrl, {})
            : null
        this.rateLimitByIdentity = new Map()
        this.gasQuotaByIdentity = new Map()
        this.apiKeyPolicyCache = new Map()
    }

    shouldProtect(method: string): boolean {
        return this.protectedMethods.has(method)
    }

    private getDefaultPolicy(): EffectivePolicy {
        return {
            methods: this.protectedMethods,
            rateLimitWindowMs: this.config.authRateLimitWindowMs,
            rateLimitMaxRequests: this.config.authRateLimitMaxRequests,
            gasQuotaDailyLimit: this.config.authGasQuotaDailyLimit
        }
    }

    private async getDynamicPolicy(
        apiKey: string
    ): Promise<AltoConfig["authApiKeyPolicies"][string] | null> {
        if (!this.redis) {
            return null
        }

        const cached = this.apiKeyPolicyCache.get(apiKey)
        if (
            cached &&
            Date.now() - cached.fetchedAt < this.config.authApiKeyPoliciesCacheMs
        ) {
            return cached.policy
        }

        const payload = await this.redis.hget(
            this.config.authApiKeyPoliciesRedisKey,
            apiKey
        )
        if (!payload) {
            this.apiKeyPolicyCache.set(apiKey, {
                fetchedAt: Date.now(),
                policy: null
            })
            return null
        }

        try {
            const raw = JSON.parse(payload) as Record<string, unknown>
            const parsed: AltoConfig["authApiKeyPolicies"][string] = {}

            if ("methods" in raw && Array.isArray(raw.methods)) {
                parsed.methods = raw.methods.filter(
                    (item): item is string => typeof item === "string"
                )
            }
            if (
                "rateLimitWindowMs" in raw &&
                typeof raw.rateLimitWindowMs === "number" &&
                Number.isInteger(raw.rateLimitWindowMs) &&
                raw.rateLimitWindowMs > 0
            ) {
                parsed.rateLimitWindowMs = raw.rateLimitWindowMs
            }
            if (
                "rateLimitMaxRequests" in raw &&
                typeof raw.rateLimitMaxRequests === "number" &&
                Number.isInteger(raw.rateLimitMaxRequests) &&
                raw.rateLimitMaxRequests > 0
            ) {
                parsed.rateLimitMaxRequests = raw.rateLimitMaxRequests
            }
            if ("gasQuotaDailyLimit" in raw) {
                const limit = BigInt(raw.gasQuotaDailyLimit as string | number | bigint)
                if (limit >= 0n) {
                    parsed.gasQuotaDailyLimit = limit
                }
            }

            this.apiKeyPolicyCache.set(apiKey, {
                fetchedAt: Date.now(),
                policy: parsed
            })
            return parsed
        } catch {
            throw new RpcError(
                "invalid api key policy payload in redis",
                ValidationErrors.InvalidRequest
            )
        }
    }

    private async getEffectivePolicy(
        identity: RequestIdentity
    ): Promise<EffectivePolicy> {
        const defaultPolicy: EffectivePolicy = {
            ...this.getDefaultPolicy()
        }

        if (!identity.apiKey) {
            return defaultPolicy
        }

        const dynamicPolicy = await this.getDynamicPolicy(identity.apiKey)
        const keyPolicy = dynamicPolicy ?? this.config.authApiKeyPolicies[identity.apiKey]
        if (!keyPolicy) {
            return defaultPolicy
        }

        return {
            methods: new Set(keyPolicy.methods ?? [...defaultPolicy.methods]),
            rateLimitWindowMs:
                keyPolicy.rateLimitWindowMs ?? defaultPolicy.rateLimitWindowMs,
            rateLimitMaxRequests:
                keyPolicy.rateLimitMaxRequests ?? defaultPolicy.rateLimitMaxRequests,
            gasQuotaDailyLimit:
                keyPolicy.gasQuotaDailyLimit ?? defaultPolicy.gasQuotaDailyLimit
        }
    }

    getIdentity({
        request,
        method
    }: {
        request: FastifyRequest
        method: string
    }): RequestIdentity {
        if (!this.shouldProtect(method)) {
            return {
                key: `ip:${request.ip}`,
                source: "ip",
                apiKey: null
            }
        }

        if (this.config.authMode === "api-key") {
            const apiKeyHeader = request.headers["x-api-key"]
            const apiKey = Array.isArray(apiKeyHeader)
                ? apiKeyHeader[0]
                : apiKeyHeader

            if (!apiKey) {
                throw new RpcError(
                    "missing x-api-key header",
                    ValidationErrors.InvalidRequest
                )
            }

            if (!this.validApiKeys.has(apiKey)) {
                throw new RpcError("invalid api key", ValidationErrors.InvalidRequest)
            }

            return {
                key: `api-key:${apiKey}`,
                source: "api-key",
                apiKey
            }
        }

        return {
            key: `ip:${request.ip}`,
            source: "ip",
            apiKey: null
        }
    }

    async enforceRateLimit({
        identity,
        method
    }: {
        identity: RequestIdentity
        method: string
    }): Promise<void> {
        const policy = await this.getEffectivePolicy(identity)
        if (!policy.methods.has(method)) {
            return
        }

        if (this.redis) {
            const key = `${this.config.chainId}:auth:rate-limit:${identity.key}:${method}`
            const current = await this.redis.incr(key)
            if (current === 1) {
                await this.redis.pexpire(key, policy.rateLimitWindowMs)
            }

            if (current > policy.rateLimitMaxRequests) {
                throw new RpcError(
                    "rate limit exceeded",
                    ValidationErrors.InvalidRequest
                )
            }
            return
        }

        const now = Date.now()
        const existing = this.rateLimitByIdentity.get(identity.key)
        if (!existing) {
            this.rateLimitByIdentity.set(identity.key, {
                windowStart: now,
                count: 1
            })
            return
        }

        const elapsed = now - existing.windowStart
        if (elapsed >= policy.rateLimitWindowMs) {
            this.rateLimitByIdentity.set(identity.key, {
                windowStart: now,
                count: 1
            })
            return
        }

        if (existing.count >= policy.rateLimitMaxRequests) {
            throw new RpcError(
                "rate limit exceeded",
                ValidationErrors.InvalidRequest
            )
        }

        existing.count += 1
        this.rateLimitByIdentity.set(identity.key, existing)
    }

    async enforceGasQuota({
        identity,
        bundlerRequest
    }: {
        identity: RequestIdentity
        bundlerRequest: BundlerRequest
    }): Promise<void> {
        const policy = await this.getEffectivePolicy(identity)
        if (!policy.methods.has(bundlerRequest.method)) {
            return
        }
        if (policy.gasQuotaDailyLimit === 0n) {
            return
        }

        const budget = getUserOpGasBudget(bundlerRequest)
        if (budget === null) {
            return
        }

        if (this.redis) {
            const currentDay = getCurrentDayKey()
            const quotaKey = `${this.config.chainId}:auth:gas-quota:${currentDay}:${identity.key}`
            toRedisInteger(budget, "request gas budget")
            toRedisInteger(
                policy.gasQuotaDailyLimit,
                "daily gas quota limit"
            )
            for (let retry = 0; retry < 3; retry++) {
                await this.redis.watch(quotaKey)
                const currentValue = await this.redis.get(quotaKey)
                const currentUsage = currentValue ? BigInt(currentValue) : 0n
                const nextUsage = currentUsage + budget

                if (nextUsage > policy.gasQuotaDailyLimit) {
                    await this.redis.unwatch()
                    throw new RpcError(
                        "daily gas quota exceeded",
                        ValidationErrors.InvalidRequest
                    )
                }

                const tx = this.redis.multi()
                tx.set(quotaKey, nextUsage.toString())
                if (!currentValue) {
                    tx.expire(quotaKey, 60 * 60 * 24 * 2)
                }
                const result = await tx.exec()
                if (result !== null) {
                    return
                }
            }

            throw new RpcError(
                "concurrent quota update failed, retry later",
                ValidationErrors.InvalidRequest
            )
        }

        const currentDay = getCurrentDayKey()
        const existing = this.gasQuotaByIdentity.get(identity.key)
        if (!existing || existing.dayKey !== currentDay) {
            if (budget > policy.gasQuotaDailyLimit) {
                throw new RpcError(
                    "daily gas quota exceeded",
                    ValidationErrors.InvalidRequest
                )
            }

            this.gasQuotaByIdentity.set(identity.key, {
                dayKey: currentDay,
                gasUsed: budget
            })
            return
        }

        const nextGasUsed = existing.gasUsed + budget
        if (nextGasUsed > policy.gasQuotaDailyLimit) {
            throw new RpcError(
                "daily gas quota exceeded",
                ValidationErrors.InvalidRequest
            )
        }

        this.gasQuotaByIdentity.set(identity.key, {
            dayKey: existing.dayKey,
            gasUsed: nextGasUsed
        })
    }
}
