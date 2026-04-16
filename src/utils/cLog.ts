const colors: Record<
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'reset',
  string
> = {
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
}

type Color = keyof typeof colors // Литеральный тип для цветов

export default function cLog(msg: string, color: Color = 'white'): void {
  const colorCode = colors[color]
  console.log(`${colorCode}%s${colors['reset']}`, msg)
}
