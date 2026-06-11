# canvas3d-mcp

Servidor MCP que dá a agentes de IA **olhos e instrumentos** para criar arte e jogos em `<canvas>` HTML: modelos 3D (Three.js, WebGL puro, Canvas 2D por software), ilustração 2D, UI de jogos, **pixel art** e **jogos 2D/3D jogáveis** (com playtest automatizado). Suporta projetos multi-arquivo (a pasta do HTML de entrada é servida inteira).

A IA escreve um arquivo HTML auto-contido; o servidor renderiza em Chromium headless e devolve:

- **`render_scene`** — screenshots multi-ângulo (front/side/top/three-quarter ou ângulos custom, close-up via `distance_factor < 1`) ou **frames sequenciais de animação** (`animation_frames` + `frame_interval_ms`). A IA passa a *ver* o que criou e itera.
- **`validate_scene`** — relatório JSON estruturado: erros de página/console, canvas em branco, e (com Three.js registrado) checks profundos do grafo de cena: objetos flutuando, sem luzes, fora do frustum, transform NaN, texturas sem UV, clipping de câmera etc. Para pixel art (`window.__pix`): `ANTI_ALIASING` (pixels borrados/fora da grade) e `PALETTE_OVERFLOW`. Cada issue vem com severidade e sugestão de correção.
- **`interact_scene`** — **playtest**: executa um roteiro de inputs (teclas seguradas, cliques, esperas) intercalado com screenshots e leituras de `window.__state()`, para a IA verificar que o gameplay funciona (player anda? pula? pontua?). Inclui estimativa de FPS.
- **`inspect_scene`** — dump da árvore de cena Three.js com bounding boxes em coordenadas de mundo, para raciocinar sobre posicionamento exato.
- **`get_guidelines`** — guias (workflow, ofício 3D geral, texturização, armadilhas por tecnologia, ilustração 2D + UI de jogos, pixel art).

Bibliotecas de helpers servidas em `/__helpers/` para o HTML da IA:

| Lib | Para | Destaques |
|---|---|---|
| `three-helpers.js` | Three.js | `register()`, `anchor()`, `mirrorX()`, `frameCamera()`, `threePointLights()`, `applyTexture()` |
| `canvas3d.js` | Canvas 2D | mini-engine 3D por software (`C3D`): primitivas, câmera orbital, flat shading |
| `webgl-helpers.js` | WebGL puro | `GLH`: shaders prontos, malhas com UVs, `mat4`, `orbitCamera`, upload de texturas |
| `texture-helpers.js` | todas | `TEX`: texturas procedurais (wood, brick, marble, noise, bump...) sem rede |
| `draw2d.js` | ilustração 2D / UI | `D2D`: camadas com transform, formas/gradientes/sombras, UI de jogos (panel, healthBar, button), ticker de animação |
| `pixel-helpers.js` | pixel art | `PIX`: grade lógica exibida nítida, paletas retrô (Game Boy, PICO-8, NES...), Bresenham, flood fill, dithering, espelhamento, outline, sprites, animação por frames |
| `game2d.js` | jogos 2D | `G2D`: loop com timestep fixo, input com edge detection, entidades/tags, colisão AABB, tilemap por strings com `moveEntity` (física de plataforma), câmera follow/shake, tweens, partículas, cenas |
| `game3d.js` | jogos 3D | `G3D`: bootstrap de mundo (luzes + registro automático), character controller (WASD+pulo+gravidade), câmera 3ª pessoa, colisores AABB `moveAndCollide`, raycast pick, spawner |

## Setup

```powershell
npm install
npx playwright install chromium
```

## Registrar no Claude Code

```powershell
# escopo do projeto atual:
claude mcp add canvas3d -- npx tsx "C:\Users\use\Desktop\ESTUDO\3d canvas improve\src\index.ts"

# ou disponível em todos os projetos:
claude mcp add --scope user canvas3d -- npx tsx "C:\Users\use\Desktop\ESTUDO\3d canvas improve\src\index.ts"
```

Depois peça, por exemplo: *"usando as tools do canvas3d, crie um robô 3D em Three.js — leia get_guidelines('workflow') primeiro e itere com render/validate até ficar bom".*

## O loop que a IA segue

1. `get_guidelines("workflow")` → convenções e snippets
2. escreve o HTML (com helpers, registrando `window.__scene` ou `window.__setView`)
3. `render_scene` → olha todos os ângulos
4. `validate_scene` → corrige errors, depois warnings
5. repete até imagem + relatório ficarem bons

## Desenvolvimento

```powershell
npm test            # vitest: unit + integração (Playwright real)
npm run typecheck   # tsc --noEmit
npx tsx scripts/smoke-render.ts examples/good-threejs-robot.html   # render direto, salva JPGs
npx tsx scripts/smoke-mcp.ts                                       # smoke da camada MCP via stdio
```

Estrutura: `src/` (servidor MCP + pipeline Playwright + análise), `src/probe/injected/` (scripts injetados na página), `helpers/` (libs servidas ao HTML), `guidelines/` (guias), `examples/` (cenas boas + `defects/` que disparam cada validador), `tests/`.

### Notas de plataforma (descobertas empiricamente nesta máquina)

- WebGL headless funciona **sem flags** (SwiftShader). Override: `CANVAS3D_BROWSER_ARGS`.
- O primeiro contexto WebGL criado logo após o launch do browser **é perdido** (corrida de init do processo GPU). Mitigado por warmup no launch + reload automático da página quando o snapshot detecta contexto perdido.
- Canvas WebGL "render-once" pode capturar em branco (buffer descartado após present). O probe força `preserveDrawingBuffer: true` e o servidor chama `window.__redraw` antes de capturar.
