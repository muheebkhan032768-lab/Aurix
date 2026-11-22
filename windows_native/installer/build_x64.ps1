# AURIX 2.0 x64 Windows Build Script (Run on Windows 10/11 x64)
$ErrorActionPreference = "Stop"

Write-Host "1. Installing Python dependencies..."
python -m pip install -r ../python_core/requirements.txt
python -m pip install pyinstaller

Write-Host "2. Freezing Python AI Core into standalone x64 executable..."
pyinstaller --onefile --name aurix_core ../python_core/aurix_core.py --distpath ./dist/python_core

Write-Host "3. Publishing self-contained .NET 8 WPF x64 Desktop Shell..."
dotnet publish ../wpf_desktop/AurixDesktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./dist/desktop

Write-Host "4. Build ready in ./dist/. Run Inno Setup on aurix_installer.iss to generate Setup_AURIX_x64.exe."
