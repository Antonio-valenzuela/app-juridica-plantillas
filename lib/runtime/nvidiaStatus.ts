export interface NvidiaHealthSnapshot {
  provider?: string;
  configured?: boolean;
  available?: boolean;
  ok?: boolean;
}

export interface NvidiaIndicator {
  tone: 'success' | 'danger';
  label: 'NVIDIA Build Activo' | 'NVIDIA API no disponible';
}

export function deriveNvidiaIndicator(snapshot: NvidiaHealthSnapshot | null | undefined): NvidiaIndicator {
  if (snapshot?.provider === 'nvidia' && snapshot.ok !== false && snapshot.available === true) {
    return { tone: 'success', label: 'NVIDIA Build Activo' };
  }

  return { tone: 'danger', label: 'NVIDIA API no disponible' };
}
