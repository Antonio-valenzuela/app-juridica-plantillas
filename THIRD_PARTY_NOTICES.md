# Third-party notices

APP-plantillas distribuye y ejecuta las dependencias directas de producción declaradas en `package.json` y fijadas por `package-lock.json`. Las versiones y licencias de esta tabla fueron inspeccionadas desde los `package.json` instalados el 24 de septiembre de 2026; el lockfile sigue siendo la fuente de resolución reproducible.

| Paquete | Versión instalada | Licencia | Proyecto |
|---|---:|---|---|
| `@prisma/client` | 6.19.3 | Apache-2.0 | [Prisma](https://github.com/prisma/prisma) |
| `docx` | 9.7.1 | MIT | [docx](https://github.com/dolanmiu/docx) |
| `form-data` | 4.0.6 | MIT | [form-data](https://github.com/form-data/form-data) |
| `mammoth` | 1.12.1 | BSD-2-Clause | [mammoth.js](https://github.com/mwilliamson/mammoth.js) |
| `next` | 16.3.4 | MIT | [Next.js](https://github.com/vercel/next.js) |
| `node-fetch` | 3.3.2 | MIT | [node-fetch](https://github.com/node-fetch/node-fetch) |
| `pdf-parse` | 2.4.5 | Apache-2.0 | [pdf-parse](https://github.com/mehmet-kozan/pdf-parse) |
| `react` | 19.2.3 | MIT | [React](https://github.com/facebook/react) |
| `react-dom` | 19.2.3 | MIT | [React](https://github.com/facebook/react) |
| `server-only` | 0.0.1 | MIT | [server-only](https://github.com/vercel/next.js/tree/canary/packages/next/src/compiled/server-only) |
| `tesseract.js` | 7.0.0 | Apache-2.0 | [Tesseract.js](https://github.com/naptha/tesseract.js) |
| `undici` | 7.29.0 | MIT | [Undici](https://github.com/nodejs/undici) |
| `zod` | 4.4.3 | MIT | [Zod](https://github.com/colinhacks/zod) |

## Obligaciones de distribución

- Los textos completos de las licencias deben conservarse junto con el artefacto de distribución cuando el instalador o contrato de despliegue los requiera. No se deben eliminar los archivos `LICENSE`, `NOTICE` o equivalentes incluidos por cada paquete.
- Las dependencias transitivas quedan determinadas por `package-lock.json`; una instalación limpia (`npm ci`) no debe sustituirse por una resolución flotante.
- `spa.traineddata` y Poppler no son dependencias npm. Su licencia y redistribución deben revisarse con el paquete binario que se elija antes de empaquetar OCR para producción.
