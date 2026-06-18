$ErrorActionPreference = 'Stop'
Set-Location 'C:\DataDev\Projetos\ks_easy_erp'
$env:NODE_ENV = 'development'
& 'C:\Program Files\nodejs\node.exe' 'node_modules\tsx\dist\cli.mjs' 'watch' 'server/_core/index.ts'
