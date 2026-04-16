import { ChildProcessWithoutNullStreams } from 'child_process'
import { BaseSpawnEngine } from './BaseSpawnEngine'
import dLog from '../utils/dLog'
import { BotTableInfo } from '../types/types'
import { MAX_THINK_TIME } from '../conf'

const PING_DELAY = 1000
const FIXED_MOVE_TIME_DEC = 5000
const MIN_THINK_TIME = 100
const BUFFER_WORK_DELAY = 50

export default class UciEngine extends BaseSpawnEngine {
  private onUciOk: (() => void) | null = null
  private buffer: string = ''
  private bufferTimeout: NodeJS.Timeout | null = null
  private greetingsClearInterval: NodeJS.Timeout | null = null
  private engineName: string | null = null
  private engineAuthor: string | null = null
  private greatingsSended: Set<number> = new Set()
  private sendMessage: ((tableId: number, message: string) => void) | null =
    null

  protected setupEngine(
    child: ChildProcessWithoutNullStreams,
    initCommands?: string[],
    resolve?: () => void,
    reject?: (err: any) => void,
  ): void {
    this.greetingsClearInterval = setInterval(
      () => {
        this.greatingsSended.clear()
      },
      1000 * 60 * 60 * 12,
    )

    this.onUciOk = () => {
      if (initCommands) {
        for (const command of initCommands) {
          this.send(command)
        }
      }
      this.send('ucinewgame')
      if (resolve) resolve()
      this.onUciOk = null
    }

    this.send('uci')
  }

  protected onSpawnError(err: Error): void {
    if (this.greetingsClearInterval) {
      clearInterval(this.greetingsClearInterval)
      this.greetingsClearInterval = null
    }
    super.onSpawnError(err)
  }

  protected handleOutput(output: string): void {
    if (output.length === 0) return

    if (this.onUciOk) {
      const nameMatch = output.match(/id name (.+?)(?= id |$)/)
      if (nameMatch) {
        this.engineName = nameMatch[1].trim()
        dLog(`Engine name: ${this.engineName}`)
      }

      const authorMatch = output.match(/id author (.+?)(?= id | option |$)/)
      if (authorMatch) {
        this.engineAuthor = authorMatch[1].trim()
        dLog(`Engine author: ${this.engineAuthor}`)
      }

      if (output.indexOf('uciok') !== -1) {
        this.onUciOk()
      }
    }

    if (this.onBestMove) {
      const bestMovePos = output.indexOf('bestmove')
      if (bestMovePos !== -1) {
        const bestMove = output.slice(bestMovePos + 9, bestMovePos + 9 + 5)
        this.onBestMove(bestMove)
        this.onBestMove = null
      }
    }
  }

  protected onStdoutData(data: Buffer): void {
    const output = data.toString().replace(/\s+/g, ' ').trim()
    this.buffer += output
    if (this.bufferTimeout) clearTimeout(this.bufferTimeout)
    this.bufferTimeout = setTimeout(() => {
      this.handleOutput(this.buffer)
      this.buffer = ''
    }, BUFFER_WORK_DELAY)
  }

  start(
    engineCommand: string,
    initCommands?: string[],
    sendMessage?: (tableId: number, message: string) => void,
    onProcessDeath?: () => void,
  ): Promise<void> {
    this.sendMessage = sendMessage || null
    return super.start(engineCommand, initCommands, sendMessage, onProcessDeath)
  }

  private convertMove(stockfishMove: string, player: number): string {
    let move = stockfishMove.trim().replace(/\d{1,2}/g, (num) => {
      const number = parseInt(num, 10)
      if (number >= 1 && number <= 26) {
        return String.fromCharCode(96 + number)
      }
      return num
    })

    // Stockfish reserves uppercase letters for piece moves, so convert to lowercase if player 1
    if (move[1] === '@' && player === 1) {
      move = move[0].toLowerCase() + move.slice(1)
    }

    return move
  }

  async getBestMove(
    tableInfo: BotTableInfo,
    pos: { fen: string; lastmove: string | null },
    player: number,
    fixedTime: number,
    whiteTime: number,
    blackTime: number,
  ): Promise<string> {
    if (this.child) {
      if (
        this.sendMessage &&
        tableInfo.id &&
        !this.greatingsSended.has(tableInfo.id)
      ) {
        this.sendMessage(
          tableInfo.id,
          `Hi, ${tableInfo.enemyLogin ? `${tableInfo.enemyLogin}` : 'there'}! ${
            this.engineName
              ? "I'm bot with engine: " + this.engineName + '. '
              : ''
          }`,
        )
        this.greatingsSended.add(tableInfo.id)
      }

      this.send(`position fen ${pos.fen}`)

      if (fixedTime) {
        const pTime = player === 1 ? blackTime : whiteTime
        let tm = Math.max(
          pTime - PING_DELAY - FIXED_MOVE_TIME_DEC,
          MIN_THINK_TIME,
        )

        if (tm > MAX_THINK_TIME) tm = MAX_THINK_TIME
        dLog(`Move time: ${tm}`)

        this.send(`go movetime ${tm}`)
      } else if (whiteTime && blackTime) {
        const wt = Math.max(whiteTime - PING_DELAY, MIN_THINK_TIME)
        const bt = Math.max(blackTime - PING_DELAY, MIN_THINK_TIME)

        this.send(`go wtime ${wt} btime ${bt}`)
      }

      return this.createBestMovePromise((bestMove) =>
        this.convertMove(bestMove, player),
      )
    }
    throw new Error('Engine not started')
  }

  protected clearTimers(): void {
    super.clearTimers()
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout)
      this.bufferTimeout = null
    }
    if (this.greetingsClearInterval) {
      clearInterval(this.greetingsClearInterval)
      this.greetingsClearInterval = null
    }
  }

  protected clearEngineState(): void {
    this.onUciOk = null
    this.buffer = ''
    this.greatingsSended.clear()
  }
}
