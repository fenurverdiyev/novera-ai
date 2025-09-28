param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak'

Write-Host "Backing up $path to $backup"
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw

# Find the marker where we want to replace the tail of the component
$marker = 'const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {'
$idx = $content.IndexOf($marker)
if ($idx -lt 0) {
  Write-Error "Marker not found: $marker"
}

# If a stray block starting with base64Image exists BEFORE the marker, remove it
$errStr = 'const base64Image = e.target?.result as string;'
$posErr = $content.IndexOf($errStr)
if ($posErr -ge 0 -and $posErr -lt $idx) {
  $content = $content.Remove($posErr, ($idx - $posErr))
  $idx = $content.IndexOf($marker)
}

$before = $content.Substring(0, $idx)

$tail = @'
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target?.result as string;
        const query = "Bu şəkli analiz et.";
        handleSend(query, [base64Image]);
      };
      reader.readAsDataURL(file);
    }
  };

  const stopPlayback = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    } catch {}
    setPlayingMessageId(null);
    currentPlayingMessageIdRef.current = null;
    sentenceQueueRef.current = [];
    isProcessingSentencesRef.current = false;
  }, []);

  const processVocalStream = useCallback(async () => {
    if (isProcessingSentencesRef.current) return;
    if (!audioRef.current) return;
    if (!sentenceQueueRef.current.length) return;

    isProcessingSentencesRef.current = true;
    try {
      while (sentenceQueueRef.current.length > 0) {
        const sentence = sentenceQueueRef.current.shift();
        if (!sentence) continue;

        try {
          const audioUrl = await textToSpeech(sentence, settings.voiceId);
          await new Promise<void>((resolve) => {
            if (!audioRef.current) return resolve();
            const el = audioRef.current;
            el.onended = () => resolve();
            el.onerror = () => resolve();
            el.src = audioUrl;
            el.play().catch(() => resolve());
          });
        } catch {
          // continue silently
        }
      }
    } finally {
      isProcessingSentencesRef.current = false;
    }
  }, [settings.voiceId]);

  const handlePlayAudio = async (messageId: string, text: string) => {
    try {
      setPlayingMessageId(messageId);
      const audioUrl = await textToSpeech(text, settings.voiceId);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        await audioRef.current.play();
      }
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, ttsError: "Səsi səsləndirmək alınmadı." } : m));
      setPlayingMessageId(null);
    }
  };

  const handleCloseVoiceOverlay = () => {
    setIsVoiceOverlayOpen(false);
    setLiveVocalResponse(null);
    stopPlayback();
  };

  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    setScrollOffset(event.currentTarget.scrollTop);
  };

  const scrollToBottom = () => {
    try { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); } catch {}
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const renderView = () => {
    switch (activeView) {
      case 'google-search':
        return <GoogleSearchView />;
      case 'news':
        return <News />;
      case 'weather':
        return <Weather />;
      case 'translate':
        return <Translate />;
      case 'profile':
        return <Profile />;
      case 'settings':
        return <Settings settings={settings} onSettingsChange={setSettings} themeColor={THEMES.find(t => t.id === settings.theme)?.colors[2]} />;
      case 'search':
      default:
        return (
          <div className="flex flex-col h-full bg-bg-jet/80 backdrop-blur-sm">
            <main className="flex-grow overflow-y-auto" onScroll={handleScroll}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <Logo isLarge={true} className="mb-4" />
                  <h1 className="text-4xl font-bold text-text-main">Bu gün sizə necə kömək edə bilərəm?</h1>
                </div>
              ) : (
                <div>
                  {messages.map(msg => (
                    <MessageDisplay
                      key={msg.id}
                      message={msg}
                      onRelatedQuery={(q) => handleSend(q)}
                      onPlayAudio={handlePlayAudio}
                      playingMessageId={playingMessageId}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </main>
            <footer className="bg-transparent pt-2">
              <SearchBar
                onSend={(q) => handleSend(q)}
                isLoading={isLoading}
                onVoiceClick={() => setIsVoiceOverlayOpen(true)}
                searchMode={searchMode}
                onChangeMode={setSearchMode}
              />
              <p className="text-center text-xs text-text-sub pb-3">
                NovEra səhv edə bilər. Vacib məlumatları yoxlamağınız tövsiyə olunur.
              </p>
            </footer>
          </div>
        );
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-bg-jet">
      {renderView()}
      <audio ref={audioRef} hidden />
    </div>
  );
};

export default App;
'@

$new = $before + $tail
Set-Content -LiteralPath $path -Value $new -Encoding UTF8
Write-Host "Patched $path. Backup: $backup"
