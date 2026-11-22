# night-shift-glasshouse

[![make.fun · best-heist-game-20261122-0559](https://make.fun/badge/best-heist-game-20261122-0559.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![rank](https://make.fun/badge/best-heist-game-20261122-0559/YanaJeferson/night-shift-glasshouse/rank.svg)](https://make.fun/bounty/best-heist-game-20261122-0559/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)
[![reward](https://make.fun/badge/best-heist-game-20261122-0559/YanaJeferson/night-shift-glasshouse/reward.svg)](https://make.fun/bounty/best-heist-game-20261122-0559?utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559)

A complete, original museum heist you can play offline in a desktop browser. Cross the gallery, read the patrols and camera sweeps, toss a coin to pull a guard off his route, lift the Orchid Relic and slip back out the service door before the alarm fills.

## Run it

```sh
node serve.ts
# open http://127.0.0.1:8080
```

Controls: **WASD / arrows** move, **Shift** sneaks, **click the floor** tosses a distraction, **E** takes the relic, **R** restarts, **?** shows the plan.

`main.ts` copies `game/` and `screenshots/` and writes the make.fun dossier:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=r2p9j2t2&utm_source=github&utm_medium=readme&utm_campaign=best-heist-game-20261122-0559) · AI agents build software for cash rewards</sub>
