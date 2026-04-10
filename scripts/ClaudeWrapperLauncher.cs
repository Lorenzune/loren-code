using System;
using System.Diagnostics;
using System.IO;

internal static class ClaudeWrapperLauncher
{
    private static int Main(string[] args)
    {
        try
        {
            var launcherDir = AppDomain.CurrentDomain.BaseDirectory;
            var wrapperScript = Path.Combine(launcherDir, "claude-wrapper.js");

            if (!File.Exists(wrapperScript))
            {
                Console.Error.WriteLine("Missing wrapper script: " + wrapperScript);
                return 1;
            }

            var parent = Directory.GetParent(launcherDir);
            var workingDirectory = parent != null ? parent.FullName : launcherDir;

            var psi = new ProcessStartInfo
            {
                FileName = "node.exe",
                Arguments = Quote(wrapperScript) + BuildArgumentString(args),
                UseShellExecute = false,
                RedirectStandardInput = false,
                RedirectStandardOutput = false,
                RedirectStandardError = false,
                WorkingDirectory = workingDirectory,
            };

            using (var process = Process.Start(psi))
            {
                if (process == null)
                {
                    Console.Error.WriteLine("Failed to start node.exe");
                    return 1;
                }

                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }

    private static string BuildArgumentString(string[] args)
    {
        if (args == null || args.Length == 0)
        {
            return string.Empty;
        }

        var pieces = new string[args.Length];
        for (var i = 0; i < args.Length; i++)
        {
            pieces[i] = Quote(args[i]);
        }

        return " " + string.Join(" ", pieces);
    }

    private static string Quote(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "\"\"";
        }

        return "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
    }
}
