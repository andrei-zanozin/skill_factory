import { readFileSync } from "node:fs"

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 5_000
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_MAX_RESPONSE_BYTES = 10_000_000
const DEFAULT_MAX_OUTPUT_BYTES = 750_000
const MAX_PAGES = 10_000

type JsonRecord = Record<string, unknown>

type NormalizedComment = {
  id: string
  author: string | null
  created: string
  updated: string
  body: string
}

type JiraRequirementResult = {
  schemaVersion: "1"
  issueKey: string
  trust: "untrusted-external-content"
  source: {
    fetchedAt: string
  }
  requirement: {
    summary: string | null
    description: string | null
    status: string | null
    issueType: string | null
    acceptanceCriteria: null
  }
  comments: NormalizedComment[]
  completeness: {
    issueRead: boolean
    commentsFullyPaginated: boolean
    commentCount: number
    contentTruncated: boolean
    warnings: string[]
  }
}

type RequestConfig = {
  token: string
  proxyUrl?: string
  proxyHost?: string
  ca?: string
  timeoutMs: number
  retries: number
  retryDelayMs: number
  maxResponseBytes: number
}

class SafeToolError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new SafeToolError(`Jira returned an invalid ${label}.`)
  }
  return value
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new SafeToolError(`Jira returned an invalid ${label}.`)
  }
  return value
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return requireString(value, label)
}

function requireInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new SafeToolError(`Jira returned an invalid ${label}.`)
  }
  return value as number
}

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) {
    return fallback
  }

  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new SafeToolError(`${name} must be a positive integer.`)
  }
  return value
}

function alternativeEnv(primary: string, fallback: string): string | undefined {
  const primaryValue = process.env[primary]?.trim()
  const fallbackValue = process.env[fallback]?.trim()
  if (
    primaryValue &&
    fallbackValue &&
    primaryValue !== fallbackValue
  ) {
    throw new SafeToolError(`Set only one of ${primary} and ${fallback}.`)
  }
  return primaryValue || fallbackValue
}

function requiredAlternativeEnv(primary: string, fallback: string): string {
  const value = alternativeEnv(primary, fallback)
  if (!value) {
    throw new SafeToolError(`${primary} or ${fallback} is required.`)
  }
  return value
}

function parseBaseUrl(raw: string): URL {
  let baseUrl: URL
  try {
    baseUrl = new URL(raw)
  } catch {
    throw new SafeToolError("The configured Jira server must be a valid URL.")
  }

  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new SafeToolError("The configured Jira server must use HTTP or HTTPS.")
  }
  baseUrl.search = ""
  baseUrl.hash = ""
  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "")
  return baseUrl
}

function buildProxyConfig(): {
  proxyUrl?: string
  proxyHost?: string
} {
  const proxy = alternativeEnv("HTTP_PROXY", "JIRA_PROXY_URL")
  const username = process.env.TOOL_PROXY_USERNAME?.trim()
  const password = process.env.TOOL_PROXY_PASSWORD?.trim()

  if (!proxy) {
    if (username || password) {
      throw new SafeToolError(
        "TOOL_PROXY_USERNAME and TOOL_PROXY_PASSWORD require a configured Jira proxy.",
      )
    }
    return {}
  }

  let value: URL
  try {
    value = new URL(proxy.includes("://") ? proxy : `http://${proxy}`)
  } catch {
    throw new SafeToolError("The configured Jira proxy must be a valid URL.")
  }
  if (value.protocol !== "https:" && value.protocol !== "http:") {
    throw new SafeToolError("The configured Jira proxy must use HTTP or HTTPS.")
  }
  if (!value.hostname) {
    throw new SafeToolError("The configured Jira proxy must include a host.")
  }

  if ((username && !password) || (!username && password)) {
    throw new SafeToolError(
      "Set both TOOL_PROXY_USERNAME and TOOL_PROXY_PASSWORD.",
    )
  }
  if ((username || password) && (value.username || value.password)) {
    throw new SafeToolError(
      "Provide proxy credentials either separately or in the proxy URL, not both.",
    )
  }
  if (username && password) {
    value.username = username
    value.password = password
  }

  value.pathname = ""
  value.search = ""
  value.hash = ""
  return {
    proxyUrl: value.toString(),
    proxyHost: value.hostname,
  }
}

function loadCaBundle(): string | undefined {
  const path = process.env.JIRA_CA_BUNDLE?.trim()
  if (!path) {
    return undefined
  }

  try {
    return readFileSync(path, "utf8")
  } catch {
    throw new SafeToolError("JIRA_CA_BUNDLE could not be read.")
  }
}

function apiUrl(baseUrl: URL, path: string): URL {
  const url = new URL(baseUrl.origin)
  url.pathname = `${baseUrl.pathname}${path}`
  return url
}

export function parseIssueReference(issue: string, baseUrl: URL): string {
  const candidate = issue.trim()
  const normalizedKey = candidate.toUpperCase()
  if (ISSUE_KEY.test(normalizedKey)) {
    return normalizedKey
  }

  let issueUrl: URL
  try {
    issueUrl = new URL(candidate)
  } catch {
    throw new SafeToolError("issue must be a Jira issue key or a permitted Jira browse URL.")
  }

  const basePath = baseUrl.pathname.replace(/\/+$/, "")
  const browsePrefix = `${basePath}/browse/`
  if (issueUrl.origin !== baseUrl.origin || !issueUrl.pathname.startsWith(browsePrefix)) {
    throw new SafeToolError("The Jira URL does not belong to the configured Jira server.")
  }

  const key = decodeURIComponent(issueUrl.pathname.slice(browsePrefix.length)).toUpperCase()
  if (key.includes("/") || !ISSUE_KEY.test(key)) {
    throw new SafeToolError("The Jira URL does not contain a valid issue key.")
  }
  return key
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SafeToolError("Jira response exceeded JIRA_MAX_RESPONSE_BYTES.")
  }

  if (!response.body) {
    return ""
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new SafeToolError("Jira response exceeded JIRA_MAX_RESPONSE_BYTES.")
    }
    text += decoder.decode(value, { stream: true })
  }

  return text + decoder.decode()
}

async function requestJson(url: URL, config: RequestConfig): Promise<unknown> {
  for (let attempt = 1; attempt <= config.retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

    const options: RequestInit & {
      proxy?: string
      tls?: {
        ca?: string
      }
    } = {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.token}`,
      },
      signal: controller.signal,
    }

    if (config.proxyUrl) {
      options.proxy = config.proxyUrl
    }
    if (config.ca) {
      options.tls = { ca: config.ca }
    }

    try {
      const response = await fetch(url, options)
      const text = await readResponseText(response, config.maxResponseBytes)

      if (!response.ok) {
        throw new SafeToolError(`Jira request failed with HTTP ${response.status}.`)
      }
      try {
        return JSON.parse(text)
      } catch {
        const contentType = response.headers
          .get("content-type")
          ?.replace(/[^\w/+.;= -]/g, "")
          .slice(0, 100)
        const detail = contentType ? ` Content-Type was ${contentType}.` : ""
        throw new SafeToolError(`Jira returned invalid JSON.${detail}`)
      }
    } catch (error) {
      if (error instanceof SafeToolError) {
        throw error
      }
      if (attempt < config.retries) {
        clearTimeout(timeout)
        await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs))
        continue
      }
      if (config.proxyHost && isDnsResolutionFailure(error)) {
        throw new SafeToolError(
          `Cannot resolve proxy host ${config.proxyHost}. ` +
            "Check VPN/network DNS or Jira proxy settings.",
        )
      }
      if (controller.signal.aborted) {
        throw new SafeToolError(
          `Jira request timed out after ${config.retries} attempt(s).`,
        )
      }
      throw new SafeToolError(
        `Jira request failed after ${config.retries} attempt(s) ` +
          "before a complete response was received.",
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new SafeToolError("Jira request retry loop ended unexpectedly.")
}

function isDnsResolutionFailure(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (isRecord(current)) {
      if (
        current.code === "ENOTFOUND" ||
        (typeof current.message === "string" &&
          current.message.toLowerCase().includes("getaddrinfo"))
      ) {
        return true
      }
      current = current.cause
      continue
    }
    break
  }
  return false
}

function nestedName(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const record = requireRecord(value, label)
  return optionalString(record.name, `${label}.name`)
}

function normalizeIssue(payload: unknown): JiraRequirementResult["requirement"] {
  const issue = requireRecord(payload, "issue response")
  const fields = requireRecord(issue.fields, "issue fields")

  return {
    summary: optionalString(fields.summary, "issue summary"),
    description: optionalString(fields.description, "issue description"),
    status: nestedName(fields.status, "issue status"),
    issueType: nestedName(fields.issuetype, "issue type"),
    acceptanceCriteria: null,
  }
}

function normalizeAuthor(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const author = requireRecord(value, "comment author")
  for (const key of ["displayName", "name", "key"]) {
    const candidate = author[key]
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate
    }
  }
  return null
}

function normalizeComment(value: unknown): NormalizedComment {
  const comment = requireRecord(value, "comment")
  const rawId = comment.id
  const id =
    typeof rawId === "string"
      ? rawId
      : typeof rawId === "number" && Number.isSafeInteger(rawId)
        ? String(rawId)
        : null

  if (id === null) {
    throw new SafeToolError("Jira returned an invalid comment id.")
  }

  return {
    id,
    author: normalizeAuthor(comment.author),
    created: requireString(comment.created, "comment created timestamp"),
    updated: requireString(comment.updated, "comment updated timestamp"),
    body: requireString(comment.body, "comment body"),
  }
}

async function fetchAllComments(
  baseUrl: URL,
  issueKey: string,
  config: RequestConfig,
): Promise<NormalizedComment[]> {
  const comments: NormalizedComment[] = []
  let startAt = 0

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = apiUrl(
      baseUrl,
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}/comment`,
    )
    url.searchParams.set("startAt", String(startAt))
    url.searchParams.set("maxResults", String(DEFAULT_PAGE_SIZE))

    const payload = requireRecord(await requestJson(url, config), "comment response")
    const pageStart = requireInteger(payload.startAt, "comment startAt")
    const total =
      payload.total === undefined
        ? null
        : requireInteger(payload.total, "comment total")
    const pageSize =
      payload.maxResults === undefined
        ? DEFAULT_PAGE_SIZE
        : requireInteger(payload.maxResults, "comment maxResults")
    const rawComments = payload.comments
    if (!Array.isArray(rawComments)) {
      throw new SafeToolError("Jira returned an invalid comments array.")
    }
    if (pageStart !== startAt) {
      throw new SafeToolError("Jira comment pagination returned an unexpected offset.")
    }

    comments.push(...rawComments.map(normalizeComment))
    const nextStart = startAt + rawComments.length
    if (total !== null && nextStart >= total) {
      return comments
    }
    if (rawComments.length === 0) {
      if (total === null) {
        return comments
      }
      throw new SafeToolError("Jira comment pagination made no progress.")
    }
    if (total === null && rawComments.length < pageSize) {
      return comments
    }
    startAt = nextStart
  }

  throw new SafeToolError("Jira comment pagination exceeded the safe page limit.")
}

function failureResult(issueKey: string, warning: string): JiraRequirementResult {
  return {
    schemaVersion: "1",
    issueKey,
    trust: "untrusted-external-content",
    source: {
      fetchedAt: new Date().toISOString(),
    },
    requirement: {
      summary: null,
      description: null,
      status: null,
      issueType: null,
      acceptanceCriteria: null,
    },
    comments: [],
    completeness: {
      issueRead: false,
      commentsFullyPaginated: false,
      commentCount: 0,
      contentTruncated: false,
      warnings: [warning],
    },
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export function serializeWithinBudget(
  result: JiraRequirementResult,
  maxOutputBytes: number,
): string {
  const complete = JSON.stringify(result)
  if (byteLength(complete) <= maxOutputBytes) {
    return complete
  }

  const warning =
    `Normalized Jira content exceeded JIRA_MAX_OUTPUT_BYTES (${maxOutputBytes}); ` +
    "requirement text and comments were omitted from the returned payload."
  const reduced: JiraRequirementResult = {
    ...result,
    requirement: {
      summary: null,
      description: null,
      status: result.requirement.status,
      issueType: result.requirement.issueType,
      acceptanceCriteria: null,
    },
    comments: [],
    completeness: {
      ...result.completeness,
      contentTruncated: true,
      warnings: [...result.completeness.warnings, warning],
    },
  }

  const serialized = JSON.stringify(reduced)
  if (byteLength(serialized) > maxOutputBytes) {
    throw new SafeToolError("JIRA_MAX_OUTPUT_BYTES is too small for the completeness envelope.")
  }
  return serialized
}

export async function retrieveJiraRequirement(issue: string): Promise<string> {
  const baseUrl = parseBaseUrl(
    requiredAlternativeEnv("JIRA_SERVER", "JIRA_BASE_URL"),
  )
  const issueKey = parseIssueReference(issue, baseUrl)
  const maxOutputBytes = positiveIntegerEnv(
    "JIRA_MAX_OUTPUT_BYTES",
    DEFAULT_MAX_OUTPUT_BYTES,
  )
  const proxy = buildProxyConfig()
  const requestConfig: RequestConfig = {
    token: requiredAlternativeEnv(
      "JIRA_PAT",
      "JIRA_PERSONAL_ACCESS_TOKEN",
    ),
    ...proxy,
    ca: loadCaBundle(),
    timeoutMs: positiveIntegerEnv("JIRA_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    retries: positiveIntegerEnv("JIRA_RETRIES", DEFAULT_RETRIES),
    retryDelayMs: positiveIntegerEnv(
      "JIRA_RETRY_DELAY_MS",
      DEFAULT_RETRY_DELAY_MS,
    ),
    maxResponseBytes: positiveIntegerEnv(
      "JIRA_MAX_RESPONSE_BYTES",
      DEFAULT_MAX_RESPONSE_BYTES,
    ),
  }

  try {
    const issueUrl = apiUrl(
      baseUrl,
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}`,
    )
    issueUrl.searchParams.set(
      "fields",
      "summary,description,status,issuetype",
    )

    const requirement = normalizeIssue(await requestJson(issueUrl, requestConfig))
    const comments = await fetchAllComments(baseUrl, issueKey, requestConfig)
    const result: JiraRequirementResult = {
      schemaVersion: "1",
      issueKey,
      trust: "untrusted-external-content",
      source: {
        fetchedAt: new Date().toISOString(),
      },
      requirement,
      comments,
      completeness: {
        issueRead: true,
        commentsFullyPaginated: true,
        commentCount: comments.length,
        contentTruncated: false,
        warnings: [],
      },
    }

    return serializeWithinBudget(result, maxOutputBytes)
  } catch (error) {
    const warning =
      error instanceof SafeToolError
        ? error.message
        : "Jira retrieval failed for an unknown reason."
    return serializeWithinBudget(failureResult(issueKey, warning), maxOutputBytes)
  }
}

// Keep the copied tool self-contained: OpenCode also accepts JSON Schema entries
// directly and does not need the @opencode-ai/plugin helper at runtime.
export default {
  description:
    "Read one Jira Data Center issue and every visible comment as normalized, explicitly untrusted requirement data with provenance and completeness metadata.",
  args: {
    issue: {
      type: "string",
      minLength: 1,
      description:
        "Jira issue key or browse URL permitted by the configured Jira server",
    },
  },
  async execute({ issue }: { issue: string }) {
    return retrieveJiraRequirement(issue)
  },
}
