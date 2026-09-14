export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-3 border-[#0B2545] border-t-transparent animate-spin" />
        <span className="text-xs font-semibold text-slate-600">Cargando Machotes Jurídicos...</span>
      </div>
    </div>
  );
}
