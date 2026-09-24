# Maps

Each floor is one YAML file in `maps/<building>/`. `pnpm mapgen maps/<building>` turns it into a
[Tiled](https://www.mapeditor.org/) map (`.tmj`) that the game loads. Add `--png` to also write
`maps/<building>/preview/<floor>.png` for a quick visual check.

```yaml
name: Office — Ground floor
floor: wood            # default floor under furniture: wood | carpet | green | rose | tile | concrete
start: [15, 8]         # optional; or put '@' in the layout
layout: |
  ##WWWW######wwww##
  #..dd..#.,,,,,,,,#
  #..cc..D.,,TTTT,,#
  #......#.,cTTTTc,#
  ####DD############
areas:
  - { name: Meeting room, at: [8, 1, 9, 3], meeting: meeting-room, floor: carpet }
  - { name: Quiet corner, at: [1, 1, 3, 2], silent: true }
  - { name: stairs-up,    at: [4, 12, 2, 2], exit: floor-1.tmj#stairs-down }
  - { name: stairs-arrival, at: [6, 12, 1, 2] }
```

## Layout characters

| char | meaning | | char | meaning |
|---|---|---|---|---|
| `#` | wall | | `d` | desk with monitor |
| `W` | wall with window | | `c` | office chair (walkable) |
| `w` | wall with whiteboard | | `T` | table (joins with neighbouring `T`) |
| `.` | wood floor | | `k` | counter (joins with neighbouring `k`) |
| `,` | blue carpet | | `s` | sofa |
| `;` | green carpet (`:` rose carpet) | | `b` | bookshelf |
| `_` | tiles | | `p` | plant |
| `=` | concrete | | `m` | coffee machine |
| `D` | door (walkable) | | `S` | stairs (walkable) |
| `@` | start position | | ` ` (space) | outside / void |

If the first row of the layout starts with spaces (outside the building), use `layout: |2` so YAML
keeps the leading spaces.

Walls automatically show their front face when floor is below them. Furniture sits on the floor
type most common around it, unless an area sets `floor:`.

## Areas

`at: [x, y, width, height]` in tiles (0-based, top-left is `[0, 0]`).

| key | effect |
|---|---|
| `meeting: <id>` | LiveKit video meeting for everyone inside; area chat in the proximity tab |
| `silent: true` | nobody starts a proximity conversation here |
| `exit: <file>#<area>` | walking in loads another floor and places you in that area |
| `website: <url>` | (reserved) open a website panel |
| `matrixRoom: <name>` | walking in opens (and on first use creates) the chat room `#name` |
| `floor: <type>` | paint this floor under the whole rectangle |

Areas with slug-like names (`stairs-up`) are entry points; names with spaces/capitals are shown
to players as room names.

**Floors:** connect them with a pair of `exit` areas, and give each arrival its own area *next to*
the stairs (arriving inside an exit area is fine — it only triggers when you walk *into* it —
but a separate arrival spot avoids surprises).

## Tiled compatibility

Generated maps are plain Tiled JSON and can be polished in Tiled. The engine also loads
hand-made WorkAdventure-style maps: `collides` tile property, `start` layer/area, `exitUrl`,
`silent`, `jitsiRoom`/`livekitRoom`, `openWebsite`. Tilesets must be embedded in the map.
WorkAdventure's own tilesets are licensed only for WorkAdventure maps, so they are not bundled.
