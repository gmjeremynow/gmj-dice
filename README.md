# GM Jeremy's Critical Hit Dice

A Foundry VTT module that adds three custom six-sided dice, each with picture faces and a 3D look through [Dice So Nice!](https://foundryvtt.com/packages/dice-so-nice).

| Die | Chat command | Formula | Faces |
|---|---|---|---|
| Critical Hit (black) | `/crit` | `1dh` | Stun, Double Damage, Sever Limb, Max Damage, Triple Damage, Death |
| Fumble (orange) | `/fumble` | `1du` | Drop Weapon, Fall, Break Weapon, Hit Self, Hit Ally, Knocked Out |
| Hit Location (gray) | `/location` | `1db` | Head, Torso, Right Arm, Left Arm, Right Leg, Left Leg |

## Features

- **Chat commands** roll the die, wait for the 3D animation, then post a card with the face image and name.
- **Sever Limb** on the Critical Hit die automatically rolls the Hit Location die.
- **Macros** for all three dice are created in the Macro Directory the first time a GM loads the world. Turn this off in the module settings with "Create macros automatically".
- **Roll formulas** (`/r 1dh`, `/r 1du`, `/r 1db`) work anywhere Foundry accepts a formula. These show the face image in the roll tooltip but do not post a card or trigger follow-up rolls.

## Macro API

```js
const api = game.modules.get("gmj-dice").api;
api.rollCriticalHit();
api.rollFumble();
api.rollHitLocation();
```

## Requirements

- Foundry VTT v12 or later (verified on v14)
- Dice So Nice! (optional, recommended) for 3D dice

## Customizing

Face order, colors, commands and follow-up rolls are set in the `DICE` and `FOLLOW_UPS` tables at the top of `scripts/main.js`.
