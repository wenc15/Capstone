using System.Diagnostics;
using System.Runtime.InteropServices;

namespace CapstoneBackend.Utils;

public static class ActiveWindowHelper
{
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    public static string? GetActiveProcessName()
    {
        var handle = GetForegroundWindow();
        if (handle == IntPtr.Zero) return null;

        GetWindowThreadProcessId(handle, out uint pid);

        try
        {
            using var proc = Process.GetProcessById((int)pid);
            return proc.ProcessName; // 例如 "chrome"
        }
        catch
        {
            return null;
        }
    }
}
