import { Worker } from 'worker_threads'
import path from 'path'
import { fileURLToPath } from 'url'
import { IEngine } from './IEngine'
import { BotTableInfo } from '../types/types'
import dLog from '../utils/dLog'
import { MAX_THINK_TIME } from '../conf'

const PING_DELAY = 500
const MIN_THINK_TIME = 500

type PendingMove = {
  resolve: (move: string | string[]) => void
  reject: (err: Error) => void
}

export default class ArenaGamesEngine implements IEngine {
  private worker: Worker | null = null
  private pending = new Map<number, PendingMove>()
  private nextId = 0
  private onProcessDeath: (() => void) | null = null
  private maxPlayers = 2
  private gameId = 0

  setGameId(id: number) {
    this.gameId = id
  }

  async start(
    engineCommand: string,
    _initCommands?: string[],
    _sendMessage?: (tableId: number, message: string) => void,
    onProcessDeath?: () => void,
  ): Promise<void> {
    this.onProcessDeath = onProcessDeath ?? null

    const enginePath = path.resolve(engineCommand)
    const workerPath = path.join(
      fileURLToPath(import.meta.url),
      '..',
      'arenaEngineWorker.js',
    )

    dLog(`ArenaGamesEngine: starting worker for ${enginePath}`)

    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: { enginePath, gameId: this.gameId },
      })

      worker.on('message', (msg) => {
        switch (msg.type) {
          case 'ready':
            this.worker = worker
            resolve()
            break

          case 'initError':
            reject(new Error(`ArenaEngine init failed: ${msg.error}`))
            break

          case 'result': {
            const entry = this.pending.get(msg.id)
            if (entry) {
              this.pending.delete(msg.id)
              entry.resolve(msg.result)
            }
            break
          }

          case 'error': {
            const entry = this.pending.get(msg.id)
            if (entry) {
              this.pending.delete(msg.id)
              entry.reject(new Error(msg.error))
            }
            break
          }
        }
      })

      worker.on('error', (err) => {
        dLog(`ArenaGamesEngine worker error: ${err}`)
        reject(err)
      })

      worker.on('exit', (code) => {
        dLog(`ArenaGamesEngine worker exited with code ${code}`)
        this.worker = null
        this.rejectAllPending(new Error('Engine worker exited'))
        if (this.onProcessDeath) {
          this.onProcessDeath()
          this.onProcessDeath = null
        }
      })
    })
  }

  getBestMove(
    _tableInfo: BotTableInfo,
    pos: any,
    player: number,
    fixedTime?: number,
    whiteTime?: number,
    blackTime?: number,
  ): Promise<string | string[]> {
    if (!this.worker) {
      return Promise.reject(new Error('Engine not started'))
    }

    let thinkTimeLimit = 1000
    if (fixedTime) {
      const pTime = (player === 1 ? blackTime : whiteTime) ?? 0
      thinkTimeLimit = Math.min(
        Math.max(pTime - PING_DELAY, MIN_THINK_TIME),
        MAX_THINK_TIME,
      )
    } else if (whiteTime !== undefined && blackTime !== undefined) {
      const pTime = player === 0 ? whiteTime : blackTime
      thinkTimeLimit = Math.max(pTime - PING_DELAY, MIN_THINK_TIME)
    }

    const players =
      _tableInfo.players ??
      Array.from({ length: this.maxPlayers }, (_, i) => (i === player ? 1 : 0))

    const id = this.nextId++

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({
        type: 'getBestMove',
        id,
        position: pos,
        player,
        players,
        thinkTimeLimit,
        maxPlayers: this.maxPlayers,
      })
    })
  }

  kill(): void {
    dLog('ArenaGamesEngine kill called')
    this.rejectAllPending(new Error('Engine killed'))

    if (this.onProcessDeath) {
      this.onProcessDeath()
      this.onProcessDeath = null
    }

    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
  }

  private rejectAllPending(err: Error): void {
    this.pending.forEach(({ reject }) => reject(err))
    this.pending.clear()
  }
}
