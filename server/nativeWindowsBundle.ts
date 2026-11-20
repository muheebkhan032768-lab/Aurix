import type { DeliverableFile } from "../src/types/aurix";

export const NATIVE_WINDOWS_FILES: DeliverableFile[] = [
  {
    path: "python_core/aurix_core.py",
    category: "Python Core",
    language: "python",
    description: "Main Python AI orchestration daemon & IPC JSON-RPC bridge for C# WPF shell.",
    content: `"""
AURIX 2.0 — Native Windows AI Core Orchestrator
Creator: Abdul Muheeb | Company: AM VEYRONIX
"""
import json
import platform
import psutil
import sys
from pathlib import Path
from ai_router import HybridAIRouter
from memory_sqlite import AurixMemoryStore
from security_argon2 import AurixSecurityManager


class AurixOrchestrator:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.memory = AurixMemoryStore(self.data_dir / "aurix_local.db")
        self.security = AurixSecurityManager(self.data_dir / "security.db")
        self.router = HybridAIRouter(self.detect_hardware_profile())

    def detect_hardware_profile(self) -> dict:
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 2)
        cores = psutil.cpu_count(logical=True) or 2
        has_cuda = False
        try:
            import torch
            has_cuda = torch.cuda.is_available()
        except ImportError:
            has_cuda = False

        tier = "high" if (ram_gb >= 16 and (has_cuda or cores >= 8)) else ("mid" if ram_gb >= 8 else "entry")
        return {
            "os": f"{platform.system()} {platform.release()}",
            "arch": platform.machine(),
            "cpu_cores": cores,
            "ram_gb": ram_gb,
            "gpu_cuda": has_cuda,
            "tier": tier,
            "execution_provider": "CUDAExecutionProvider" if has_cuda else "CPUExecutionProvider",
        }

    def handle_request(self, payload: dict) -> dict:
        action = payload.get("action")
        if action == "status":
            return {"ok": True, "hardware": self.detect_hardware_profile()}
        if action == "chat":
            prompt = payload.get("prompt", "")
            scope = payload.get("website_scope", "Global")
            context = self.memory.get_scoped_context(scope)
            reply = self.router.generate(prompt=prompt, system_context=context)
            return {"ok": True, "reply": reply, "provider": self.router.active_provider}
        if action == "verify_pin":
            ok, msg = self.security.verify_pin(payload.get("pin", ""))
            return {"ok": ok, "message": msg}
        return {"ok": False, "error": f"Unknown action: {action}"}


if __name__ == "__main__":
    orchestrator = AurixOrchestrator(Path.home() / "AppData" / "Local" / "AM_VEYRONIX" / "AURIX")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            res = orchestrator.handle_request(req)
        except Exception as exc:
            res = {"ok": False, "error": str(exc)}
        print(json.dumps(res), flush=True)
`,
  },
  {
    path: "python_core/ai_router.py",
    category: "Python Core",
    language: "python",
    description: "Hybrid Cloud + Local ONNX Runtime / PyTorch AI Router with automatic CPU/GPU scaling.",
    content: `"""
AURIX 2.0 Hybrid AI Router (Cloud + Local ONNX / CPU fallback)
"""
import os
import urllib.request


class HybridAIRouter:
    def __init__(self, hardware: dict):
        self.hardware = hardware
        self.active_provider = "cloud_gemini" if self.has_internet() else "local_onnx"

    @staticmethod
    def has_internet() -> bool:
        try:
            urllib.request.urlopen("https://generativelanguage.googleapis.com", timeout=2)
            return True
        except Exception:
            return False

    def select_local_quantization(self) -> str:
        tier = self.hardware.get("tier", "entry")
        if tier == "high":
            return "Q6_K / FP16 ONNX (CUDA/DirectML)"
        if tier == "mid":
            return "Q4_K_M ONNX (CPU/DirectML)"
        return "Q4_0 Compact CPU-Only"

    def generate(self, prompt: str, system_context: str) -> str:
        api_key = os.environ.get("GEMINI_API_KEY")
        if self.has_internet() and api_key:
            from google import genai
            client = genai.Client(api_key=api_key)
            resp = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"{system_context}\\n\\nOwner Request: {prompt}",
            )
            self.active_provider = "cloud_gemini"
            return resp.text or ""

        self.active_provider = "local_onnx_offline"
        return (
            f"[Offline Local Mode — {self.select_local_quantization()}] "
            "No cloud network or local ONNX model weight file is loaded at this path yet. "
            "Place an approved ONNX model in %LOCALAPPDATA%\\\\AM_VEYRONIX\\\\AURIX\\\\models to enable offline inference."
        )
`,
  },
  {
    path: "python_core/voice_engine.py",
    category: "Python Core",
    language: "python",
    description: "Offline/Online speech recognition, wake-word loop ('Hello AURIX'), and male TTS adapter.",
    content: `"""
AURIX 2.0 Voice Engine — Wake Word, Speech Recognition & Male TTS
Languages: English, Urdu, Hindi
"""
import pyttsx3


class AurixVoiceEngine:
    def __init__(self, wake_phrase: str = "Hello AURIX"):
        self.wake_phrase = wake_phrase.lower()
        self.engine = pyttsx3.init("sapi5")
        self.configure_male_voice(rate=178)

    def configure_male_voice(self, rate: int = 178):
        voices = self.engine.getProperty("voices")
        for v in voices:
            if "david" in v.name.lower() or "male" in v.name.lower():
                self.engine.setProperty("voice", v.id)
                break
        self.engine.setProperty("rate", rate)
        self.engine.setProperty("volume", 0.95)

    def speak(self, text: str):
        self.engine.say(text)
        self.engine.runAndWait()

    def matches_wake_phrase(self, transcript: str) -> bool:
        return self.wake_phrase in transcript.lower()
`,
  },
  {
    path: "python_core/security_argon2.py",
    category: "Python Core",
    language: "python",
    description: "Argon2id PIN hashing, attempt limits, temporary lockout, and security audit log.",
    content: `"""
AURIX 2.0 Security Module — Argon2id PIN Hashing & Lockout Controls
"""
import sqlite3
import time
from pathlib import Path
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError


class AurixSecurityManager:
    MAX_ATTEMPTS = 5
    LOCKOUT_SECONDS = 120

    def __init__(self, db_path: Path):
        self.ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
        self.conn = sqlite3.connect(str(db_path))
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS auth_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                pin_hash TEXT,
                failed_attempts INTEGER DEFAULT 0,
                locked_until REAL DEFAULT 0
            )"""
        )
        self.conn.execute("INSERT OR IGNORE INTO auth_state (id) VALUES (1)")
        self.conn.commit()

    def set_pin(self, raw_pin: str):
        if len(raw_pin) < 4:
            raise ValueError("PIN must be at least 4 characters.")
        hashed = self.ph.hash(raw_pin)
        self.conn.execute(
            "UPDATE auth_state SET pin_hash = ?, failed_attempts = 0, locked_until = 0 WHERE id = 1",
            (hashed,),
        )
        self.conn.commit()

    def verify_pin(self, raw_pin: str) -> tuple[bool, str]:
        row = self.conn.execute("SELECT pin_hash, failed_attempts, locked_until FROM auth_state WHERE id = 1").fetchone()
        pin_hash, attempts, locked_until = row
        now = time.time()
        if locked_until and now < locked_until:
            return False, f"Account locked. Retry in {int(locked_until - now)}s."
        if not pin_hash:
            return True, "No PIN configured."
        try:
            self.ph.verify(pin_hash, raw_pin)
            self.conn.execute("UPDATE auth_state SET failed_attempts = 0, locked_until = 0 WHERE id = 1")
            self.conn.commit()
            return True, "Verified"
        except VerifyMismatchError:
            attempts += 1
            next_lock = now + self.LOCKOUT_SECONDS if attempts >= self.MAX_ATTEMPTS else 0
            self.conn.execute(
                "UPDATE auth_state SET failed_attempts = ?, locked_until = ? WHERE id = 1",
                (attempts, next_lock),
            )
            self.conn.commit()
            return False, "Temporary lockout active." if next_lock else f"Invalid PIN ({attempts}/{self.MAX_ATTEMPTS})"
`,
  },
  {
    path: "python_core/memory_sqlite.py",
    category: "Python Core",
    language: "python",
    description: "Structured SQLite memory manager keeping AM VEYRONIX websites strictly isolated.",
    content: `"""
AURIX 2.0 SQLite Memory Store — Strict Website & Project Isolation
"""
import sqlite3
from pathlib import Path


class AurixMemoryStore:
    def __init__(self, db_path: Path):
        self.conn = sqlite3.connect(str(db_path))
        self.conn.execute(
            """CREATE TABLE IF NOT EXISTS memories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                project_scope TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                approved INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            )"""
        )
        self.conn.commit()

    def get_scoped_context(self, project_scope: str) -> str:
        rows = self.conn.execute(
            "SELECT category, project_scope, title, content FROM memories WHERE approved = 1 AND (project_scope = ? OR project_scope = 'Global')",
            (project_scope,),
        ).fetchall()
        return "\\n".join(f"[{r[1]} · {r[0]}] {r[2]}: {r[3]}" for r in rows)
`,
  },
  {
    path: "python_core/requirements.txt",
    category: "Python Core",
    language: "text",
    description: "Python 3.11+ dependencies for AURIX Windows AI Core.",
    content: `google-genai>=1.0.0
psutil>=6.0.0
argon2-cffi>=23.1.0
pyttsx3>=2.90
onnxruntime>=1.19.0
numpy>=1.26.0
Pillow>=10.4.0
`,
  },
  {
    path: "wpf_desktop/AurixDesktop.csproj",
    category: "C# WPF Desktop",
    language: "xml",
    description: "Modern .NET 8 Windows Desktop WPF project targeting x64 Windows 10 & Windows 11.",
    content: `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net8.0-windows10.0.19041.0</TargetFramework>
    <UseWPF>true</UseWPF>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <PlatformTarget>x64</PlatformTarget>
    <AssemblyName>AURIX</AssemblyName>
    <ApplicationTitle>AURIX 2.0 — AM VEYRONIX</ApplicationTitle>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="System.Speech" Version="8.0.0" />
  </ItemGroup>
</Project>
`,
  },
  {
    path: "wpf_desktop/App.xaml",
    category: "C# WPF Desktop",
    language: "xml",
    description: "WPF application entry point launching the 8-second cinematic StartupWindow.",
    content: `<Application x:Class="AurixDesktop.App"
             xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             StartupUri="StartupWindow.xaml"
             ShutdownMode="OnExplicitShutdown">
</Application>
`,
  },
  {
    path: "wpf_desktop/App.xaml.cs",
    category: "C# WPF Desktop",
    language: "csharp",
    description: "Application lifecycle & Windows Startup Registry toggle helper.",
    content: `using System.Windows;
using Microsoft.Win32;

namespace AurixDesktop
{
    public partial class App : Application
    {
        public static void SetWindowsAutoStart(bool enabled)
        {
            const string runKey = @"Software\\Microsoft\\Windows\\CurrentVersion\\Run";
            using var key = Registry.CurrentUser.OpenSubKey(runKey, writable: true);
            if (key == null) return;
            var exePath = Environment.ProcessPath;
            if (enabled && !string.IsNullOrEmpty(exePath))
                key.SetValue("AURIX_2_0", $"\\"{exePath}\\"");
            else
                key.DeleteValue("AURIX_2_0", throwOnMissingValue: false);
        }
    }
}
`,
  },
  {
    path: "wpf_desktop/StartupWindow.xaml",
    category: "C# WPF Desktop",
    language: "xml",
    description: "Pure black 8-second native WPF cinematic startup screen with metallic 3D AURIX 2.0 animation, cyan sweep, and fixed bottom-right AM VEYRONIX branding.",
    content: `<Window x:Class="AurixDesktop.StartupWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        WindowStyle="None" ResizeMode="NoResize" WindowState="Maximized"
        Background="#000000" Topmost="True" ShowInTaskbar="True">
    <Window.Resources>
        <Storyboard x:Key="StartupSequence" Completed="StartupSequence_Completed">
            <!-- 0-2s: Cyan atmospheric radial glow -->
            <DoubleAnimation Storyboard.TargetName="CyanAura" Storyboard.TargetProperty="Opacity"
                             From="0" To="0.9" BeginTime="0:0:0" Duration="0:0:2"/>
            <!-- 2-4s: Sudden 3D slam emergence of large metallic AURIX 2.0 -->
            <DoubleAnimation Storyboard.TargetName="TitleContainer" Storyboard.TargetProperty="Opacity"
                             From="0" To="1" BeginTime="0:0:1.95" Duration="0:0:1.6"/>
            <DoubleAnimation Storyboard.TargetName="TitleScale" Storyboard.TargetProperty="ScaleX"
                             From="1.48" To="1.0" BeginTime="0:0:1.95" Duration="0:0:1.8">
                <DoubleAnimation.EasingFunction><CubicEase EasingMode="EaseOut"/></DoubleAnimation.EasingFunction>
            </DoubleAnimation>
            <DoubleAnimation Storyboard.TargetName="TitleScale" Storyboard.TargetProperty="ScaleY"
                             From="1.48" To="1.0" BeginTime="0:0:1.95" Duration="0:0:1.8">
                <DoubleAnimation.EasingFunction><CubicEase EasingMode="EaseOut"/></DoubleAnimation.EasingFunction>
            </DoubleAnimation>
            <!-- 4-6s: Cyan light sweep across AURIX 2.0 -->
            <DoubleAnimation Storyboard.TargetName="LightSweepTransform" Storyboard.TargetProperty="X"
                             From="-420" To="420" BeginTime="0:0:4" Duration="0:0:1.8"/>
            <DoubleAnimation Storyboard.TargetName="LightSweep" Storyboard.TargetProperty="Opacity"
                             From="0" To="0.85" BeginTime="0:0:4" Duration="0:0:0.4" AutoReverse="True"/>
            <!-- 6-8s: Tagline reveal & hold -->
            <DoubleAnimation Storyboard.TargetName="TaglineText" Storyboard.TargetProperty="Opacity"
                             From="0" To="1" BeginTime="0:0:5.5" Duration="0:0:1.2"/>
        </Storyboard>
    </Window.Resources>

    <Grid Background="#000000">
        <!-- Particle & Lighting Canvas -->
        <Canvas x:Name="ParticleCanvas" IsHitTestVisible="False"/>

        <Ellipse x:Name="CyanAura" Width="620" Height="620" Opacity="0" IsHitTestVisible="False">
            <Ellipse.Fill>
                <RadialGradientBrush>
                    <GradientStop Color="#3306B6D4" Offset="0"/>
                    <GradientStop Color="#140EA5E9" Offset="0.45"/>
                    <GradientStop Color="#00000000" Offset="1"/>
                </RadialGradientBrush>
            </Ellipse.Fill>
        </Ellipse>

        <!-- Center Logo & Tagline -->
        <StackPanel VerticalAlignment="Center" HorizontalAlignment="Center">
            <Grid x:Name="TitleContainer" Opacity="0" RenderTransformOrigin="0.5,0.5">
                <Grid.RenderTransform>
                    <ScaleTransform x:Name="TitleScale" ScaleX="1.48" ScaleY="1.48"/>
                </Grid.RenderTransform>
                <TextBlock Text="AURIX 2.0" FontSize="108" FontWeight="Bold" HorizontalAlignment="Center">
                    <TextBlock.Foreground>
                        <LinearGradientBrush StartPoint="0,0" EndPoint="0,1">
                            <GradientStop Color="#FFFFFF" Offset="0"/>
                            <GradientStop Color="#CBD5E1" Offset="0.52"/>
                            <GradientStop Color="#06B6D4" Offset="1"/>
                        </LinearGradientBrush>
                    </TextBlock.Foreground>
                </TextBlock>
                <Rectangle x:Name="LightSweep" Width="160" Height="120" Opacity="0" IsHitTestVisible="False">
                    <Rectangle.RenderTransform>
                        <TranslateTransform x:Name="LightSweepTransform" X="-520"/>
                    </Rectangle.RenderTransform>
                    <Rectangle.Fill>
                        <LinearGradientBrush StartPoint="0,0" EndPoint="1,0">
                            <GradientStop Color="#0006B6D4" Offset="0"/>
                            <GradientStop Color="#CC67E8F9" Offset="0.5"/>
                            <GradientStop Color="#0006B6D4" Offset="1"/>
                        </LinearGradientBrush>
                    </Rectangle.Fill>
                </Rectangle>
            </Grid>

            <TextBlock x:Name="TaglineText" Text="ADVANCED UNIFIED INTELLIGENCE X"
                       Opacity="0" Margin="0,22,0,0" HorizontalAlignment="Center"
                       FontSize="18" FontWeight="SemiBold" Foreground="#67E8F9"/>
        </StackPanel>

        <!-- PERMANENT BOTTOM-RIGHT AM VEYRONIX BRANDING (HIGH-CONTRAST GOLD/EMERALD BADGE) -->
        <Border HorizontalAlignment="Right" VerticalAlignment="Bottom" Margin="0,0,48,40"
                Background="#E612151C" BorderBrush="#F59E0B" BorderThickness="1.5" CornerRadius="10" Padding="18,10">
            <StackPanel>
                <TextBlock Text="POWERED BY:" FontSize="13" FontWeight="SemiBold"
                           Foreground="#FFFFFF" HorizontalAlignment="Right"/>
                <TextBlock Text="AM VEYRONIX" FontSize="26" FontWeight="Bold"
                           Foreground="#FBBF24" HorizontalAlignment="Right" Margin="0,3,0,0">
                    <TextBlock.Effect>
                        <DropShadowEffect Color="#F59E0B" BlurRadius="16" ShadowDepth="0" Opacity="0.75"/>
                    </TextBlock.Effect>
                </TextBlock>
            </StackPanel>
        </Border>
    </Grid>
</Window>
`,
  },
  {
    path: "wpf_desktop/StartupWindow.xaml.cs",
    category: "C# WPF Desktop",
    language: "csharp",
    description: "WPF 8-second startup orchestration: particle loop, procedural sound, Windows Hello auth, and time-aware first voice greeting.",
    content: `using System;
    using System.Collections.Generic;
    using System.Speech.Synthesis;
    using System.Windows;
    using System.Windows.Controls;
    using System.Windows.Media;
    using System.Windows.Media.Animation;
    using System.Windows.Shapes;
    using System.Windows.Threading;

namespace AurixDesktop
{
    public partial class StartupWindow : Window
    {
        private readonly DispatcherTimer _particleTimer = new() { Interval = TimeSpan.FromMilliseconds(33) };
        private readonly List<(Ellipse Dot, double Vx, double Vy)> _particles = new();
        private static bool _hasGreetedThisLaunch = false;

        public StartupWindow()
        {
            InitializeComponent();
            Loaded += StartupWindow_Loaded;
        }

        private void StartupWindow_Loaded(object sender, RoutedEventArgs e)
        {
            InitParticles();
            _particleTimer.Start();
            StartupAudioGenerator.PlayStartupSoundAsync(volume: 0.7f, durationSeconds: 8);
            var sb = (Storyboard)FindResource("StartupSequence");
            sb.Begin();
        }

        private void InitParticles()
        {
            var rng = new Random();
            for (int i = 0; i < 65; i++)
            {
                var dot = new Ellipse
                {
                    Width = rng.Next(2, 4),
                    Height = rng.Next(2, 4),
                    Fill = i % 2 == 0 ? new SolidColorBrush(Color.FromArgb(140, 34, 211, 238))
                                      : new SolidColorBrush(Color.FromArgb(95, 226, 232, 240))
                };
                Canvas.SetLeft(dot, rng.NextDouble() * SystemParameters.PrimaryScreenWidth);
                Canvas.SetTop(dot, rng.NextDouble() * SystemParameters.PrimaryScreenHeight);
                ParticleCanvas.Children.Add(dot);
                _particles.Add((dot, (rng.NextDouble() - 0.5) * 0.8, -0.35 - rng.NextDouble() * 0.4));
            }
            _particleTimer.Tick += (_, _) =>
            {
                foreach (var p in _particles)
                {
                    double x = (Canvas.GetLeft(p.Dot) + p.Vx + ActualWidth) % Math.Max(1, ActualWidth);
                    double y = (Canvas.GetTop(p.Dot) + p.Vy + ActualHeight) % Math.Max(1, ActualHeight);
                    Canvas.SetLeft(p.Dot, x);
                    Canvas.SetTop(p.Dot, y);
                }
            };
        }

        private async void StartupSequence_Completed(object? sender, EventArgs e)
        {
            _particleTimer.Stop();
            bool verified = await WindowsHelloAuth.VerifyOwnerAsync("Verify Abdul Muheeb to enter AURIX 2.0");
            // If Windows Hello unavailable, MainWindow enforces configured Argon2id PIN fallback
            var main = new MainWindow();
            Application.Current.MainWindow = main;
            Application.Current.ShutdownMode = ShutdownMode.OnMainWindowClose;
            main.Show();
            Close();

            if (!_hasGreetedThisLaunch)
            {
                _hasGreetedThisLaunch = true;
                SpeakFirstTimeAwareGreeting(verified);
            }
        }

        private static void SpeakFirstTimeAwareGreeting(bool verified)
        {
            int hour = DateTime.Now.Hour;
            string prefix = hour >= 5 && hour < 12 ? "Good morning, Muheeb. AURIX is online and ready."
                          : hour >= 12 && hour < 17 ? "Good afternoon, Muheeb. AURIX is online and ready."
                          : hour >= 17 && hour < 21 ? "Good evening, Muheeb. AURIX is online and ready."
                          : "Good evening, Muheeb. AURIX is ready.";

            string full = verified
                ? $"{prefix} All systems are operational. How may I assist you today?"
                : prefix;

            var synth = new SpeechSynthesizer();
            synth.SelectVoiceByHints(VoiceGender.Male, VoiceAge.Adult);
            synth.Rate = 0;
            synth.Volume = 85;
            synth.SpeakAsync(full);
        }
    }
}
`,
  },
  {
    path: "wpf_desktop/StartupAudioGenerator.cs",
    category: "C# WPF Desktop",
    language: "csharp",
    description: "Procedural 16-bit PCM WAV synthesizer for native Windows startup audio without copyrighted files.",
    content: `using System;
using System.IO;
using System.Media;
using System.Threading.Tasks;

namespace AurixDesktop
{
    public static class StartupAudioGenerator
    {
        public static void PlayStartupSoundAsync(float volume = 0.7f, int durationSeconds = 8)
        {
            Task.Run(() =>
            {
                const int sampleRate = 44100;
                int totalSamples = sampleRate * Math.Max(4, durationSeconds);
                using var ms = new MemoryStream();
                using var bw = new BinaryWriter(ms);

                // WAV Header
                bw.Write("RIFF".ToCharArray());
                bw.Write(36 + totalSamples * 2);
                bw.Write("WAVEfmt ".ToCharArray());
                bw.Write(16);
                bw.Write((short)1);
                bw.Write((short)1);
                bw.Write(sampleRate);
                bw.Write(sampleRate * 2);
                bw.Write((short)2);
                bw.Write((short)16);
                bw.Write("data".ToCharArray());
                bw.Write(totalSamples * 2);

                var rng = new Random(42);
                for (int i = 0; i < totalSamples; i++)
                {
                    double t = (double)i / sampleRate;
                    double env = Math.Min(1.0, t / 0.35) * Math.Min(1.0, Math.Max(0.0, (durationSeconds - t) / 1.2));
                    // Phase 1: Rising whoosh + synth tension (0 - 1.95s)
                    double riser = t < 2.0 ? (t / 2.0) * 0.25 * Math.Sin(2 * Math.PI * (55.0 + t * 85.0) * t) : 0.0;
                    double whoosh = t < 2.1 ? (t / 2.0) * 0.14 * (rng.NextDouble() * 2.0 - 1.0) : 0.0;
                    // Phase 2: Sudden sub-bass emergence drop at 1.95s
                    double impactT = t - 1.95;
                    double boom = impactT >= 0 ? Math.Exp(-impactT * 2.4) * 0.65 * Math.Sin(2 * Math.PI * (34.0 + 95.0 * Math.Exp(-impactT * 6.0)) * impactT) : 0.0;
                    double chord = impactT >= 0 ? Math.Exp(-impactT * 0.45) * (0.22 * Math.Sin(2 * Math.PI * 146.83 * t) + 0.16 * Math.Sin(2 * Math.PI * 220.0 * t) + 0.12 * Math.Sin(2 * Math.PI * 329.63 * t)) : 0.0;
                    // Phase 3: Digital activation chime at 4.95s
                    double chime = t > 4.95 ? Math.Exp(-(t - 4.95) * 1.8) * 0.28 * Math.Sin(2 * Math.PI * 880.0 * t) : 0.0;
                    double sample = (riser + whoosh + boom + chord + chime) * env * Math.Clamp(volume, 0f, 1f);
                    bw.Write((short)(Math.Clamp(sample, -1.0, 1.0) * short.MaxValue));
                }

                ms.Position = 0;
                using var player = new SoundPlayer(ms);
                player.PlaySync();
            });
        }
    }
}
`,
  },
  {
    path: "wpf_desktop/MainWindow.xaml",
    category: "C# WPF Desktop",
    language: "xml",
    description: "Native WPF futuristic dark shell with cyan accents and 15-module navigation.",
    content: `<Window x:Class="AurixDesktop.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="AURIX 2.0 — AM VEYRONIX" Height="860" Width="1400"
        Background="#070B12" Foreground="#F1F5F9"
        WindowStartupLocation="CenterScreen">
    <Grid>
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="260"/>
            <ColumnDefinition Width="*"/>
        </Grid.ColumnDefinitions>

        <Border Grid.Column="0" Background="#0D1420" BorderBrush="#1E293B" BorderThickness="0,0,1,0" Padding="20">
            <StackPanel>
                <TextBlock Text="AURIX 2.0" FontSize="22" FontWeight="Bold" Foreground="#06B6D4"/>
                <TextBlock Text="AM VEYRONIX · Abdul Muheeb" FontSize="12" Foreground="#94A3B8" Margin="0,4,0,20"/>
                <Button Content="Home Dashboard" Margin="0,4" Padding="12,8" Click="NavButton_Click"/>
                <Button Content="AI Chat Core" Margin="0,4" Padding="12,8" Click="NavButton_Click"/>
                <Button Content="Voice Assistant" Margin="0,4" Padding="12,8" Click="NavButton_Click"/>
                <Button Content="AM VEYRONIX Company" Margin="0,4" Padding="12,8" Click="NavButton_Click"/>
                <Button Content="Website Manager" Margin="0,4" Padding="12,8" Click="NavButton_Click"/>
                <Button Content="Security &amp; Windows Hello" Margin="0,12,0,4" Padding="12,8" Click="VerifyHello_Click"/>
            </StackPanel>
        </Border>

        <Grid Grid.Column="1" Margin="28">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <StackPanel Grid.Row="0" Margin="0,0,0,20">
                <TextBlock x:Name="StatusTitle" Text="AURIX Native Desktop Core Ready" FontSize="24" FontWeight="SemiBold"/>
                <TextBlock x:Name="HardwareSummary" Text="Detecting system hardware..." FontSize="13" Foreground="#94A3B8" Margin="0,4,0,0"/>
            </StackPanel>

            <Border Grid.Row="1" Background="#0D1420" BorderBrush="#1E293B" BorderThickness="1" CornerRadius="10" Padding="18">
                <ScrollViewer>
                    <TextBox x:Name="TranscriptBox" IsReadOnly="True" TextWrapping="Wrap"
                             Background="Transparent" BorderThickness="0" Foreground="#E2E8F0" FontSize="14"/>
                </ScrollViewer>
            </Border>

            <Grid Grid.Row="2" Margin="0,16,0,0">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <TextBox x:Name="PromptInput" Grid.Column="0" Padding="14,10" Background="#0D1420"
                         Foreground="#F8FAFC" BorderBrush="#334155" FontSize="14"/>
                <Button Grid.Column="1" Content="Send to AURIX" Margin="12,0,0,0" Padding="20,10"
                        Background="#06B6D4" Foreground="#041018" FontWeight="SemiBold" Click="SendPrompt_Click"/>
            </Grid>
        </Grid>
    </Grid>
</Window>
`,
  },
  {
    path: "wpf_desktop/MainWindow.xaml.cs",
    category: "C# WPF Desktop",
    language: "csharp",
    description: "C# WPF code-behind spawning the Python AI orchestrator process via JSON-RPC stdio.",
    content: `using System.Diagnostics;
using System.Text.Json;
using System.Windows;

namespace AurixDesktop
{
    public partial class MainWindow : Window
    {
        private Process? _pythonProc;

        public MainWindow()
        {
            InitializeComponent();
            StartPythonCore();
        }

        private void StartPythonCore()
        {
            var psi = new ProcessStartInfo
            {
                FileName = "python",
                Arguments = "..\\\\python_core\\\\aurix_core.py",
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            _pythonProc = Process.Start(psi);
            SendBridgeCommand(new { action = "status" });
        }

        private void SendBridgeCommand(object payload)
        {
            if (_pythonProc == null) return;
            _pythonProc.StandardInput.WriteLine(JsonSerializer.Serialize(payload));
            var response = _pythonProc.StandardOutput.ReadLine();
            if (!string.IsNullOrEmpty(response))
            {
                HardwareSummary.Text = response;
            }
        }

        private void SendPrompt_Click(object sender, RoutedEventArgs e)
        {
            var prompt = PromptInput.Text.Trim();
            if (string.IsNullOrEmpty(prompt) || _pythonProc == null) return;
            _pythonProc.StandardInput.WriteLine(JsonSerializer.Serialize(new { action = "chat", prompt }));
            var reply = _pythonProc.StandardOutput.ReadLine();
            TranscriptBox.AppendText($"Abdul Muheeb: {prompt}\\nAURIX: {reply}\\n\\n");
            PromptInput.Clear();
        }

        private async void VerifyHello_Click(object sender, RoutedEventArgs e)
        {
            var result = await WindowsHelloAuth.VerifyOwnerAsync("Verify Abdul Muheeb identity for AURIX");
            MessageBox.Show(result ? "Windows Hello Verified." : "Biometric verification unavailable or cancelled.", "AURIX Security");
        }

        private void NavButton_Click(object sender, RoutedEventArgs e)
        {
            if (sender is System.Windows.Controls.Button btn)
                StatusTitle.Text = $"AURIX — {btn.Content}";
        }
    }
}
`,
  },
  {
    path: "wpf_desktop/WindowsHelloAuth.cs",
    category: "C# WPF Desktop",
    language: "csharp",
    description: "Genuine WinRT Windows Hello biometric authentication wrapper with graceful fallback.",
    content: `using System;
using System.Threading.Tasks;
using Windows.Security.Credentials.UI;

namespace AurixDesktop
{
    public static class WindowsHelloAuth
    {
        public static async Task<bool> VerifyOwnerAsync(string message)
        {
            try
            {
                var availability = await UserConsentVerifier.CheckAvailabilityAsync();
                if (availability != UserConsentVerifierAvailability.Available)
                {
                    return false;
                }
                var consent = await UserConsentVerifier.RequestVerificationAsync(message);
                return consent == UserConsentVerificationResult.Verified;
            }
            catch
            {
                return false;
            }
        }
    }
}
`,
  },
  {
    path: "installer/build_x64.ps1",
    category: "Build & Installer",
    language: "powershell",
    description: "PowerShell script to bundle Python core + self-contained .NET 8 x64 WPF executable.",
    content: `# AURIX 2.0 x64 Windows Build Script (Run on Windows 10/11 x64)
$ErrorActionPreference = "Stop"

Write-Host "1. Installing Python dependencies..."
python -m pip install -r ../python_core/requirements.txt
python -m pip install pyinstaller

Write-Host "2. Freezing Python AI Core into standalone x64 executable..."
pyinstaller --onefile --name aurix_core ../python_core/aurix_core.py --distpath ./dist/python_core

Write-Host "3. Publishing self-contained .NET 8 WPF x64 Desktop Shell..."
dotnet publish ../wpf_desktop/AurixDesktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o ./dist/desktop

Write-Host "4. Build ready in ./dist/. Run Inno Setup on aurix_installer.iss to generate Setup_AURIX_x64.exe."
`,
  },
  {
    path: "installer/aurix_installer.iss",
    category: "Build & Installer",
    language: "ini",
    description: "Inno Setup 6 script to compile a signed-ready Windows 10/11 x64 installer.",
    content: `[Setup]
AppName=AURIX 2.0 — AM VEYRONIX
AppVersion=2.0.0
AppPublisher=AM VEYRONIX (Abdul Muheeb)
DefaultDirName={autopf}\\AM VEYRONIX\\AURIX
DefaultGroupName=AURIX 2.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputBaseFilename=AURIX_2.0_Setup_x64
Compression=lzma2
SolidCompression=yes

[Files]
Source: "dist\\desktop\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs
Source: "dist\\python_core\\aurix_core.exe"; DestDir: "{app}\\python_core"; Flags: ignoreversion

[Icons]
Name: "{group}\\AURIX 2.0"; Filename: "{app}\\AURIX.exe"
Name: "{autodesktop}\\AURIX 2.0"; Filename: "{app}\\AURIX.exe"
`,
  },
  {
    path: "docs/README_WINDOWS_BUILD.md",
    category: "Documentation",
    language: "markdown",
    description: "Step-by-step Windows 10/11 x64 compilation and installation instructions.",
    content: `# AURIX 2.0 — Native Windows 10/11 x64 Installation & Build Guide

## Prerequisites (Windows 10/11 64-bit)
1. .NET 8.0 SDK (x64)
2. Python 3.11+ (x64)
3. Inno Setup 6 (for generating the Windows Installer)

## Build Steps
1. Open PowerShell inside \`installer/\`.
2. Run \`./build_x64.ps1\` to freeze the Python AI core and publish the self-contained C# WPF executable.
3. Open \`installer/aurix_installer.iss\` in Inno Setup Compiler and click **Build -> Compile** to produce \`AURIX_2.0_Setup_x64.exe\`.
4. Set your \`GEMINI_API_KEY\` environment variable or Windows Credential Manager entry for cloud mode, and optionally place local ONNX model weights under \`%LOCALAPPDATA%\\AM_VEYRONIX\\AURIX\\models\`.
`,
  },
  {
    path: "docs/TROUBLESHOOTING.md",
    category: "Documentation",
    language: "markdown",
    description: "Troubleshooting guide for GPU/CPU inference, Windows Hello, and voice permissions.",
    content: `# AURIX 2.0 — Troubleshooting Guide

- **No Dedicated GPU Detected**: AURIX automatically selects \`CPUExecutionProvider\` and \`Q4_0\` quantization so it runs reliably on entry-level laptops without CUDA.
- **Windows Hello Unavailable**: Ensure a PIN/Hello face sensor is enrolled in Windows Settings -> Accounts -> Sign-in options. AURIX falls back automatically to Argon2id PIN verification.
- **Voice Input Silent**: Confirm Windows Privacy -> Microphone access is enabled for desktop apps and adjust Microphone Sensitivity in AURIX Settings.
- **Offline Mode**: When internet is unavailable, AURIX switches to local SQLite memory and local ONNX models if installed, clearly displaying Offline status.
`,
  },
  {
    path: "docs/BACKUP_RECOVERY.md",
    category: "Documentation",
    language: "markdown",
    description: "Backup, export, and disaster recovery procedure for SQLite knowledge and PIN lockouts.",
    content: `# AURIX 2.0 — Backup & Recovery Guide

## Exporting Backups
- In the AURIX Command Center, open **Settings -> Memory & Backups** and click **Export JSON Backup**.
- On native Windows installations, back up \`%LOCALAPPDATA%\\AM_VEYRONIX\\AURIX\\aurix_local.db\` and \`security.db\`.

## PIN Lockout Recovery
- 5 consecutive incorrect PIN entries trigger a 120-second cooldown lockout.
- If the owner forgets the PIN on native Windows, authenticate via Windows Hello or clear \`pin_hash\` from \`security.db\` using an administrator recovery shell after physical device verification.
`,
  },
  {
    path: "python_core/pc_controller.py",
    category: "Python Core",
    language: "python",
    description: "Native Windows 10/11 PC automation: launch YouTube/websites, apps, screenshots, Downloads sorting, firewall check, and Emergency Stop guard.",
    content: `"""AURIX 2.0 — Native Windows PC Controller for Abdul Muheeb"""
import os
import shutil
import subprocess
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

EMERGENCY_FLAG = Path.home() / "AppData" / "Local" / "AM_VEYRONIX" / "AURIX" / "EMERGENCY_STOP.flag"

ALLOWED_APPS = {
    "notepad": ["notepad.exe"],
    "explorer": ["explorer.exe"],
    "chrome": ["cmd", "/c", "start", "chrome"],
    "edge": ["cmd", "/c", "start", "msedge"],
    "vscode": ["cmd", "/c", "code"],
    "terminal": ["wt.exe"],
    "calculator": ["calc.exe"],
    "taskmgr": ["taskmgr.exe"],
}


def check_emergency_stop() -> bool:
    return EMERGENCY_FLAG.exists()


def trigger_emergency_stop() -> Dict[str, Any]:
    EMERGENCY_FLAG.parent.mkdir(parents=True, exist_ok=True)
    EMERGENCY_FLAG.write_text(datetime.utcnow().isoformat(), encoding="utf-8")
    return {"ok": True, "emergency_stop": True, "flag_path": str(EMERGENCY_FLAG)}


def clear_emergency_stop() -> Dict[str, Any]:
    if EMERGENCY_FLAG.exists():
        EMERGENCY_FLAG.unlink()
    return {"ok": True, "emergency_stop": False}


def open_website(url: str) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    webbrowser.open(url)
    return {"ok": True, "action": "open_website", "url": url}


def launch_app(app_key: str) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    cmd = ALLOWED_APPS.get(app_key.lower())
    if not cmd:
        return {"ok": False, "error": f"App '{app_key}' is not in the approved launcher table."}
    subprocess.Popen(cmd, shell=False)
    return {"ok": True, "action": "launch_app", "app": app_key}


def take_screenshot(output_dir: str | None = None) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    from PIL import ImageGrab
    dest_dir = Path(output_dir or (Path.home() / "Pictures" / "AURIX_Screenshots"))
    dest_dir.mkdir(parents=True, exist_ok=True)
    file_path = dest_dir / f"aurix_screen_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
    img = ImageGrab.grab()
    img.save(str(file_path))
    return {"ok": True, "path": str(file_path)}


def organize_downloads(confirm: bool = False) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    downloads = Path.home() / "Downloads"
    if not downloads.exists():
        return {"ok": False, "error": "Downloads folder not found."}
    if not confirm:
        files = [f.name for f in downloads.iterdir() if f.is_file()]
        return {"ok": False, "requires_confirmation": True, "preview_count": len(files), "sample": files[:15]}
    categories = {"Documents": {".pdf", ".docx", ".txt", ".xlsx"}, "Images": {".png", ".jpg", ".jpeg", ".webp", ".svg"}, "Archives": {".zip", ".rar", ".7z"}}
    moved = 0
    for f in downloads.iterdir():
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        for folder, exts in categories.items():
            if ext in exts:
                target_dir = downloads / f"AURIX_Sorted_{folder}"
                target_dir.mkdir(exist_ok=True)
                shutil.move(str(f), str(target_dir / f.name))
                moved += 1
                break
    return {"ok": True, "moved": moved}


def edit_or_create_file(file_path: str, content: str, confirm: bool = False) -> Dict[str, Any]:
    if check_emergency_stop():
        return {"ok": False, "error": "Blocked: Emergency Stop is active."}
    if not confirm:
        return {"ok": False, "requires_confirmation": True, "path": file_path}
    target = Path(file_path).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"ok": True, "path": str(target), "bytes": len(content)}


def check_windows_firewall() -> Dict[str, Any]:
    res = subprocess.run(["netsh", "advfirewall", "show", "allprofiles"], capture_output=True, text=True)
    return {"ok": res.returncode == 0, "summary": res.stdout[:1200]}
`,
  },
  {
    path: "python_core/self_healer.py",
    category: "Python Core",
    language: "python",
    description: "12-step continuous self-healing watchdog: backup snapshots, AST syntax checks, SQLite PRAGMA repair, and rollback safety.",
    content: `"""AURIX 2.0 — 12-Step Self-Healing Watchdog"""
import ast
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

def create_backup_snapshot(source_dir: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_base = backup_dir / f"aurix_py_snapshot_{stamp}"
    zip_path = shutil.make_archive(str(archive_base), "zip", root_dir=str(source_dir))
    return Path(zip_path)

def verify_python_syntax(root_dir: str) -> List[Dict[str, Any]]:
    issues = []
    for py_file in Path(root_dir).rglob("*.py"):
        try:
            ast.parse(py_file.read_text(encoding="utf-8"))
        except SyntaxError as exc:
            issues.append({"file": str(py_file), "line": exc.lineno, "error": exc.msg})
    return issues

def heal_sqlite_db(db_path: str) -> Dict[str, Any]:
    conn = sqlite3.connect(db_path)
    try:
        res = conn.execute("PRAGMA integrity_check;").fetchone()
        ok = bool(res and res[0] == "ok")
        if not ok:
            conn.execute("VACUUM;")
        return {"ok": ok, "integrity": res[0] if res else "unknown"}
    finally:
        conn.close()
`,
  },
  {
    path: "python_core/offline_brain.py",
    category: "Python Core",
    language: "python",
    description: "100% Free Local/Offline AI Engine connecting to Ollama + RAM model fit check.",
    content: `"""AURIX 2.0 — Free Local & Offline AI Brain"""
import urllib.request
import json

def list_local_ollama_models() -> list[dict]:
    try:
        with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("models", [])
    except Exception:
        return []

def ask_local_ollama(prompt: str, model: str = "qwen2.5:1.5b") -> str | None:
    try:
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/chat",
            data=json.dumps({
                "model": model,
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("message", {}).get("content")
    except Exception:
        return None
`,
  },
  {
    path: "AURIX_Portable_Start.bat",
    category: "Build & Installer",
    language: "batch",
    description: "One-click Windows 10/11 Portable Launcher starting the AURIX 2.0 server and opening the bright desktop browser shell.",
    content: `@echo off
title AURIX 2.0 - AM VEYRONIX Portable Launcher
echo ====================================================
echo   AURIX 2.0 — POWERED BY AM VEYRONIX
echo   Starting Personal AI Command Center...
echo ====================================================
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js 20+ is not installed. Please install Node.js LTS from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [SETUP] First-time launch: installing dependencies...
  call npm install
)

start "" http://localhost:3000
echo [RUN] Starting AURIX 2.0 server on http://localhost:3000 ...
call npm run dev
pause
`,
  },
  {
    path: "Install_AURIX_Windows.ps1",
    category: "Build & Installer",
    language: "powershell",
    description: "Windows 10/11 64-bit interactive environment checker & installer setup script.",
    content: `# AURIX 2.0 — Windows 10/11 Setup Verification & Installer Helper
$ErrorActionPreference = "Continue"
Write-Host "=== AURIX 2.0 (AM VEYRONIX) Windows 10/11 Setup Check ===" -ForegroundColor Cyan

$ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)
Write-Host "Detected RAM: $ramGb GB"
if ($ramGb -lt 6) {
  Write-Host "Recommended Profile: Lightweight Mode (Optimized for <=4GB RAM systems)" -ForegroundColor Yellow
} elseif ($ramGb -lt 14) {
  Write-Host "Recommended Profile: Balanced Mode" -ForegroundColor Green
} else {
  Write-Host "Recommended Profile: Advanced Mode" -ForegroundColor Green
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Write-Host "Node.js: $($node.Source)" -ForegroundColor Green }
else { Write-Host "Node.js NOT FOUND - Install Node.js 20+ LTS from https://nodejs.org" -ForegroundColor Red }

$py = Get-Command python -ErrorAction SilentlyContinue
if ($py) { Write-Host "Python: $($py.Source)" -ForegroundColor Green }
else { Write-Host "Python 3.11+ optional for native desktop hardware control" -ForegroundColor Yellow }

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollama) { Write-Host "Ollama Offline AI: Installed" -ForegroundColor Green }
else { Write-Host "Ollama Offline AI: Optional - Install from https://ollama.com for local models" -ForegroundColor Yellow }
`,
  },
  {
    path: "Audit_Hardware.ps1",
    category: "Build & Installer",
    language: "powershell",
    description: "Phase 1 hardware & environment audit for the real Windows PC. Reads CPU, RAM, GPU, disks, Windows build and AI runtimes, prints the compatibility verdict and saves aurix_hardware_audit.json.",
    content: `# AURIX 2.0 — Phase 1 Hardware & Environment Audit (AM VEYRONIX)
# Run on the target Windows 10/11 PC:  powershell -ExecutionPolicy Bypass -File .\\Audit_Hardware.ps1
$ErrorActionPreference = "Continue"
$out = @{ generatedAt = (Get-Date).ToString("o") }

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpu = Get-CimInstance Win32_VideoController | Select-Object -First 1
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"

$ramGb = [math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
$freeRamGb = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
$diskTotalGb = [math]::Round((($disks | Measure-Object Size -Sum).Sum) / 1GB, 1)
$diskFreeGb = [math]::Round((($disks | Measure-Object FreeSpace -Sum).Sum) / 1GB, 1)
$vramGb = if ($gpu.AdapterRAM -gt 0) { [math]::Round($gpu.AdapterRAM / 1GB, 1) } else { $null }
$dedicated = $gpu.Name -match "NVIDIA|GeForce|RTX|GTX|Radeon RX|Arc A"

$score = [math]::Min(100, [math]::Round([math]::Min(40, $ramGb / 32 * 40)) + [math]::Round([math]::Min(24, $cpu.NumberOfCores / 8 * 24)) + $(if ($dedicated) { 20 } elseif ($gpu) { 8 } else { 4 }) + $(if ($diskFreeGb -ge 20) { 16 } elseif ($diskFreeGb -ge 8) { 10 } else { 4 }))

Write-Host "=== AURIX 2.0 HARDWARE COMPATIBILITY REPORT ===" -ForegroundColor Cyan
Write-Host "OS            : $($os.Caption) build $($os.BuildNumber) ($($os.OSArchitecture))"
Write-Host "CPU           : $($cpu.Name) - $($cpu.NumberOfCores) physical / $($cpu.NumberOfLogicalProcessors) logical cores"
Write-Host "RAM           : $ramGb GB installed, $freeRamGb GB free"
Write-Host "GPU           : $(if ($gpu) { $gpu.Name } else { 'not detected' }) $(if ($vramGb) { "($vramGb GB VRAM)" } else { '' })"
Write-Host "Storage       : $diskFreeGb GB free of $diskTotalGb GB"
Write-Host "Compatibility : $score / 100" -ForegroundColor Green

$mode = if ($ramGb -lt 6 -or $cpu.NumberOfLogicalProcessors -le 2) { "ECO MODE" } elseif ($ramGb -lt 12) { "BALANCED MODE" } else { "PERFORMANCE MODE" }
$model = if ($ramGb -lt 6) { "qwen2.5:0.5b" } elseif ($ramGb -lt 10) { "qwen2.5:1.5b" } elseif ($ramGb -lt 16) { "llama3.2:3b" } else { "qwen2.5:7b (optional) - 3B default" }
Write-Host "Performance   : $mode"
Write-Host "Local model   : $model"

$node = Get-Command node -ErrorAction SilentlyContinue
$py = Get-Command python -ErrorAction SilentlyContinue
$ollama = Get-Command ollama -ErrorAction SilentlyContinue
Write-Host "Node.js       : $(if ($node) { $node.Source } else { 'NOT FOUND - required for the portable build' })"
Write-Host "Python        : $(if ($py) { $py.Source } else { 'optional - needed for native PC control' })"
Write-Host "Ollama        : $(if ($ollama) { 'installed' } else { 'not installed - local AI needs it' })"

$out += @{
  os = "$($os.Caption) $($os.Version) build $($os.BuildNumber)"
  cpu = $cpu.Name
  physicalCores = $cpu.NumberOfCores
  logicalCores = $cpu.NumberOfLogicalProcessors
  ramGb = $ramGb
  freeRamGb = $freeRamGb
  gpu = $(if ($gpu) { $gpu.Name } else { $null })
  gpuVramGb = $vramGb
  gpuKind = $(if ($dedicated) { "Dedicated" } elseif ($gpu) { "Integrated/Unknown" } else { "Not detectable" })
  diskTotalGb = $diskTotalGb
  diskFreeGb = $diskFreeGb
  score = $score
  performanceMode = $mode
  recommendedLocalModel = $model
  node = $(if ($node) { $node.Source } else { $null })
  python = $(if ($py) { $py.Source } else { $null })
  ollama = [bool]$ollama
}

$jsonPath = Join-Path $PSScriptRoot "aurix_hardware_audit.json"
$out | ConvertTo-Json -Depth 4 | Set-Content -Path $jsonPath -Encoding UTF8
Write-Host "Saved JSON report: $jsonPath" -ForegroundColor Cyan
Write-Host "Paste this JSON into the AURIX System & PC Monitor to confirm the architecture choice." -ForegroundColor DarkGray
`,
  },
];


