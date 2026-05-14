import React, { useState } from 'react';
import { CloseIcon, UserIcon } from './Icons';

interface MemoryManagerProps {
  memory: string;
  setMemory: (memory: string) => void;
  onBack: () => void;
}

export const MemoryManager: React.FC<MemoryManagerProps> = ({ memory, setMemory, onBack }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [newFact, setNewFact] = useState('');

  const facts = memory.split('\n').filter(f => f.trim() !== '');

  const handleDelete = (index: number) => {
    const next = facts.filter((_, i) => i !== index);
    setMemory(next.join('\n'));
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    const next = [...facts];
    next[editingIndex] = editText.trim();
    setMemory(next.join('\n'));
    setEditingIndex(null);
  };

  const handleAdd = () => {
    if (!newFact.trim()) return;
    setMemory([...facts, newFact.trim()].join('\n'));
    setNewFact('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/30">
            <UserIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">NovEra Yaddaşı</h1>
            <p className="text-xs text-white/50">AI-ın sizin haqqınızda öyrəndiyi və yadda saxladığı faktlar</p>
          </div>
        </div>
        <button
          onClick={onBack}
          className="p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white/70 transition-all border border-white/10"
        >
          <CloseIcon className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        {/* Info Card */}
        <div className="p-5 rounded-[2rem] bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-white/10 relative overflow-hidden">
            <div className="relative z-10">
                <h3 className="font-bold text-cyan-400 mb-1">Ağıllı Yaddaş</h3>
                <p className="text-sm text-white/70 leading-relaxed">
                    NovEra söhbət zamanı mühüm detalları (adınız, maraqlarınız, xüsusi seçimləriniz) avtomatik qeyd edir. 
                    Bu məlumatlar bütün söhbətlərdə sizi daha yaxşı tanımaq üçün istifadə olunur.
                </p>
            </div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 blur-[60px] -mr-16 -mt-16"></div>
        </div>

        {/* Add New */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/40 ml-1">Fakt Əlavə Et</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              placeholder="Məsələn: Mən çayı şəkərsiz xoşlayıram"
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button
              onClick={handleAdd}
              className="px-6 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm transition-all shadow-lg shadow-cyan-900/20"
            >
              Əlavə et
            </button>
          </div>
        </div>

        {/* Facts List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <h2 className="text-sm font-bold uppercase tracking-widest text-white/40">Saxlanılan Faktlar ({facts.length})</h2>
            {facts.length > 0 && (
                <button 
                    onClick={() => { if(confirm('Bütün yaddaşı silmək istəyirsiniz?')) setMemory(''); }}
                    className="text-[10px] font-bold text-rose-400/70 hover:text-rose-400 uppercase tracking-tighter transition-colors"
                >
                    Hamısını Sil
                </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 gap-3">
            {facts.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-[2.5rem]">
                <p className="text-white/30 text-sm">Hələ heç bir fakt yadda saxlanılmayıb.</p>
              </div>
            ) : (
              facts.map((fact, i) => (
                <div
                  key={i}
                  className="group p-4 rounded-3xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all hover:bg-white/10 flex items-start justify-between gap-4"
                >
                  {editingIndex === i ? (
                    <div className="flex-1 flex flex-col gap-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full bg-black/40 border border-white/20 rounded-xl p-3 text-sm focus:outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button onClick={handleSaveEdit} className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300">Yadda Saxla</button>
                        <button onClick={() => setEditingIndex(null)} className="text-[11px] font-bold text-white/40 hover:text-white/60">Ləğv Et</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-white/90 leading-relaxed py-1">{fact}</p>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => { setEditingIndex(i); setEditText(fact); }}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 hover:text-cyan-400 transition-all"
                          title="Düzəliş et"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(i)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 transition-all"
                          title="Sil"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
