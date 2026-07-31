const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RETRIES = 3
const DEFAULT_RETRY_DELAY_MS = 5_000
const DEFAULT_PAGE_SIZE = 100
const DEFAULT_MAX_RESPONSE_BYTES = 20_000_000
const MAX_PAGES = 10_000
const MAX_COMMENTS_PER_REQUEST = 50
const MAX_COMMENT_BYTES = 100_000
const FULL_REVISION = /^[0-9a-f]{40,64}$/i
const SAFE_REPOSITORY_PART = /^[A-Za-z0-9._~-]+$/

type JsonRecord = Record<string, unknown>

type CommentInput = {
  number: number
  path: string
  startLine: number
  endLine: number
  text: string
}

type ValidatedComment = CommentInput & {
  path: string
  text: string
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

type InlineAnchor = {
  diffType: "EFFECTIVE"
  path: string
  srcPath?: string
  line: number
  lineType: "ADDED" | "CONTEXT"
  fileType: "TO"
}

type PreparedComment = {
  input: ValidatedComment
  anchor: InlineAnchor
  alreadyPostedId: number | null
}

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
  status: "posted" | "already-posted" | "failed" | "not-attempted"
  commentId: number | null
  url: string | null
  reason: string | null
}

type PublicationResult = {
  schemaVersion: "1"
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

function validateCommentText(number: number, value: string): string {
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
  if (lines.some((line) => line.startsWith("- Location:"))) {
    throw new SafeToolError(`Comment ${number} still contains its Location line.`)
  }
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
    problem !== 2 ||
    fix !== 3 ||
    evidence !== 4 ||
    !lines[problem].startsWith("- Problem and impact: ") ||
    !lines[fix].startsWith("- Suggested fix: ") ||
    !((singleEvidence && lines.length === 5) || evidenceList)
  ) {
    throw new SafeToolError(
      `Comment ${number} does not preserve the final-report finding format.`,
    )
  }
  return text
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
    if (!Number.isSafeInteger(startLine) || (startLine as number) <= 0) {
      throw new SafeToolError(`Comment ${number} requires a positive starting line.`)
    }
    if (
      !Number.isSafeInteger(endLine) ||
      (endLine as number) < (startLine as number) ||
      (endLine as number) - (startLine as number) > 100_000
    ) {
      throw new SafeToolError(`Comment ${number} has an invalid ending line.`)
    }
    if (typeof raw.path !== "string" || typeof raw.text !== "string") {
      throw new SafeToolError(`Comment ${number} requires path and text strings.`)
    }
    return {
      number: number as number,
      path: normalizeRepositoryPath(raw.path),
      startLine: startLine as number,
      endLine: endLine as number,
      text: validateCommentText(number as number, raw.text),
    }
  })
  return comments.sort((left, right) => left.number - right.number)
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

async function requestText(
  url: URL,
  config: RequestConfig,
  method: "GET" | "POST" = "GET",
  body?: unknown,
  accept = "application/json",
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
        throw new SafeToolError(
          `Bitbucket ${method} request failed with HTTP ${response.status}.`,
        )
      }
      return text
    } catch (error) {
      if (error instanceof SafeToolError) {
        throw error
      }
      if (attempt < attempts) {
        clearTimeout(timeout)
        await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs))
        continue
      }
      if (config.proxyHost && isDnsResolutionFailure(error)) {
        throw new SafeToolError(
          `Cannot resolve proxy host ${config.proxyHost}. Check VPN/network DNS or Bitbucket proxy settings.`,
        )
      }
      if (controller.signal.aborted) {
        throw new SafeToolError(
          `Bitbucket request timed out after ${attempts} attempt(s).`,
        )
      }
      throw new SafeToolError(
        `Bitbucket ${method} request failed before a complete response was received.`,
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
): Promise<unknown> {
  const text = await requestText(url, config, method, body)
  try {
    return JSON.parse(text)
  } catch {
    throw new SafeToolError("Bitbucket returned invalid JSON.")
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

    const payload = requireRecord(await requestJson(url, config), "pull request page")
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
  return normalizePullRequest(await requestJson(url, config))
}

function pullRequestApiUrl(baseUrl: URL, pullRequest: PullRequestIdentity): URL {
  return apiUrl(
    baseUrl,
    `/rest/api/latest/projects/${encodeURIComponent(pullRequest.targetProjectKey)}` +
      `/repos/${encodeURIComponent(pullRequest.targetRepositorySlug)}` +
      `/pull-requests/${pullRequest.id}`,
  )
}

function pullRequestWebUrl(baseUrl: URL, pullRequest: PullRequestIdentity): string {
  const url = new URL(baseUrl.origin)
  url.pathname =
    `${baseUrl.pathname}/projects/${encodeURIComponent(pullRequest.targetProjectKey)}` +
    `/repos/${encodeURIComponent(pullRequest.targetRepositorySlug)}` +
    `/pull-requests/${pullRequest.id}/overview`
  return url.toString()
}

function parseDiffPath(header: string): string | null {
  const value = header.slice(4)
  if (value === "/dev/null") {
    return null
  }
  if (value.startsWith('"')) {
    throw new SafeToolError(
      "The Bitbucket diff contains a quoted path that cannot be anchored safely.",
    )
  }
  return value.replace(/^[ab]\//, "")
}

type DiffLine = {
  path: string
  srcPath?: string
  line: number
  lineType: "ADDED" | "CONTEXT"
}

export function parseDestinationDiffLines(diff: string): Map<string, Map<number, DiffLine>> {
  const result = new Map<string, Map<number, DiffLine>>()
  let oldPath: string | null = null
  let newPath: string | null = null
  let newLine = 0
  let inHunk = false

  for (const line of diff.replace(/\r\n/g, "\n").split("\n")) {
    if (!inHunk && line.startsWith("--- ")) {
      oldPath = parseDiffPath(line)
      newPath = null
      inHunk = false
      continue
    }
    if (!inHunk && line.startsWith("+++ ")) {
      newPath = parseDiffPath(line)
      inHunk = false
      continue
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      if (!newPath) {
        throw new SafeToolError("The Bitbucket diff hunk has no destination path.")
      }
      newLine = Number(hunk[1])
      inHunk = true
      continue
    }
    if (!inHunk || !newPath || line.startsWith("\\ No newline")) {
      continue
    }

    if (line.startsWith("+")) {
      const lines = result.get(newPath) ?? new Map<number, DiffLine>()
      lines.set(newLine, {
        path: newPath,
        ...(oldPath && oldPath !== newPath ? { srcPath: oldPath } : {}),
        line: newLine,
        lineType: "ADDED",
      })
      result.set(newPath, lines)
      newLine += 1
      continue
    }
    if (line.startsWith("-")) {
      continue
    }
    if (line.startsWith(" ")) {
      const lines = result.get(newPath) ?? new Map<number, DiffLine>()
      if (!lines.has(newLine)) {
        lines.set(newLine, {
          path: newPath,
          ...(oldPath && oldPath !== newPath ? { srcPath: oldPath } : {}),
          line: newLine,
          lineType: "CONTEXT",
        })
      }
      result.set(newPath, lines)
      newLine += 1
      continue
    }
    inHunk = false
  }
  return result
}

function resolveAnchor(
  comment: ValidatedComment,
  diffLines: Map<string, Map<number, DiffLine>>,
): InlineAnchor {
  const fileLines = diffLines.get(comment.path)
  if (!fileLines) {
    throw new SafeToolError(
      `Comment ${comment.number} path ${comment.path} is not available in the current pull request diff.`,
    )
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
    throw new SafeToolError(
      `Comment ${comment.number} lines ${comment.startLine}-${comment.endLine} cannot be anchored in the current pull request diff.`,
    )
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

function sameAnchor(value: unknown, expected: InlineAnchor): boolean {
  if (!isRecord(value)) {
    return false
  }
  return (
    value.path === expected.path &&
    value.line === expected.line &&
    value.lineType === expected.lineType &&
    value.fileType === expected.fileType
  )
}

async function findDuplicateComment(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  prepared: { input: ValidatedComment; anchor: InlineAnchor },
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
    const payload = requireRecord(await requestJson(url, config), "comment page")
    const values = payload.values
    if (!Array.isArray(values)) {
      throw new SafeToolError("Bitbucket returned an invalid comment list.")
    }
    for (const value of values) {
      if (!isRecord(value)) {
        continue
      }
      if (value.text === prepared.input.text && sameAnchor(value.anchor, prepared.anchor)) {
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

async function postComment(
  baseUrl: URL,
  pullRequest: PullRequestIdentity,
  prepared: PreparedComment,
  config: RequestConfig,
): Promise<number> {
  const url = new URL(`${pullRequestApiUrl(baseUrl, pullRequest).toString()}/comments`)
  const response = requireRecord(
    await requestJson(url, config, "POST", {
      text: prepared.input.text,
      anchor: prepared.anchor,
    }),
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
    schemaVersion: "1",
    status: "blocked",
    pullRequest: null,
    comments: numbers.map((number) => ({
      number,
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

    const diffUrl = new URL(`${pullRequestApiUrl(baseUrl, current).toString()}.diff`)
    const diff = await requestText(diffUrl, config, "GET", undefined, "text/plain")
    const diffLines = parseDestinationDiffLines(diff)
    const prepared: PreparedComment[] = []
    for (const input of comments) {
      const anchor = resolveAnchor(input, diffLines)
      const alreadyPostedId = await findDuplicateComment(
        baseUrl,
        current,
        { input, anchor },
        config,
      )
      prepared.push({ input, anchor, alreadyPostedId })
    }

    const prUrl = pullRequestWebUrl(baseUrl, current)
    const publicationItems: PublicationItem[] = []
    result = {
      schemaVersion: "1",
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
          status: "failed",
          commentId: null,
          url: null,
          reason: "The pull request state, source branch or head changed during publication.",
        })
        for (const remaining of prepared.slice(index + 1)) {
          publicationItems.push({
            number: remaining.input.number,
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
          status: "posted",
          commentId,
          url: commentWebUrl(prUrl, commentId),
          reason: null,
        })
      } catch (error) {
        publicationItems.push({
          number: item.input.number,
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
    "Post an explicitly selected batch of numbered findings from the latest deep-review report as Bitbucket Data Center inline comments after validating the repository, pull request head and diff anchors.",
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
        required: ["number", "path", "startLine", "endLine", "text"],
        properties: {
          number: { type: "integer", minimum: 1 },
          path: { type: "string", minLength: 1 },
          startLine: { type: "integer", minimum: 1 },
          endLine: { type: "integer", minimum: 1 },
          text: {
            type: "string",
            minLength: 1,
            description:
              "Exact final-report finding block with only its Location line removed",
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
