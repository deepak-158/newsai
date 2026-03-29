# setup_piper.ps1
# This script downloads Piper TTS and the required en_US-lessac-medium model for Windows

$ErrorActionPreference = "Stop"

$piperZipUrl = "https://github.com/rhasspy/piper/releases/latest/download/piper_windows_amd64.zip"
$modelUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
$configUrl = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"

$backendDir = $PSScriptRoot

Write-Host "1. Downloading Piper Windows Binaries..."
Invoke-WebRequest -Uri $piperZipUrl -OutFile "$backendDir\piper.zip"

Write-Host "2. Extracting Piper..."
Expand-Archive -Path "$backendDir\piper.zip" -DestinationPath "$backendDir" -Force
Remove-Item "$backendDir\piper.zip"

# Move the contents of piper folder to the backend root or leave it in a folder
# The zip extracts to a folder usually named `piper`. Let's move piper.exe and piper_phonemize.dll to backend root
if (Test-Path "$backendDir\piper\piper.exe") {
    Move-Item -Path "$backendDir\piper\*" -Destination "$backendDir" -Force
    Remove-Item -Path "$backendDir\piper" -Recurse -Force
}

Write-Host "3. Downloading en_US-lessac-medium ONNX model..."
Invoke-WebRequest -Uri $modelUrl -OutFile "$backendDir\en_US-lessac-medium.onnx"

Write-Host "4. Downloading model JSON config..."
Invoke-WebRequest -Uri $configUrl -OutFile "$backendDir\en_US-lessac-medium.onnx.json"

Write-Host "✅ Piper TTS and the en_US-lessac-medium model are successfully setup in the backend directory!"
