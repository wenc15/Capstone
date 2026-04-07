using System;
using System.IO;

namespace CapstoneBackend.Tests.TestInfrastructure;

public static class TestEnvironment
{
    public static string AppDataRoot { get; }

    static TestEnvironment()
    {
        AppDataRoot = Path.Combine(Path.GetTempPath(), "Growin.VV.Tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(AppDataRoot);
        Environment.SetEnvironmentVariable("APPDATA", AppDataRoot);
        Environment.SetEnvironmentVariable("GROWIN_BASE_DIR", Path.Combine(AppDataRoot, "Growin"));
    }

    public static string GrowinDataDirectory => Path.Combine(AppDataRoot, "Growin");

    public static void ResetStorage()
    {
        var path = GrowinDataDirectory;
        if (Directory.Exists(path))
        {
            Directory.Delete(path, recursive: true);
        }

        Directory.CreateDirectory(path);
    }
}
