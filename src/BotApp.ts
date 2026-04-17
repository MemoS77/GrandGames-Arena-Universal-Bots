import {
  gamesConf,
  JWT_TOKEN,
  LOOP_INTERVAL,
  MAX_SEARCH_MOVE_RESTART,
  MAX_TABLE_LIVE_TIME,
  RECONNECT_TIMEOUT,
  WS_SERVER,
} from './conf'

import { IEngine } from './engines/IEngine'
import UciEngine from './engines/UciEngine'
import { GameNames, GamesIds, TableState } from './types/enums'
import GomocupEngine from './engines/GomocupEngine'

import dLog from './utils/dLog'
import { ChessPos } from './types/types'
import { BotSDK, GameId, PositionInfo } from 'gga-bots'
import Connect6Engine from './engines/Connect6Engine'

type EngineInfo = {
  engine: IEngine
  nowThinkMove: number | null
  lastMoveTime: number
}

export default class BotApp {
  private sdk = new BotSDK()
  private uid: number = 0
  private login: string = ''
  private connected: boolean = false
  private engines: Map<number, EngineInfo> = new Map()
  private engineCreationLocks: Set<number> = new Set()

  private getSupportedGames(): number[] {
    return Object.keys(gamesConf).map((key) => {
      if (!(key in GamesIds)) {
        throw new Error(`Game ${key} not found in GamesIds`)
      }
      return GamesIds[key]
    })
  }

  async start(): Promise<void> {
    this.listenPos()
    this.startLoop()
    await this.connect()
    this.sdk.onDisconnect((code) => {
      this.connected = false
      console.log('Disconnected', code)
      setTimeout(() => {
        this.connect()
      }, RECONNECT_TIMEOUT)
    })
  }

  private startLoop() {
    setInterval(() => {
      if (this.connected) {
        const nowTime = new Date().getTime()
        this.engines.forEach((ei, key) => {
          // Prevent having many processes
          if (nowTime - ei.lastMoveTime > MAX_TABLE_LIVE_TIME) {
            console.log('HARD KILL', key)
            ei.engine.kill()
            // Don't delete here - onProcessDeath callback will handle it
          }
        })
      }
    }, LOOP_INTERVAL)
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve()
      }

      const doConnect = () => {
        const games = this.getSupportedGames()
        dLog(`Try connect. Games: ${games.join(', ')}`)
        this.sdk
          .connect(JWT_TOKEN, games as GameId[], { serverUrl: WS_SERVER })
          .then((r) => {
            dLog('Connected! User data: ', r)
            this.connected = true
            this.uid = r.uid
            this.login = r.login
            resolve()
          })
          .catch((e) => {
            console.error(e)
            setTimeout(() => doConnect(), RECONNECT_TIMEOUT)
          })
      }

      doConnect()
    })
  }

  public async listenPos(): Promise<void> {
    this.sdk.onPosition(async (data: PositionInfo<ChessPos>) => {
      //dLog('Pos: ', data)
      const id: number = +data.tableId
      let ei = this.engines.get(id)

      if (data.state === TableState.Started) {
        // Game launched
        if (!ei) {
          // Prevent race condition - check if engine is being created
          if (this.engineCreationLocks.has(id)) {
            console.log(
              `Engine for table ${id} is already being created, skipping`,
            )
            return
          }

          this.engineCreationLocks.add(id)
          let engine: IEngine
          try {
            engine = await this.prepareEngine(data.game, id)
          } catch (err: Error | any) {
            console.error(err.message)
            this.engineCreationLocks.delete(id)
            return
          }

          ei = {
            engine,
            nowThinkMove: null,
            lastMoveTime: new Date().getTime(),
          }
          this.engines.set(id, ei)
          this.engineCreationLocks.delete(id)
        }

        if (!ei.nowThinkMove && data.needMove) {
          ei.nowThinkMove = data.moveNumber

          let successMove = false
          const initTime = new Date().getTime()
          let tryNumber = 0
          do {
            try {
              successMove = false
              const timeDec = new Date().getTime() - initTime
              const move = await ei.engine.getBestMove(
                {
                  id: id,
                  enemyLogin: data.players[data.botIndex === 0 ? 1 : 0]!.login,
                  enemyRating:
                    data.players[data.botIndex === 0 ? 1 : 0]!.rating,
                },
                data.position,
                data.botIndex!,
                data.fixedMoveTime ? 1 : 0,
                data.players[0]!.time - (data.botIndex !== 0 ? 0 : timeDec),
                data.players[1]!.time - (data.botIndex !== 1 ? 0 : timeDec),
              )

              if (this.connected) {
                await this.sdk.move(id, move)
                successMove = true
                ei.lastMoveTime = new Date().getTime()
                ei.nowThinkMove = null
              }
            } catch (err) {
              tryNumber++
              console.error('Move handle error. Restart analize!', err)

              // If engine is dead, remove it and break
              if (err instanceof Error && err.message === 'Engine killed') {
                console.error('Engine is dead, removing from map')
                this.engines.delete(id)
                break
              }
            }
          } while (!successMove && tryNumber < MAX_SEARCH_MOVE_RESTART)

          // Reset nowThinkMove if all attempts failed
          if (!successMove && ei.nowThinkMove !== null) {
            console.error(
              `Failed to make move after ${tryNumber} attempts, resetting nowThinkMove`,
            )
            ei.nowThinkMove = null
          }
        }
      } else {
        // Remove Table
        if (ei) {
          ei.engine.kill()
          // Don't delete here - onProcessDeath callback will handle it
        }
      }
    })
  }

  private async prepareEngine(
    gameId: number,
    tableId: number,
  ): Promise<IEngine> {
    dLog(`Prepare engine for game ${gameId}`)
    const gameName = GameNames[gameId]
    if (!gameName) throw new Error(`Unknown game ${gameId}`)
    const conf = gamesConf[gameName]
    if (!conf) throw new Error(`Game ${gameName} not supported`)

    let engine: IEngine
    const command = conf.command

    const messageFn = (tableId: number, message: string) => {
      this.sdk.message(tableId, message)
    }

    const onProcessDeath = () => {
      dLog(`Engine process died for table ${tableId}, cleaning up`)
      this.engines.delete(tableId)
    }

    switch (conf.engineKind) {
      case 'connect6':
        engine = new Connect6Engine()
        await engine.start(
          command,
          conf.initCommands,
          messageFn,
          onProcessDeath,
        )
        return engine
      case 'uci':
        engine = new UciEngine()
        await engine.start(
          command,
          conf.initCommands,
          messageFn,
          onProcessDeath,
        )
        return engine
      case 'gomocup':
        engine = new GomocupEngine()
        await engine.start(
          command,
          conf.initCommands,
          messageFn,
          onProcessDeath,
        )
        return engine
      default:
        throw new Error(`Enginekind ${conf.engineKind} not supported`)
    }
  }
}
