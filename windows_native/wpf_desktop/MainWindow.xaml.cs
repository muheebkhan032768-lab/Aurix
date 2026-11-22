using System.Diagnostics;
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
                Arguments = "..\\python_core\\aurix_core.py",
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
            TranscriptBox.AppendText($"Abdul Muheeb: {prompt}\nAURIX: {reply}\n\n");
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
