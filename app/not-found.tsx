import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-lex-primary">404</h1>
        <h2 className="mb-4 text-lex-section text-lex-on-surface">Página no encontrada</h2>
        <p className="mb-6 text-lex-body text-lex-secondary">
          La página solicitada no existe.
        </p>
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg bg-lex-primary-container px-4 py-2 text-lex-on-primary font-lex-ui text-lex-body-strong hover:bg-lex-primary transition-colors">
          <span className="material-symbols-outlined">home</span>
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}