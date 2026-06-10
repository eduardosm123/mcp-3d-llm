# canvas3d-mcp

Servidor MCP que dá a agentes de IA **olhos e instrumentos** para criar modelos 3D melhores em `<canvas>` HTML — qualquer tecnologia: Three.js, WebGL puro ou Canvas 2D (projeção por software).

A IA escreve um arquivo HTML auto-contido; o servidor renderiza em Chromium headless e devolve:

- **`render_scene`** — screenshots multi-ângulo (front/side/top/three-quarter ou ângulos custom, com close-up via `distance_factor < 1`). A IA passa a *ver* o que criou e itera.
- **`validate_scene`** — relatório JSON estruturado: erros de página/console, canvas em branco, e (com Three.js registrado) checks profundos do grafo de cena: objetos flutuando, sem luzes, fora do frustum, transform NaN, texturas sem UV, clipping de câmera etc. Cada issue vem com severidade e sugestão de correção.
- **`inspect_scene`** — dump da árvore de cena Three.js com bounding boxes em coordenadas de mundo, para raciocinar sobre posicionamento exato.
- **`get_guidelines`** — guias de modelagem (workflow, ofício geral, texturização, armadilhas por tecnologia).

Bibliotecas de helpers servidas em `/__helpers/` para o HTML da IA:

| Lib | Para | Destaques |
|---|---|---|
| `three-helpers.js` | Three.js | `register()`, `anchor()`, `mirrorX()`, `frameCamera()`, `threePointLights()`, `applyTexture()` |
| `canvas3d.js` | Canvas 2D | mini-engine 3D por software (`C3D`): primitivas, câmera orbital, flat shading |
| `webgl-helpers.js` | WebGL puro | `GLH`: shaders prontos, malhas com UVs, `mat4`, `orbitCamera`, upload de texturas |
| `texture-helpers.js` | todas | `TEX`: texturas procedurais (wood, brick, marble, noise, bump...) sem rede |

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
