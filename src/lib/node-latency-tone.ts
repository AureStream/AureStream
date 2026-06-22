export type NodeLatencyTone = {
  tone: "success" | "warning" | "danger"
  text: string
  dot: string
}

export function getNodeLatencyTone(ms: number): NodeLatencyTone {
  if (ms <= 300) {
    return { tone: "success", text: "text-success", dot: "bg-success" }
  }

  if (ms <= 800) {
    return { tone: "warning", text: "text-warning", dot: "bg-warning" }
  }

  return { tone: "danger", text: "text-danger", dot: "bg-danger" }
}
