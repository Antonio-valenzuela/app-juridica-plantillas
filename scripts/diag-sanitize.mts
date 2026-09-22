import fs from 'node:fs';
import { sanitizeLegalDocument } from '../lib/legal-engine/legalDocumentSanitizer';
import { measureRenderedDocumentPages } from '../lib/legal-engine/documentPageMetrics';
import type { UniversalLegalDocument, ContentBlock } from '../lib/legal-engine/types';

// Check if any blocks are dropped or modified significantly
console.log('Sanitizer diagnostic ready');
