@echo off
echo ====================================
echo Deploying updates to server...
echo ====================================

echo.
echo Step 1: Compiling TypeScript...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo Step 2: Uploading compiled file to server...
echo Please enter the password when prompted.
scp dist/services/openphone.service.js root@31.220.31.186:/opt/sms-automation/dist/services/

if errorlevel 1 (
    echo ERROR: Upload failed!
    pause
    exit /b 1
)

echo.
echo Step 3: Restarting Docker container on server...
ssh root@31.220.31.186 "cd /opt/sms-automation && docker-compose restart"

if errorlevel 1 (
    echo ERROR: Docker restart failed!
    pause
    exit /b 1
)

echo.
echo ====================================
echo Deployment completed successfully!
echo ====================================
echo.
echo Checking logs...
ssh root@31.220.31.186 "cd /opt/sms-automation && docker-compose logs --tail=30"

pause
