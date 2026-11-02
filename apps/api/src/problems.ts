import type { Issue } from '@studio/schema'

/** An error that renders as RFC 9457 problem details. */
export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    readonly title: string,
    readonly extra: { detail?: string; issues?: Issue[]; reasons?: string[] } = {},
  ) {
    super(extra.detail ?? title)
  }

  toJSON() {
    return { type: this.type, title: this.title, status: this.status, ...this.extra }
  }
}

export const problems = {
  badRequest: (detail: string, issues?: Issue[]) =>
    new HttpProblem(400, 'bad-request', 'Bad request', { detail, ...(issues ? { issues } : {}) }),
  unauthorized: (detail = 'Sign in required') => new HttpProblem(401, 'unauthorized', 'Unauthorized', { detail }),
  forbidden: (detail: string) => new HttpProblem(403, 'forbidden', 'Forbidden', { detail }),
  notFound: (detail: string) => new HttpProblem(404, 'not-found', 'Not found', { detail }),
  conflict: (detail: string, reasons?: string[]) =>
    new HttpProblem(409, 'conflict', 'Conflict', { detail, ...(reasons ? { reasons } : {}) }),
  precondition: (detail: string, reasons: string[]) =>
    new HttpProblem(409, 'precondition-failed', 'Precondition failed', { detail, reasons }),
  validation: (issues: Issue[]) =>
    new HttpProblem(422, 'validation-failed', 'Validation failed', {
      detail: `${issues.filter((i) => i.severity === 'error').length} error(s) must be fixed first`,
      issues,
    }),
  unsupported: (detail: string) => new HttpProblem(415, 'unsupported-media-type', 'Unsupported media type', { detail }),
}
