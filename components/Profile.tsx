import React from 'react';
import { GoogleLoginButton } from './GoogleLoginButton';
import { useAuth } from '../hooks/useAuth';
import { getTranslation, Language } from '../utils/translations';

interface ProfileProps {
  language: Language;
  setActiveView?: (view: any) => void;
}

export const Profile: React.FC<ProfileProps> = ({ language, setActiveView }) => {
  const { user, isGuest, loginWithGoogle, logout, loadHistoryFromCloud, saveHistoryToCloud } = useAuth();
  const t = (key: any) => getTranslation(language, key);

  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [localName, setLocalName] = React.useState('');
  const [localEmail, setLocalEmail] = React.useState('');
  const [localPassword, setLocalPassword] = React.useState('');
  const [loginEmail, setLoginEmail] = React.useState('');
  const [loginPassword, setLoginPassword] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'register' | 'login'>('login');
  const [localAuthEmail, setLocalAuthEmail] = React.useState<string | null>(null);
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    try {
      const authRaw = localStorage.getItem('nov-era-auth');
      if (authRaw) setLocalAuthEmail(authRaw);
      const aRaw = localStorage.getItem('nov-era-avatar');
      if (aRaw) setAvatar(aRaw);
    } catch {}
  }, []);

  // Google login olduqda avatarı yenilə
  React.useEffect(() => {
    if (user?.picture) setAvatar(user.picture);
  }, [user]);

  const showMsg = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3500);
  };

  // Local qeydiyyat
  const handleLocalRegister = () => {
    const n = localName.trim(), e = localEmail.trim().toLowerCase(), p = localPassword;
    if (!n || !e || p.length < 6) { showMsg('Bütün xanaları doldurun (şifrə ≥6 simvol).', 'error'); return; }
    const users: any = (() => { try { return JSON.parse(localStorage.getItem('nov-era-users') || '{}'); } catch { return {}; } })();
    if (users[e]) { showMsg('Bu e‑poçt artıq qeydiyyatdan keçib.', 'error'); return; }
    users[e] = { name: n, email: e, password: p };
    localStorage.setItem('nov-era-users', JSON.stringify(users));
    localStorage.setItem('nov-era-auth', e);
    localStorage.setItem('nov-era-profile', JSON.stringify({ name: n, email: e }));
    setLocalAuthEmail(e);
    setLocalName(''); setLocalEmail(''); setLocalPassword('');
    showMsg('Qeydiyyat uğurlu!', 'success');
  };

  const handleLocalLogin = () => {
    const e = loginEmail.trim().toLowerCase(), p = loginPassword;
    const users: any = (() => { try { return JSON.parse(localStorage.getItem('nov-era-users') || '{}'); } catch { return {}; } })();
    const u = users[e];
    if (!u || u.password !== p) { showMsg('E‑poçt və ya şifrə yanlışdır.', 'error'); return; }
    localStorage.setItem('nov-era-auth', e);
    localStorage.setItem('nov-era-profile', JSON.stringify({ name: u.name, email: u.email }));
    setLocalAuthEmail(e);
    setLoginEmail(''); setLoginPassword('');
    showMsg('Uğurla daxil oldunuz!', 'success');
  };

  const handleLocalLogout = () => {
    localStorage.removeItem('nov-era-auth');
    localStorage.removeItem('nov-era-profile');
    setLocalAuthEmail(null);
    showMsg('Hesabdan çıxıldı.', 'info');
  };

  const handleGoogleLogin = (data: any) => {
    loginWithGoogle(data);
    showMsg(`Xoş gəldiniz, ${data.user?.name || ''}!`, 'success');
  };

  const handleGoogleLogout = () => {
    logout();
    setAvatar(null);
    showMsg('Hesabdan çıxıldı.', 'info');
  };

  const handleSyncHistory = async () => {
    setSaving(true);
    try {
      const raw = localStorage.getItem('nov-era-chat-history');
      const msgs = raw ? JSON.parse(raw) : [];
      await saveHistoryToCloud(msgs);
      showMsg('Söhbət tarixi Google hesabınıza saxlandı!', 'success');
    } catch { showMsg('Sinxronizasiya uğursuz oldu.', 'error'); }
    finally { setSaving(false); }
  };

  const handleLoadHistory = async () => {
    setSaving(true);
    try {
      const msgs = await loadHistoryFromCloud();
      if (msgs.length) {
        localStorage.setItem('nov-era-chat-history', JSON.stringify(msgs));
        showMsg(`${msgs.length} mesaj yükləndi. Yeni söhbət açın.`, 'success');
      } else {
        showMsg('Bulud tarixçəsi boşdur.', 'info');
      }
    } catch { showMsg('Yükləmə uğursuz oldu.', 'error'); }
    finally { setSaving(false); }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target?.result as string;
      setAvatar(b64);
      localStorage.setItem('nov-era-avatar', b64);
      showMsg('Avatar yeniləndi!');
    };
    reader.readAsDataURL(file);
  };

  const isLoggedIn = !isGuest || !!localAuthEmail;
  const displayName = user?.name || localAuthEmail || t('guest');
  const displayEmail = user?.email || localAuthEmail || '';
  const displayAvatar = avatar || user?.picture;

  const inputCls = 'w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all';
  const btnPrimary = 'w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-4 rounded-2xl transition-all transform hover:scale-[1.02] shadow-lg';

  return (
    <div className="flex-grow overflow-y-auto">
      <div className="min-h-full p-6 md:p-8">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Header */}
          <div className="text-center">
            <div className="inline-block p-5 rounded-3xl bg-white/10 backdrop-blur border border-white/20 shadow-2xl">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                ✨ Profil
              </h1>
              <p className="text-white/70 text-sm">Hesab məlumatlarınızı idarə edin</p>
            </div>
          </div>

          {/* Mesaj */}
          {message && (
            <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
              message.type === 'success' ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300' :
              message.type === 'error'   ? 'bg-red-500/20 border-red-400/40 text-red-300' :
              'bg-blue-500/20 border-blue-400/40 text-blue-300'
            }`}>
              <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                message.type === 'success' ? 'bg-emerald-400' :
                message.type === 'error' ? 'bg-red-400' : 'bg-blue-400'
              }`} />
              <span className="text-sm font-medium">{message.text}</span>
            </div>
          )}

          {isLoggedIn ? (
            /* ── GİRİŞ EDİLİB ── */
            <div className="space-y-5">
              {/* Avatar + Ad */}
              <div className="bg-white/10 backdrop-blur rounded-3xl border border-white/20 p-6 shadow-xl flex flex-col items-center gap-4">
                <div className="relative group">
                  <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-white/30 bg-white/10 flex items-center justify-center">
                    {displayAvatar ? (
                      <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-5xl">👤</span>
                    )}
                  </div>
                  {!user && (
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      className="absolute bottom-0 right-0 w-8 h-8 bg-cyan-500 hover:bg-cyan-400 rounded-full flex items-center justify-center text-white text-sm shadow-lg transition-colors"
                      title="Şəkli dəyiş"
                    >✏️</button>
                  )}
                  <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </div>

                <div className="text-center">
                  <div className="text-xl font-bold text-white">{displayName}</div>
                  <div className="text-sm text-white/60 mt-1">{displayEmail}</div>
                  {user && (
                    <span className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs text-white/70">
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                        <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                      </svg>
                      Google hesabı
                    </span>
                  )}
                </div>

                <div className="flex gap-3 w-full">
                  {user ? (
                    <button onClick={handleGoogleLogout} className="flex-1 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-semibold py-3 rounded-2xl transition-all shadow-lg">
                      🚪 Çıxış
                    </button>
                  ) : (
                    <button onClick={handleLocalLogout} className="flex-1 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-semibold py-3 rounded-2xl transition-all shadow-lg">
                      🚪 Çıxış
                    </button>
                  )}
                </div>
              </div>

              {/* NovEra Memory Management */}
              <div className="bg-gradient-to-br from-cyan-600/20 to-blue-600/20 backdrop-blur rounded-3xl border border-cyan-500/30 p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 border border-cyan-500/30">
                    <span className="text-2xl">🧠</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">NovEra Yaddaşı</h3>
                    <p className="text-white/60 text-xs">AI-ın sizin haqqınızda bildiklərini idarə edin.</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveView?.('memory')}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-2xl transition-all border border-white/10 hover:border-cyan-400/30 flex items-center justify-center gap-2 group"
                >
                  <span>Yaddaşı İdarə Et</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </button>
              </div>

              {/* Cloud History Sync (yalnız Google istifadəçilər) */}
              {user && (
                <div className="bg-white/10 backdrop-blur rounded-3xl border border-white/20 p-6 shadow-xl space-y-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    ☁️ Söhbət Tarixçəsi
                  </h3>
                  <p className="text-white/60 text-sm">Söhbəti Google hesabınızda saxlayın və ya yükləyin.</p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSyncHistory}
                      disabled={saving}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-white font-semibold py-3 rounded-2xl transition-all shadow-lg"
                    >
                      {saving ? '⏳ Saxlanır...' : '💾 Saxla'}
                    </button>
                    <button
                      onClick={handleLoadHistory}
                      disabled={saving}
                      className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 disabled:opacity-50 text-white font-semibold py-3 rounded-2xl transition-all shadow-lg"
                    >
                      {saving ? '⏳ Yüklənir...' : '📥 Yüklə'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── QİRİŞ EDİLMƏYİB ── */
            <div className="bg-white/10 backdrop-blur rounded-3xl border border-white/20 p-8 shadow-2xl space-y-6">

              {/* Google Giriş — əsas seçim */}
              <div className="text-center space-y-3">
                <p className="text-white/80 text-sm font-medium">Google hesabınızla daxil olun</p>
                <GoogleLoginButton
                  onSuccess={handleGoogleLogin}
                  onError={() => showMsg('Google giriş uğursuz oldu.', 'error')}
                  text="signin_with"
                />
              </div>

              <div className="flex items-center gap-4 my-2">
                <div className="flex-1 h-px bg-white/20" />
                <span className="text-white/40 text-xs">və ya</span>
                <div className="flex-1 h-px bg-white/20" />
              </div>

              {/* Local Auth Tabs */}
              <div>
                <div className="flex bg-black/20 rounded-2xl p-1 mb-5 border border-white/10">
                  <button
                    onClick={() => setActiveTab('login')}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'login' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg' : 'text-white/60 hover:text-white'}`}
                  >🔑 Giriş</button>
                  <button
                    onClick={() => setActiveTab('register')}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${activeTab === 'register' ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg' : 'text-white/60 hover:text-white'}`}
                  >🚀 Qeydiyyat</button>
                </div>

                {activeTab === 'login' ? (
                  <div className="space-y-4">
                    <input className={inputCls} type="email" placeholder="E‑poçt" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                    <input className={inputCls} type="password" placeholder="Şifrə" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                    <button onClick={handleLocalLogin} className={btnPrimary}>🚀 Daxil ol</button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <input className={inputCls} type="text" placeholder="Ad Soyad" value={localName} onChange={e => setLocalName(e.target.value)} />
                    <input className={inputCls} type="email" placeholder="E‑poçt" value={localEmail} onChange={e => setLocalEmail(e.target.value)} />
                    <input className={inputCls} type="password" placeholder="Şifrə (ən azı 6 simvol)" value={localPassword} onChange={e => setLocalPassword(e.target.value)} />
                    <button onClick={handleLocalRegister} className={btnPrimary}>✨ Qeydiyyatdan keç</button>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
