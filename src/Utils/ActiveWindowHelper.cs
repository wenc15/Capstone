using System.Diagnostics;
using System.Runtime.InteropServices;

namespace CapstoneBackend.Utils;

public sealed class ProcessSnapshot
{
    public int ProcessId { get; init; }
    public int ParentProcessId { get; init; }
    public string ProcessName { get; init; } = string.Empty;
    public DateTimeOffset? StartTime { get; init; }
}

public static class ActiveWindowHelper
{
    private const uint TH32CS_SNAPPROCESS = 0x00000002;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct PROCESSENTRY32
    {
        public uint dwSize;
        public uint cntUsage;
        public uint th32ProcessID;
        public IntPtr th32DefaultHeapID;
        public uint th32ModuleID;
        public uint cntThreads;
        public uint th32ParentProcessID;
        public int pcPriClassBase;
        public uint dwFlags;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szExeFile;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    public static ProcessSnapshot? GetActiveProcessInfo()
    {
        var handle = GetForegroundWindow();
        if (handle == IntPtr.Zero) return null;

        GetWindowThreadProcessId(handle, out uint pid);
        if (pid == 0) return null;

        return TryGetProcessInfo((int)pid, out var info) ? info : null;
    }

    public static string? GetActiveProcessName()
    {
        return GetActiveProcessInfo()?.ProcessName;
    }

    public static bool TryGetProcessInfo(int pid, out ProcessSnapshot? info)
    {
        info = null;
        if (pid <= 0)
            return false;

        try
        {
            using var proc = Process.GetProcessById(pid);
            DateTimeOffset? startedAt = null;
            try
            {
                startedAt = new DateTimeOffset(proc.StartTime);
            }
            catch
            {
                // Process may deny StartTime access; allow null.
            }

            info = new ProcessSnapshot
            {
                ProcessId = pid,
                ParentProcessId = GetParentProcessId(pid),
                ProcessName = proc.ProcessName,
                StartTime = startedAt,
            };
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static int GetParentProcessId(int pid)
    {
        var snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1))
            return 0;

        try
        {
            var entry = new PROCESSENTRY32 { dwSize = (uint)Marshal.SizeOf<PROCESSENTRY32>() };

            if (!Process32First(snapshot, ref entry))
                return 0;

            do
            {
                if (entry.th32ProcessID == (uint)pid)
                    return (int)entry.th32ParentProcessID;
            }
            while (Process32Next(snapshot, ref entry));

            return 0;
        }
        finally
        {
            CloseHandle(snapshot);
        }
    }
}
