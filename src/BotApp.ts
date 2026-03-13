import {
  gamesConf,
  JWT_TOKEN,
  LOOP_INTERVAL,
  MAX_SEARCH_MOVE_RESTART,
  MAX_TABLE_LIVE_TIME,
  RECONNECT_TIMEOUT,
  WS_SERVER,
} from './conf'
// @ts-ignore
import BotSDK from './sdk/arena-bot-node-sdk.js'
import { IEngine } from './engines/IEngine'
import UciEngine from './engines/UciEngine'
import { GamesIds, GamesNames, TableState } from './types/enums'
import GomocupEngine from './engines/GomocupEngine'
import { IBotSDK } from './sdk/IBotSDK.js'

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
        console.log(`Try connect to ${WS_SERVER}`, games)
        this.sdk
          .connect(JWT_TOKEN, { games })
          .then((r) => {
            console.info('Connected! User data: ', r)
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
    this.sdk.onPosition(async (data: any) => {
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

        if (!ei.nowThinkMove && data.activePlayerIndex === data.botIndex) {
          ei.nowThinkMove = data.moveNumber

          let successMove = false
          const initTime = new Date().getTime()
          let tryNumber = 0
          do {
            try {
              successMove = false
              const timeDec = new Date().getTime() - initTime
              const move = await ei.engine.getBestMove(
                data.position,
                data.botIndex,
                data.fixedMoveTime,
                data.playersTime[0] - (data.botIndex !== 0 ? 0 : timeDec),
                data.playersTime[1] - (data.botIndex !== 1 ? 0 : timeDec),
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
    const gameName = GamesNames[gameId]
    if (!gameName) throw new Error(`Unknown game ${gameId}`)
    const conf = gamesConf[gameName]
    if (!conf) throw new Error(`Game ${gameName} not supported`)

    let engine: IEngine
    const command = conf.command
    switch (conf.engineKind) {
      case 'uci':
        engine = new UciEngine()
        await engine.start(command, conf.initCommands)
        return engine
      case 'gomocup':
        engine = new GomocupEngine()
        await engine.start(command, conf.initCommands)
        return engine
      default:
        throw new Error(`Enginekind ${conf.engineKind} not supported`)
    }
  }
}
