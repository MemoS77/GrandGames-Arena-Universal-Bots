export interface IEngine {
  // Run engine and prepare for game
  start(engine: string, initCommands?: string[]): Promise<void>

  // Get move for position
  getBestMove(
    pos: any,
    player: number,
    fixedTime?: number,
    whiteTime?: number,
    blackTime?: number,
  ): Promise<string>

  // Kill and clear memory
  kill(): void
}
