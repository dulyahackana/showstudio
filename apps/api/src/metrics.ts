/** Tiny Prometheus text-format registry (counters + callback gauges). */
type Labels = Record<string, string>

const fmtLabels = (labels: Labels) => {
  const entries = Object.entries(labels)
  return entries.length ? `{${entries.map(([k, v]) => `${k}="${v.replaceAll('"', '\\"')}"`).join(',')}}` : ''
}

export class Metrics {
  private readonly counters = new Map<
    string,
    { help: string; values: Map<string, { labels: Labels; value: number }> }
  >()
  private readonly gauges = new Map<string, { help: string; collect: () => { labels: Labels; value: number }[] }>()

  counter(name: string, help: string) {
    const series = new Map<string, { labels: Labels; value: number }>()
    this.counters.set(name, { help, values: series })
    return (labels: Labels = {}, by = 1) => {
      const key = fmtLabels(labels)
      const cur = series.get(key) ?? { labels, value: 0 }
      cur.value += by
      series.set(key, cur)
    }
  }

  gauge(name: string, help: string, collect: () => { labels: Labels; value: number }[]) {
    this.gauges.set(name, { help, collect })
  }

  render(): string {
    const lines: string[] = []
    for (const [name, { help, values }] of this.counters) {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} counter`)
      for (const { labels, value } of values.values()) lines.push(`${name}${fmtLabels(labels)} ${value}`)
    }
    for (const [name, { help, collect }] of this.gauges) {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} gauge`)
      for (const { labels, value } of collect()) lines.push(`${name}${fmtLabels(labels)} ${value}`)
    }
    return `${lines.join('\n')}\n`
  }
}
