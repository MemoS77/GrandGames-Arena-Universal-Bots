import BotApp from './BotApp'

let app = new BotApp()

app
  .start()
  .then(() => {
    console.log('App started')
  })
  .catch((e) => {
    console.error(e.message)
  })
