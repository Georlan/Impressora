# KA7 Print Studio

Estúdio local para preparar e imprimir imagens/texto na impressora térmica Bluetooth
**KA-1445 (alias KA7)** — 58 mm, 384 dots (48 bytes/linha), ESC/POS raster `GS v 0`.

- Frontend: React 19 + TanStack Start/Vite + Tailwind v4 + shadcn.
- Bridge local: `bridge/server.ts` (Node/TypeScript) → chama o utilitário `imprimir-ka7`
  via `child_process`, enviando os bytes **por stdin** (sem arquivos temporários).
- Sem banco, sem login, sem cloud. Histórico fica no `localStorage` do navegador.

> **O browser nunca fala Bluetooth.** Toda impressão real passa pelo bridge em
> `http://localhost:7777`. Um preview hospedado na nuvem (Lovable, Cloudflare…) **não
> alcança a impressora do seu computador** — nesse caso o app entra em **modo demo**:
> o preview térmico continua funcionando e você pode baixar o `.bin` para imprimir
> manualmente com `imprimir-ka7 arquivo.bin`.

## Pré-requisitos (Linux)

1. Impressora KA-1445 pareada (Bluetooth Classic BR/EDR, SPP, RFCOMM canal 1, MAC configurado no utilitário local `imprimir-ka7`).
2. O utilitário **`imprimir-ka7` no PATH** (ex.: `~/.local/bin/imprimir-ka7`). O bridge depende dele:

   ```bash
   imprimir-ka7 arquivo.bin          # arquivo
   cat arquivo.bin | imprimir-ka7    # stdin   ← é assim que o bridge usa
   imprimir-ka7 -t "Texto"           # continua disponível no utilitário, mas o app não depende dele
   ```

   Ele abre um socket Python `AF_BLUETOOTH/BTPROTO_RFCOMM`, envia em blocos de 512 bytes com
   10 ms de pacing e fecha. Não usamos `/dev/rfcomm0`, CUPS, BLE GATT nem conexão persistente.
3. Node 18+ (ou Bun) e `npm`/`bun`.

## Rodando localmente

```bash
npm install
npm run dev:all        # sobe frontend (http://localhost:8080) + bridge (http://localhost:7777)
```

Ou em dois terminais:

```bash
npm run dev            # frontend
npm run dev:bridge     # bridge local
```

Abra `http://localhost:8080`. Ao carregar a página o app verifica **somente o bridge** e não abre
Bluetooth automaticamente. Isso evita conexões desnecessárias e disputa com Blueman/outros clientes.

| Status         | Significado                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| Testando...    | Verificando o bridge ou executando um teste solicitado pelo usuário         |
| Bridge pronto  | Bridge e `imprimir-ka7` disponíveis; Bluetooth ainda não foi aberto          |
| Pronta         | Um teste manual conseguiu abrir/enviar/fechar a conexão com a KA7            |
| Indisponível   | O último teste real falhou                                                   |
| Modo demo      | Bridge não encontrado (preview na nuvem ou `dev:bridge` parado)             |

### Controles rápidos

A página oferece comandos independentes, sempre com conexão sob demanda:

- **Testar conexão** — envia apenas `ESC @`, sem mover papel.
- **Teste texto** — imprime um texto curto.
- **Reset** — reinicializa o estado ESC/POS.
- **Feed +1 / +3 / +5 / +10** — usa `ESC d n` apenas para avançar o papel.
- **Diagnóstico** — exibe os últimos jobs do bridge, duração, bytes, stdout e stderr reais do
  `imprimir-ka7`. Isso evita o erro genérico "código 1" esconder a causa da falha.

### Variáveis opcionais

| Variável               | Onde     | Padrão                  |
| ---------------------- | -------- | ----------------------- |
| `VITE_KA7_BRIDGE_URL`  | frontend | `http://localhost:7777` |
| `KA7_BRIDGE_PORT`      | bridge   | `7777`                  |
| `KA7_BRIDGE_HOST`      | bridge   | `127.0.0.1`             |
| `KA7_PRINT_CMD`        | bridge   | `imprimir-ka7`          |

## API do bridge

| Rota                | Corpo                        | Ação                                              |
| ------------------- | ---------------------------- | ------------------------------------------------- |
| `GET  /health`      | —                            | Bridge vivo? `imprimir-ka7` encontrado no PATH?   |
| `POST /probe`       | —                            | Envia `ESC @` por stdin (teste seguro de conexão) |
| `POST /print/raw`   | `application/octet-stream`   | Pipe dos bytes ESC/POS → `imprimir-ka7` (stdin)   |
| `POST /print/text`  | `{"text": "..."}`            | Gera ESC/POS de texto e envia por stdin ao `imprimir-ka7` |

Um job por vez; timeout de 90 s; CORS liberado (o frontend pode estar em outra origem).

## Pipeline de imagem (frontend)

`src/lib/ka7/`

- `bitmap.ts` — funções puras: cinza, brilho/contraste, threshold, Floyd-Steinberg, Atkinson,
  recorte automático, layout (escala/margens/alinhamento) e composição em **exatamente 384 dots**.
- `process-image.ts` — Canvas/ImageData: carrega a imagem, redimensiona (nearest-neighbor para
  Pixel Art), roda o pipeline e desenha o **mesmo** bitmap 1-bit no preview.
- `escpos.ts` — `bitmapToEscPos()`: `ESC @` · `ESC a 1` · `GS v 0 m=0 xL=48 xH=0 yL yH` + raster
  (em bandas de até 1024 linhas) · `ESC d n`. Determinístico e coberto por testes.
- `bridge.ts` — cliente HTTP do bridge (health, probe, printRaw, printText, download `.bin`).
- `history.ts` — histórico em `localStorage` (guarda o ESC/POS já gerado para "Imprimir novamente").

Presets: **Pixel Art** (nearest, sem dithering) · **Foto** (Floyd-Steinberg) · **Logo**
(limiar alto, recorte automático, fundo limpo).

## Testes

```bash
npm test
```

## Roadmap

- [ ] Texto avançado (fontes, negrito, tamanho) via raster em vez de `-t`.
- [ ] GitHub + frontend no Cloudflare Pages (o bridge continua local, sempre).