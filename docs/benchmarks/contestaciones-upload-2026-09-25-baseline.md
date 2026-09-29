# Baseline técnico: subida de Contestaciones

Fecha: 2026-09-25  
Archivo: PDF real de 44 páginas usado en el diagnóstico  
Propósito: medir sin registrar texto jurídico ni contenido de páginas.

| Etapa | Duración observada |
|---|---:|
| FILE_RECEIVED | 7 ms |
| PDF_METADATA | 82 ms |
| NATIVE_EXTRACTION | 730 ms |
| OCR_PREPARATION (render Poppler equivalente) | 2,309 ms |
| OCR | 103,103 ms |
| NORMALIZATION | 6 ms |
| QUALITY_VALIDATION | 5 ms |
| TOTAL del benchmark | 106,258 ms |

## Métricas

- Tamaño: 3,999,739 bytes.
- Páginas totales: 44.
- Caracteres nativos: 779; promedio: 18 caracteres/página.
- Páginas que requieren OCR: 44/44.
- Páginas OCR: 44.
- Concurrencia observada: 2 workers.
- Caracteres OCR: 121,760.
- Confianza OCR promedio: 74.
- `sourceQualityStatus`: `READY`.
- `sourceValidated`: `true`.
- `qualityScore`: 100.
- Advertencias observadas: 0.
- Variación RSS del proceso benchmark: aproximadamente 211 MB.

El log del servidor del diagnóstico anterior registró 117 s de endpoint y 114,857 ms de extractor OCR. La diferencia frente a este benchmark (106,258 ms total, 103,103 ms OCR) es una variación de ejecución; ambas mediciones confirman que OCR domina el tiempo y no la transferencia.

No se guardó texto extraído, OCR, páginas ni contenido legal en este artefacto.

## Validación del flujo asíncrono

Se repitió el mismo PDF mediante `POST /api/templates/analyze-upload` con el modo asíncrono y se consultó su job hasta estado terminal. La respuesta de aceptación fue `202` y el servidor reportó páginas OCR reales, no porcentajes sintéticos.

| Medición | Resultado |
|---|---:|
| Aceptación del job | `202` en 1,692 ms |
| Progreso observado | `2/44` → `44/44` páginas OCR |
| Análisis completo del job | 104,501 ms |
| OCR del job | 101,430 ms |
| Caché: segunda ejecución | `200` en 180 ms |
| Caché: `cacheHit` | `true` |
| Caché: duración de análisis actual | 0 ms; no repitió OCR |

La aceptación incluye la resolución de identidad local; durante la prueba la base remota respondió sin cuota y el fallback local tardó aproximadamente 1.7 s una sola vez. El fallback local quedó amortiguado por una ventana breve para que el polling posterior no vuelva a consultar la base en cada actualización.
