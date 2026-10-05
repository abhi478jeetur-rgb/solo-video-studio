import os
import subprocess

def create_desktop_shortcut():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    bat_path = os.path.join(base_dir, "run.bat")
    icon_path = os.path.join(base_dir, "static", "icons", "app_icon.ico")

    ps_code = f"""
    $WshShell = New-Object -ComObject WScript.Shell
    $desktops = @('{os.path.expanduser("~/Desktop")}', 'D:\\Desktop')
    foreach ($d in $desktops) {{
        if (Test-Path $d) {{
            $lnk = Join-Path $d 'Solo Video Studio.lnk'
            $s = $WshShell.CreateShortcut($lnk)
            $s.TargetPath = '{bat_path}'
            $s.WorkingDirectory = '{base_dir}'
            $s.IconLocation = '{icon_path},0'
            $s.Description = 'Solo Video Studio - Splitter, Watermark Cleaner & Storyboard'
            $s.Save()
            Write-Host "Shortcut created: $lnk"
        }}
    }}
    """

    res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_code], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print("Stderr:", res.stderr)

if __name__ == "__main__":
    create_desktop_shortcut()
