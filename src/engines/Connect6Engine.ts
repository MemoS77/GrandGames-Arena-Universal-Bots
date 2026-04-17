import { ChildProcessWithoutNullStreams, SpawnOptions } from 'child_process'
import { BaseSpawnEngine } from './BaseSpawnEngine'
import { BotTableInfo, ChessPos } from '../types/types'
import cLog from '../utils/cLog'
//import path from 'path'

const SHOW_MESSAGES = true
const SHOW_BUFF_MESSAGES = true
const BOARD_SIZE = 19

// Время после которого можно увеличить глубину
const UP_THINK_TIME = 1500
const DOWN_THINK_TIME = 30000
const MAX_DEPTH = 6
const MIN_DEPTH = 3

const numToString = (num: number) => {
  return String.fromCharCode(65 + num)
}

type PosInfo = {
  // Отправляем ход, а не все ходы сначала партии
  oneMove: string | null

  // Получен один ход из двух
  firstMove: string | null

  moveNumber: number
  black: Set<string>
  white: Set<string>
  newStones: string[]
}

const defPos: PosInfo = {
  moveNumber: 0,
  oneMove: null,
  black: new Set(),
  white: new Set(),
  newStones: [],
  firstMove: null,
}

const deepCopy = <T>(obj: T): T => JSON.parse(JSON.stringify(obj))

export default class Connect6Engine extends BaseSpawnEngine {
  private pos: PosInfo = deepCopy(defPos)
  private nowDepth = 3
  private buffer: string = ''
  private varDepth: boolean = false
  private lastThinkTime: number = 0

  /*
  protected getSpawnOptions(): SpawnOptions {
    return {
      cwd: path.resolve('./bots_files'),
    }
  }*/

  private fillStones(lines: string[]) {
    this.pos.newStones = []

    for (let i = 0; i < lines.length; i++) {
      let y = i
      let x = -1
      let numString = ''

      for (let j = 0; j < lines[i].length; j++) {
        let symb = lines[i].charAt(j)
        let side = 0
        if (symb === 'D') {
          side = 2
          x++
        } else if (symb === 'd') {
          side = 1
          x++
        }

        if (side) {
          if (numString != '') {
            x += parseInt(numString)
            numString = ''
          }
          const move = `${numToString(x)}${numToString(BOARD_SIZE - y - 1)}`
          if (side === 1) {
            if (!this.pos.black.has(move)) {
              this.pos.black.add(move)
              this.pos.newStones.push(move)
            }
          } else {
            if (!this.pos.white.has(move)) {
              this.pos.white.add(move)
              this.pos.newStones.push(move)
            }
          }
        } else {
          numString += symb
        }
      }
    }
  }

  private workPos(pos: ChessPos, player: number) {
    const fenParts = pos.fen.split(' ')
    const moveNumber = parseInt(fenParts[5])
    if (moveNumber <= this.pos.moveNumber) {
      this.pos = deepCopy(defPos)
    }
    this.pos.moveNumber = moveNumber

    const lines = fenParts[0].slice(0, fenParts[0].indexOf('[')).split('/')

    if (this.pos.moveNumber === 1) {
      this.send('new black')
    } else {
      if (this.pos.moveNumber === 2) this.send('new white')
      this.fillStones(lines)

      if (this.pos.newStones.length <= 2) {
        this.send(`move ${this.pos.newStones.join('')}`)
      } else {
        const cnt = this.pos.white.size + this.pos.black.size
        const whiteStones = Array.from(this.pos.white)
        const blackStones = Array.from(this.pos.black)

        let side = 0 // black
        let mn = 1
        for (let i = 0; i < cnt; i++) {
          if (side === 1) {
            const move = whiteStones.pop()
            this.send(`white ${move}`)
          } else {
            const move = blackStones.pop()
            this.send(`black ${move}`)
          }
          mn++
          if (mn === 2) {
            side = 1 - side
            mn = 0
          }
        }
        this.send('next')
      }
    }
  }

  protected onStdoutData(data: Buffer): void {
    const v = data.toString()
    if (SHOW_BUFF_MESSAGES) cLog(`Buffer: ${v}`, 'cyan')
    this.buffer += v
    let index

    while ((index = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, index).trim()
      this.handleOutput(line)
      this.buffer = this.buffer.slice(index + 1)
    }
  }

  protected handleOutput(line: string): void {
    if (SHOW_MESSAGES) cLog(line, 'yellow')

    if (this.onBestMove && line.indexOf('move') === 0) {
      const parts = line.split(' ')
      const bestMove = parts[1]
      if (bestMove !== 'XXXX') {
        this.onBestMove(bestMove)
        this.onBestMove = null
      }
    }
  }

  protected setupEngine(
    child: ChildProcessWithoutNullStreams,
    initCommands?: string[],
    resolve?: () => void,
    reject?: (err: any) => void,
  ): void {
    setTimeout(() => {
      this.send('depth ' + this.nowDepth)
      if (initCommands) {
        for (const command of initCommands) {
          if (command === 'varDepth') this.varDepth = true
          else this.send(command)
        }
      }
      if (resolve) resolve()
    }, 500)
  }

  async getBestMove(
    tableInfo: BotTableInfo,
    pos: ChessPos,
    player: number,
    fixedTime: number,
    whiteTime: number,
    blackTime: number,
  ): Promise<string> {
    if (this.child) {
      this.workPos(pos, player)

      return this.createBestMovePromise((bestMove) => {
        const startThinkTime = Date.now()
        let ans =
          bestMove.length === 4
            ? [bestMove.slice(0, 2), bestMove.slice(2)]
            : [bestMove]

        for (let i = 0; i < ans.length; i++) {
          player === 0 ? this.pos.white.add(ans[i]) : this.pos.black.add(ans[i])
          this.pos.moveNumber++
        }

        if (this.varDepth) {
          this.lastThinkTime = Date.now() - startThinkTime
          if (this.lastThinkTime < UP_THINK_TIME) {
            if (this.nowDepth < MAX_DEPTH) {
              this.nowDepth++
              this.send('depth ' + this.nowDepth)
            }
          } else if (this.lastThinkTime > DOWN_THINK_TIME) {
            if (this.nowDepth > MIN_DEPTH) {
              this.nowDepth--
              this.send('depth ' + this.nowDepth)
            }
          }
        }
        const converted = this.convertMove(ans, player)
        return Array.isArray(converted) ? converted.join('') : converted
      })
    }
    throw new Error('Engine not started')
  }

  protected clearEngineState(): void {
    this.buffer = ''
    this.pos = deepCopy(defPos)
  }

  kill(): void {
    this.send('quit')
    setTimeout(() => {
      super.kill()
    }, 200)
  }

  private convertMove(move: string[], player: number): string[] {
    const prefix = player === 1 ? 'd@' : 'D@'
    return move.map((m) => `${prefix}${m.toLowerCase()}`)
  }

  protected send(message: string): void {
    if (this.child) {
      this.child.stdin.write(`${message}\n`)
    }
  }
}
