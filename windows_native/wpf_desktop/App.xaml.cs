using System.Windows;
using Microsoft.Win32;

namespace AurixDesktop
{
    public partial class App : Application
    {
        public static void SetWindowsAutoStart(bool enabled)
        {
            const string runKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
            using var key = Registry.CurrentUser.OpenSubKey(runKey, writable: true);
            if (key == null) return;
            var exePath = Environment.ProcessPath;
            if (enabled && !string.IsNullOrEmpty(exePath))
                key.SetValue("AURIX_2_0", $"\"{exePath}\"");
            else
                key.DeleteValue("AURIX_2_0", throwOnMissingValue: false);
        }
    }
}
