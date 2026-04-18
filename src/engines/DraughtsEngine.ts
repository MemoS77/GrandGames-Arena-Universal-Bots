import path from 'path'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { BaseSpawnEngine } from './BaseSpawnEngine'
import { BotTableInfo } from '../types/types'
import { MAX_THINK_TIME } from '../conf'
import dLog from '../utils/dLog'

const READY_TIMEOUT_MS = 15_000
const MIN_THINK_TIME = 200
const PING_OVERHEAD_MS = 500

export default class DraughtsEngine extends BaseSpawnEngine {
  private lineBuffer: string = ''
  private readyTimeout: NodeJS.Timeout | null = null
  private onReady: (() => void) | null = null

  start(
    engineCommand: string,
    initCommands?: string[],
    sendMessage?: (tableId: number, message: string) => void,
    onProcessDeath?: () => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const parts = engineCommand.trim().split(/\s+/)
      const exe = parts[0]

      // Resolve script path if it's a file reference (not a flag)
      const spawnArgs = parts
        .slice(1)
        .map((arg) => (arg.startsWith('-') ? arg : path.resolve(arg)))

      dLog(`Draughts spawn: ${exe} ${spawnArgs.join(' ')}`)

      const child = spawn(exe, spawnArgs, {}) as ChildProcessWithoutNullStreams

      this.onProcessDeath = onProcessDeath || null

      child.on('spawn', () => {
        this.setupEngine(child, initCommands, resolve, reject)
      })
      child.on('error', (err) => {
        this.onSpawnError(err)
        reject(err)
      })
      child.stdout.on('data', (data) => this.onStdoutData(data))
      child.stderr.on('data', (data) =>
        console.error(`Draughts stderr: ${data}`),
      )
      child.on('close', (code) => this.onProcessClose(code))

      this.child = child
    })
  }

  protected setupEngine(
    _child: ChildProcessWithoutNullStreams,
    _initCommands: string[] | undefined,
    resolve?: () => void,
    reject?: (err: any) => void,
  ): void {
    this.onReady = () => {
      this.clearReadyTimeout()
      if (resolve) resolve()
      this.onReady = null
    }

    this.readyTimeout = setTimeout(() => {
      this.readyTimeout = null
      if (this.onReady) {
        this.onReady = null
        if (reject) reject(new Error('Draughts engine startup timeout'))
      }
    }, READY_TIMEOUT_MS)
  }

  // -------------------------------------------------------------------------
  // Stdout line buffering
  // -------------------------------------------------------------------------

  protected onStdoutData(data: Buffer): void {
    this.lineBuffer += data.toString()
    const lines = this.lineBuffer.split('\n')
    this.lineBuffer = lines.pop() ?? ''
    for (const line of lines) {
      this.handleOutput(line.trim())
    }
  }

  // -------------------------------------------------------------------------
  // JSON message dispatch
  // -------------------------------------------------------------------------

  protected handleOutput(line: string): void {
    if (!line) return
    let msg: Record<string, any>
    try {
      msg = JSON.parse(line)
    } catch {
      dLog(`Draughts non-JSON: ${line}`)
      return
    }

    if (msg.status === 'ready' && this.onReady) {
      dLog(`Draughts ready (variant=${msg.variant})`)
      this.onReady()
      return
    }

    if (msg.error) {
      console.error(`Draughts engine error: ${msg.error}`)
      if (this.onBestMoveReject) {
        this.onBestMoveReject(new Error(msg.error))
        this.onBestMoveReject = null
        this.onBestMove = null
      }
      return
    }

    if (msg.move && this.onBestMove) {
      dLog(`Draughts move: ${msg.move}`)
      this.onBestMove(msg.move)
      this.onBestMove = null
    }
  }

  // -------------------------------------------------------------------------
  // Get best move
  // -------------------------------------------------------------------------

  async getBestMove(
    _tableInfo: BotTableInfo,
    pos: { fen: string; lastMove: string | null },
    player: number,
    fixedTime: number,
    whiteTime: number,
    blackTime: number,
  ): Promise<string> {
    if (!this.child) throw new Error('Engine not started')

    const playerTime = player === 0 ? whiteTime : blackTime
    const raw = fixedTime
      ? Math.max(playerTime - PING_OVERHEAD_MS, MIN_THINK_TIME)
      : Math.max(Math.min(playerTime / 20, MAX_THINK_TIME), MIN_THINK_TIME)

    const timeMs = Math.min(raw, MAX_THINK_TIME)

    this.send(JSON.stringify({ fen: pos.fen, time: timeMs }))

    return this.createBestMovePromise((move) => move) as Promise<string>
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  protected clearTimers(): void {
    super.clearTimers()
    this.clearReadyTimeout()
  }

  protected clearEngineState(): void {
    this.lineBuffer = ''
    this.onReady = null
    this.clearReadyTimeout()
  }

  private clearReadyTimeout(): void {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout)
      this.readyTimeout = null
    }
  }
}
