# LOOP 6 — Hardening y release gate

## Alcance

Loop 6 verifica seguridad, resiliencia, determinismo, observabilidad y el gate de publicación sin reabrir el routing ni el flujo de `CaseContext` de los Loops 2–5.

## Gate reproducible

```powershell
npm run release-gate
```

El comando ejecuta, en orden, `npm audit --omit=dev --audit-level=high`, la suite completa, `typecheck`, `lint` y el build de producción. Las pruebas se ejecutan con `NVIDIA_API_KEY` vacío y `NVIDIA_REAL_TEST=false`; el build conserva `NODE_ENV=production`, `DEMO_MODE_ENABLED=false` y `ALLOW_DEV_ADMIN_TOKEN=false`.

## Controles confirmados

- Next.js y `eslint-config-next` están alineados en `16.3.4`.
- Prisma permanece en `6.19.3`, pero el lockfile aplica explícitamente `deepmerge-ts@8.0.2` mediante `overrides`; `prisma validate` y `prisma generate` pasan con esa resolución.
- El logger estructurado no expone claves NVIDIA, Bearer tokens ni documentos completos en sus campos contractuales.
- Las rutas API mantienen autenticación/alcance de organización y las pruebas IDOR existentes cubren la denegación de identidad no confiable.
- `GenerationJob` conserva transiciones terminales y progreso acotado; no puede reabrirse después de completar, fallar o cancelar.
- El nombre de exportación proviene de `Content-Disposition` del servidor y se sanitiza antes de usarse en el navegador.
- `.env`, claves y archivos de uploads permanecen ignorados por Git; `.env.example` no contiene credenciales y deshabilita demo/token de desarrollo por defecto.
- En producción multi-pod se requiere `REDIS_URL` con `USE_REDIS_JOBSTORE=true`; el almacenamiento en memoria queda explícitamente identificado como single-node.

## Bloqueos de producción

- La auditoría local detectó una credencial activa en el `.env` del entorno de trabajo. No se imprime ni se modifica; debe revocarse/rotarse en el proveedor y sustituirse mediante el gestor de secretos antes de publicar.
- El gate de producción debe ejecutarse con una base de datos real disponible, `ADMIN_TOKEN` fuerte, `DEMO_MODE_ENABLED=false` y la infraestructura Redis requerida para más de una instancia.

## Decisión

El advisory de Prisma queda resuelto por el override probado. Mientras permanezca la credencial local pendiente de rotación, el resultado es **NO-GO**. El código y las pruebas de aplicación quedan listos para repetir el secret scan tras invalidar la credencial anterior.
