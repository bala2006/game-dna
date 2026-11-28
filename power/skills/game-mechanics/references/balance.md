# Combat, progression and economy numbers

Starting points for tuning, not targets. Measure the shipped values with seeded runs.

## Attack timing at 60 Hz

| Action | Windup | Active | Recovery | Notes |
|---|---|---|---|---|
| Light melee | 3 to 6 ticks | 2 to 4 | 8 to 15 | Chains of 2 or 3; allow the next input in the last 4 to 6 recovery ticks |
| Heavy melee | 15 to 30 | 3 to 6 | 20 to 35 | Punishable on a miss |
| Ranged shot | 0 to 4 | 1 | Cooldown 6 to 20 | 3 to 10 shots per second |
| Dodge | 0 to 2 | 8 to 20 invulnerable | 6 to 12 | Longer invulnerability makes dodging the only defense |

Buffer an attack pressed during recovery for 6 to 10 ticks, the same way a jump is buffered.

## Damage and time to kill

- Design time to kill first, then derive health: `TTK = HP / (damage × hits per second)`.
- Horde enemies 0.1 to 0.5 s, standard foes 1 to 3 s, elites 5 to 10 s, bosses 20 to 60 s of focused attack.
- Player health in hits taken: 3 to 6 for action games (Neon Survivor 5), with invulnerability between hits.
- Keep damage variance within 10 percent so players can count hits. Critical hits at 5 to 15 percent chance and 1.5 to 2 times damage.
- Health and damage are integers. Apply percentage modifiers once, then floor at one defined point.

## Progression curves

- Cost of level `n`: `base × r^n`, total to reach `n`: `base × (r^n - 1) / (r - 1)`.
- `r` of 1.07 to 1.15 suits incremental games, 1.15 to 1.5 upgrade trees and character levels.
- With `base` 100 and `r` 1.25, levels 1 to 6 cost 125, 156, 195, 244, 305 and 381.
- Let rewards per minute grow slower than costs, so time per level grows 10 to 20 percent each level.
- Early on, player power should grow faster than enemy power, so the player feels stronger; later they may match.

## Drop odds

- Chance of no drop in `n` tries at probability `p`: `(1 - p)^n`. At 5 percent: 49 percent of players miss 14 times in a row, 10 percent miss 45 times, 1 percent miss 90 times.
- Pity: guarantee the drop around the try where `(1 - p)^n` falls to 5 to 10 percent (45 to 60 tries at 5 percent), or raise `p` by its base value after each miss and reset on a drop.
- For exact proportions over a short run, use a bag: `shuffle(rng, bag)` over a list with each outcome repeated by its count, refilled when empty.
- `weightedPick(rng, table, (e) => e.weight)` returns an index, or -1 when no weight is positive.

## Economy

- Keep a ledger from simulated runs: income per minute by source, spending per minute by sink, balance trend. The player should afford the next meaningful purchase every 2 to 5 minutes.
- Sell prices at 25 to 50 percent of buy prices. No item may sell for more than its cheapest source costs, or a buy-sell loop prints money.
- Stored currency and carried value have caps; overflow is converted or lost with a visible message.

## Measuring balance

- Run 20 to 100 seeds headless with a scripted or AI player. Record clear time, deaths and currency, and report the median with the 10th and 90th percentiles.
- Change one parameter, rerun the same seeds, compare.
- An option (weapon, route, build) that beats every other on every seed is dominant: give it a cost or cut it.
