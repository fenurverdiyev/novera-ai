$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\components\MessageDisplay.tsx'
$text = Get-Content -Raw -Path $path
$pattern = 'const\s+Stepper:\s*React\.FC<\{\s*step\?:\s*1\s*\|\s*2\s*\|\s*3\s*\}>\s*=\s*\(\{\s*step\s*\}\)\s*=>\s*\{[\s\S]*?\};'
$replacement = 'const Stepper: React.FC<{ step?: 1 | 2 | 3 }> = () => null;'
$text = [regex]::Replace($text, $pattern, $replacement)
[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
Write-Host 'Stepper removed (now returns null).'
