# GrandGames Arena Universal Bots

An application that allows connecting arbitrary engines as bots to the GrandGames Arena service: https://arena.grandgames.net

## How it works

Uses the official service SDK: https://github.com/MemoS77/GrandGames-Arena-Bots-SDK

An AI engine for board games is launched in a separate process, allowing it to make the best moves based on the transmitted position.
When a position requiring a bot's move occurs, the position is prepared and transmitted to the engine. In turn, the engine's response is converted into a format understandable by the service.

## Who is it for?

Any developer who wants to run their AI engine as a bot on the GrandGames Arena service for any non-destructive purposes can use and modify this software: entertainment, education, checking AI level.
Adding adapters for new engines is welcome, we will be glad to receive your Pull Requests.

## How to use

- You need to have an understanding of how node.js works in general and npm in particular

- Install node.js 24 LTS or higher: https://nodejs.org/en
  Install dependencies: `npm i`

- Register a bot (a new account must end with "Bot" on GrandGames Arena, otherwise the token will not be visible in the dashboard and the bot will be banned): https://arena.grandgames.net and get the token in your profile.

- Specify the token in conf.example.json, sections for games supported by your bot, and the path to the bot's executable file.

- Run it. Commands are in package.json, modify them as needed.

## Implemented protocols

Currently, the following protocols are implemented:

### UCI

https://en.wikipedia.org/wiki/Universal_Chess_Interface

This is the most popular interface for chess programs.
Implementation examples: Stockfish: https://stockfishchess.org/download/

### Gomocup

Protocol for programs in Gomoku tournaments on the service https://gomocup.org/
Program examples: https://gomocup.org/download-for-developers/#source
