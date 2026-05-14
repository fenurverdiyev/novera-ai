import React from 'react';
import { CheckIcon } from './Icons';

interface PlanSelectionProps {
  onSelect: (plan: 'free' | 'pro') => void;
}

export const PlanSelection: React.FC<PlanSelectionProps> = ({ onSelect }) => {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="max-w-4xl w-full bg-[#0a0a0a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row animate-in zoom-in-95 duration-500">
        
        {/* NovEra Free */}
        <div className="flex-1 p-8 border-b md:border-b-0 md:border-r border-white/5 flex flex-col">
          <div className="mb-6">
            <h3 className="text-xl font-medium text-white/60 mb-2 tracking-tight">NovEra</h3>
            <h2 className="text-4xl font-bold text-white mb-2 tracking-tighter">Free</h2>
            <p className="text-white/40 text-sm">Gündəlik ehtiyaclarınız üçün ideal seçim.</p>
          </div>
          
          <div className="space-y-4 mb-8 flex-1">
            <div className="flex items-start gap-3">
              <div className="mt-1 text-emerald-400"><CheckIcon size={18} /></div>
              <div>
                <p className="text-white/90 text-sm font-medium">Gündəlik 20 Sual Limiti</p>
                <p className="text-white/30 text-xs">Hər gün 20 sorğu haqqı</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-emerald-400"><CheckIcon size={18} /></div>
              <div>
                <p className="text-white/90 text-sm font-medium">Base & Universe Rejimi</p>
                <p className="text-white/30 text-xs">15 Base, 5 Universe axtarış</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-emerald-400"><CheckIcon size={18} /></div>
              <div>
                <p className="text-white/90 text-sm font-medium">Şəkil Analizi</p>
                <p className="text-white/30 text-xs">Limitsiz şəkil yükləmə və təhlil</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-emerald-400"><CheckIcon size={18} /></div>
              <div>
                <p className="text-white/90 text-sm font-medium">NovEra Canvas</p>
                <p className="text-white/30 text-xs">Yaradıcı kodlama və vizuallaşdırma</p>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => onSelect('free')}
            className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-medium transition-all active:scale-[0.98]"
          >
            Pulsuz Davam Et
          </button>
        </div>

        {/* NovEra Pro */}
        <div className="flex-1 p-8 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] flex flex-col relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest border border-emerald-500/20">
            Tövsiyə Olunur
          </div>
          
          <div className="mb-6">
            <h3 className="text-xl font-medium text-emerald-400 mb-2 tracking-tight">NovEra</h3>
            <h2 className="text-4xl font-bold text-white mb-2 tracking-tighter">Pro</h2>
            <p className="text-white/40 text-sm">Peşəkarlar üçün limitsiz imkanlar.</p>
          </div>
          
          <div className="space-y-4 mb-8 flex-1">
            <div className="flex items-start gap-3">
              <div className="mt-1 text-emerald-400"><CheckIcon size={18} /></div>
              <div>
                <p className="text-white/90 text-sm font-medium">Gündəlik 100 Sual Limiti</p>
                <p className="text-white/30 text-xs">Yüksək performanslı iş üçün</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-emerald-400"><CheckIcon size={18} /></div>
              <div>
                <p className="text-white/90 text-sm font-medium">Genişləndirilmiş Axtarış</p>
                <p className="text-white/30 text-xs">60 Base, 40 Universe axtarış</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-emerald-400"><CheckIcon size={18} /></div>
              <div>
                <p className="text-white/90 text-sm font-medium">NovEra 3.0 Modeli</p>
                <p className="text-white/30 text-xs">Ən son nəsil süni intellekt gücü</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-1 text-emerald-400"><CheckIcon size={18} /></div>
              <div>
                <p className="text-white/90 text-sm font-medium">Prioritet Dəstək</p>
                <p className="text-white/30 text-xs">Bütün funksiyalara ilk giriş</p>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => onSelect('pro')}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] active:scale-[0.98]"
          >
            Pro Planına Keç
          </button>
        </div>

      </div>
    </div>
  );
};
