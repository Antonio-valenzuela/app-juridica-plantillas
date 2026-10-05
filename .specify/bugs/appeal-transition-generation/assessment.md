# BUG - appeal-transition-generation

Estado: **PARTIAL**

## CAUSE

1. `AppealResolutionReviewPanel.tsx:19` construia la notificacion como
   `notificationDate && bulletin ? ... : ''`. Exigia **fecha Y boletin**. Sin
   boletin (mayoria de resoluciones notificadas por otro medio) la notificacion
   quedaba vacia, `validateAppealConfirmation` era `eligible:false`, el checkbox
   de confirmar quedaba `disabled` y **"Generar apelacion" no podia habilitarse
   nunca**. No era un bug de estado: era un requisito imposible de satisfacer.

2. Una resolucion judicial en Contestacion se mostraba como aviso
   (`role="alert"`) pero NO era blocker. `getContestacionesGenerationBlockReason`
   recibia `compatible: true` forzado, asi que el boton quedaba HABILITADO
   mientras la UI decia "fuente incompatible". Contradiccion visible.

3. `isIncompatible` seguia siendo una via oculta de `disabled` en
   `ContestacionesChecklist` (`!isAllReady`), duplicando la fuente de verdad.

## RED

- `appealPhase1b 2 leaves no appeal requirement on a response`: el boton de
  contestacion debia quedar habilitado con fuente judicial (contrato INVERTIDO).
- Panel: sin boletin, `canConfirm`永远 false.

## FIX

- `AppealResolutionReviewPanel`: la notificacion se acredita con la FECHA; el
  boletin/folio es opcional y se rotula como tal.
- `CaseDocumentsReader`: `SOURCE_DOCUMENT_INCOMPATIBLE` entra en
  `generationBlockers[]` (`flow:'contestacion'`, `actionable:true`) con el texto
  exigido y la accion "cambia a Apelacion".
- El aviso `role="alert"` pasa a usar `judgmentSourceNeedsAppeal` y la
  redaccion del blocker (fuente unica).
- `isIncompatible={false}`: ya no es via oculta; la incompatibilidad es blocker
  visible.
- Tests actualizados al contrato correcto, con MAS aserciones (aislamiento
  verificable: el bloqueo de contestacion no es de apelacion).

## GREEN

```
appealPhase1b                  15/15
contestacionesFlowIsolation      6/6
writingAvailabilityNotice        6/6
DRAFT/FINAL security           13/13
LocalProvider isolation         5/5
UI admission guard              7/7
tsc --noEmit                   PASS
```

## STATE TRANSITION

```
CONTESTACION + SENTENCIA
  -> blocker SOURCE_DOCUMENT_INCOMPATIBLE (visible, accionable)
  -> Generar contestacion DISABLED
  -> [Cambiar a Apelacion] conserva fuente + fingerprint + resoluciones
  -> flow appeal: appealReview se inicializa, appealConfirmation se resetea
  -> se muestran requisitos SOLO de apelacion
  -> al seleccionar resolucion + confirmar datos: appealConfirmation valido
  -> Generar apelacion ENABLED
```

## BLOCKERS ANTES / DESPUES

| Escenario | Antes | Despues |
|---|---|---|
| Contestacion + sentencia | HABILITADO (bug) | DESHABILITADO + blocker visible |
| Apelacion sin resolucion | DESHABILITADO | DESHABILITADO (sin cambio) |
| Apelacion sin boletin | IMPOSIBLE habilitar | habilitado con fecha |

## PENDIENTE

- **Happy path E2E RED 5-8** (blockers=[] -> Generar habilitado -> click ->
  payload -> API -> DRAFT) **NO escrito**: el fixture `appealResolutionSource`
  no produce una notificacion legible y el panel exige `actor:`/`demandado:`
  por linea. Requiere trabajo de fixture.
- Checklist de apelacion sigue mostrando "Analisis de la demanda revisado"
  (contrato `appealPhase1b 1.2` lo exige visible y sin marcar). Decision de
  producto pendiente.
- No verificado: `appealPhase1b` 1.2 y el resto de la suite amplia.

## VEREDICTO

**PARTIAL** - causa raiz corregida en codigo; falta el E2E del happy path.