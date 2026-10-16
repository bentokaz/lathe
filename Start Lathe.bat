@echo off
rem Starts the Lathe server and opens it in your browser. Close this window to stop it.
cd /d "%~dp0"
start "" http://localhost:5173
node serve.js
pause
