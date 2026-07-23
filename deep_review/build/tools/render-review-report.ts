const SEVERITIES = ["Critical", "Major", "Minor"] as const
type Severity = (typeof SEVERITIES)[number]

type Finding = {
  severity: Severity
  title: string
  location: {
    file: string
    lines: string
    symbol: string
  }
  problem: string
  impact: string
  suggestedFix: string
  evidence: string[]
  sourceLayers: Array<
    "solution-and-architecture" | "unit-correctness" | "code-polish"
  >
}

export type ReviewResult = {
  schemaVersion: "1"
  summary: {
    reviewTarget: string
    description: string
    baseRevision: string
    headRevision: string
    limitations: string[]
  }
  findings: Finding[]
}

function requireText(value: string, label: string): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (!normalized) {
    throw new Error(`${label} must not be empty.`)
  }
  return normalized
}

function optionalText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_[\]<>#+.!|{}()-])/g, "\\$1")
}

function codeSpan(value: string): string {
  const normalized = requireText(value, "code span")
  const runs = normalized.match(/`+/g) ?? []
  const fenceLength = Math.max(1, ...runs.map((run) => run.length + 1))
  const fence = "`".repeat(fenceLength)
  const padding =
    normalized.startsWith("`") || normalized.endsWith("`") ? " " : ""
  return `${fence}${padding}${normalized}${padding}${fence}`
}

function lineSortValue(lines: string): number {
  const match = lines.match(/\d+/)
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER
}

function compareFindings(left: Finding, right: Finding): number {
  return (
    left.location.file.localeCompare(right.location.file) ||
    lineSortValue(left.location.lines) - lineSortValue(right.location.lines) ||
    left.location.lines.localeCompare(right.location.lines) ||
    left.location.symbol.localeCompare(right.location.symbol) ||
    left.title.localeCompare(right.title)
  )
}

function validateReview(review: ReviewResult): void {
  if (review.schemaVersion !== "1") {
    throw new Error("Unsupported review schemaVersion.")
  }

  requireText(review.summary.reviewTarget, "summary.reviewTarget")
  requireText(review.summary.description, "summary.description")
  requireText(review.summary.baseRevision, "summary.baseRevision")
  requireText(review.summary.headRevision, "summary.headRevision")
  review.summary.limitations.forEach((value, index) =>
    requireText(value, `summary.limitations[${index}]`),
  )

  review.findings.forEach((finding, index) => {
    requireText(finding.title, `findings[${index}].title`)
    requireText(finding.location.file, `findings[${index}].location.file`)
    requireText(finding.problem, `findings[${index}].problem`)
    requireText(finding.impact, `findings[${index}].impact`)
    requireText(finding.suggestedFix, `findings[${index}].suggestedFix`)
    if (finding.evidence.length === 0) {
      throw new Error(`findings[${index}].evidence must not be empty.`)
    }
    finding.evidence.forEach((value, evidenceIndex) =>
      requireText(value, `findings[${index}].evidence[${evidenceIndex}]`),
    )
    if (finding.sourceLayers.length === 0) {
      throw new Error(`findings[${index}].sourceLayers must not be empty.`)
    }
  })
}

function renderLocation(finding: Finding): string {
  const lines = optionalText(finding.location.lines)
  const symbol = optionalText(finding.location.symbol)
  const path = lines
    ? `${requireText(finding.location.file, "location.file")}:${lines}`
    : requireText(finding.location.file, "location.file")
  return symbol ? `${codeSpan(path)} (${codeSpan(symbol)})` : codeSpan(path)
}

function renderFinding(finding: Finding): string[] {
  const lines = [
    `### ${escapeMarkdown(requireText(finding.title, "finding.title"))}`,
    "",
    `- Location: ${renderLocation(finding)}`,
    `- Problem and impact: ${escapeMarkdown(requireText(finding.problem, "finding.problem"))} ${escapeMarkdown(requireText(finding.impact, "finding.impact"))}`,
    `- Suggested fix: ${escapeMarkdown(requireText(finding.suggestedFix, "finding.suggestedFix"))}`,
  ]

  if (finding.evidence.length === 1) {
    lines.push(
      `- Evidence: ${escapeMarkdown(requireText(finding.evidence[0], "finding.evidence"))}`,
    )
  } else {
    lines.push("- Evidence:")
    for (const evidence of finding.evidence) {
      lines.push(`  - ${escapeMarkdown(requireText(evidence, "finding.evidence"))}`)
    }
  }

  return lines
}

export function renderReviewReport(review: ReviewResult): string {
  validateReview(review)

  const lines = [
    "# Review summary",
    "",
    escapeMarkdown(requireText(review.summary.description, "summary.description")),
    "",
    `Review target: ${codeSpan(review.summary.reviewTarget)} ` +
      `(${codeSpan(review.summary.baseRevision)} → ${codeSpan(review.summary.headRevision)}).`,
  ]

  if (review.summary.limitations.length > 0) {
    lines.push("", "Limitations:")
    for (const limitation of review.summary.limitations) {
      lines.push(`- ${escapeMarkdown(requireText(limitation, "summary limitation"))}`)
    }
  }

  if (review.findings.length === 0) {
    lines.push("", "No issues found.")
    return `${lines.join("\n")}\n`
  }

  for (const severity of SEVERITIES) {
    const findings = review.findings
      .filter((finding) => finding.severity === severity)
      .sort(compareFindings)
    if (findings.length === 0) {
      continue
    }

    lines.push("", `## ${severity}`)
    for (const finding of findings) {
      lines.push("", ...renderFinding(finding))
    }
  }

  return `${lines.join("\n")}\n`
}

const nonEmptyTextSchema = {
  type: "string",
  minLength: 1,
} as const
const layerSchema = {
  type: "string",
  enum: ["solution-and-architecture", "unit-correctness", "code-polish"],
} as const

// Keep the copied tool self-contained: OpenCode also accepts JSON Schema entries
// directly and does not need the @opencode-ai/plugin helper at runtime.
export default {
  description:
    "Validate and deterministically render a verified, deduplicated deep-review result as stable severity-prioritized Markdown.",
  args: {
    review: {
      type: "object",
      description: "Verified and deduplicated review result",
      additionalProperties: false,
      required: ["schemaVersion", "summary", "findings"],
      properties: {
        schemaVersion: {
          type: "string",
          const: "1",
        },
        summary: {
          type: "object",
          additionalProperties: false,
          required: [
            "reviewTarget",
            "description",
            "baseRevision",
            "headRevision",
            "limitations",
          ],
          properties: {
            reviewTarget: nonEmptyTextSchema,
            description: nonEmptyTextSchema,
            baseRevision: nonEmptyTextSchema,
            headRevision: nonEmptyTextSchema,
            limitations: {
              type: "array",
              items: nonEmptyTextSchema,
            },
          },
        },
        findings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "severity",
              "title",
              "location",
              "problem",
              "impact",
              "suggestedFix",
              "evidence",
              "sourceLayers",
            ],
            properties: {
              severity: {
                type: "string",
                enum: SEVERITIES,
              },
              title: nonEmptyTextSchema,
              location: {
                type: "object",
                additionalProperties: false,
                required: ["file", "lines", "symbol"],
                properties: {
                  file: nonEmptyTextSchema,
                  lines: {
                    type: "string",
                  },
                  symbol: {
                    type: "string",
                  },
                },
              },
              problem: nonEmptyTextSchema,
              impact: nonEmptyTextSchema,
              suggestedFix: nonEmptyTextSchema,
              evidence: {
                type: "array",
                minItems: 1,
                items: nonEmptyTextSchema,
              },
              sourceLayers: {
                type: "array",
                minItems: 1,
                items: layerSchema,
              },
            },
          },
        },
      },
    },
  },
  async execute({ review }: { review: ReviewResult }) {
    return renderReviewReport(review)
  },
}
