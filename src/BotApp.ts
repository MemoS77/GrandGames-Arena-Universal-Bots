import {
  gamesConf,
  JWT_TOKEN,
  LOOP_INTERVAL,
  MAX_SEARCH_MOVE_RESTART,
  MAX_TABLE_LIVE_TIME,
  RECONNECT_TIMEOUT,
} from './conf'
// @ts-ignore
import BotSDK from './sdk/arena-bot-sdk'
import { IEngine } from './engines/IEngine'
import UciEngine from './engines/UciEngine'
import { GamesIds, GamesNames, TableState } from './types/enums'
import GomocupEngine from './engines/GomocupEngine'
import { IBotSDK, PositionInfo } from './sdk/IBotSDK.js'
import dLog from './funcs/dLog'
import { ChessPos } from './types/types'

type EngineInfo = {
  engine: IEngine
  nowThinkMove: number | null
  lastMoveTime: number
}

export default class BotApp {
  private sdk: IBotSDK = new BotSDK()
  private uid: number = 0
  private login: string = ''
  private connected: boolean = false
  private engines: Map<number, EngineInfo> = new Map()

  private getSupportedGames(): number[] {
    return Object.keys(gamesConf).map((key) => GamesIds[key])
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
            this.engines.delete(key)
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
        dLog(`Try connect`)
        this.sdk
          .connect(JWT_TOKEN, { games })
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
      dLog('Pos: ', data)
      const id: number = +data.tableId
      let ei = this.engines.get(id)

      if (data.state === TableState.Started) {
        // Game launched
        if (!ei) {
          let engine: IEngine
          try {
            engine = await this.prepareEngine(data.game)
          } catch (err: Error | any) {
            console.error(err.message)
            return
          }
          ei = {
            engine,
            nowThinkMove: null,
            lastMoveTime: new Date().getTime(),
          }
          this.engines.set(id, ei)
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
            }
          } while (!successMove && tryNumber < MAX_SEARCH_MOVE_RESTART)
        }
      } else {
        // Remove Table
        if (ei) {
          ei.engine.kill()
          this.engines.delete(id)
        }
      }
    })
  }

  private async prepareEngine(gameId: number): Promise<IEngine> {
    dLog(`Prepare engine for game ${gameId}`)
    const gameName = GamesNames[gameId]
    if (!gameName) throw new Error(`Unknown game ${gameId}`)
    const conf = gamesConf[gameName]
    if (!conf) throw new Error(`Game ${gameName} not supported`)

    let engine: IEngine
    const command = conf.command

    const messageFn = (tableId: number, message: string) => {
      this.sdk.message(tableId, message)
    }

    switch (conf.engineKind) {
      case 'uci':
        engine = new UciEngine()
        await engine.start(command, conf.initCommands, messageFn)
        return engine
      case 'gomocup':
        engine = new GomocupEngine()
        await engine.start(command, conf.initCommands, messageFn)
        return engine
      default:
        throw new Error(`Enginekind ${conf.engineKind} not supported`)
    }
  }
}
