# Set up environment for git ops (add git to path for this script)
$env:Path = "$env:ProgramFiles\Git\cmd;" + $env:Path
$env:Path = "C:\Program Files\GitHub CLI;" + $env:Path
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = "C:\Users\sreya\Local\Temp" # dummy for gradle

# Move to project
Set-Location "C:\Users\sreya\Downloads\Radio-Global"

# Sanity check
Write-Host "=== Repo sanity check ==="
git status --short | Measure-Object | Select-Object -ExpandProperty Count
Write-Host "=== Current branch ==="
git branch --show-current 2>$null || "no branch yet"
Write-Host "=== Last commit ==="
git log --oneline -1 2>$null || "no commits yet"

Write-Host "`n=== Ready to proceed. Run the push script with your Personal Access Token next. ==="
