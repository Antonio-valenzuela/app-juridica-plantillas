# LOOP 4 — Matriz de soporte documental

Fuente: `DOCUMENT_TYPES` + `DocumentTemplates`, consolidada por
`buildDocumentSupportMatrix()`. Los IDs de la tabla son los que deben viajar
desde la UI hasta `/api/legal-engine/generate` y el pipeline.

| Tab/categoría | Label | Canonical ID | Strategy | Template | Estado |
|---|---|---|---|---|---|
| inicial | Demanda | `demanda` | `demanda` | `demanda` | SUPPORTED |
| contestacion | Contestación de demanda | `contestacion_demanda` | `contestacion_demanda` | `contestacion_demanda` | SUPPORTED |
| contestacion | Reconvención | `reconvencion` | — | — | MISSING_TEMPLATE |
| inicial | Ampliación | `ampliacion` | — | — | MISSING_TEMPLATE |
| contestacion | Réplica | `replica` | `replica` | `replica` | SUPPORTED |
| contestacion | Dúplica | `duplica` | `duplica` | `duplica` | SUPPORTED |
| incidental | Incidente | `incidente` | — | — | MISSING_TEMPLATE |
| recurso | Recurso | `recurso` | — | — | MISSING_TEMPLATE |
| recurso | Apelación | `apelacion` | — | — | MISSING_TEMPLATE |
| recurso | Revocación | `revocacion` | — | — | MISSING_TEMPLATE |
| recurso | Queja | `queja` | — | — | MISSING_TEMPLATE |
| recurso | Reclamación | `reclamacion` | — | — | MISSING_TEMPLATE |
| amparo | Amparo directo | `amparo_directo` | — | — | NOT_APPLICABLE |
| amparo | Amparo indirecto | `amparo_indirecto` | — | — | NOT_APPLICABLE |
| recurso | Agravios | `agravios` | — | — | MISSING_TEMPLATE |
| argumentacion | Alegatos | `alegatos` | — | — | MISSING_TEMPLATE |
| promocion | Promoción | `promocion` | — | — | MISSING_TEMPLATE |
| promocion | Solicitud | `solicitud` | — | — | MISSING_TEMPLATE |
| promocion | Escrito libre | `escrito_libre` | `escrito_libre` | `escrito_libre` | SUPPORTED |
| recurso | Recurso de Queja | `recurso_queja` | `recurso_queja` | `recurso_queja` | SUPPORTED |
| recurso | Recurso de Reclamación | `recurso_reclamacion` | `recurso_reclamacion` | `recurso_reclamacion` | SUPPORTED |
| recurso | Recurso de Revisión | `recurso_revision` | — | — | MISSING_TEMPLATE |
| recurso | Recurso Administrativo | `recurso_administrativo` | `recurso_administrativo` | `recurso_administrativo` | SUPPORTED |
| recurso | Recurso de Revisión en Amparo Directo | `recurso_revision_amparo_directo` | `recurso_revision_amparo_directo` | `recurso_revision_amparo_directo` | SUPPORTED |
| amparo | Demanda de Amparo Indirecto | `demanda_amparo_indirecto` | `demanda_amparo_indirecto` | `demanda_amparo_indirecto` | SUPPORTED |
| amparo | Demanda de Amparo Directo | `demanda_amparo_directo` | `demanda_amparo_directo` | `demanda_amparo_directo` | SUPPORTED |
| contestacion | Contestación de Demanda Laboral | `contestacion_demanda_laboral` | `contestacion_demanda_laboral` | `contestacion_demanda_laboral` | SUPPORTED |
| contestacion | Contestación de Demanda Civil | `contestacion_demanda_civil` | `contestacion_demanda_civil` | `contestacion_demanda_civil` | SUPPORTED |
| promocion | Escrito sobre Cumplimiento de Sentencia | `escrito_cumplimiento_sentencia` | `escrito_cumplimiento_sentencia` | `escrito_cumplimiento_sentencia` | SUPPORTED |
| contestacion | Contestación / Revisión extraordinaria ante sentencia de amparo directo | `contestacion_revision_extraordinaria_amparo_directo` | mismo ID | mismo ID | SUPPORTED |
| recurso | Escrito de Agravios | `escrito_agravios` | `escrito_agravios` | `escrito_agravios` | SUPPORTED |
| incidental | Incidente Procesal | `incidente_procesal` | `incidente_procesal` | `incidente_procesal` | SUPPORTED |
| otro | Otro | `otro` | `escrito_libre` | `escrito_libre` | LEGACY_SAFE_FALLBACK |

Resumen actual: 33 IDs; 17 SUPPORTED, 13 MISSING_TEMPLATE, 2
NOT_APPLICABLE y 1 LEGACY_SAFE_FALLBACK. No hay MISSING_STRATEGY ni
DEPRECATED declarados en el catálogo vigente; si aparece uno, debe añadirse
como estado explícito antes de considerarlo generable.

Reglas negativas cubiertas por la prueba de matriz:

- un ID explícito desconocido produce `UNKNOWN_DOCUMENT_TYPE`;
- los IDs genéricos `amparo_directo`/`amparo_indirecto` no producen demandas;
- un ID taxonómico sin plantilla produce `MISSING_TEMPLATE_MAPPING`;
- `otro` solo llega a `escrito_libre` cuando no existe `selectedDocumentType`;
- una fuente no sustituye el ID seleccionado;
- el alias visible de la estrategia post-sentencia resuelve a su propio ID.
