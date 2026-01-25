@echo off
echo ====================================
echo Checking server status...
echo ====================================
echo Please enter the password when prompted.
echo.

echo.
echo === Docker Container Status ===
ssh root@31.220.31.186 "cd /opt/sms-automation && docker-compose ps"

echo.
echo.
echo === Recent Logs (last 30 lines) ===
ssh root@31.220.31.186 "cd /opt/sms-automation && docker-compose logs --tail=30"

echo.
echo.
echo === Container Resource Usage ===
ssh root@31.220.31.186 "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}' $(docker-compose -f /opt/sms-automation/docker-compose.yml ps -q)"

echo.
echo.
echo === Disk Space on Server ===
ssh root@31.220.31.186 "df -h /opt/sms-automation"

echo.
echo ====================================
echo Status check completed!
echo ====================================
pause
