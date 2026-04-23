import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const loadDotEnv = () => {
    const envPath = resolve(process.cwd(), ".env")
    if (!existsSync(envPath)) {
        return
    }

    const content = readFileSync(envPath, "utf8")
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
        const rawValue = trimmed.slice(separator + 1).trim()
        if (process.env[key] !== undefined) {
            continue
        }
        process.env[key] = rawValue
    }
}

loadDotEnv()

const REQUIRED_KEYS = [
    "ALTO_ENTRYPOINTS",
    "ALTO_RPC_URL",
    "ALTO_EXECUTOR_PRIVATE_KEYS",
    "ALTO_UTILITY_PRIVATE_KEY",
    "ALTO_AUTH_MODE",
    "ALTO_AUTH_API_KEYS"
] as const

const PLACEHOLDER_PATTERNS = [
    /replace-with/i,
    /^your[-_]/i,
    /^changeme$/i,
    /^example$/i
]

const isPlaceholder = (value: string): boolean => {
    return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value.trim()))
}

const run = () => {
    const missing: string[] = []
    const invalid: string[] = []

    for (const key of REQUIRED_KEYS) {
        const value = process.env[key]
        if (!value || value.trim() === "") {
            missing.push(key)
            continue
        }

        if (isPlaceholder(value)) {
            invalid.push(`${key} uses placeholder value`)
        }
    }

    if (process.env.ALTO_AUTH_MODE === "api-key") {
        const keys = process.env.ALTO_AUTH_API_KEYS ?? ""
        if (keys.split(",").filter((item) => item.trim() !== "").length === 0) {
            invalid.push("ALTO_AUTH_API_KEYS must contain at least one API key")
        }
    }

    if (missing.length === 0 && invalid.length === 0) {
        console.log("PM2 env check passed")
        process.exit(0)
    }

    if (missing.length > 0) {
        console.error("Missing required env keys:")
        for (const key of missing) {
            console.error(`- ${key}`)
        }
    }

    if (invalid.length > 0) {
        console.error("Invalid env values:")
        for (const issue of invalid) {
            console.error(`- ${issue}`)
        }
    }

    process.exit(2)
}

run()
