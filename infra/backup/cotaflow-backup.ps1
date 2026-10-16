<#
  Backup diário do CotaFlow para uma pasta da empresa (ex.: \\SERVER02\...).

  Busca no serviço de backup do Railway:
    - a cópia completa do banco  -> <Destino>\banco\cotaflow-AAAA-MM-DD.dump (guarda N dias)
    - as fotos, só as novas       -> <Destino>\fotos\<bucket>\<caminho>
  e registra tudo em <Destino>\backup.log.

  A chave de acesso fica no perfil do usuário do Windows, criptografada
  (só esse usuário, neste computador, consegue ler). Para gravar ou trocar:
    .\cotaflow-backup.ps1 -SalvarChave

  Uso normal (Agendador de Tarefas):
    powershell -NoProfile -ExecutionPolicy Bypass -File cotaflow-backup.ps1
#>
param(
  [string]$Url = "",
  [string]$Destino = "",
  [int]$DiasParaGuardar = 30,
  [switch]$SalvarChave
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # deixa os downloads bem mais rápidos no PowerShell 5.1
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$pastaConfig = Join-Path $env:LOCALAPPDATA "CotaFlowBackup"
$arquivoChave = Join-Path $pastaConfig "chave.dat"
$arquivoConfig = Join-Path $pastaConfig "config.json"
New-Item -ItemType Directory -Force $pastaConfig | Out-Null

if ($SalvarChave) {
  $seguro = Read-Host "Cole a chave do backup (BACKUP_TOKEN)" -AsSecureString
  $seguro | ConvertFrom-SecureString | Set-Content -Encoding ASCII $arquivoChave
  Write-Host "Chave guardada em $arquivoChave (criptografada para este usuário)."
  exit 0
}

# Endereço e pasta: parâmetros ou config.json (gravado na instalação).
if (Test-Path $arquivoConfig) {
  $cfg = Get-Content $arquivoConfig -Raw | ConvertFrom-Json
  if (-not $Url) { $Url = $cfg.Url }
  if (-not $Destino) { $Destino = $cfg.Destino }
  if ($cfg.DiasParaGuardar -and -not $PSBoundParameters.ContainsKey("DiasParaGuardar")) { $DiasParaGuardar = [int]$cfg.DiasParaGuardar }
}
if (-not $Url -or -not $Destino) { throw "Informe -Url e -Destino (ou grave o config.json)." }
if (-not (Test-Path $arquivoChave)) { throw "Chave não encontrada. Rode: .\cotaflow-backup.ps1 -SalvarChave" }

$Url = $Url.TrimEnd("/")
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR((Get-Content $arquivoChave | ConvertTo-SecureString)))
$headers = @{ Authorization = "Bearer $token" }

$pastaBanco = Join-Path $Destino "banco"
$pastaFotos = Join-Path $Destino "fotos"
$log = Join-Path $Destino "backup.log"
New-Item -ItemType Directory -Force $pastaBanco, $pastaFotos | Out-Null

function Registrar([string]$texto) {
  $linha = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $texto
  Add-Content -Path $log -Value $linha -Encoding UTF8
  Write-Host $linha
}

$inicio = Get-Date
try {
  # 1) Banco: baixa num arquivo temporário e só renomeia se estiver íntegro.
  $hoje = Get-Date -Format "yyyy-MM-dd"
  $final = Join-Path $pastaBanco "cotaflow-$hoje.dump"
  $temp = "$final.parcial"
  Invoke-WebRequest -Uri "$Url/db" -Headers $headers -OutFile $temp -UseBasicParsing -TimeoutSec 1800
  $fs = [IO.File]::OpenRead($temp)
  $buf = New-Object byte[] 5
  [void]$fs.Read($buf, 0, 5)
  $fs.Close()
  $cabecalho = [Text.Encoding]::ASCII.GetString($buf)
  $tamanho = (Get-Item $temp).Length
  if ($cabecalho -ne "PGDMP" -or $tamanho -lt 10000) {
    Remove-Item $temp -Force
    throw "Cópia do banco inválida ($tamanho bytes)."
  }
  Move-Item -Force $temp $final
  Registrar ("Banco OK: {0} ({1:N1} MB)" -f (Split-Path $final -Leaf), ($tamanho / 1MB))

  # 2) Fotos: só as que ainda não existem aqui (ou mudaram de tamanho).
  $lista = Invoke-RestMethod -Uri "$Url/photos" -Headers $headers -UseBasicParsing -TimeoutSec 300
  $novas = 0
  $falhas = 0
  foreach ($f in $lista) {
    $local = Join-Path $pastaFotos (Join-Path $f.bucket ($f.name -replace "/", "\"))
    if ((Test-Path $local) -and ((Get-Item $local).Length -eq [int64]$f.size)) { continue }
    New-Item -ItemType Directory -Force (Split-Path $local) | Out-Null
    $q = "bucket=" + [uri]::EscapeDataString($f.bucket) + "&name=" + [uri]::EscapeDataString($f.name)
    try {
      Invoke-WebRequest -Uri "$Url/photo?$q" -Headers $headers -OutFile "$local.parcial" -UseBasicParsing -TimeoutSec 300
      Move-Item -Force "$local.parcial" $local
      $novas++
    } catch {
      $falhas++
      Registrar "Foto com falha: $($f.bucket)/$($f.name) ($($_.Exception.Message))"
    }
  }
  Registrar ("Fotos OK: {0} no total, {1} nova(s), {2} falha(s)" -f @($lista).Count, $novas, $falhas)

  # 3) Apaga cópias do banco mais antigas que o prazo (as fotos ficam todas).
  $limite = (Get-Date).AddDays(-$DiasParaGuardar)
  Get-ChildItem $pastaBanco -Filter "cotaflow-*.dump" |
    Where-Object { $_.LastWriteTime -lt $limite } |
    ForEach-Object { Remove-Item $_.FullName -Force; Registrar "Removida cópia antiga: $($_.Name)" }

  Registrar ("Backup concluído em {0:N0} s" -f ((Get-Date) - $inicio).TotalSeconds)
  if ($falhas -gt 0) { exit 2 }
  exit 0
} catch {
  Registrar "ERRO: $($_.Exception.Message)"
  exit 1
}
