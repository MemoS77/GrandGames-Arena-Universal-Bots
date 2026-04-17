import {
  spawn,
  ChildProcessWithoutNullStreams,
  SpawnOptions,
} from 'child_process'
import path from 'path'
import { IEngine } from './IEngine'
import dLog from '../utils/cLog'

const SIGKILL_TIMEOUT = 2000

export abstract class BaseSpawnEngine implements IEngine {
  protected child: ChildProcessWithoutNullStreams | null = null
  protected onBestMove: ((bestMove: string) => void) | null = null
  protected onBestMoveReject: ((reason?: any) => void) | null = null
  protected onProcessDeath: (() => void) | null = null
  private killTimeout: NodeJS.Timeout | null = null

  abstract getBestMove(
    tableInfo: any,
    pos: any,
    player: number,
    fixedTime: number,
    whiteTime: number,
    blackTime: number,
  ): Promise<string | string[]>

  protected abstract setupEngine(
    child: ChildProcessWithoutNullStreams,
    initCommands?: string[],
    resolve?: () => void,
    reject?: (err: any) => void,
  ): void

  protected abstract handleOutput(output: string): void

  protected abstract clearEngineState(): void

  protected getSpawnOptions(engineCommand: string): SpawnOptions | undefined {
    return undefined
  }

  start(
    engineCommand: string,
    initCommands?: string[],
    sendMessage?: (tableId: number, message: string) => void,
    onProcessDeath?: () => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const commandParts = engineCommand.split(' ')
      const spawnOptions = this.getSpawnOptions(engineCommand) || {}

      let executablePath = commandParts[0]

      // Если указан cwd и путь не абсолютный, делаем путь абсолютным
      if (!path.isAbsolute(executablePath)) {
        executablePath = path.resolve(executablePath)
      }

      dLog(`Executable path: ${executablePath} for command: ${engineCommand}`)

      // Absolute path is more reliable than relative path. Some problems with
      // relative paths in some engines.
      const child = spawn(
        executablePath,
        commandParts.slice(1),
        spawnOptions,
      ) as ChildProcessWithoutNullStreams

      this.onProcessDeath = onProcessDeath || null
      dLog(`Spawned engine: ${engineCommand}`)

      child.on('spawn', () => {
        this.setupEngine(child, initCommands, resolve, reject)
      })

      child.on('error', (err) => {
        this.onSpawnError(err)
        reject(err)
      })

      child.stdout.on('data', (data) => {
        this.onStdoutData(data)
      })

      child.stderr.on('data', (data) => {
        console.error(`Program error: ${data}`)
      })

      child.on('close', (code) => {
        this.onProcessClose(code)
      })

      this.child = child
    })
  }

  protected onSpawnError(err: Error): void {
    this.child = null
  }

  protected abstract onStdoutData(data: Buffer): void

  protected onProcessClose(code: number | null): void {
    dLog(`Program terminated with code: ${code}`)
    if (this.onProcessDeath) {
      this.onProcessDeath()
      this.onProcessDeath = null
    }
  }

  kill(): void {
    dLog('kill called')
    if (this.child) {
      dLog('kill: child exists')

      if (this.onBestMoveReject) {
        this.onBestMoveReject(new Error('Engine killed'))
        this.onBestMoveReject = null
      }

      this.clearTimers()

      if (this.onProcessDeath) {
        this.onProcessDeath()
        this.onProcessDeath = null
      }

      this.child.stdout.removeAllListeners()
      this.child.stderr.removeAllListeners()
      this.child.removeAllListeners()

      this.child.kill('SIGTERM')

      const childRef = this.child
      this.killTimeout = setTimeout(() => {
        if (childRef && !childRef.killed) {
          childRef.kill('SIGKILL')
        }
        this.killTimeout = null
        dLog('kill: force killed')
      }, SIGKILL_TIMEOUT)

      this.child = null
    }

    this.onBestMove = null
    this.clearEngineState()
  }

  protected clearTimers(): void {
    if (this.killTimeout) {
      clearTimeout(this.killTimeout)
      this.killTimeout = null
    }
  }

  protected send(message: string): void {
    if (this.child) {
      dLog(`Sending: ${message}`)
      this.child.stdin.write(message + '\n')
    }
  }

  protected createBestMovePromise(
    convertMove: (move: string) => string | string[],
  ): Promise<string | string[]> {
    if (!this.child) {
      throw new Error('Engine not started')
    }

    return new Promise((resolve, reject) => {
      this.onBestMove = (bestMove) => {
        resolve(convertMove(bestMove))
        this.onBestMove = null
        this.onBestMoveReject = null
      }
      this.onBestMoveReject = reject
    })
  }
}
