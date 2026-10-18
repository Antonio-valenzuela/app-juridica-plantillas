import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveLexPlantillasStoragePaths } from './storagePaths';
import { sanitizeProfileInput } from './lawyerProfileStore';
import type { LawyerProfile } from './lawyerProfileTypes';

export interface DesktopOwner {
  version: 1;
  ownerId: string;
  profile: LawyerProfile & { professionalLicense: string; email: string };
}
const globalQueues = globalThis as typeof globalThis & { lexProfileWrites?: Map<string, Promise<unknown>> };
globalQueues.lexProfileWrites ??= new Map();

/** Local ownership is a workspace record, never a WEB organization/user. */
export class DesktopProfileRepository {
  private readonly file: string;
  constructor(root = resolveLexPlantillasStoragePaths().workspace) {
    this.file = path.resolve(root, 'desktop-owner-v1.json');
  }
  private async read(): Promise<DesktopOwner | null> {
    try {
      const owner = JSON.parse(await readFile(this.file, 'utf8')) as DesktopOwner;
      if (owner.version !== 1 || !/^[0-9a-f-]{36}$/.test(owner.ownerId)
        || owner.profile?.lawyerId !== owner.ownerId || typeof owner.profile.lawyerName !== 'string'
        || typeof owner.profile.professionalLicense !== 'string' || typeof owner.profile.email !== 'string') {
        throw new Error('DESKTOP_OWNER_CORRUPT');
      }
      return owner;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  private async write(owner: DesktopOwner) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(owner), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.file);
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  private async mutate(input?: Record<string, unknown>): Promise<DesktopOwner> {
    const prior = globalQueues.lexProfileWrites!.get(this.file) ?? Promise.resolve();
    const next = prior.catch(() => undefined).then(async () => {
      let owner = await this.read();
      if (!owner) {
        const ownerId = randomUUID();
        const now = new Date().toISOString();
        owner = { version: 1, ownerId, profile: {
          lawyerId: ownerId, lawyerName: '', firmName: '', professionalLicense: '', email: '',
          preferredTone: 'formal_academico', preferredStructure: [], preferredSectionOrdering: [],
          recurringFormulas: [], openingPatterns: [], closingPatterns: [], argumentPatterns: [],
          citationStyle: 'completo_con_registro', legalTerminology: [], preferredDefenses: [],
          preferredWayToContestFacts: [], preferredWayToContestBenefits: [], preferredWayToAttackEvidence: [],
          preferredWayToDevelopConstitutionalArguments: [], preferredWayToWritePetition: [],
          averageSectionLength: 'medio', preferredDocumentLength: 'estandar', createdAt: now, updatedAt: now,
        } };
        await this.write(owner);
      }
      if (input) {
        const sanitized = sanitizeProfileInput(input);
        for (const field of ['professionalLicense', 'email'] as const) {
          if (input[field] !== undefined) {
            if (typeof input[field] !== 'string' || input[field].length > 320) throw new TypeError('INVALID_PROFILE_FIELD');
            sanitized[field] = input[field].trim();
          }
        }
        // A blank submitted field clears it; it never restores demo defaults.
        owner.profile = { ...owner.profile, ...sanitized, lawyerId: owner.ownerId,
          lawyerName: sanitized.lawyerName === null ? '' : String(sanitized.lawyerName ?? owner.profile.lawyerName),
          firmName: sanitized.firmName === null ? '' : String(sanitized.firmName ?? owner.profile.firmName),
          updatedAt: new Date().toISOString(),
        };
        await this.write(owner);
      }
      return owner;
    });
    globalQueues.lexProfileWrites!.set(this.file, next);
    try { return await next; }
    finally { if (globalQueues.lexProfileWrites!.get(this.file) === next) globalQueues.lexProfileWrites!.delete(this.file); }
  }
  load() { return this.mutate(); }
  save(input: Record<string, unknown>) { return this.mutate(input); }
}
