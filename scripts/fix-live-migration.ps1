param()
$ErrorActionPreference = 'Stop'

function Repair-AppTsx {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw "File not found: $Path" }
  $backup = $Path + '.bak_fixlivemig_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
  Copy-Item -LiteralPath $Path -Destination $backup -Force
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8

  # 1) Replace broken settings initializer block with correct version + refs
  $startMarker = 'const [settings, setSettings] = useState<AppSettings>(() => {'
  $addMsgMarker = 'const addMessage'
  $startIdx = $content.IndexOf($startMarker)
  if ($startIdx -ge 0) {
    $addIdx = $content.IndexOf($addMsgMarker, $startIdx)
    if ($addIdx -gt $startIdx) {
      $before = $content.Substring(0, $startIdx)
      $after  = $content.Substring($addIdx)
      $newBlock = @"
const [settings, setSettings] = useState<AppSettings>(() => {
  try {
    const savedSettings = localStorage.getItem('gemini-insight-settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      return { noveraColor: '#000000', ...parsed };
    }
  } catch (error) {
    console.error("Could not parse saved settings:", error);
  }
  return {
    voiceEnabled: true,
    voiceId: undefined,
    theme: 'novera',
    noveraColor: '#000000',
  };
});

const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
const [scrollOffset, setScrollOffset] = useState(0);
const messagesEndRef = useRef<HTMLDivElement>(null);
const audioRef = useRef<HTMLAudioElement>(null);
const fileInputRef = useRef<HTMLInputElement>(null); // For image uploads
const sentenceQueueRef = useRef<string[]>([]);
const isProcessingSentencesRef = useRef(false);
const currentPlayingMessageIdRef = useRef<string | null>(null);
const audioContextRef = useRef<AudioContext | null>(null);
const analyserRef = useRef<AnalyserNode | null>(null);
const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
const sentenceAudioCacheRef = useRef<Record<string, string | null>>({});
const saveTimerRef = useRef<number | null>(null);

"@
      $content = $before + $newBlock + $after
    }
  }

  # 2) Remove VoiceOverlay usage (state handlers, function, JSX, props)
  $content = [regex]::Replace($content, '\s*setIsVoiceOverlayOpen\([^)]*\);\s*', '', 'Singleline')
  $content = [regex]::Replace($content, '\s*setLiveVocalResponse\([^)]*\);\s*', '', 'Singleline')
  $content = [regex]::Replace($content, 'const\s+handleCloseVoiceOverlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*', '', 'Singleline')
  $content = [regex]::Replace($content, '<VoiceOverlay[\s\S]*?/>\s*', '', 'Singleline')
  $content = [regex]::Replace($content, ',\s*onVoiceClick=\{[^}]*\}', '', 'Singleline')

  # 3) Neutralize isVocalQuery paths (keep signature intact for now)
  $content = $content -replace 'if \(isVocalQuery && settings\.voiceEnabled\)', 'if (false && settings.voiceEnabled)'
  $content = $content -replace 'if \(isVocalQuery && settings\.voiceEnabled && sentenceAccumulator\.trim\(\)\)', 'if (false && settings.voiceEnabled && sentenceAccumulator.trim())'
  $content = [regex]::Replace($content, 'if \(isVocalQuery\)\s*setLiveVocalResponse\([^)]*\);', '', 'Singleline')

  # 4) Switch ElevenLabs textToSpeech() -> ttsBinary()
  $content = [regex]::Replace($content, 'textToSpeech\(\s*([^,\)]+)\s*,\s*settings\.voiceId\s*\)\.then', 'ttsBinary($1, { voiceId: settings.voiceId }).then')
  $content = [regex]::Replace($content, 'await\s+textToSpeech\(\s*([^,\)]+)\s*,\s*settings\.voiceId\s*\)', 'await ttsBinary($1, { voiceId: settings.voiceId })')

  [System.IO.File]::WriteAllText($Path, $content, [System.Text.Encoding]::UTF8)
  Write-Host "App.tsx repaired. Backup: $backup"
}

function Update-SearchBar {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $backup = $Path + '.bak_fixlivemig_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
  Copy-Item -LiteralPath $Path -Destination $backup -Force
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $content = $content -replace ',\s*LiveCircleIcon', ''
  $content = $content -replace 'LiveCircleIcon,\s*', ''
  # remove onVoiceClick from interface
  $content = [regex]::Replace($content, '\s*onVoiceClick:\s*\(\)\s*=>\s*void;[^\r\n]*\r?\n', '', 'Multiline')
  # remove onVoiceClick from prop destructuring
  $content = $content -replace '\{ onSend, isLoading, onVoiceClick,\s*searchMode, onChangeMode \}', '{ onSend, isLoading, searchMode, onChangeMode }'
  $content = $content -replace '\{ onSend, isLoading, onVoiceClick,', '{ onSend, isLoading,'
  $content = $content -replace 'onVoiceClick,\s*', ''
  # remove the live conversation button
  $content = [regex]::Replace($content, '<button\s+onClick=\{onVoiceClick\}[\s\S]*?</button>\s*\r?\n', '', 'Singleline')
  [System.IO.File]::WriteAllText($Path, $content, [System.Text.Encoding]::UTF8)
  Write-Host "SearchBar.tsx updated. Backup: $backup"
}

function Update-UseAudioQueue {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $backup = $Path + '.bak_fixlivemig_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
  Copy-Item -LiteralPath $Path -Destination $backup -Force
  $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $content = [regex]::Replace($content, "import\s*\{\s*textToSpeech\s*\}\s*from\s*'\.\.\/services\/elevenLabsService'", "import { ttsBinary } from '../services/ttsBackendService'")
  $content = [regex]::Replace($content, 'textToSpeech\(\s*([^,\)]+)\s*,\s*voiceId\s*\)', 'ttsBinary($1, { voiceId })')
  [System.IO.File]::WriteAllText($Path, $content, [System.Text.Encoding]::UTF8)
  Write-Host "useAudioQueue.ts updated. Backup: $backup"
}

# Execute
Repair-AppTsx -Path 'd:\NovEra\NovEra\App.tsx'
Update-SearchBar -Path 'd:\NovEra\NovEra\components\SearchBar.tsx'
Update-UseAudioQueue -Path 'd:\NovEra\NovEra\hooks\useAudioQueue.ts'
