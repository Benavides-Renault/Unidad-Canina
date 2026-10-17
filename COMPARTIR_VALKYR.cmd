@echo off
cd /d "%~dp0"
set "NODE_RUNTIME=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_RUNTIME%" set "NODE_RUNTIME=node"
echo Inicia VALKYR antes de abrir el enlace. Esta ventana debe permanecer abierta.
"%NODE_RUNTIME%" scripts/share-start.mjs
pause
