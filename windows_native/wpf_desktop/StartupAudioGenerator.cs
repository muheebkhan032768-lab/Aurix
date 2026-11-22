using System;
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
