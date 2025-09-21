import React from 'react';
import type { UserProfile } from '../types';

export const Profile: React.FC = () => {
  // Auth + profile state
  const [authEmail, setAuthEmail] = React.useState<string | null>(null);
  const [activeAuthTab, setActiveAuthTab] = React.useState<'register' | 'login'>('register');
  const [regName, setRegName] = React.useState('');
  const [regEmail, setRegEmail] = React.useState('');
  const [regPassword, setRegPassword] = React.useState('');
  const [loginEmail, setLoginEmail] = React.useState('');
  const [loginPassword, setLoginPassword] = React.useState('');

  const [profile, setProfile] = React.useState<UserProfile>({ name: '', email: '' });
  const [avatar, setAvatar] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  // Password change state
  const [showPasswordChange, setShowPasswordChange] = React.useState(false);
  const [oldPwd, setOldPwd] = React.useState('');
  const [newPwd, setNewPwd] = React.useState('');
  const [confirmPwd, setConfirmPwd] = React.useState('');

  // Password visibility toggles
  const [showRegPassword, setShowRegPassword] = React.useState(false);
  const [showLoginPassword, setShowLoginPassword] = React.useState(false);
  const [showOldPwd, setShowOldPwd] = React.useState(false);
  const [showNewPwd, setShowNewPwd] = React.useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = React.useState(false);

  // Avatar upload ref for custom button
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    try {
      const authRaw = localStorage.getItem('nov-era-auth');
      if (authRaw) setAuthEmail(authRaw);
      const pRaw = localStorage.getItem('nov-era-profile');
      const aRaw = localStorage.getItem('nov-era-avatar');
      if (pRaw) setProfile(JSON.parse(pRaw));
      if (aRaw) setAvatar(aRaw);
    } catch {}
  }, []);

  const showMessage = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleChange = (key: keyof UserProfile, value: string) => {
    setProfile(prev => ({ ...prev, [key]: value }));
  };

  // Local demo user store
  type StoredUser = { name: string; email: string; password: string };
  const getUsers = (): Record<string, StoredUser> => {
    try { return JSON.parse(localStorage.getItem('nov-era-users') || '{}'); } catch { return {}; }
  };
  const setUsers = (users: Record<string, StoredUser>) => {
    localStorage.setItem('nov-era-users', JSON.stringify(users));
  };

  const handleRegister = () => {
    const n = regName.trim();
    const e = regEmail.trim().toLowerCase();
    const p = regPassword;
    if (!n || !e || p.length < 6) {
      showMessage('Xahiş edirik bütün xanaları doldurun (şifrə ən azı 6 simvol).', 'error');
      return;
    }
    const users = getUsers();
    if (users[e]) {
      showMessage('Bu e‑poçt artıq qeydiyyatdan keçib.', 'error');
      return;
    }
    users[e] = { name: n, email: e, password: p };
    setUsers(users);
    localStorage.setItem('nov-era-auth', e);
    localStorage.setItem('nov-era-profile', JSON.stringify({ name: n, email: e }));
    setAuthEmail(e);
    setProfile({ name: n, email: e });
    setRegName(''); setRegEmail(''); setRegPassword('');
    showMessage('Qeydiyyat uğurla tamamlandı! Xoş gəlmisiniz.', 'success');
  };

  const handleLogin = () => {
    const e = loginEmail.trim().toLowerCase();
    const p = loginPassword;
    const users = getUsers();
    const u = users[e];
    if (!u || u.password !== p) {
      showMessage('E‑poçt və ya şifrə yanlışdır.', 'error');
      return;
    }
    localStorage.setItem('nov-era-auth', e);
    localStorage.setItem('nov-era-profile', JSON.stringify({ name: u.name, email: u.email }));
    setAuthEmail(e);
    setProfile({ name: u.name, email: u.email });
    setLoginEmail(''); setLoginPassword('');
    showMessage('Uğurla daxil oldunuz!', 'success');
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('nov-era-auth');
      setAuthEmail(null);
      setProfile({ name: '', email: '' });
      setAvatar(null);
      showMessage('Hesabdan çıxıldı.', 'info');
    } catch {}
  };

  const handleChangePassword = () => {
    if (!authEmail) return;
    const users = getUsers();
    const u = users[authEmail];
    if (!u) {
      showMessage('İstifadəçi tapılmadı.', 'error');
      return;
    }
    if (u.password !== oldPwd) {
      showMessage('Köhnə şifrə düzgün deyil.', 'error');
      return;
    }
    if (newPwd.length < 6) {
      showMessage('Yeni şifrə ən azı 6 simvol olmalıdır.', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      showMessage('Yeni şifrə ilə təkrar uyğun gəlmir.', 'error');
      return;
    }
    users[authEmail] = { ...u, password: newPwd };
    setUsers(users);
    setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    setShowPasswordChange(false);
    showMessage('Şifrə uğurla yeniləndi!', 'success');
  };

  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function resizeDataUrl(dataUrl: string, maxSize = 256): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setSaving(true);
      const dataUrl = await fileToDataUrl(file);
      const small = await resizeDataUrl(dataUrl, 256);
      setAvatar(small);
      localStorage.setItem('nov-era-avatar', small);
      showMessage('Avatar yeniləndi!', 'success');
    } catch {
      showMessage('Avatar yükləmə zamanı xəta baş verdi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem('nov-era-profile', JSON.stringify({ name: profile.name.trim(), email: profile.email.trim() }));
      showMessage('Profil məlumatları yadda saxlandı!', 'success');
    } catch {
      showMessage('Saxlama zamanı xəta baş verdi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatar(null);
    try { 
      localStorage.removeItem('nov-era-avatar'); 
      showMessage('Avatar silindi.', 'info');
    } catch {}
  };

  return (
    <div className="flex-grow overflow-y-auto">
      <div className="min-h-full p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header with glassmorphism */}
          <div className="text-center mb-8">
            <div className="inline-block p-6 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 shadow-2xl mb-6">
              <h1 className="text-6xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-3 animate-pulse">
                ✨ Profil
              </h1>
              <p className="text-white/80 text-lg font-medium">Hesab məlumatlarınızı idarə edin</p>
            </div>
          </div>

          {/* Message Display with enhanced styling */}
          {message && (
            <div className={`mb-6 p-5 rounded-2xl border backdrop-blur-md transition-all duration-500 transform hover:scale-[1.02] ${
              message.type === 'success' ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 shadow-emerald-500/25' :
              message.type === 'error' ? 'bg-red-500/20 border-red-400/40 text-red-300 shadow-red-500/25' :
              'bg-blue-500/20 border-blue-400/40 text-blue-300 shadow-blue-500/25'
            } shadow-xl`}>
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full animate-pulse ${
                  message.type === 'success' ? 'bg-emerald-400' :
                  message.type === 'error' ? 'bg-red-400' : 'bg-blue-400'
                }`} />
                <span className="font-medium">{message.text}</span>
              </div>
            </div>
          )}

          {!authEmail ? (
            /* Authentication Section with glassmorphism */
            <div className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 p-8 shadow-2xl">
              <div className="flex justify-center mb-8">
                <div className="flex bg-black/20 backdrop-blur-sm rounded-2xl p-2 border border-white/10">
                  <button 
                    onClick={() => setActiveAuthTab('register')} 
                    className={`px-8 py-4 rounded-xl font-semibold transition-all duration-300 ${
                      activeAuthTab === 'register' 
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg transform scale-105 shadow-cyan-500/25' 
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    🚀 Qeydiyyat
                  </button>
                  <button 
                    onClick={() => setActiveAuthTab('login')} 
                    className={`px-8 py-4 rounded-xl font-semibold transition-all duration-300 ${
                      activeAuthTab === 'login' 
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg transform scale-105 shadow-cyan-500/25' 
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    🔑 Giriş
                  </button>
                </div>
              </div>

              {activeAuthTab === 'register' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-white/90 mb-3">👤 Ad</label>
                      <input 
                        className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15" 
                        placeholder="Adınızı daxil edin" 
                        value={regName} 
                        onChange={(e) => setRegName(e.target.value)} 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/90 mb-3">📧 E‑poçt</label>
                      <input 
                        className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15" 
                        placeholder="email@example.com" 
                        type="email" 
                        value={regEmail} 
                        onChange={(e) => setRegEmail(e.target.value)} 
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white/90 mb-3">🔒 Şifrə</label>
                    <div className="relative">
                      <input 
                        className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 pr-12 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15" 
                        placeholder="Ən azı 6 simvol" 
                        type={showRegPassword ? 'text' : 'password'} 
                        value={regPassword} 
                        onChange={(e) => setRegPassword(e.target.value)} 
                      />
                      <button
                        type="button"
                        aria-label="Şifrəni göstər/gizlət"
                        onClick={() => setShowRegPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-xl"
                      >
                        {showRegPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={handleRegister} 
                    className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 hover:from-cyan-400 hover:via-blue-400 hover:to-purple-400 text-white font-bold py-5 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-cyan-500/25"
                  >
                    ✨ Qeydiyyatdan keç
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-white/90 mb-3">📧 E‑poçt</label>
                    <input 
                      className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15" 
                      placeholder="email@example.com" 
                      type="email" 
                      value={loginEmail} 
                      onChange={(e) => setLoginEmail(e.target.value)} 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-white/90 mb-3">🔒 Şifrə</label>
                    <div className="relative">
                      <input 
                        className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 pr-12 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15" 
                        placeholder="Şifrənizi daxil edin" 
                        type={showLoginPassword ? 'text' : 'password'} 
                        value={loginPassword} 
                        onChange={(e) => setLoginPassword(e.target.value)} 
                      />
                      <button
                        type="button"
                        aria-label="Şifrəni göstər/gizlət"
                        onClick={() => setShowLoginPassword(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-xl"
                      >
                        {showLoginPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={handleLogin} 
                    className="w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 hover:from-cyan-400 hover:via-blue-400 hover:to-purple-400 text-white font-bold py-5 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-cyan-500/25"
                  >
                    🚀 Daxil ol
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Profile Management Section */
            <div className="space-y-8">
              {/* Profile Card with enhanced glassmorphism */}
              <div className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 p-8 shadow-2xl">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Avatar Section with glow effect */}
                  <div className="flex flex-col items-center space-y-6">
                    <div className="relative group">
                      <div className="w-44 h-44 rounded-full bg-gradient-to-br from-cyan-400/30 via-blue-500/30 to-purple-500/30 p-2 shadow-2xl animate-pulse">
                        <div className="w-full h-full rounded-full bg-black/30 backdrop-blur-sm overflow-hidden flex items-center justify-center border-2 border-white/20">
                          {avatar ? (
                            <img src={avatar} alt="Profil şəkli" className="w-full h-full object-cover" />
                          ) : (
                            <div className="text-7xl">👤</div>
                          )}
                        </div>
                      </div>
                      {saving && (
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                          <div className="w-10 h-10 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-4 w-full">
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                        disabled={saving}
                      />
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={saving}
                          className="flex-1 min-w-[140px] bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-2xl transition-all duration-300 shadow-lg"
                        >
                          📤 Şəkil Yüklə
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          disabled={saving || !avatar}
                          className="flex-1 min-w-[140px] bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-2xl transition-all duration-300 shadow-lg"
                        >
                          🗑️ Şəkili sil
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Profile Info with enhanced styling */}
                  <div className="lg:col-span-2 space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-white/90 mb-3">👤 Ad</label>
                      <input
                        type="text"
                        value={profile.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="Adınız"
                        className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/90 mb-3">📧 E‑poçt</label>
                      <input
                        type="email"
                        value={profile.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="email@example.com"
                        className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15"
                      />
                    </div>

                    <div className="flex flex-wrap gap-4 pt-6">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 min-w-[140px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-emerald-500/25"
                      >
                        {saving ? '💾 Saxlanır...' : '💾 Yadda saxla'}
                      </button>
                      <button
                        onClick={() => setShowPasswordChange(!showPasswordChange)}
                        className="flex-1 min-w-[140px] bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-purple-500/25"
                      >
                        🔐 Şifrəni dəyiş
                      </button>
                      <button
                        onClick={handleLogout}
                        className="flex-1 min-w-[140px] bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-red-500/25"
                      >
                        🚪 Çıxış
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Password Change Section with enhanced styling */}
              {showPasswordChange && (
                <div className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 p-8 shadow-2xl">
                  <h3 className="text-3xl font-bold text-white mb-8 flex items-center gap-4">
                    <span className="text-3xl">🔒</span>
                    Şifrəni dəyiş
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-white/90 mb-3">🔑 Köhnə şifrə</label>
                      <div className="relative">
                        <input 
                          type={showOldPwd ? 'text' : 'password'} 
                          value={oldPwd} 
                          onChange={(e) => setOldPwd(e.target.value)} 
                          placeholder="Hazırki şifrəniz" 
                          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 pr-12 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15" 
                        />
                        <button
                          type="button"
                          aria-label="Şifrəni göstər/gizlət"
                          onClick={() => setShowOldPwd(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-xl"
                        >
                          {showOldPwd ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/90 mb-3">🆕 Yeni şifrə</label>
                      <div className="relative">
                        <input 
                          type={showNewPwd ? 'text' : 'password'} 
                          value={newPwd} 
                          onChange={(e) => setNewPwd(e.target.value)} 
                          placeholder="Ən azı 6 simvol" 
                          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 pr-12 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15" 
                        />
                        <button
                          type="button"
                          aria-label="Şifrəni göstər/gizlət"
                          onClick={() => setShowNewPwd(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-xl"
                        >
                          {showNewPwd ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white/90 mb-3">✅ Şifrə təkrarı</label>
                      <div className="relative">
                        <input 
                          type={showConfirmPwd ? 'text' : 'password'} 
                          value={confirmPwd} 
                          onChange={(e) => setConfirmPwd(e.target.value)} 
                          placeholder="Yeni şifrəni təkrar edin" 
                          className="w-full bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 pr-12 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all duration-300 hover:bg-white/15" 
                        />
                        <button
                          type="button"
                          aria-label="Şifrəni göstər/gizlət"
                          onClick={() => setShowConfirmPwd(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-xl"
                        >
                          {showConfirmPwd ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-8">
                    <button 
                      onClick={handleChangePassword} 
                      className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl hover:shadow-green-500/25"
                    >
                      ✨ Şifrəni yenilə
                    </button>
                    <button 
                      onClick={() => {
                        setShowPasswordChange(false);
                        setOldPwd(''); setNewPwd(''); setConfirmPwd('');
                      }} 
                      className="bg-gradient-to-r from-gray-500 to-slate-500 hover:from-gray-400 hover:to-slate-400 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] shadow-xl"
                    >
                      ❌ Ləğv et
                    </button>
                  </div>
                </div>
              )}

              {/* Info Section with enhanced styling */}
              <div className="bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 backdrop-blur-md rounded-3xl border border-white/20 p-8 shadow-xl">
                <div className="flex items-start gap-6">
                  <div className="text-4xl">ℹ️</div>
                  <div>
                    <h4 className="font-bold text-white text-xl mb-3">💡 Məlumat</h4>
                    <p className="text-white/80 leading-relaxed">
                      Bütün məlumatlar yalnız bu cihazda (localStorage) saxlanılır və heç yerə göndərilmir. 
                      Bu, demo məqsədli lokal sistemdir. Real tətbiqdə məlumatlar təhlükəsiz serverdə saxlanmalıdır.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
