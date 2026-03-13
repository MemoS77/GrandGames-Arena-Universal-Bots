export type GameConf = {
  engineKind: 'uci' | 'gomocup'
  command: string
  initCommands?: string[]
}

export type AppConf = {
  token: string
  server: string
  maxTableLiveTime?: number
  reconnectTimeout?: number
  games: Record<string, GameConf>
}

export type ChessPos = { fen: string; lastMove: string | null }
