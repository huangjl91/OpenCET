# 启动桌面应用并把它置顶，然后只截应用窗口，保存到 .build-tmp\shot-<name>.png
# 用法: pwsh -File shot.ps1 -Route /translation -Name translation
param(
  [string]$Route = '',
  [string]$Name = 'app'
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32Cap {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@ -ErrorAction SilentlyContinue

$root = 'E:\DSH-openCET\cet-master\desktop'
$exe = Join-Path $root 'node_modules\electron\dist\electron.exe'
$ud = 'E:\DSH-openCET\.build-tmp\electron-data'
$outDir = 'E:\DSH-openCET\.build-tmp'

Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Get-Process | Where-Object { $_.ProcessName -match 'electron' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

if ($Route) { $env:OPENCET_ROUTE = $Route }
$p = Start-Process $exe -ArgumentList '.', '--no-sandbox', "--user-data-dir=$ud" -WorkingDirectory $root -PassThru
Start-Sleep -Seconds 9

$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*OpenCET*' } | Select-Object -First 1
if (-not $proc) { Write-Output '找不到应用窗口'; exit 1 }
$h = $proc.MainWindowHandle
[W32Cap]::ShowWindow($h, 9) | Out-Null
[W32Cap]::MoveWindow($h, 30, 10, 1400, 880, $true) | Out-Null
# HWND_TOPMOST = -1，压住其它窗口，保证截到的是应用本身
[W32Cap]::SetWindowPos($h, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0003) | Out-Null
Start-Sleep -Seconds 3

$r = New-Object W32Cap+RECT
[W32Cap]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left
$ht = $r.Bottom - $r.Top
$bmp = New-Object System.Drawing.Bitmap $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size $w, $ht))
$file = Join-Path $outDir "shot-$Name.png"
$bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# 取消置顶，别影响用户操作
[W32Cap]::SetWindowPos($h, [IntPtr]::new(-2), 0, 0, 0, 0, 0x0003) | Out-Null
Write-Output "标题=[$($proc.MainWindowTitle)] 截图=$file ${w}x${ht}"
