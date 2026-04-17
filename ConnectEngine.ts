import { spawn } from 'bun'
import type { IEngine } from './IEngine'
import path from 'path'
import cLog from './funcs/cLog'
import { deepCopy } from './inc'

const SHOW_MESSAGES = false
const SHOW_BUFF_MESSAGES = false
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

type ChessPos = { fen: string; lastMove: string | null }
const decode = (data: any) => new TextDecoder().decode(data)

const defPos: PosInfo = {
  moveNumber: 0,
  oneMove: null,
  black: new Set(),
  white: new Set(),
  newStones: [],
  firstMove: null,
}

export default class ConnectEngine implements IEngine {
  private onBestMove: ((bestMove: string) => void) | null = null
  private pos: PosInfo = deepCopy(defPos)
  private nowDepth = 3

  child: any = null
  buffer: string = ''
  engineCommand: string[] | null = null
  initCommands: string[] | undefined = []
  varDepth: boolean = false
  lastThinkTime: number = 0

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

  private async runOutputReader() {
    if (this.child) {
      const reader = this.child.stdout.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        const v = decode(value)
        if (SHOW_BUFF_MESSAGES) cLog(`Buffer: ${v}`, 'cyan')
        this.buffer += v
        let index

        //console.log(`\x1b[36mEngine buffer: \x1b[0m ${this.buffer}`)

        while ((index = this.buffer.indexOf('\n')) !== -1) {
          // Извлекаем строку до символа новой строки
          const line = this.buffer.slice(0, index).trim()
          // Отправляем строку в обработчик
          this.workLine(line)
          // Обрезаем буфер после символа новой строки
          this.buffer = this.buffer.slice(index + 1)
        }
      }
    }
  }

  private workLine(line: string) {
    if (SHOW_MESSAGES) cLog(line, 'yellow')

    if (this.onBestMove && line.indexOf('move') === 0) {
      const parts = line.split(' ')
      const bestMove = parts[1]
      // В справке, которая посылается  есть строка  bestmove, исправляем чтобы не срабатывало на нее
      if (bestMove !== 'XXXX') {
        this.onBestMove(bestMove)
        this.onBestMove = null
      }
    }
  }

  private async runErrorsReader() {
    if (this.child) {
      const reader = this.child.stderr.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        cLog(decode(value), 'red')
      }
    }
  }

  async restart() {
    if (this.engineCommand) {
      await this.start(this.engineCommand, this.initCommands)
    }
  }

  start(engineCommands: string[], initCommands?: string[]): Promise<void> {
    this.engineCommand = engineCommands
    this.initCommands = initCommands

    return new Promise(async (resolve, reject) => {
      try {
        const curPath = path.resolve('./bots_files')

        this.child = spawn(engineCommands, {
          cwd: curPath,
          stdout: 'pipe',
          stderr: 'pipe',
          stdin: 'pipe',
        })
      } catch (e) {
        console.log('Spawn error!', e)
        reject(e)
      }

      this.runOutputReader()
      this.runErrorsReader()

      setTimeout(() => {
        this.send('depth ' + this.nowDepth)
        if (initCommands) {
          for (const command of initCommands) {
            if (command === 'varDepth') this.varDepth = true
            else this.send(command)
          }
        }
        resolve()
      }, 500)
    })
  }

  async getBestMove(
    pos: ChessPos,
    player: number,
    maxThinkTime: number,
  ): Promise<string | string[]> {
    if (!this.child) await this.restart()
    if (this.child) {
      this.workPos(pos, player)
      //console.log('new move', pos.fen, pos.lastMove)
      //this.send('move AA')
      //this.send(`position fen ${this.prepareFen(pos.fen)}`)
      //this.send(`go movetime ${maxThinkTime}`)

      return new Promise((resolve) => {
        const startThinkTime = Date.now()
        this.onBestMove = (bestMove) => {
          let ans =
            bestMove.length === 4
              ? [bestMove.slice(0, 2), bestMove.slice(2)]
              : [bestMove]

          for (let i = 0; i < ans.length; i++) {
            player === 0
              ? this.pos.white.add(ans[i])
              : this.pos.black.add(ans[i])
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
          resolve(this.convertMove(ans, player))
        }
      })
    }
    throw new Error('Engine not started')
  }

  kill(): void {
    this.send('quit')
    setTimeout(() => {
      if (this.child) this.child.kill('SIGKILL')
    }, 200)
  }

  private convertMove(move: string[], player: number): string | string[] {
    const prefix = player === 1 ? 'd@' : 'D@'
    return move.map((m) => `${prefix}${m.toLowerCase()}`)
  }

  private send(message: string): void {
    if (this.child && this.child.stdin) {
      const encoder = new TextEncoder()
      this.child.stdin.write(encoder.encode(`${message}\n`))
    }
  }
}
