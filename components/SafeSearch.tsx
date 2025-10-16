import React from 'react';
import { ArrowLeftIcon } from './Icons';

type Mode = 'off' | 'blur' | 'filter';

interface Props {
  value?: Mode;
  onChange?: (v: Mode) => void;
}

const SafeSearch: React.FC<Props> = ({ value = 'off', onChange }) => {
  const [mode, setMode] = React.useState<Mode>(value);

  React.useEffect(() => { setMode(value); }, [value]);

  const apply = (v: Mode) => {
    setMode(v);
    try { localStorage.setItem('nov-era-safe-search', v); } catch {}
    try { window.dispatchEvent(new CustomEvent('nov-era-safe-search-changed' as any, { detail: v })); } catch {}
    onChange?.(v);
  };

  const goBack = () => { try { window.dispatchEvent(new Event('nov-era-back' as any)); } catch {} };

  return (
    <div className="flex flex-col h-full bg-bg-jet/80 backdrop-blur-sm">
      {/* Header */}
      <div className="sticky top-0 z-10 -mb-2 bg-white/5 backdrop-blur border-b border-white/10 px-3 py-2">
        <button onClick={goBack} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/90 border border-white/15 text-sm">
          <ArrowLeftIcon className="w-4 h-4" />
          Geri
        </button>
      </div>
      <main className="flex-1 overflow-y-auto app-scroll">
        <div className="max-w-2xl mx-auto p-6 md:p-8">
          <div className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur p-6 md:p-8 shadow-2xl">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">SafeSearch</h1>
            <p className="text-white/70 mb-6">Axtarış nəticələrində açıq‑saçıq məzmunu idarə edin.</p>

            <div className="space-y-3">
              <label className={`flex items-start gap-3 p-4 rounded-2xl cursor-pointer border ${mode==='filter' ? 'border-accent/50 bg-accent/10' : 'border-white/10 hover:bg-white/5'}`}>
                <input type="radio" name="ss" className="mt-1" checked={mode==='filter'} onChange={() => apply('filter')} />
                <div>
                  <div className="text-white font-semibold">Filtr</div>
                  <div className="text-white/70 text-sm">Açıq‑saçıq nəticələri mümkün qədər gizlət.</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-2xl cursor-pointer border ${mode==='blur' ? 'border-accent/50 bg-accent/10' : 'border-white/10 hover:bg-white/5'}`}>
                <input type="radio" name="ss" className="mt-1" checked={mode==='blur'} onChange={() => apply('blur')} />
                <div>
                  <div className="text-white font-semibold">Bulanıqlıq</div>
                  <div className="text-white/70 text-sm">Şəkilləri bulanıq göstər (mətn və linklər qalır).</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-2xl cursor-pointer border ${mode==='off' ? 'border-accent/50 bg-accent/10' : 'border-white/10 hover:bg-white/5'}`}>
                <input type="radio" name="ss" className="mt-1" checked={mode==='off'} onChange={() => apply('off')} />
                <div>
                  <div className="text-white font-semibold">Deaktiv</div>
                  <div className="text-white/70 text-sm">Bütün nəticələr göstərilsin.</div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SafeSearch;
