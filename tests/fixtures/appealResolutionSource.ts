import type { UploadedSourceDocument } from '@/lib/legal-engine/types';
// Anonymized, minimal transcription preserving the real scan's boundaries (1/5/44).
// The final publication line is a controlled synthetic variant, not a verified reading of page 44.
export const appealResolutionSource: UploadedSourceDocument = {
  id: 'anonymous-scan', filename: 'anonymous-decisions.pdf', sourceValidated: true,
  pages: [
    { page: 1, chars: 0, text: 'JUZGADO QUINTO EN MATERIA FAMILIAR\nAUTO: SE DESECHA INCIDENTE, SE CITA A SENTENCIA.\nZAPOPAN, JALISCO A 12 DOCE DE AGOSTO DEL AÑO 2026\nPor recibido el escrito de PARTE DEMANDADA UNO.\nAhora 1 A\nNOTIFICACIÓN: BOLETÍN 120, 13 de agosto de 2026.' },
    { page: 5, chars: 0, text: 'PODER JUDICIAL DEL ESTADO\nJUZGADO QUINTO EN MATERIA FAMILIAR\nSE DICTA SENTENCIA DEFINITIVA\nEXPEDIENTE: ANON-01\nACTORES: J. ALFA, BETA, GAMMA Y J. DELTA, DE APELLIDOS APELLIDO UNO.\nDEMANDADOS:\nPARTE DEMANDADA UNO;\nLIC. NOTARIO DOS;\nDIRECCIÓN DEL ARCHIVO ESTATAL;\nSUCESIÓN TESTAMENTARIA DE PERSONA TRES.\nZAPOPAN, JALISCO A 24 VEINTICUATRO DE AGOSTO DE 2026\nVISTOS los autos.\nRESULTANDO Y CONSIDERANDO\nSEGUNDO. Se cita al SEGUNDO TRIBUNAL COLEGIADO DEL SEXTO CIRCUITO, materia federal.' },
    { page: 44, chars: 0, text: 'RESOLUTIVOS\nNotifíquese personalmente.\nNOTIFICACIÓN: BOLETÍN 139, 25 de agosto de 2026.' },
  ],
};
