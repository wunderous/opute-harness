declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * UI-only assemble diagnostic. Log-only (not a chat surface node).
     * One append per stage so Trajectory can identity each row by seq.
     */
    'opute/execution-trace': {
      turn: number
      events: ReadonlyArray<{
        stage: string
        label: string
        detail?: string
        data?: Record<string, unknown>
      }>
    }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    oputeTrace: {
      turns: Record<string, { events: readonly unknown[] }>
      latestTurn: number
    }
  }
  interface SessionProjectionMap {
    oputeTrace: SessionProjectionStateMap['oputeTrace']
  }
}
