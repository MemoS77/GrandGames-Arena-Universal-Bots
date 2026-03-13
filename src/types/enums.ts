export enum TableState {
  Empty = 0,
  Started = 1,
  Finished = 2,
  Canceled = 3,
}

export enum GameId {
  ClassicChess = 1,
  AntiChess = 2,
  TriceChess = 3,
  Crazyhouse = 4,
  JanusChess = 5,
  LosAlamosChess = 6,
  Chess960 = 7,
  ChancellorChess = 8,
  MiniGomoku = 9,
  Gomoku = 10,
  Connect6 = 11,
}

export const GamesNames: Record<number, string> = {
  [GameId.ClassicChess]: 'chess',
  [GameId.AntiChess]: 'antichess',
  [GameId.JanusChess]: 'januschess',
  [GameId.LosAlamosChess]: 'losalamoschess',
  [GameId.TriceChess]: 'tricechess',
  [GameId.Crazyhouse]: 'crazyhouse',
  [GameId.Chess960]: 'chess960',
  [GameId.ChancellorChess]: 'chancellor',
  [GameId.MiniGomoku]: 'fiveinrow',
  [GameId.Gomoku]: 'gomoku',
  [GameId.Connect6]: 'connect6',
}

export const GamesIds: Record<string, GameId> = {
  chess: GameId.ClassicChess,
  antichess: GameId.AntiChess,
  januschess: GameId.JanusChess,
  losalamoschess: GameId.LosAlamosChess,
  tricechess: GameId.TriceChess,
  crazyhouse: GameId.Crazyhouse,
  chess960: GameId.Chess960,
  chancellor: GameId.ChancellorChess,
  fiveinrow: GameId.MiniGomoku,
  connect6: GameId.Connect6,
  gomoku: GameId.Gomoku,
}
