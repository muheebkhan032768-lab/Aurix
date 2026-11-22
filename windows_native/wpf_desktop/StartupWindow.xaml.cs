using System;
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
