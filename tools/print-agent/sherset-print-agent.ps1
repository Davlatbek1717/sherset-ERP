<#
  Sherset Print Agent
  -------------------
  Kassir kompyuterida ishlaydigan kichik lokal xizmat. Web ilova (sherset.biznesjon.uz)
  har omborning yig'ish-chekini shu agentga yuboradi, agent esa uni AYNAN belgilangan
  Windows printeriga (RAW ESC/POS) chiqaradi. Bitta kompyuterga bir nechta printer
  ulanganda har chekni to'g'ri printerga yo'naltirish uchun kerak.

  Ishga tushirish:  start-agent.bat  (yoki: powershell -ExecutionPolicy Bypass -File sherset-print-agent.ps1)
  Manzil:           http://127.0.0.1:17777
  Endpointlar:
    GET  /health          -> {"ok":true,...}          (tirikligini tekshirish)
    GET  /printers        -> {"printers":[...]}        (o'rnatilgan printerlar ro'yxati)
    POST /print           -> body: {"printer":"NAME","dataBase64":"..."}   (RAW baytlar)
                             yoki {"printer":"NAME","text":"..."}          (oddiy matn + ESC/POS init/cut)

  Loopback (127.0.0.1) HTTPS-sahifadan chaqirilishi Chrome tomonidan ruxsat etiladi
  (localhost "ishonchli manba"). CORS ochiq.
#>

param(
  [int]$Port = 17777
)

$ErrorActionPreference = 'Stop'

# ── RAW printer helper (Win32 winspool P/Invoke) ─────────────────────────────
# Microsoft KB322091 uslubidagi RAW-chop yordamchisi: drayverni chetlab o'tib
# printerga to'g'ridan-to'g'ri baytlar yuboradi (ESC/POS uchun shart).
if (-not ('ShersetRawPrinter' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class ShersetRawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static bool SendBytes(string printerName, byte[] bytes) {
        IntPtr hPrinter;
        var di = new DOCINFOA();
        di.pDocName = "Sherset picking sheet";
        di.pDataType = "RAW";
        if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter failed for '" + printerName + "' (err " + Marshal.GetLastWin32Error() + ")");
        try {
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("StartDocPrinter failed (err " + Marshal.GetLastWin32Error() + ")");
            try {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("StartPagePrinter failed (err " + Marshal.GetLastWin32Error() + ")");
                IntPtr pUnmanaged = Marshal.AllocCoTaskMem(bytes.Length);
                try {
                    Marshal.Copy(bytes, 0, pUnmanaged, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, pUnmanaged, bytes.Length, out written))
                        throw new Exception("WritePrinter failed (err " + Marshal.GetLastWin32Error() + ")");
                } finally { Marshal.FreeCoTaskMem(pUnmanaged); }
                EndPagePrinter(hPrinter);
            } finally { EndDocPrinter(hPrinter); }
        } finally { ClosePrinter(hPrinter); }
        return true;
    }
}
'@
}

# ── ESC/POS: oddiy matnni init + cut bilan o'rash (sinov uchun) ───────────────
function Build-EscPos([string]$text) {
  $esc = [char]27; $gs = [char]29
  $init = "$esc@"                       # ESC @  -> printerni tiklash
  $cut  = "$gs" + "V" + [char]66 + [char]0   # GS V B 0 -> qog'ozni qirqish (partial)
  $payload = $init + $text + "`n`n`n" + $cut
  # ESC/POS printerlar odatda CP866/CP1251 kutadi; lotin+raqam uchun ASCII yetarli.
  return [System.Text.Encoding]::GetEncoding(1251).GetBytes($payload)
}

# ── Printerlar ro'yxati ──────────────────────────────────────────────────────
function Get-PrinterNames {
  try {
    return @(Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop | Select-Object -ExpandProperty Name)
  } catch {
    return @(Get-WmiObject -Class Win32_Printer | Select-Object -ExpandProperty Name)
  }
}

# ── HTTP javob yordamchisi (CORS bilan) ──────────────────────────────────────
function Write-Response($ctx, [int]$status, [string]$body, [string]$contentType = 'application/json') {
  $resp = $ctx.Response
  $resp.StatusCode = $status
  $resp.ContentType = $contentType
  $resp.Headers['Access-Control-Allow-Origin']  = '*'
  $resp.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $resp.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $resp.ContentLength64 = $bytes.Length
  $resp.OutputStream.Write($bytes, 0, $bytes.Length)
  $resp.OutputStream.Close()
}

# ── Listener ─────────────────────────────────────────────────────────────────
$prefix = "http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  Write-Host "!! Listener ochilmadi ($prefix)." -ForegroundColor Red
  Write-Host "   Bir marta admin PowerShell'da quyidagini ishga tushiring, keyin qayta uriниб ko'ring:" -ForegroundColor Yellow
  Write-Host "   netsh http add urlacl url=$prefix user=Everyone" -ForegroundColor Cyan
  throw
}

Write-Host ""
Write-Host "  Sherset Print Agent ishga tushdi" -ForegroundColor Green
Write-Host "  Manzil : $prefix" -ForegroundColor Green
Write-Host "  Printerlar:" -ForegroundColor Green
Get-PrinterNames | ForEach-Object { Write-Host "    - $_" }
Write-Host ""
Write-Host "  Bu oynani OCHIQ qoldiring. To'xtatish: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

# ── Har so'rovni alohida oqim (runspace)да qayta ishlaydigan handler ──────────
# Bir vaqtda bir necha printerga chiqarilganда biri ikkinchisini KUTMASLIGI uchun
# har HTTP so'rov mustaqil runspace'да ishlaydi (max 8 parallel). Handler o'zi-
# yetarli — kerakli yordamchilarni ichida qayta ta'riflaydi ([ShersetRawPrinter]
# AppDomain-global, shu sabab hamma runspace'да ko'rinadi).
$handler = {
  param($ctx)

  function Write-Response($ctx, [int]$status, [string]$body, [string]$contentType = 'application/json') {
    $resp = $ctx.Response
    $resp.StatusCode = $status
    $resp.ContentType = $contentType
    $resp.Headers['Access-Control-Allow-Origin']  = '*'
    $resp.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $resp.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $resp.ContentLength64 = $bytes.Length
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.OutputStream.Close()
  }
  function Get-PrinterNames {
    try { return @(Get-CimInstance -ClassName Win32_Printer -ErrorAction Stop | Select-Object -ExpandProperty Name) }
    catch { return @(Get-WmiObject -Class Win32_Printer | Select-Object -ExpandProperty Name) }
  }
  function Build-EscPos([string]$text) {
    $esc = [char]27; $gs = [char]29
    $init = "$esc@"
    $cut  = "$gs" + "V" + [char]66 + [char]0
    $payload = $init + $text + "`n`n`n" + $cut
    return [System.Text.Encoding]::GetEncoding(1251).GetBytes($payload)
  }

  $req = $ctx.Request
  $path = $req.Url.AbsolutePath.TrimEnd('/')
  $method = $req.HttpMethod

  try {
    if ($method -eq 'OPTIONS') { Write-Response $ctx 204 ''; return }

    switch ("$method $path") {
      'GET /health' {
        Write-Response $ctx 200 '{"ok":true,"agent":"sherset-print-agent","version":"1.1","concurrent":true}'
      }
      'GET /printers' {
        $names = Get-PrinterNames
        $json = ($names | ForEach-Object { '"' + ($_ -replace '"','\"') + '"' }) -join ','
        Write-Response $ctx 200 "{`"printers`":[$json]}"
      }
      'POST /print' {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        $raw = $reader.ReadToEnd(); $reader.Close()
        $data = $raw | ConvertFrom-Json
        $printer = [string]$data.printer
        if ([string]::IsNullOrWhiteSpace($printer)) {
          Write-Response $ctx 400 '{"ok":false,"error":"printer nomi berilmadi"}'; return
        }
        [byte[]]$bytes = $null
        if ($data.PSObject.Properties.Name -contains 'dataBase64' -and $data.dataBase64) {
          $bytes = [System.Convert]::FromBase64String([string]$data.dataBase64)
        } elseif ($data.PSObject.Properties.Name -contains 'text' -and $data.text) {
          $bytes = Build-EscPos ([string]$data.text)
        } else {
          Write-Response $ctx 400 '{"ok":false,"error":"dataBase64 yoki text kerak"}'; return
        }
        [ShersetRawPrinter]::SendBytes($printer, $bytes) | Out-Null
        try { Write-Host ("  -> chop etildi: '" + $printer + "' (" + $bytes.Length + " bayt)") -ForegroundColor Cyan } catch {}
        Write-Response $ctx 200 '{"ok":true}'
      }
      default { Write-Response $ctx 404 '{"ok":false,"error":"not found"}' }
    }
  } catch {
    $msg = ($_.Exception.Message -replace '"','\"' -replace "`r?`n",' ')
    try { Write-Response $ctx 500 "{`"ok`":false,`"error`":`"$msg`"}" } catch {}
    try { Write-Host "  !! xato: $msg" -ForegroundColor Red } catch {}
  }
}

# Runspace pool — bir vaqtда 8 tagacha so'rov mustaqil qayta ishlanadi.
$iss = [System.Management.Automation.Runspaces.InitialSessionState]::CreateDefault()
$pool = [runspacefactory]::CreateRunspacePool(1, 8, $iss, $Host)
$pool.Open()
$pending = New-Object System.Collections.ArrayList

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()   # ulanishni qabul qilish (tez) — keyin darhol oqimга topshiriladi
  } catch { break }

  $ps = [powershell]::Create()
  $ps.RunspacePool = $pool
  [void]$ps.AddScript($handler).AddArgument($ctx)
  $async = $ps.BeginInvoke()
  [void]$pending.Add(@{ PS = $ps; Async = $async })

  # Tugagan handlerlarni tozalash (xotira o'smasligi uchun).
  for ($i = $pending.Count - 1; $i -ge 0; $i--) {
    if ($pending[$i].Async.IsCompleted) {
      try { $pending[$i].PS.EndInvoke($pending[$i].Async) } catch {}
      $pending[$i].PS.Dispose()
      $pending.RemoveAt($i)
    }
  }
}

$pool.Close()
$listener.Stop()
