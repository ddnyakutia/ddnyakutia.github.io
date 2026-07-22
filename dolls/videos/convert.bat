@echo off
setlocal enabledelayedexpansion

mkdir optimized 2>nul

for %%f in (*.webm) do (
    echo Обрабатываю %%f ...

    ffmpeg -c:v libvpx-vp9 -i "%%f" ^
      -c:v libvpx-vp9 -b:v 2000k -crf 32 -pix_fmt yuva420p -auto-alt-ref 0 ^
      -deadline good -cpu-used 4 -row-mt 1 ^
      -pass 1 -an -f webm -y NUL

    ffmpeg -c:v libvpx-vp9 -i "%%f" ^
      -c:v libvpx-vp9 -b:v 2000k -crf 32 -pix_fmt yuva420p -auto-alt-ref 0 ^
      -deadline good -cpu-used 4 -row-mt 1 ^
      -pass 2 -an "optimized\%%~nf.webm"
)

echo Готово! Результаты в папке optimized
pause