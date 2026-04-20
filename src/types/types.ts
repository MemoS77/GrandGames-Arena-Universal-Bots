export type GameConf = {
  engineKind: string
  command: string
  initCommands?: string[]
}

export type AppConf = {
  maxTables: number
  token: string
  server: string
  maxTableLiveTime?: number
  reconnectTimeout?: number
  games: Record<string, GameConf>
  maxThinkTime?: number
  allowGuests?: boolean
  allowBots?: boolean
  allowTrain?: boolean
}

export type ChessPos = { fen: string; lastMove: string | null }

export type BotTableInfo = {
  id?: number
  enemyLogin?: string
  enemyRating?: number
  players?: Array<number | null>
}
