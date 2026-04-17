import { BotTableInfo } from '../types/types'

export interface IEngine {
  // Run engine and prepare for game
  start(
    engine: string,
    initCommands?: string[],
    sendMessage?: (tableId: number, message: string) => void,
    onProcessDeath?: () => void,
  ): Promise<void>

  // Get move for position
  getBestMove(
    tableInfo: BotTableInfo,
    pos: any,
    player: number,
    fixedTime?: number,
    whiteTime?: number,
    blackTime?: number,
  ): Promise<string | string[]>

  // Kill and clear memory
  kill(): void
}
