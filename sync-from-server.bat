@echo off
echo ====================================
echo Syncing project from server...
echo ====================================
echo.

set SERVER=root@31.220.31.186
set REMOTE_PATH=/opt/sms-automation
set LOCAL_PATH=%~dp0

echo Server: %SERVER%
echo Remote path: %REMOTE_PATH%
echo Local path: %LOCAL_PATH%
echo.
echo This will REPLACE local files with server versions!
echo.
pause

echo.
echo Step 1: Downloading src/ folder...
scp -r %SERVER%:%REMOTE_PATH%/src/* "%LOCAL_PATH%src\"

echo.
echo Step 2: Downloading dist/ folder...
scp -r %SERVER%:%REMOTE_PATH%/dist/* "%LOCAL_PATH%dist\"

echo.
echo Step 3: Downloading package.json...
scp %SERVER%:%REMOTE_PATH%/package.json "%LOCAL_PATH%"

echo.
echo Step 4: Downloading .env (if exists)...
scp %SERVER%:%REMOTE_PATH%/.env "%LOCAL_PATH%" 2>nul

echo.
echo Step 5: Downloading docker-compose.yml...
scp %SERVER%:%REMOTE_PATH%/docker-compose.yml "%LOCAL_PATH%"

echo.
echo Step 6: Downloading Dockerfile...
scp %SERVER%:%REMOTE_PATH%/Dockerfile "%LOCAL_PATH%"

echo.
echo ====================================
echo Sync completed!
echo ====================================
echo.
echo NOTE: You may need to run 'npm install' if dependencies changed.
echo.
pause
