import type { FastifyRequest } from "fastify"

function firstQueryValue(
    query: unknown,
    ...names: string[]
): string | undefined {
    if (!query || typeof query !== "object") {
        return undefined
    }
    const q = query as Record<string, unknown>
    for (const name of names) {
        const v = q[name]
        if (typeof v === "string" && v.length > 0) {
            return v
        }
        if (Array.isArray(v) && typeof v[0] === "string" && v[0].length > 0) {
            return v[0]
        }
    }
    return undefined
}

/**
 * Resolves API key from query (?apikey=...), x-api-key header, or Bearer token.
 */
export function extractApiKeyFromRequest(
    request: FastifyRequest
): string | undefined {
    const fromQuery = firstQueryValue(
        request.query,
        "apikey",
        "apiKey",
        "api_key"
    )
    if (fromQuery) {
        return fromQuery
    }

    const x = request.headers["x-api-key"]
    if (typeof x === "string" && x.length > 0) {
        return x
    }
    if (Array.isArray(x) && typeof x[0] === "string") {
        return x[0]
    }

    const auth = request.headers.authorization
    if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
        const token = auth.slice(7).trim()
        if (token.length > 0) {
            return token
        }
    }

    return undefined
}
