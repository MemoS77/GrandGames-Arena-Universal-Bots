import { ChildProcessWithoutNullStreams } from 'child_process'
import { BaseSpawnEngine } from './BaseSpawnEngine'
import { BotTableInfo, ChessPos } from '../types/types'

import cLog from '../funcs/cLog'

const PING_DELAY = 1000
const FIXED_MOVE_TIME_DEC = 5000
const MIN_THINK_TIME = 50

const fixedMoves = [
  '4,4',
  '4,5',
  '4,6',
  '4,7',
  '4,8',
  '4,9',
  '4,10',
  '10,4',
  '10,5',
  '10,6',
  '10,7',
  '10,8',
  '10,9',
  '10,10',
  '5,4',
  '6,4',
  '7,4',
  '8,4',
  '9,4',
  '5,10',
  '6,10',
  '7,10',
  '8,10',
  '9,10',
]

type PosInfo = {
  oneMove: string | null
  moveNumber: number
  moves: Set<string>
}

function sortAndAlternate(set: Set<string>, startWith: number): string[] {
  // Преобразуем Set в массив
  const arr = Array.from(set)

  // Разделяем значения по последней цифре
  const group1 = arr.filter((item) => item.endsWith('1'))
  const group2 = arr.filter((item) => item.endsWith('2'))

  // Результирующий массив
  const result: string[] = []

  // Флаги для контроля очередности добавления
  let useGroup1 = startWith === 1

  // Чередуем значения из групп
  while (group1.length > 0 || group2.length > 0) {
    if (useGroup1 && group1.length > 0) {
      result.push(group1.shift()!) // Добавляем элемент из первой группы
    } else if (!useGroup1 && group2.length > 0) {
      result.push(group2.shift()!) // Добавляем элемент из второй группы
    }
    useGroup1 = !useGroup1 // Меняем очередность
  }

  return result
}

export default class GomocupEngine extends BaseSpawnEngine {
  private onOk: (() => void) | null = null
  private boardSize = 15
  private pos: PosInfo = { moveNumber: 0, oneMove: null, moves: new Set() }

  private parsePos(pos: ChessPos, player: number) {
    const fenParts = pos.fen.split(' ')
    this.pos.moveNumber = parseInt(fenParts[5])
    const lines = fenParts[0].slice(0, fenParts[0].indexOf('[')).split('/')
    let lastMove = null
    let newMovesCount = 0

    for (let i = 0; i < lines.length; i++) {
      let y = i
      let x = -1
      let numString = ''
      for (let j = 0; j < lines[i].length; j++) {
        let symb = lines[i].charAt(j)
        let side = 0
        if (symb === 'D') {
          side = player === 0 ? 1 : 2
          x++
        } else if (symb === 'd') {
          side = player === 0 ? 2 : 1
          x++
        }

        if (side) {
          if (numString != '') {
            x += parseInt(numString)
            numString = ''
          }
          const move = `${x},${y},${side}`
          if (!this.pos.moves.has(move)) {
            this.pos.moves.add(move)
            if (side === 2) {
              lastMove = `${x},${y}`
              newMovesCount++
            }
          }
        } else {
          numString += symb
          // идет число
        }
      }
    }
    if (newMovesCount === 1) {
      this.pos.oneMove = lastMove
    } else this.pos.oneMove = null
  }

  // Send moves to engine
  private applyPos(player: number) {
    if (this.pos.oneMove) {
      this.send(`TURN ${this.pos.oneMove}`)
    } else {
      if (this.pos.moves.size > 0) {
        this.send('RESTART')
        this.send('BOARD')
        const sortedMoves = sortAndAlternate(
          this.pos.moves,
          player === 0 ? 2 : 1,
        )

        for (const move of sortedMoves) {
          this.send(move)
        }
        this.send('DONE')
      }
    }
  }

  protected setupEngine(
    child: ChildProcessWithoutNullStreams,
    initCommands?: string[],
    resolve?: () => void,
    reject?: (err: any) => void,
  ): void {
    cLog('Engine launched!')
    this.onOk = () => {
      cLog('OK recieved!')
      if (initCommands) {
        for (const command of initCommands) {
          cLog(`Init command: ${command}`)
          this.send(command)
        }
      }
      if (resolve) resolve()
      this.onOk = null
    }

    this.send('START 15')
  }

  protected handleOutput(output: string): void {
    if (output.length === 0) return

    cLog(`${output}`, 'blue')

    if (this.onOk && output.indexOf('OK') !== -1) {
      this.onOk()
    }

    if (this.onBestMove) {
      const match = output.match(/^(\d+),(\d+)/)
      if (match) {
        const move = `${match[1]},${match[2]}`
        cLog('Move Found: ' + move, 'green')
        this.onBestMove(move)
        this.onBestMove = null
      }
    }
  }

  private buffer = ''

  protected onStdoutData(data: Buffer): void {
    this.buffer += data.toString()

    let index
    while ((index = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, index).trim()
      this.handleOutput(line)
      this.buffer = this.buffer.slice(index + 1)
    }
  }

  private convertMove(player: number, move: string): string {
    const boardSize = this.boardSize
    // Разделяем ход на x и y
    const [xStr, yStr] = move.split(',')
    const x = parseInt(xStr)
    const y = boardSize - 1 - parseInt(yStr)

    // Проверяем, что x и y находятся в пределах доски
    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
      throw new Error('Move is out of bounds')
    }

    // Преобразуем числа в буквы начиная с 'a'
    const xLetter = String.fromCharCode('a'.charCodeAt(0) + x)
    const yLetter = String.fromCharCode('a'.charCodeAt(0) + y)

    const prefix = player === 0 ? 'D@' : 'd@'

    return `${prefix}${xLetter}${yLetter}`
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
      this.parsePos(pos, player)

      // Программы из gomocup не поддерживают вариант опен-рендзю. Приходится использовать костыль для третьего хода.
      if (this.pos.moveNumber === 3) {
        const moves = fixedMoves.sort(() => Math.random() - 0.5)
        const move = this.pos.moves.has(moves[0] + ',1') ? moves[1] : moves[0]
        this.pos.moves.clear()
        return this.convertMove(player, move)
      }

      if (fixedTime) {
        const pTime = player === 1 ? blackTime : whiteTime
        const tm = Math.max(
          pTime - PING_DELAY - FIXED_MOVE_TIME_DEC,
          MIN_THINK_TIME,
        )

        //this.send(`INFO timeout_turn ${tm}`) // need sent one time after start.... use time_left...
        this.send(`INFO time_left ${tm}`)
      } else if (whiteTime && blackTime) {
        const wt = Math.max(whiteTime - PING_DELAY, MIN_THINK_TIME)
        const bt = Math.max(blackTime - PING_DELAY, MIN_THINK_TIME)
        //this.send(`go wtime ${wt} btime ${bt}`)
        this.send(`INFO time_left ${player === 0 ? wt : bt}`)
      }

      this.applyPos(player)

      return this.createBestMovePromise((bestMove) =>
        this.convertMove(player, bestMove),
      )
    }
    throw new Error('Engine not started')
  }

  protected clearEngineState(): void {
    this.onOk = null
    this.pos = { moveNumber: 0, oneMove: null, moves: new Set() }
    this.buffer = ''
  }

  protected send(message: string): void {
    if (this.child) {
      this.child.stdin.write(message + '\n')
      cLog(message, 'magenta')
    }
  }
}
