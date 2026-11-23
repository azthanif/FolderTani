@echo off
rem Jalankan pipeline berita harian (Windows Task Scheduler). Isi variabel rahasia di news_pipeline\env.bat.
cd /d "%~dp0\.."
if exist news_pipeline\env.bat call news_pipeline\env.bat
if not exist news_pipeline\data\logs mkdir news_pipeline\data\logs
python -m news_pipeline.run_daily --config news_pipeline\config.yaml %* >> news_pipeline\data\logs\daily.log 2>&1
