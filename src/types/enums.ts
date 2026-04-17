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
  Reversi = 12,
  Pente = 13,
  RPS = 14,
  FRC = 15,
  RuDraughts = 16,
  LosingDraughts = 17,
  Checkers = 18,
  InternationalDraughts = 19,
  CanadianCheckers = 20,
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
  reversi: GameId.Reversi,
  pente: GameId.Pente,
  rps: GameId.RPS,
  islands: GameId.FRC,
  rudraughts: GameId.RuDraughts,
  losingdraughts: GameId.LosingDraughts,
  checkers: GameId.Checkers,
  internationaldraughts: GameId.InternationalDraughts,
  canadiancheckers: GameId.CanadianCheckers,
  gomoku: GameId.Gomoku,
}

export const GameNames = Object.fromEntries(
  Object.entries(GamesIds).map(([key, value]) => [value, key]),
) as Record<number, string>
