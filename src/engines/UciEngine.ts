import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { IEngine } from './IEngine'
import dLog from '../funcs/cLog'
import { BotTableInfo } from '../types/types'
import { MAX_THINK_TIME } from '../conf'

const PING_DELAY = 1000
const FIXED_MOVE_TIME_DEC = 5000
const MIN_THINK_TIME = 100
const BUFFER_WORK_DELAY = 50

export default class UciEngine implements IEngine {
  private child: ChildProcessWithoutNullStreams | null = null
  private onBestMove: ((bestMove: string) => void) | null = null
  private onBestMoveReject: ((reason?: any) => void) | null = null
  private onUciOk: (() => void) | null = null
  private buffer: string = ''
  private bufferTimeout: NodeJS.Timeout | null = null
  private greetingsClearInterval: NodeJS.Timeout | null = null
  private killTimeout: NodeJS.Timeout | null = null
  private engineName: string | null = null
  private engineAuthor: string | null = null
  private greatingsSended: Set<number> = new Set()
  private sendMessage: ((tableId: number, message: string) => void) | null =
    null
  private onProcessDeath: (() => void) | null = null

  start(
    engineCommand: string,
    initCommands?: string[],
    sendMessage?: (tableId: number, message: string) => void,
    onProcessDeath?: () => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(engineCommand)
      this.sendMessage = sendMessage || null
      this.onProcessDeath = onProcessDeath || null
      dLog(`Spawned engine: ${engineCommand}`)

      // Clear greatings cache
      this.greetingsClearInterval = setInterval(
        () => {
          this.greatingsSended.clear()
        },
        1000 * 60 * 60 * 12,
      )

      child.on('spawn', () => {
        this.onUciOk = () => {
          if (initCommands) {
            for (const command of initCommands) {
              this.send(command)
            }
          }
          this.send('ucinewgame')
          resolve()
          this.onUciOk = null
        }

        this.send('uci')
      })

      child.on('error', (err) => {
        // Clean up resources on spawn error
        if (this.greetingsClearInterval) {
          clearInterval(this.greetingsClearInterval)
          this.greetingsClearInterval = null
        }
        this.child = null
        reject(err)
      })

      const workBuffer = (output: string) => {
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

      child.stdout.on('data', (data) => {
        const output = data.toString().replace(/\s+/g, ' ').trim()
        //dLog(`Received: ${output}`)
        this.buffer += output
        if (this.bufferTimeout) clearTimeout(this.bufferTimeout)
        this.bufferTimeout = setTimeout(() => {
          workBuffer(this.buffer)
          this.buffer = ''
        }, BUFFER_WORK_DELAY)
      })

      // Read errors, if any (stderr)
      child.stderr.on('data', (data) => {
        console.error(`Program error: ${data}`)
      })

      // When the process finishes
      child.on('close', (code) => {
        console.log(`Program terminated with code: ${code}`)
        if (this.onProcessDeath) {
          this.onProcessDeath()
          this.onProcessDeath = null
        }
      })

      this.child = child
    })
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

      // Return the best move after it's received
      return new Promise((resolve, reject) => {
        this.onBestMove = (bestMove) => {
          resolve(this.convertMove(bestMove, player))
          this.onBestMove = null
          this.onBestMoveReject = null
        }
        this.onBestMoveReject = reject
      })
    }
    throw new Error('Engine not started')
  }

  kill(): void {
    if (this.child) {
      // Reject pending promise if any
      if (this.onBestMoveReject) {
        this.onBestMoveReject(new Error('Engine killed'))
        this.onBestMoveReject = null
      }

      // Clear all timers
      if (this.bufferTimeout) {
        clearTimeout(this.bufferTimeout)
        this.bufferTimeout = null
      }

      if (this.greetingsClearInterval) {
        clearInterval(this.greetingsClearInterval)
        this.greetingsClearInterval = null
      }

      // Remove all event listeners
      this.child.stdout.removeAllListeners()
      this.child.stderr.removeAllListeners()
      this.child.removeAllListeners()

      // Try graceful shutdown first, then force kill
      this.child.kill('SIGTERM')

      const childRef = this.child
      this.killTimeout = setTimeout(() => {
        if (childRef && !childRef.killed) {
          childRef.kill('SIGKILL')
        }
        this.killTimeout = null
      }, 1000)

      this.child = null
    }

    // Clear state
    this.onBestMove = null
    this.onUciOk = null
    this.buffer = ''
    this.greatingsSended.clear()
  }

  private send(message: string): void {
    if (this.child) {
      dLog(`Sending: ${message}`)
      this.child.stdin.write(message + '\n')
      // this.child.stdin.end(); // Uncomment if you want to close stdin after sending
    }
  }
}
