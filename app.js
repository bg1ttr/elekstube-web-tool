document.addEventListener('DOMContentLoaded', () => {
    const scanButton = document.getElementById('scan-button');
    const resetButton = document.getElementById('reset-button');
    const wifiForm = document.getElementById('wifi-form');
    const connectionStatus = document.getElementById('connection-status');
    const wifiStatus = document.getElementById('wifi-status');
    const syncTimeButton = document.getElementById('sync-time-button');
    const syncTimezoneButton = document.getElementById('sync-timezone-button');

    let bluetoothDevice;
    let gattServer;
    let wifiCharacteristic;
    let receivedData = '';
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let operationQueue = [];
    let isProcessingQueue = false;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 3;
    const RECONNECT_DELAY = 5000; // 5秒

    const COMMANDS = {
        SYS_HANDSHAKE: '#0',
        GET_SYS_INFO: '#1',
        SET_SYS_POWER: '#2',
        SET_SYS_RESTART: '#3',
        SET_TIME: '#4',
        SET_TIME_FORMAT: '#5',
        SET_TIME_ZONE: '#6',
        SET_TFT_STYLE: '#7',
        SET_TFT_MODE: '#8',
        SET_TFT_ROTATE: '#9',
        SET_TFT_POWER: '#10',
        SET_LED_POWER: '#11',
        SET_LED_STYLE: '#12',
        SET_LED_BRIGHTNESS: '#13',
        SET_LED_COLOR: '#14',
        SET_LED_COLORS: '#15',
        GET_WIFI_LIST: '#16',
        GET_WIFI_STATE: '#17',
        SET_WIFI: '#18',
        FS_FORMAT: '#19',
        FS_DOWNLOAD_FILE: '#20',
        FS_DOWNLOAD_ALBUM: '#21',
        SET_NTP_SERVER: '#22',
        SET_NTP_INTERVAL: '#23',
        SYS_UPDATA_FFS: '#24',
        SET_SPECIAL_STATE: '#25',
        GET_SPECIAL_STATE: '#26',
        SET_SPECIAL_INFO: '#27',
        SET_CITY_CODE: '#28',
        SET_BILIBILI_ID: '#29',
        SET_TIKTOK_ID: '#30',
        GET_UID: '#222',
        SET_TOKEN: '#233',
        TEST_TOKEN: '#234',
        DEL_TOKEN: '#235'
    };

    syncTimezoneButton.addEventListener('click', syncTimezone);

    if (scanButton) {
        log('找到扫描按钮，添加事件监听器');
        scanButton.addEventListener('click', scanForDevices);
    } else {
        log('错误：未找到扫描按钮');
    }

    resetButton.addEventListener('click', resetApp);
    wifiForm.addEventListener('submit', configureWiFi);
    syncTimeButton.addEventListener('click', syncTime);

    async function scanForDevices() {
        log('扫描函数被调用');
        try {
            log('开始扫描设备...');
            if (!navigator.bluetooth) {
                throw new Error('浏览器不支持 Web Bluetooth API');
            }
            const device = await Promise.race([
                navigator.bluetooth.requestDevice({
                    filters: [{ namePrefix: 'EleksIPS' }],
                    optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('扫描超时')), 30000))
            ]);
            log(`找到设备: ${device.name}`);
            log('尝试连接到设备...');
            await connectToDevice(device);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                log('未找到匹配的蓝牙设备');
            } else if (error.name === 'SecurityError') {
                log('用户拒绝了蓝牙权限请求');
            } else {
                log(`扫描设备错误: ${error.name} - ${error.message}`);
            }
            handleError(error);
        }
    }

    async function connectToDevice(device) {
        try {
            bluetoothDevice = device;
            log(`正在连接到 ${device.name}...`);
            
            gattServer = await device.gatt.connect();
            log('GATT服务器已连接');

            device.addEventListener('gattserverdisconnected', onDisconnected);

            await connectToGATTServer(device);
        } catch (error) {
            log(`连接错误: ${error.message || error}`);
            handleError(error);
            await handleReconnect(device);
        }
    }

    async function connectToGATTServer(device) {
        try {
            log('尝试获取服务...');
            const service = await gattServer.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
            log(`找到服务: ${service.uuid}`);

            log('尝试获取特征...');
            wifiCharacteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
            log(`找到可写入的特征: ${wifiCharacteristic.uuid}`);

            log('开始监听特征值变化...');
            await wifiCharacteristic.startNotifications();
            wifiCharacteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);

            connectionStatus.textContent = `已连接到 ${device.name}`;
            document.getElementById('wifi-section').style.display = 'block';
            log(`成功连接到设备 ${device.name}`);

            reconnectAttempts = 0; // 重置重连尝试次数

            await enqueueGattOperation(performHandshake);
            await enqueueGattOperation(getDeviceInfo);
            await enqueueGattOperation(syncTime);
        } catch (error) {
            throw error; // 将错误抛出，由上层函数处理
        }
    }

    function handleCharacteristicValueChanged(event) {
        const value = new TextDecoder().decode(event.target.value);
        log(`收到原始数据: ${value}`);
        receivedData += value;
        
        log(`当前累积数据: ${receivedData}`);
        
        if (receivedData.includes('\n') || receivedData.endsWith('}')) {
            log(`处理完整响应: ${receivedData}`);
            parseDeviceResponse(receivedData);
            receivedData = '';
        }
    }

    function parseDeviceResponse(response) {
        log(`开始解析响应: ${response}`);
        if (response.startsWith('#1')) {
            // 解析设备信息
            try {
                const jsonStr = response.substring(response.indexOf('{'));
                const deviceInfo = JSON.parse(jsonStr);
                log(`设备型号: ${deviceInfo.su}`);
                log(`固件版本: ${deviceInfo.sv}`);
                log(`MAC地址: ${deviceInfo.sm}`);
                log(`时区: UTC+${deviceInfo.tz / 60}`);
            } catch (error) {
                log(`解析设备信息失败: ${error.message}`);
            }
        } else if (response.startsWith('#4')) {
            // 解析时间同步响应
            const timeMatch = response.match(/#4 0 (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
            if (timeMatch) {
                const syncedTime = timeMatch[1];
                log(`时间同步响应，设备时间: ${syncedTime}`);
                // 验证同步时间是否正确
                const localTime = new Date();
                if (isTimeValid(syncedTime, localTime)) {
                    log('时间同步成功');
                } else {
                    log('时间同步失败，设备时间与本地时间不匹配');
                }
            } else {
                log('无法解析时间同步响应');
            }
        }
    }

    async function configureWiFi(event) {
        event.preventDefault();
        log('开始配置 Wi-Fi...');
        const ssid = document.getElementById('ssid').value;
        const password = document.getElementById('password').value;
        
        if (!ssid || !password) {
            log('请输入 SSID 和密码');
            return;
        }

        try {
            await sendWiFiConfig(ssid, password);
            log('Wi-Fi 配置已发送');
            
            // 等待一段时间后检查 Wi-Fi 状态
            await new Promise(resolve => setTimeout(resolve, 10000));
            log('检查 Wi-Fi 状态...');
            await sendCommandWithTimeout(COMMANDS.GET_WIFI_STATE + '\n', 5000);

            log('Wi-Fi 配置已完成。请手动重启设备以使新的 Wi-Fi 设置生效。');
            alert('Wi-Fi 配置已完成。请手动重启设备以使新的 Wi-Fi 设置生效。');

        } catch (error) {
            log(`Wi-Fi 配置错误: ${error.message || error}`);
            handleError(error);
        }
    }

    async function sendWiFiConfig(ssid, password) {
        const encodedSsid = customEncode(ssid);
        const encodedPassword = password; // 密码似乎没有被编码
        const command = `${COMMANDS.SET_WIFI} ${encodedSsid} ${encodedPassword}\n`;
        
        log(`准备发送Wi-Fi配置: SSID=${ssid}, Password=****`);
        await sendBLEData(command);
        log('Wi-Fi配置数据已发送');
    }

    async function sendBLEData(data) {
        try {
            const encoder = new TextEncoder();
            const dataArray = encoder.encode(data);
            const chunkSize = 20; // 蓝牙数据包通常限制为20字节
            
            for (let i = 0; i < dataArray.length; i += chunkSize) {
                const chunk = dataArray.slice(i, i + chunkSize);
                await wifiCharacteristic.writeValue(chunk);
                log(`发送数据块: ${i/chunkSize + 1}`);
                await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟，避免发送过快
            }
            
            log(`数据发送完成: ${data}`);
        } catch (error) {
            log(`发送数据失败: ${error.message || error}`);
            throw error;
        }
    }

    async function performHandshake() {
        try {
            const command = COMMANDS.SYS_HANDSHAKE + '\n';
            log(`发送握手命令: ${command}`);
            await sendCommandWithTimeout(command, 10000);
            log('握手命令已发送，等待响应...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            log('握手等待结束');
        } catch (error) {
            log(`握手失败: ${error.message || error}`);
            handleError(error);
        }
    }

    async function getDeviceInfo() {
        try {
            log('获取设备信息...');
            await sendCommandWithTimeout(COMMANDS.GET_SYS_INFO + '\n', 5000);
            // 响应将在 handleCharacteristicValueChanged 中处理
        } catch (error) {
            log(`获取设备信息失败: ${error.message || error}`);
            handleError(error);
        }
    }

    async function syncTime() {
        try {
            log('开始同步时间...');
            const now = new Date();
            const setTimeCommand = `${COMMANDS.SET_TIME} 0 ${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}\n`;
            
            log(`准备发送时间同步命令: ${setTimeCommand}`);
            await sendCommandWithTimeout(setTimeCommand, 5000);
            log('时间同步命令已发送，等待响应...');
            
            const response = await waitForResponse('#4', 10000);
            log(`收到时间同步响应: ${response}`);
            parseDeviceResponse(response);
        } catch (error) {
            log(`同步时间失败: ${error.message || error}`);
            handleError(error);
        }
    }

    async function syncTimezone() {
        try {
            log('开始同步时区...');
            if (!checkBluetoothConnection()) {
                throw new Error('蓝牙设备未连接');
            }
    
            const localTimezoneOffset = new Date().getTimezoneOffset();
            const timezoneOffset = -localTimezoneOffset;
            
            const setTimezoneCommand = `${COMMANDS.SET_TIME_ZONE} ${timezoneOffset}\n`;
            
            log(`准备发送时区设置命令: ${setTimezoneCommand}`);
            await sendCommandWithTimeout(setTimezoneCommand, 5000);
            log('时区设置命令已发送，等待响应...');
    
            try {
                const response = await waitForResponse('#6', 15000);
                log(`收到时区设置响应: ${response}`);
    
                if (response.includes(`0 ${timezoneOffset}`)) {
                    log(`时区同步成功，设置为 UTC${timezoneOffset >= 0 ? '+' : '-'}${Math.abs(timezoneOffset / 60)}`);
                    return; // 成功后直接返回
                } else {
                    log(`时区同步响应格式不正确: ${response}`);
                }
            } catch (error) {
                if (error.message.includes('超时')) {
                    log('时区设置响应超时，尝试验证设置...');
                } else {
                    throw error;
                }
            }
    
            // 验证时区设置
            log('尝试获取系统信息以验证时区设置...');
            await sendCommandWithTimeout(`${COMMANDS.GET_SYS_INFO}\n`, 5000);
            try {
                const sysInfoResponse = await waitForResponse('#1', 10000);
                log(`系统信息响应: ${sysInfoResponse}`);
                
                // 解析系统信息响应，检查时区设置
                const tzMatch = sysInfoResponse.match(/"tz":(\d+)/);
                if (tzMatch) {
                    const setTz = parseInt(tzMatch[1]);
                    if (setTz === timezoneOffset) {
                        log(`时区同步成功，设置为 UTC${setTz >= 0 ? '+' : '-'}${Math.abs(setTz / 60)}`);
                    } else {
                        log(`时区设置不匹配。期望: ${timezoneOffset}, 实际: ${setTz}`);
                    }
                } else {
                    log('无法从系统信息中解析时区设置');
                }
            } catch (error) {
                log(`获取系统信息失败: ${error.message}`);
            }
    
        } catch (error) {
            log(`同步时区失败: ${error.message || error}`);
            handleError(error);
        }
    }

    function onDisconnected(event) {
        const device = event.target;
        log(`设备 ${device.name} 已断开连接`);
        connectionStatus.textContent = '已断开连接';
        document.getElementById('wifi-section').style.display = 'none';
        
        handleReconnect(device).catch(error => {
            log(`重新连接失败: ${error.message}`);
        });
    }

    async function handleReconnect(device) {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            log(`尝试重新连接 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));
            await connectToDevice(device);
        } else {
            log('达到最大重连次数，请手动重试');
            resetApp();
        }
    }

    function resetApp() {
        log('重置应用...');
        if (bluetoothDevice) {
            if (bluetoothDevice.gatt.connected) {
                bluetoothDevice.gatt.disconnect();
            }
            bluetoothDevice.removeEventListener('gattserverdisconnected', onDisconnected);
            bluetoothDevice = null;
        }
        gattServer = null;
        wifiCharacteristic = null;
        connectionStatus.textContent = '';
        wifiStatus.textContent = '';
        document.getElementById('log-content').textContent = '';  // 清空日志窗口
        document.getElementById('wifi-section').style.display = 'none';
        retryCount = 0;
        receivedData = '';
        operationQueue = [];
        isProcessingQueue = false;
        reconnectAttempts = 0; // 重置重连尝试次数
        log('应用已重置');
    }

    function handleError(error) {
        console.error('Error:', error);
        log(`错误: ${error.message || error}`);
    }

    function checkBluetoothConnection() {
        return bluetoothDevice && bluetoothDevice.gatt.connected;
    }

    async function sendCommandWithTimeout(command, timeout) {
        return Promise.race([
            sendBLEData(command),
            new Promise((_, reject) => setTimeout(() => reject(new Error('命令发送超时')), timeout))
        ]);
    }

    async function waitForResponse(expectedCommand, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`等待响应超时: ${expectedCommand}`));
            }, timeout);

            let fullResponse = '';
            const responseHandler = (event) => {
                const response = new TextDecoder().decode(event.target.value);
                fullResponse += response;
                log(`累积的响应: ${fullResponse}`);

                if (fullResponse.includes(expectedCommand) && (fullResponse.includes('\n') || fullResponse.endsWith('29'))) {
                    clearTimeout(timeoutId);
                    wifiCharacteristic.removeEventListener('characteristicvaluechanged', responseHandler);
                    resolve(fullResponse.trim());
                }
            };

            wifiCharacteristic.addEventListener('characteristicvaluechanged', responseHandler);
        });
    }

    function isTimeValid(syncedTime, localTime) {
        const synced = new Date(syncedTime);
        const timeDiff = Math.abs(synced - localTime);
        return timeDiff < 60000; // 允许1分钟的误差
    }

    function customEncode(str) {
        return btoa(str);
    }

    function customDecode(str) {
        return atob(str);
    }

    function log(message) {
        console.log(message);
        const logContent = document.getElementById('log-content');
        if (logContent) {
            const timestamp = new Date().toLocaleTimeString();
            logContent.textContent += `[${timestamp}] ${message}\n`;
            logContent.scrollTop = logContent.scrollHeight;
        }
    }

    let gattQueue = Promise.resolve();

    function enqueueGattOperation(operation) {
        return new Promise((resolve, reject) => {
            gattQueue = gattQueue.then(() => operation().then(resolve, reject));
        });
    }
});