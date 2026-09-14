import { LawyerProfile, DEFAULT_LAWYER_PROFILE } from './lawyerProfileTypes';
export type { LawyerProfile };
export { DEFAULT_LAWYER_PROFILE };

function getNodeFs(): typeof import('fs') | null {
  try { return eval('require')('fs'); } catch { return null; }
}
function getNodePath(): typeof import('path') | null {
  try { return eval('require')('path'); } catch { return null; }
}
function getNodeCrypto(): typeof import('crypto') | null {
  try { return eval('require')('crypto'); } catch { return null; }
}

const SUBFOLDERS = [
  'cases',
  'lawyers',
  'documents',
  'templates',
  'history',
  'exports',
  'index',
  'ocr',
  'thumbnails'
] as const;

export class LegalWorkspaceManager {
  private workspaceRoot: string;

  constructor(customRoot?: string) {
    const p = getNodePath();
    const defaultPath = p ? p.join(process.cwd(), 'data', 'legal-workspace') : '/tmp/legal-workspace';
    this.workspaceRoot = p ? p.resolve(customRoot || process.env.LEGAL_WORKSPACE_ROOT || defaultPath) : defaultPath;
    this.ensureRootDirectory();
  }

  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  private ensureRootDirectory(): void {
    const fsMod = getNodeFs();
    if (fsMod && !fsMod.existsSync(this.workspaceRoot)) {
      fsMod.mkdirSync(this.workspaceRoot, { recursive: true });
    }
  }

  /**
   * Prevents Path Traversal. Resolves target path and enforces that it remains strictly inside workspaceRoot.
   */
  public resolveSafePath(lawyerId: string, subfolder: typeof SUBFOLDERS[number], fileName: string): string {
    const fsMod = getNodeFs();
    const p = getNodePath();
    if (!fsMod || !p) throw new Error('Entorno no compatible con sistema de archivos.');

    const safeLawyerId = lawyerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFileName = p.basename(fileName);
    const targetDir = p.resolve(this.workspaceRoot, 'lawyers', safeLawyerId, subfolder);
    
    if (!targetDir.startsWith(this.workspaceRoot)) {
      throw new Error(`Acceso denegado: Path Traversal detectado fuera del directorio raíz de trabajo (${this.workspaceRoot}).`);
    }

    if (!fsMod.existsSync(targetDir)) {
      fsMod.mkdirSync(targetDir, { recursive: true });
    }

    const safeFullPath = p.resolve(targetDir, safeFileName);
    if (!safeFullPath.startsWith(targetDir)) {
      throw new Error(`Acceso denegado: intento de path traversal en el archivo "${fileName}".`);
    }

    return safeFullPath;
  }

  public ensureLawyerWorkspace(lawyerId: string): string {
    const fsMod = getNodeFs();
    const p = getNodePath();
    if (!fsMod || !p) throw new Error('Entorno no compatible con sistema de archivos.');

    const safeLawyerId = lawyerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const lawyerDir = p.resolve(this.workspaceRoot, 'lawyers', safeLawyerId);
    
    if (!lawyerDir.startsWith(this.workspaceRoot)) {
      throw new Error('Path Traversal invalido');
    }

    SUBFOLDERS.forEach(sub => {
      const dir = p.join(lawyerDir, sub);
      if (!fsMod.existsSync(dir)) {
        fsMod.mkdirSync(dir, { recursive: true });
      }
    });

    return lawyerDir;
  }

  public async saveDocumentFile(
    lawyerId: string,
    subfolder: typeof SUBFOLDERS[number],
    filename: string,
    content: Buffer | string
  ): Promise<{ fileId: string; filePath: string; relativePath: string; hash: string }> {
    const fsMod = getNodeFs();
    const p = getNodePath();
    const c = getNodeCrypto();
    if (!fsMod || !p || !c) throw new Error('Entorno no compatible con sistema de archivos.');

    this.ensureLawyerWorkspace(lawyerId);
    
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    const hash = c.createHash('sha256').update(buffer).digest('hex');
    const ext = p.extname(filename);
    const fileId = `${hash.slice(0, 16)}${ext}`;
    const safePath = this.resolveSafePath(lawyerId, subfolder, fileId);

    await fsMod.promises.writeFile(safePath, buffer);
    const relativePath = p.relative(this.workspaceRoot, safePath);

    return { fileId, filePath: safePath, relativePath, hash };
  }

  public async readDocumentFile(lawyerId: string, subfolder: typeof SUBFOLDERS[number], filename: string): Promise<Buffer> {
    const fsMod = getNodeFs();
    if (!fsMod) throw new Error('Entorno no compatible con sistema de archivos.');

    const safePath = this.resolveSafePath(lawyerId, subfolder, filename);
    if (!fsMod.existsSync(safePath)) {
      throw new Error(`Archivo local no encontrado en el workspace: ${filename}`);
    }
    return await fsMod.promises.readFile(safePath);
  }

  public async saveLawyerProfile(profile: LawyerProfile): Promise<LawyerProfile> {
    const fsMod = getNodeFs();
    if (!fsMod) throw new Error('Entorno no compatible con sistema de archivos.');

    const lawyerId = profile.lawyerId || 'lawyer-default';
    this.ensureLawyerWorkspace(lawyerId);
    
    const updatedProfile: LawyerProfile = {
      ...profile,
      lawyerId,
      updatedAt: new Date().toISOString()
    };

    const safePath = this.resolveSafePath(lawyerId, 'lawyers' as any, 'profile.json');
    await fsMod.promises.writeFile(safePath, JSON.stringify(updatedProfile, null, 2), 'utf-8');
    return updatedProfile;
  }

  public async getLawyerProfile(lawyerId: string): Promise<LawyerProfile> {
    const fsMod = getNodeFs();
    try {
      const safePath = this.resolveSafePath(lawyerId, 'lawyers' as any, 'profile.json');
      if (fsMod && fsMod.existsSync(safePath)) {
        const raw = await fsMod.promises.readFile(safePath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch {
      // Fallback to default
    }
    return { ...DEFAULT_LAWYER_PROFILE, lawyerId };
  }
}

export const defaultWorkspaceManager = new LegalWorkspaceManager();
