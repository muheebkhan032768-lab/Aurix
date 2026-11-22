[Setup]
AppName=AURIX 2.0 — AM VEYRONIX
AppVersion=2.0.0
AppPublisher=AM VEYRONIX (Abdul Muheeb)
DefaultDirName={autopf}\AM VEYRONIX\AURIX
DefaultGroupName=AURIX 2.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputBaseFilename=AURIX_2.0_Setup_x64
Compression=lzma2
SolidCompression=yes

[Files]
Source: "dist\desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
Source: "dist\python_core\aurix_core.exe"; DestDir: "{app}\python_core"; Flags: ignoreversion

[Icons]
Name: "{group}\AURIX 2.0"; Filename: "{app}\AURIX.exe"
Name: "{autodesktop}\AURIX 2.0"; Filename: "{app}\AURIX.exe"
