const IS_DEBUG = process.env.DEBUG === 'true'

export default function dLog(...msg: any[]): void {
  if (IS_DEBUG) {
    console.log(...msg)
  }
}
