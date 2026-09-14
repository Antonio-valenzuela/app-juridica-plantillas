const OFFICIAL_LEGAL_HOSTS = [
  'diputados.gob.mx',
  'dof.gob.mx',
  'scjn.gob.mx',
  'sjf2.scjn.gob.mx',
  'cjf.gob.mx',
  'congresoweb.congresojal.gob.mx',
  'periodicooficial.jalisco.gob.mx',
];

export const isOfficialLegalSourceUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return OFFICIAL_LEGAL_HOSTS.some(
      (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`)
    );
  } catch {
    return false;
  }
};
