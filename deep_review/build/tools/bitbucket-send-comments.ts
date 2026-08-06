const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 5_000
const DEFAULT_PAGE_SIZE = 100
const CHANGE_PAGE_SIZE = 1_000
const INITIAL_DIFF_CONTEXT_LINES = 10
const DEFAULT_MAX_RESPONSE_BYTES = 20_000_000
const MAX_DIFF_CONTEXT_LINES = 2_147_483_647
const MAX_PAGES = 10_000
const MAX_COMMENTS_PER_REQUEST = 50
const MAX_COMMENT_BYTES = 100_000
const FULL_REVISION = /^[0-9a-f]{40,64}$/i
const SAFE_REPOSITORY_PART = /^[A-Za-z0-9._~-]+$/

type JsonRecord = Record<string, unknown>

type CommentInput = {
  number: number
  path: string
  startLine?: number
  endLine?: number
  text: string
}

type ValidatedComment = Omit<CommentInput, "text"> & {
  path: string
  startLine: number | null
  endLine: number | null
  fullText: string
  inlineText: string
}

type InlineValidatedComment = ValidatedComment & {
  startLine: number
  endLine: number
}

type RepositoryIdentity = {
  projectKey: string
  repositorySlug: string
}

type PullRequestIdentity = {
  id: number
  version: number
  state: string
  sourceBranch: string
  sourceHead: string
  targetProjectKey: string
  targetRepositorySlug: string
  targetBranch: string
}

type PullRequestChange = {
  path: string
  srcPath?: string
  type: string
}

type InlineAnchor = {
  diffType: "EFFECTIVE"
  path: string
  srcPath?: string
  line: number
  lineType: "ADDED" | "CONTEXT"
  fileType: "TO"
}

type PreparedInlineComment = {
  input: ValidatedComment
  placement: "inline"
  text: string
  anchor: InlineAnchor
  alreadyPostedId: number | null
}

type PreparedGeneralComment = {
  input: ValidatedComment
  placement: "general"
  text: string
  alreadyPostedId: number | null
}

type PreparedComment = PreparedInlineComment | PreparedGeneralComment

type RequestConfig = {
  token: string
  proxyUrl?: string
  proxyHost?: string
  timeoutMs: number
  retries: number
  retryDelayMs: number
  maxResponseBytes: number
}

type PublicationItem = {
  number: number
  placement: "inline" | "general" | null
  status: "posted" | "already-posted" | "failed" | "not-attempted"
  commentId: number | null
  url: string | null
  reason: string | null
}

type PublicationResult = {
  schemaVersion: "2"
  status: "completed" | "partial" | "blocked"
  pullRequest: {
    projectKey: string
    repositorySlug: string
    id: number
    sourceBranch: string
    targetBranch: string
    reviewedHeadRevision: string
    url: string
  } | null
  comments: PublicationItem[]
  reason: string | null
}

class SafeToolError extends Error {}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) {
    throw new SafeToolError(`Bitbucket returned an invalid ${label}.`)
  }
  return value
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SafeToolError(`Bitbucket returned an invalid ${label}.`)
  }
  return value
}

function requireInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new SafeToolError(`Bitbucket returned an invalid ${label}.`)
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

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new SafeToolError(`${name} is required.`)
  }
  return value
}

function parseBaseUrl(raw: string): URL {
  let baseUrl: URL
  try {
    baseUrl = new URL(raw)
  } catch {
    throw new SafeToolError("The configured Bitbucket server must be a valid URL.")
  }
  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new SafeToolError("The configured Bitbucket server must use HTTP or HTTPS.")
  }
  baseUrl.search = ""
  baseUrl.hash = ""
  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "")
  return baseUrl
}

function buildProxyConfig(): { proxyUrl: string; proxyHost: string } {
  const proxy = process.env.HTTPS_PROXY?.trim()
  const username = process.env.TOOL_PROXY_USERNAME?.trim()
  const password = process.env.TOOL_PROXY_PASSWORD?.trim()

  if (!proxy) {
    throw new SafeToolError("HTTPS_PROXY is required for Bitbucket requests.")
  }
  if (!username || !password) {
    throw new SafeToolError(
      "TOOL_PROXY_USERNAME and TOOL_PROXY_PASSWORD are required for Bitbucket requests.",
    )
  }

  let value: URL
  try {
    value = new URL(proxy.includes("://") ? proxy : `http://${proxy}`)
  } catch {
    throw new SafeToolError("The configured Bitbucket proxy must be a valid URL.")
  }
  if (value.protocol !== "https:" && value.protocol !== "http:") {
    throw new SafeToolError("The configured Bitbucket proxy must use HTTP or HTTPS.")
  }
  if (!value.hostname) {
    throw new SafeToolError("The configured Bitbucket proxy must include a host.")
  }
  if (value.username || value.password) {
    throw new SafeToolError(
      "HTTPS_PROXY must not contain credentials; use TOOL_PROXY_USERNAME and TOOL_PROXY_PASSWORD.",
    )
  }
  value.username = username
  value.password = password

  value.pathname = ""
  value.search = ""
  value.hash = ""
  return { proxyUrl: value.toString(), proxyHost: value.hostname }
}

function apiUrl(baseUrl: URL, path: string): URL {
  const url = new URL(baseUrl.origin)
  url.pathname = `${baseUrl.pathname}${path}`
  return url
}

function normalizeBranch(value: string): string {
  const branch = value.trim().replace(/^refs\/heads\//, "")
  if (
    branch.length === 0 ||
    branch.length > 1_000 ||
    /[\u0000-\u0020\u007f]/.test(branch) ||
    branch.startsWith("-") ||
    branch.includes("..") ||
    branch.includes("@{")
  ) {
    throw new SafeToolError("sourceBranch is not a safe Git branch name.")
  }
  return branch
}

function normalizeRepositoryPath(value: string): string {
  const path = value.trim().replace(/^\.\//, "")
  if (
    path.length === 0 ||
    path.length > 4_096 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new SafeToolError("A selected finding has an unsafe repository path.")
  }
  return path
}

function validateCommentText(
  number: number,
  value: string,
): { fullText: string; inlineText: string } {
  const text = value.replace(/\r\n/g, "\n").trim()
  if (new TextEncoder().encode(text).byteLength > MAX_COMMENT_BYTES) {
    throw new SafeToolError(`Comment ${number} exceeds the safe size limit.`)
  }
  const lines = text.split("\n")
  if (!lines[0]?.startsWith(`### ${number}. `)) {
    throw new SafeToolError(
      `Comment ${number} must keep its exact numbered finding heading from the report.`,
    )
  }
  if (lines.filter((line) => line.startsWith("- Location:")).length !== 1) {
    throw new SafeToolError(`Comment ${number} must contain exactly one Location line.`)
  }
  const location = lines.findIndex((line) => line.startsWith("- Location:"))
  const problem = lines.findIndex((line) => line.startsWith("- Problem and impact:"))
  const fix = lines.findIndex((line) => line.startsWith("- Suggested fix:"))
  const evidence = lines.findIndex((line) => line.startsWith("- Evidence:"))
  const singleEvidence = lines[evidence]?.startsWith("- Evidence: ")
  const evidenceList =
    lines[evidence] === "- Evidence:" &&
    lines.length > evidence + 1 &&
    lines.slice(evidence + 1).every((line) => line.startsWith("  - "))
  if (
    lines[1] !== "" ||
    location !== 2 ||
    problem !== 3 ||
    fix !== 4 ||
    evidence !== 5 ||
    !lines[location].startsWith("- Location: ") ||
    !lines[problem].startsWith("- Problem and impact: ") ||
    !lines[fix].startsWith("- Suggested fix: ") ||
    !((singleEvidence && lines.length === 6) || evidenceList)
  ) {
    throw new SafeToolError(
      `Comment ${number} does not preserve the final-report finding format.`,
    )
  }
  return {
    fullText: text,
    inlineText: lines.filter((_, index) => index !== location).join("\n"),
  }
}

function validateComments(value: unknown): ValidatedComment[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SafeToolError("At least one selected comment is required.")
  }
  if (value.length > MAX_COMMENTS_PER_REQUEST) {
    throw new SafeToolError(
      `At most ${MAX_COMMENTS_PER_REQUEST} comments may be sent at once.`,
    )
  }

  const numbers = new Set<number>()
  const comments = value.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new SafeToolError(`comments[${index}] must be an object.`)
    }
    const number = raw.number
    const startLine = raw.startLine
    const endLine = raw.endLine
    if (!Number.isSafeInteger(number) || (number as number) <= 0) {
      throw new SafeToolError(`comments[${index}].number must be a positive integer.`)
    }
    if (numbers.has(number as number)) {
      throw new SafeToolError(`Comment number ${number} was selected more than once.`)
    }
    numbers.add(number as number)
    const hasStartLine = startLine !== undefined
    const hasEndLine = endLine !== undefined
    if (hasStartLine !== hasEndLine) {
      throw new SafeToolError(
        `Comment ${number} must provide both starting and ending lines or neither.`,
      )
    }
    if (hasStartLine) {
      if (!Number.isSafeInteger(startLine) || (startLine as number) <= 0) {
        throw new SafeToolError(`Comment ${number} has an invalid starting line.`)
      }
      if (
        !Number.isSafeInteger(endLine) ||
        (endLine as number) < (startLine as number) ||
        (endLine as number) - (startLine as number) > 100_000
      ) {
        throw new SafeToolError(`Comment ${number} has an invalid ending line.`)
      }
    }
    if (typeof raw.path !== "string" || typeof raw.text !== "string") {
      throw new SafeToolError(`Comment ${number} requires path and text strings.`)
    }
    const commentText = validateCommentText(number as number, raw.text)
    return {
      number: number as number,
      path: normalizeRepositoryPath(raw.path),
      startLine: hasStartLine ? (startLine as number) : null,
      endLine: hasEndLine ? (endLine as number) : null,
      ...commentText,
    }
  })
  return comments.sort((left, right) => left.number - right.number)
}

function requireInlineLocation(comment: ValidatedComment): InlineValidatedComment {
  if (comment.startLine === null || comment.endLine === null) {
    throw new SafeToolError(
      `Comment ${comment.number} targets a changed file and requires an explicit numeric source location for inline placement.`,
    )
  }
  return comment as InlineValidatedComment
}

function validateRepositoryPart(value: string, label: string): string {
  const decoded = decodeURIComponent(value).replace(/\.git$/i, "")
  if (!SAFE_REPOSITORY_PART.test(decoded)) {
    throw new SafeToolError(`The Git remote contains an invalid ${label}.`)
  }
  return decoded
}

export function parseRepositoryIdentity(
  repositoryUrl: string,
  baseUrl: URL,
): RepositoryIdentity {
  const candidate = repositoryUrl.trim()
  let host: string
  let path: string

  const scpMatch = candidate.match(/^(?:[^@\s]+@)?([^:/\s]+):(.+)$/)
  if (scpMatch && !candidate.includes("://")) {
    host = scpMatch[1]
    path = scpMatch[2]
  } else {
    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      throw new SafeToolError("repositoryUrl must be a valid Git remote URL.")
    }
    if (!["http:", "https:", "ssh:"].includes(url.protocol)) {
      throw new SafeToolError("repositoryUrl must use HTTP, HTTPS or SSH.")
    }
    host = url.hostname
    path = url.pathname.replace(/^\/+/, "")
    if (url.protocol !== "ssh:") {
      const basePath = baseUrl.pathname.replace(/^\/+|\/+$/g, "")
      if (basePath) {
        if (!path.startsWith(`${basePath}/`)) {
          throw new SafeToolError(
            "The Git remote does not belong to the configured Bitbucket server path.",
          )
        }
        path = path.slice(basePath.length + 1)
      }
    }
  }

  if (host.toLowerCase() !== baseUrl.hostname.toLowerCase()) {
    throw new SafeToolError(
      "The Git remote does not belong to the configured Bitbucket server.",
    )
  }

  const parts = path.split("/").filter(Boolean)
  let projectKey: string | undefined
  let repositorySlug: string | undefined
  if (parts[0]?.toLowerCase() === "scm" && parts.length === 3) {
    ;[, projectKey, repositorySlug] = parts
  } else if (
    parts[0]?.toLowerCase() === "projects" &&
    parts[2]?.toLowerCase() === "repos" &&
    parts.length >= 4
  ) {
    projectKey = parts[1]
    repositorySlug = parts[3]
  } else if (parts.length === 2) {
    ;[projectKey, repositorySlug] = parts
  }
  if (!projectKey || !repositorySlug) {
    throw new SafeToolError(
      "The Git remote must identify one Bitbucket project and repository.",
    )
  }
  return {
    projectKey: validateRepositoryPart(projectKey, "project key"),
    repositorySlug: validateRepositoryPart(repositorySlug, "repository slug"),
  }
}

async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SafeToolError("Bitbucket response exceeded BITBUCKET_MAX_RESPONSE_BYTES.")
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
      throw new SafeToolError("Bitbucket response exceeded BITBUCKET_MAX_RESPONSE_BYTES.")
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

function isDnsResolutionFailure(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (!isRecord(current)) {
      break
    }
    if (
      current.code === "ENOTFOUND" ||
      (typeof current.message === "string" &&
        current.message.toLowerCase().includes("getaddrinfo"))
    ) {
      return true
    }
    current = current.cause
  }
  return false
}

function bitbucketErrorDetail(text: string): string | null {
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    return null
  }

  const messages: unknown[] = []
  if (isRecord(payload)) {
    messages.push(payload.message)
    if (Array.isArray(payload.errors)) {
      for (const error of payload.errors) {
        if (isRecord(error)) {
          messages.push(error.message)
        }
      }
    }
  }
  for (const value of messages) {
    if (typeof value !== "string") {
      continue
    }
    const sanitized = value
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500)
    if (sanitized) {
      return sanitized
    }
  }
  return null
}

async function requestText(
  url: URL,
  config: RequestConfig,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  accept = "application/json",
  operation = "Bitbucket request",
): Promise<string> {
  const attempts = method === "GET" ? config.retries : 1
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
    const options: RequestInit & { proxy?: string } = {
      method,
      headers: {
        accept,
        authorization: `Bearer ${config.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
    if (config.proxyUrl) {
      options.proxy = config.proxyUrl
    }
    try {
      const response = await fetch(url, options)
      const text = await readResponseText(response, config.maxResponseBytes)
      if (!response.ok) {
        const detail = bitbucketErrorDetail(text)
        throw new SafeToolError(
          `${operation} failed: Bitbucket ${method} returned HTTP ${response.status}` +
            (detail ? `: ${detail}` : "."),
        )
      }
      return text
    } catch (error) {
      if (error instanceof SafeToolError) {
        if (error.message.startsWith(`${operation} failed:`)) {
          throw error
        }
        throw new SafeToolError(`${operation} failed: ${error.message}`)
      }
      if (attempt < attempts) {
        clearTimeout(timeout)
        await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs))
        continue
      }
      if (config.proxyHost && isDnsResolutionFailure(error)) {
        throw new SafeToolError(
          `${operation} failed: cannot resolve proxy host ${config.proxyHost}. Check VPN/network DNS or Bitbucket proxy settings.`,
        )
      }
      if (controller.signal.aborted) {
        throw new SafeToolError(
          `${operation} failed: Bitbucket request timed out after ${attempts} attempt(s).`,
        )
      }
      throw new SafeToolError(
        `${operation} failed: Bitbucket ${method} request ended before a complete response was received.`,
      )
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new SafeToolError("Bitbucket request retry loop ended unexpectedly.")
}

async function requestJson(
  url: URL,
  config: RequestConfig,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  operation = "Bitbucket request",
): Promise<unknown> {
  const text = await requestText(
    url,
    config,
    method,
    body,
    "application/json",
    operation,
  )
  try {
    return JSON.parse(text)
  } catch {
    throw new SafeToolError(`${operation} failed: Bitbucket returned invalid JSON.`)
  }
}

function normalizePullRequest(value: unknown): PullRequestIdentity {
  const pullRequest = requireRecord(value, "pull request")
  const fromRef = requireRecord(pullRequest.fromRef, "pull request source")
  const toRef = requireRecord(pullRequest.toRef, "pull request target")
  const targetRepository = requireRecord(toRef.repository, "target repository")
  const targetProject = requireRecord(targetRepository.project, "target project")
  return {
    id: requireInteger(pullRequest.id, "pull request id"),
    version: requireInteger(pullRequest.version, "pull request version"),
    state: requireString(pullRequest.state, "pull request state"),
    sourceBranch: requireString(fromRef.displayId, "source branch"),
    sourceHead: requireString(fromRef.latestCommit, "source head"),
    targetProjectKey: requireString(targetProject.key, "target project key"),
    targetRepositorySlug: requireString(targetRepository.slug, "target repository slug"),
    targetBranch: requireString(toRef.displayId, "target branch"),
  }
}

async function findPullRequest(
  baseUrl: URL,
  repository: RepositoryIdentity,
  sourceBranch: string,
  reviewedHead: string,
  config: RequestConfig,
): Promise<PullRequestIdentity> {
  const matches: PullRequestIdentity[] = []
  let branchMatches = 0
  let start = 0
  let paginationCompleted = false
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = apiUrl(
      baseUrl,
      `/rest/api/latest/projects/${encodeURIComponent(repository.projectKey)}` +
        `/repos/${encodeURIComponent(repository.repositorySlug)}/pull-requests`,
    )
    url.searchParams.set("direction", "OUTGOING")
    url.searchParams.set("at", `refs/heads/${sourceBranch}`)
    url.searchParams.set("state", "OPEN")
    url.searchParams.set("start", String(start))
    url.searchParams.set("limit", String(DEFAULT_PAGE_SIZE))

    const payload = requireRecord(
      await requestJson(url, config, "GET", undefined, "Pull-request resolution"),
      "pull request page",
    )
    const values = payload.values
    if (!Array.isArray(values)) {
      throw new SafeToolError("Bitbucket returned an invalid pull request list.")
    }
    for (const value of values) {
      const pullRequest = normalizePullRequest(value)
      if (pullRequest.sourceBranch !== sourceBranch) {
        continue
      }
      branchMatches += 1
      if (pullRequest.sourceHead.toLowerCase() === reviewedHead.toLowerCase()) {
        matches.push(pullRequest)
      }
    }
    if (payload.isLastPage === true) {
      paginationCompleted = true
      break
    }
    const next = payload.nextPageStart
    if (!Number.isSafeInteger(next) || (next as number) <= start) {
      throw new SafeToolError("Bitbucket pull request pagination made no progress.")
    }
    start = next as number
  }

  if (!paginationCompleted) {
    throw new SafeToolError("Bitbucket pull request pagination exceeded the safe page limit.")
  }

  if (matches.length === 1) {
    return matches[0]
  }
  if (matches.length > 1) {
    throw new SafeToolError(
      "More than one open pull request matches the reviewed branch and head revision.",
    )
  }
  if (branchMatches > 0) {
    throw new SafeToolError(
      "The open pull request head differs from the reviewed head revision. Run a new review round before sending comments.",
    )
  }
  throw new SafeToolError("No open pull request matches the reviewed branch.")
}

async function getPullRequest(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  config: RequestConfig,
): Promise<PullRequestIdentity> {
  const url = pullRequestApiUrl(baseUrl, pullRequest)
  return normalizePullRequest(
    await requestJson(url, config, "GET", undefined, "Pull-request state verification"),
  )
}

function pullRequestApiUrl(baseUrl: URL, pullRequest: PullRequestIdentity): URL {
  return apiUrl(
    baseUrl,
    `/rest/api/latest/projects/${encodeURIComponent(pullRequest.targetProjectKey)}` +
      `/repos/${encodeURIComponent(pullRequest.targetRepositorySlug)}` +
      `/pull-requests/${pullRequest.id}`,
  )
}

function encodeRepositoryPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/")
}

function normalizeBitbucketPath(value: unknown, label: string): string {
  const path = requireRecord(value, label)
  return normalizeRepositoryPath(requireString(path.toString, `${label} path`))
}

async function getPullRequestChanges(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  config: RequestConfig,
): Promise<Map<string, PullRequestChange>> {
  const changes = new Map<string, PullRequestChange>()
  let start = 0
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${pullRequestApiUrl(baseUrl, pullRequest).toString()}/changes`)
    url.searchParams.set("start", String(start))
    url.searchParams.set("limit", String(CHANGE_PAGE_SIZE))
    const payload = requireRecord(
      await requestJson(url, config, "GET", undefined, "Pull-request change classification"),
      "pull request changes",
    )
    if (!Array.isArray(payload.values)) {
      throw new SafeToolError("Bitbucket returned an invalid pull request change list.")
    }
    for (const value of payload.values) {
      const change = requireRecord(value, "pull request change")
      const path = normalizeBitbucketPath(change.path, "pull request destination")
      changes.set(path, {
        path,
        ...(change.srcPath === undefined
          ? {}
          : { srcPath: normalizeBitbucketPath(change.srcPath, "pull request source") }),
        type: requireString(change.type, "pull request change type"),
      })
    }
    if (payload.isLastPage === true) {
      return changes
    }
    const next = payload.nextPageStart
    if (!Number.isSafeInteger(next) || (next as number) <= start) {
      throw new SafeToolError(
        "The pull request change list is incomplete, so comment locations cannot be classified safely.",
      )
    }
    start = next as number
  }
  throw new SafeToolError("Bitbucket pull request change pagination exceeded the safe page limit.")
}

async function ensureFileExistsAtHead(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  path: string,
  config: RequestConfig,
): Promise<void> {
  const url = apiUrl(
    baseUrl,
    `/rest/api/latest/projects/${encodeURIComponent(pullRequest.targetProjectKey)}` +
      `/repos/${encodeURIComponent(pullRequest.targetRepositorySlug)}` +
      `/browse/${encodeRepositoryPath(path)}`,
  )
  url.searchParams.set("at", pullRequest.sourceHead)
  url.searchParams.set("start", "0")
  url.searchParams.set("limit", "1")
  const payload = requireRecord(
    await requestJson(url, config, "GET", undefined, "Unchanged-file verification"),
    "repository file",
  )
  if (!Array.isArray(payload.lines)) {
    throw new SafeToolError(
      `Comment path ${path} is unchanged in the pull request but is not a file at the reviewed head revision.`,
    )
  }
}

function pullRequestWebUrl(baseUrl: URL, pullRequest: PullRequestIdentity): string {
  const url = new URL(baseUrl.origin)
  url.pathname =
    `${baseUrl.pathname}/projects/${encodeURIComponent(pullRequest.targetProjectKey)}` +
    `/repos/${encodeURIComponent(pullRequest.targetRepositorySlug)}` +
    `/pull-requests/${pullRequest.id}/overview`
  return url.toString()
}

type DiffLine = {
  path: string
  srcPath?: string
  line: number
  lineType: "ADDED" | "CONTEXT"
}

type ParsedDestinationDiff = {
  lines: Map<string, Map<number, DiffLine>>
  truncated: boolean
}

function isTruncated(value: unknown): boolean {
  return value === true || value === "true"
}

export function parseStructuredDestinationDiffLines(
  value: unknown,
  expectedPath: string,
): ParsedDestinationDiff {
  const payload = requireRecord(value, "pull request file diff")
  if (!Array.isArray(payload.diffs)) {
    throw new SafeToolError("Bitbucket returned an invalid structured file diff.")
  }

  const result = new Map<string, Map<number, DiffLine>>()
  let matched = false
  let truncated = isTruncated(payload.truncated)
  for (const rawDiff of payload.diffs) {
    const diff = requireRecord(rawDiff, "pull request file diff entry")
    truncated ||= isTruncated(diff.truncated)
    if (diff.binary === true) {
      throw new SafeToolError(
        `Comment path ${expectedPath} is binary and cannot receive an inline text comment.`,
      )
    }
    const path = normalizeBitbucketPath(diff.destination, "file diff destination")
    if (path !== expectedPath) {
      continue
    }
    matched = true
    const srcPath =
      diff.source === undefined || diff.source === null
        ? undefined
        : normalizeBitbucketPath(diff.source, "file diff source")
    if (!Array.isArray(diff.hunks)) {
      throw new SafeToolError("Bitbucket returned an invalid file diff hunk list.")
    }
    const destinationLines = result.get(path) ?? new Map<number, DiffLine>()
    for (const rawHunk of diff.hunks) {
      const hunk = requireRecord(rawHunk, "file diff hunk")
      truncated ||= isTruncated(hunk.truncated)
      if (!Array.isArray(hunk.segments)) {
        throw new SafeToolError("Bitbucket returned an invalid file diff segment list.")
      }
      for (const rawSegment of hunk.segments) {
        const segment = requireRecord(rawSegment, "file diff segment")
        truncated ||= isTruncated(segment.truncated)
        const type = requireString(segment.type, "file diff segment type").toUpperCase()
        if (type !== "ADDED" && type !== "CONTEXT") {
          continue
        }
        if (!Array.isArray(segment.lines)) {
          throw new SafeToolError("Bitbucket returned an invalid file diff line list.")
        }
        for (const rawLine of segment.lines) {
          const line = requireRecord(rawLine, "file diff line")
          truncated ||= isTruncated(line.truncated)
          if (!Number.isSafeInteger(line.destination) || (line.destination as number) <= 0) {
            throw new SafeToolError(
              "Bitbucket returned an invalid destination line in the structured file diff.",
            )
          }
          const lineNumber = line.destination as number
          const existing = destinationLines.get(lineNumber)
          if (!existing || type === "ADDED") {
            destinationLines.set(lineNumber, {
              path,
              ...(srcPath && srcPath !== path ? { srcPath } : {}),
              line: lineNumber,
              lineType: type,
            })
          }
        }
      }
    }
    result.set(path, destinationLines)
  }
  if (!matched) {
    throw new SafeToolError(
      `Bitbucket's structured diff did not contain the requested destination path ${expectedPath}.`,
    )
  }
  return { lines: result, truncated }
}

function selectAnchor(
  comment: InlineValidatedComment,
  diffLines: Map<string, Map<number, DiffLine>>,
): InlineAnchor | null {
  const fileLines = diffLines.get(comment.path)
  if (!fileLines) {
    return null
  }

  let selected = fileLines.get(comment.startLine)
  if (!selected) {
    for (let line = comment.startLine; line <= comment.endLine; line += 1) {
      const candidate = fileLines.get(line)
      if (candidate?.lineType === "ADDED") {
        selected = candidate
        break
      }
    }
  }
  if (!selected) {
    for (let line = comment.startLine; line <= comment.endLine; line += 1) {
      const candidate = fileLines.get(line)
      if (candidate) {
        selected = candidate
        break
      }
    }
  }
  if (!selected) {
    return null
  }
  return {
    diffType: "EFFECTIVE",
    path: selected.path,
    ...(selected.srcPath ? { srcPath: selected.srcPath } : {}),
    line: selected.line,
    lineType: selected.lineType,
    fileType: "TO",
  }
}

function expandedContextLines(
  comment: InlineValidatedComment,
  diffLines: Map<string, Map<number, DiffLine>>,
): number {
  const fileLines = diffLines.get(comment.path)
  if (!fileLines || fileLines.size === 0) {
    throw new SafeToolError(
      `Comment ${comment.number} path ${comment.path} has no destination lines in its pull request diff.`,
    )
  }
  let closestDistance = Number.POSITIVE_INFINITY
  for (const line of fileLines.keys()) {
    const distance =
      line < comment.startLine
        ? comment.startLine - line
        : line > comment.endLine
          ? line - comment.endLine
          : 0
    closestDistance = Math.min(closestDistance, distance)
  }
  const requested = closestDistance + INITIAL_DIFF_CONTEXT_LINES + 1
  if (!Number.isSafeInteger(requested) || requested > MAX_DIFF_CONTEXT_LINES) {
    throw new SafeToolError(
      `Comment ${comment.number} requires more diff context than Bitbucket can request safely.`,
    )
  }
  return Math.max(INITIAL_DIFF_CONTEXT_LINES, requested)
}

async function fetchFileDiffLines(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  change: PullRequestChange,
  contextLines: number,
  config: RequestConfig,
): Promise<ParsedDestinationDiff> {
  const url = new URL(
    `${pullRequestApiUrl(baseUrl, pullRequest).toString()}` +
      `/diff/${encodeRepositoryPath(change.path)}`,
  )
  url.searchParams.set("diffType", "EFFECTIVE")
  url.searchParams.set("contextLines", String(contextLines))
  url.searchParams.set("withComments", "false")
  if (change.srcPath) {
    url.searchParams.set("srcPath", change.srcPath)
  }
  const diff = await requestJson(
    url,
    config,
    "GET",
    undefined,
    "Inline-anchor structured diff lookup",
  )
  return parseStructuredDestinationDiffLines(diff, change.path)
}

async function resolveInlineAnchor(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  comment: InlineValidatedComment,
  change: PullRequestChange,
  config: RequestConfig,
): Promise<InlineAnchor> {
  if (change.type.toUpperCase() === "DELETE") {
    throw new SafeToolError(
      `Comment ${comment.number} targets a deleted file and cannot be anchored on the destination side.`,
    )
  }
  const initialDiff = await fetchFileDiffLines(
    baseUrl,
    pullRequest,
    change,
    INITIAL_DIFF_CONTEXT_LINES,
    config,
  )
  const initialAnchor = selectAnchor(comment, initialDiff.lines)
  if (initialAnchor) {
    return initialAnchor
  }
  const expandedDiff = await fetchFileDiffLines(
    baseUrl,
    pullRequest,
    change,
    expandedContextLines(comment, initialDiff.lines),
    config,
  )
  const expandedAnchor = selectAnchor(comment, expandedDiff.lines)
  if (!expandedAnchor) {
    if (expandedDiff.truncated) {
      throw new SafeToolError(
        `Comment ${comment.number} lines ${comment.startLine}-${comment.endLine} are outside Bitbucket's truncated structured file diff.`,
      )
    }
    throw new SafeToolError(
      `Comment ${comment.number} lines ${comment.startLine}-${comment.endLine} cannot be anchored after expanding the changed file diff.`,
    )
  }
  return expandedAnchor
}

function sameAnchor(value: unknown, expected: InlineAnchor): boolean {
  if (!isRecord(value)) {
    return false
  }
  const path =
    typeof value.path === "string"
      ? value.path
      : isRecord(value.path) && typeof value.path.toString === "string"
        ? value.path.toString
        : null
  return (
    path === expected.path &&
    value.line === expected.line &&
    value.lineType === expected.lineType &&
    value.fileType === expected.fileType
  )
}

async function findDuplicateInlineComment(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  prepared: { text: string; anchor: InlineAnchor },
  config: RequestConfig,
): Promise<number | null> {
  let start = 0
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${pullRequestApiUrl(baseUrl, pullRequest).toString()}/comments`)
    url.searchParams.set("path", prepared.anchor.path)
    url.searchParams.set("anchorState", "ALL")
    url.searchParams.append("diffType", "EFFECTIVE")
    url.searchParams.append("state", "OPEN")
    url.searchParams.append("state", "RESOLVED")
    url.searchParams.set("start", String(start))
    url.searchParams.set("limit", String(DEFAULT_PAGE_SIZE))
    const payload = requireRecord(
      await requestJson(
        url,
        config,
        "GET",
        undefined,
        "Inline-comment duplicate preflight",
      ),
      "comment page",
    )
    const values = payload.values
    if (!Array.isArray(values)) {
      throw new SafeToolError("Bitbucket returned an invalid comment list.")
    }
    for (const value of values) {
      if (!isRecord(value)) {
        continue
      }
      if (value.text === prepared.text && sameAnchor(value.anchor, prepared.anchor)) {
        return requireInteger(value.id, "comment id")
      }
    }
    if (payload.isLastPage === true) {
      return null
    }
    const next = payload.nextPageStart
    if (!Number.isSafeInteger(next) || (next as number) <= start) {
      throw new SafeToolError("Bitbucket comment pagination made no progress.")
    }
    start = next as number
  }
  throw new SafeToolError("Bitbucket comment pagination exceeded the safe page limit.")
}

async function findDuplicateGeneralComment(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  text: string,
  config: RequestConfig,
): Promise<number | null> {
  const latestByCommentId = new Map<
    number,
    {
      activityId: number
      createdDate: number
      commentAction: string | null
      comment: JsonRecord
      anchor: unknown
    }
  >()
  let start = 0
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = new URL(`${pullRequestApiUrl(baseUrl, pullRequest).toString()}/activities`)
    url.searchParams.set("start", String(start))
    url.searchParams.set("limit", String(DEFAULT_PAGE_SIZE))
    const payload = requireRecord(
      await requestJson(
        url,
        config,
        "GET",
        undefined,
        "General-comment duplicate preflight",
      ),
      "pull request activity page",
    )
    if (!Array.isArray(payload.values)) {
      throw new SafeToolError("Bitbucket returned an invalid pull request activity list.")
    }
    for (const value of payload.values) {
      if (!isRecord(value) || value.action !== "COMMENTED" || !isRecord(value.comment)) {
        continue
      }
      const commentId = requireInteger(value.comment.id, "comment id")
      const activityId = Number.isSafeInteger(value.id) ? (value.id as number) : -1
      const createdDate = Number.isSafeInteger(value.createdDate)
        ? (value.createdDate as number)
        : -1
      const previous = latestByCommentId.get(commentId)
      if (
        !previous ||
        createdDate > previous.createdDate ||
        (createdDate === previous.createdDate && activityId > previous.activityId)
      ) {
        latestByCommentId.set(commentId, {
          activityId,
          createdDate,
          commentAction:
            typeof value.commentAction === "string" ? value.commentAction : null,
          comment: value.comment,
          anchor: value.commentAnchor,
        })
      }
    }
    if (payload.isLastPage === true) {
      for (const [commentId, activity] of latestByCommentId) {
        if (
          activity.commentAction?.toUpperCase() !== "DELETED" &&
          activity.comment.text === text &&
          (activity.anchor === undefined || activity.anchor === null) &&
          (activity.comment.parent === undefined || activity.comment.parent === null)
        ) {
          return commentId
        }
      }
      return null
    }
    const next = payload.nextPageStart
    if (!Number.isSafeInteger(next) || (next as number) <= start) {
      throw new SafeToolError("Bitbucket activity pagination made no progress.")
    }
    start = next as number
  }
  throw new SafeToolError("Bitbucket activity pagination exceeded the safe page limit.")
}

async function postComment(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  prepared: PreparedComment,
  config: RequestConfig,
): Promise<number> {
  const url = new URL(`${pullRequestApiUrl(baseUrl, pullRequest).toString()}/comments`)
  const response = requireRecord(
    await requestJson(
      url,
      config,
      "POST",
      {
        text: prepared.text,
        ...(prepared.placement === "inline" ? { anchor: prepared.anchor } : {}),
      },
      "Comment publication",
    ),
    "created comment",
  )
  return requireInteger(response.id, "created comment id")
}

function commentWebUrl(prUrl: string, commentId: number): string {
  const url = new URL(prUrl)
  url.hash = `comment-${commentId}`
  return url.toString()
}

function blockedResult(reason: string, numbers: number[]): PublicationResult {
  return {
    schemaVersion: "2",
    status: "blocked",
    pullRequest: null,
    comments: numbers.map((number) => ({
      number,
      placement: null,
      status: "not-attempted",
      commentId: null,
      url: null,
      reason,
    })),
    reason,
  }
}

export async function sendBitbucketComments(args: {
  repositoryUrl: string
  sourceBranch: string
  reviewedHeadRevision: string
  comments: unknown
}): Promise<string> {
  let mutationStarted = false
  let result: PublicationResult | null = null
  let selectedNumbers: number[] = []
  try {
    if (typeof args.repositoryUrl !== "string") {
      throw new SafeToolError("repositoryUrl is required.")
    }
    if (typeof args.sourceBranch !== "string") {
      throw new SafeToolError("sourceBranch is required.")
    }
    if (
      typeof args.reviewedHeadRevision !== "string" ||
      !FULL_REVISION.test(args.reviewedHeadRevision)
    ) {
      throw new SafeToolError("reviewedHeadRevision must be a full Git revision.")
    }
    const comments = validateComments(args.comments)
    selectedNumbers = comments.map((comment) => comment.number)
    const sourceBranch = normalizeBranch(args.sourceBranch)
    const reviewedHead = args.reviewedHeadRevision.toLowerCase()
    const baseUrl = parseBaseUrl(requiredEnv("BITBUCKET_SERVER"))
    const repository = parseRepositoryIdentity(args.repositoryUrl, baseUrl)
    const proxy = buildProxyConfig()
    const config: RequestConfig = {
      token: requiredEnv("BITBUCKET_PAT"),
      ...proxy,
      timeoutMs: positiveIntegerEnv("BITBUCKET_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
      retries: positiveIntegerEnv("BITBUCKET_RETRIES", DEFAULT_RETRIES),
      retryDelayMs: positiveIntegerEnv(
        "BITBUCKET_RETRY_DELAY_MS",
        DEFAULT_RETRY_DELAY_MS,
      ),
      maxResponseBytes: positiveIntegerEnv(
        "BITBUCKET_MAX_RESPONSE_BYTES",
        DEFAULT_MAX_RESPONSE_BYTES,
      ),
    }

    const pullRequest = await findPullRequest(
      baseUrl,
      repository,
      sourceBranch,
      reviewedHead,
      config,
    )
    const current = await getPullRequest(baseUrl, pullRequest, config)
    if (current.state !== "OPEN") {
      throw new SafeToolError(
        "The matching pull request is no longer open. No comments were posted.",
      )
    }
    if (current.sourceBranch !== sourceBranch) {
      throw new SafeToolError(
        "The pull request source branch changed after resolution. No comments were posted.",
      )
    }
    if (current.sourceHead.toLowerCase() !== reviewedHead) {
      throw new SafeToolError(
        "The pull request head changed after the review. Run a new review round before sending comments.",
      )
    }

    const changes = await getPullRequestChanges(baseUrl, current, config)
    const prepared: PreparedComment[] = []
    for (const input of comments) {
      const change = changes.get(input.path)
      if (change) {
        const inlineInput = requireInlineLocation(input)
        const anchor = await resolveInlineAnchor(
          baseUrl,
          current,
          inlineInput,
          change,
          config,
        )
        const text = input.inlineText
        const alreadyPostedId = await findDuplicateInlineComment(
          baseUrl,
          current,
          { text, anchor },
          config,
        )
        prepared.push({
          input: inlineInput,
          placement: "inline",
          text,
          anchor,
          alreadyPostedId,
        })
        continue
      }
      await ensureFileExistsAtHead(baseUrl, current, input.path, config)
      const text = input.fullText
      const alreadyPostedId = await findDuplicateGeneralComment(
        baseUrl,
        current,
        text,
        config,
      )
      prepared.push({ input, placement: "general", text, alreadyPostedId })
    }

    const prUrl = pullRequestWebUrl(baseUrl, current)
    const publicationItems: PublicationItem[] = []
    result = {
      schemaVersion: "2",
      status: "completed",
      pullRequest: {
        projectKey: current.targetProjectKey,
        repositorySlug: current.targetRepositorySlug,
        id: current.id,
        sourceBranch: current.sourceBranch,
        targetBranch: current.targetBranch,
        reviewedHeadRevision: reviewedHead,
        url: prUrl,
      },
      comments: publicationItems,
      reason: null,
    }

    for (let index = 0; index < prepared.length; index += 1) {
      const item = prepared[index]
      if (item.alreadyPostedId !== null) {
        publicationItems.push({
          number: item.input.number,
          placement: item.placement,
          status: "already-posted",
          commentId: item.alreadyPostedId,
          url: commentWebUrl(prUrl, item.alreadyPostedId),
          reason: null,
        })
        continue
      }

      const latest = await getPullRequest(baseUrl, current, config)
      if (
        latest.state !== "OPEN" ||
        latest.sourceBranch !== sourceBranch ||
        latest.sourceHead.toLowerCase() !== reviewedHead
      ) {
        publicationItems.push({
          number: item.input.number,
          placement: item.placement,
          status: "failed",
          commentId: null,
          url: null,
          reason: "The pull request state, source branch or head changed during publication.",
        })
        for (const remaining of prepared.slice(index + 1)) {
          publicationItems.push({
            number: remaining.input.number,
            placement: remaining.placement,
            status: "not-attempted",
            commentId: null,
            url: null,
            reason: "Publication stopped after the pull request changed.",
          })
        }
        result.status = "partial"
        result.reason = "The pull request changed during publication."
        break
      }

      mutationStarted = true
      try {
        const commentId = await postComment(baseUrl, latest, item, config)
        publicationItems.push({
          number: item.input.number,
          placement: item.placement,
          status: "posted",
          commentId,
          url: commentWebUrl(prUrl, commentId),
          reason: null,
        })
      } catch (error) {
        publicationItems.push({
          number: item.input.number,
          placement: item.placement,
          status: "failed",
          commentId: null,
          url: null,
          reason:
            error instanceof SafeToolError
              ? error.message
              : "Bitbucket comment publication failed for an unknown reason.",
        })
        for (const remaining of prepared.slice(index + 1)) {
          publicationItems.push({
            number: remaining.input.number,
            placement: remaining.placement,
            status: "not-attempted",
            commentId: null,
            url: null,
            reason: "Publication stopped after an earlier comment failed.",
          })
        }
        result.status = "partial"
        result.reason = "Bitbucket did not confirm every selected comment."
        break
      }
    }
    return JSON.stringify(result)
  } catch (error) {
    const reason =
      error instanceof SafeToolError
        ? error.message
        : "Bitbucket comment publication failed for an unknown reason."
    if (mutationStarted && result) {
      result.status = "partial"
      result.reason = reason
      return JSON.stringify(result)
    }
    return JSON.stringify(blockedResult(reason, selectedNumbers))
  }
}

// Keep the copied tool self-contained. OpenCode accepts JSON Schema entries
// directly and does not need the @opencode-ai/plugin helper at runtime.
export default {
  description:
    "Post explicitly selected findings as Bitbucket Data Center inline comments for changed files or general pull request comments for unchanged files after complete preflight validation.",
  args: {
    repositoryUrl: {
      type: "string",
      minLength: 1,
      description: "Validated Git remote URL for the repository that owns the reviewed branch",
    },
    sourceBranch: {
      type: "string",
      minLength: 1,
      description: "Normalized source branch from the latest deep-review report",
    },
    reviewedHeadRevision: {
      type: "string",
      pattern: "^[0-9a-fA-F]{40,64}$",
      description: "Full immutable head revision from the latest deep-review report",
    },
    comments: {
      type: "array",
      minItems: 1,
      maxItems: MAX_COMMENTS_PER_REQUEST,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "path", "text"],
        properties: {
          number: { type: "integer", minimum: 1 },
          path: { type: "string", minLength: 1 },
          startLine: {
            type: "integer",
            minimum: 1,
            description:
              "Numeric location start when present in the report; required after classification for changed-file inline placement",
          },
          endLine: {
            type: "integer",
            minimum: 1,
            description:
              "Numeric location end when present in the report; required after classification for changed-file inline placement",
          },
          text: {
            type: "string",
            minLength: 1,
            description:
              "Exact final-report finding block including its Location line",
          },
        },
      },
    },
  },
  async execute(args: {
    repositoryUrl: string
    sourceBranch: string
    reviewedHeadRevision: string
    comments: unknown
  }) {
    return sendBitbucketComments(args)
  },
}
