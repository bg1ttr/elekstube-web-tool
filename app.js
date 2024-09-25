let bluetoothDevice;
let gattServer;
let wifiCharacteristic;
let receivedData = '';
let retryCount = 0;
const MAX_RETRIES = 3;
let operationQueue = [];
let isProcessingQueue = false;

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
    SET_YOUTUB_ID: '#31',
    GET_UID: '#222',
    SET_TOKEN: '#233',
    TEST_TOKEN: '#234',
    DEL_TOKEN: '#235'
};

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

document.addEventListener('DOMContentLoaded', () => {
    const scanButton = document.getElementById('scan-button');
    const resetButton = document.getElementById('reset-button');
    const wifiForm = document.getElementById('wifi-form');
    const connectionStatus = document.getElementById('connection-status');
    const wifiStatus = document.getElementById('wifi-status');
    const syncTimeButton = document.getElementById('sync-time-button');
    const syncTimezoneButton = document.getElementById('sync-timezone-button');
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

    function onDisconnected(event) {
        const device = event.target;
        log(`设备 ${device.name} 已断开连接`);
        connectionStatus.textContent = '已断开连接';
        document.getElementById('wifi-section').style.display = 'none';
    }

    async function scanForDevices() {
        log('扫描函数被调用');
        try {
            log('开始扫描设备...');
            if (!navigator.bluetooth) {
                throw new Error('浏览器不支持 Web Bluetooth API');
            }
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'EleksIPS' }],
                optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
            });
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
            log('执行握手...');
            await performHandshake();
            log('握手完成');
        } catch (error) {
            log(`连接错误: ${error.message || error}`);
            handleError(error);
        }
    }

    function handleCharacteristicValueChanged(event) {
        const value = new TextDecoder().decode(event.target.value);
        log(`收到原始数据: ${value}`);
        receivedData += value;
        
        log(`当前累积数据: ${receivedData}`);
        
        if (receivedData.includes('\n') || receivedData.length > 20) {
            log(`处理完整响应: ${receivedData}`);
            parseDeviceResponse(receivedData);
            receivedData = '';
        }
    }

    function parseDeviceResponse(response) {
        log(`开始解析响应: ${response}`);
        const commands = response.split('#').filter(cmd => cmd.trim().length > 0);
        
        if (commands.length === 0) {
            log('没有找到有效的命令');
            return;
        }
        
        commands.forEach(cmd => {
            const parts = cmd.trim().split(' ');
            log(`解析命令: ${cmd}`);
            switch (parts[0]) {
                case '0':
                    log('收到握手响应');
                    break;
                case '1':
                    // 处理系统信息
                    let sysInfo = parts.slice(1).join(' ');
                    try {
                        sysInfo = JSON.parse(sysInfo);
                        log(`解析的系统信息: ${JSON.stringify(sysInfo)}`);
                        // 这里可以添加对系统时间的解析和验证
                    } catch (error) {
                        log(`系统信息解析失败: ${error.message}`);
                    }
                    break;
                case '4':
                    log(`收到时间同步响应: ${parts.slice(1).join(' ')}`);
                    if (parts[1] === '0') {
                        const syncedTime = parts.slice(2).join(' ');
                        log(`时间同步响应，设备时间: ${syncedTime}`);
                    } else {
                        log('时间同步失败');
                    }
                    break;
                case '6':
                    log(`收到时区设置响应: ${parts.slice(1).join(' ')}`);
                    break;
                case '17':
                    log(`收到Wi-Fi状态响应: ${parts.slice(1).join(' ')}`);
                    if (parts[1] === '0' && parts[2] === '1') {
                        log('Wi-Fi 连接成功');
                    } else {
                        log('Wi-Fi 连接失败或状态未知');
                    }
                    break;
                case '18':
                    log(`收到Wi-Fi配置响应: ${parts.slice(1).join(' ')}`);
                    if (parts[1] === '0') {
                        log('Wi-Fi 配置成功接收');
                    } else {
                        log('Wi-Fi 配置接收失败');
                    }
                    break;
                // ... 其他 case 语句 ...
                default:
                    log(`未知响应: #${cmd}`);
            }
        });
    }

    function handleWiFiConfigResponse(parts) {
        if (parts[1] === '0') {
            log('Wi-Fi 配置成功');
            wifiStatus.textContent = '已配置';
        } else {
            log('Wi-Fi 配置失败');
            wifiStatus.textContent = '配置失败';
            retryWiFiConfig();
        }
    }

    function handleWiFiStateResponse(parts) {
        if (parts[1] === '0') {
            log('Wi-Fi 已连接');
            wifiStatus.textContent = '已连接';
        } else {
            log('Wi-Fi 未连接');
            wifiStatus.textContent = '未连接';
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

    async function retryWiFiConfig() {
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            log(`尝试重新配置Wi-Fi（第${retryCount}次）...`);
            await configureWiFi({ preventDefault: () => {} });
        } else {
            log('Wi-Fi配置失败，请检查SSID和密码是否正确，或尝试重新配置');
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
        log('应用已重置');
    }

    function handleError(error) {
        console.error('Error:', error);
        log(`错误: ${error.message || error}`);
    }

    async function syncTime() {
        try {
            log('开始同步时间...');
            if (!checkBluetoothConnection()) {
                throw new Error('蓝牙设备未连接');
            }
            
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = now.getDate().toString().padStart(2, '0');
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const seconds = now.getSeconds().toString().padStart(2, '0');
    
            // 设置时间
            const setTimeCommand = `${COMMANDS.SET_TIME} 0 ${year}-${month}-${day} ${hours}:${minutes}:${seconds}\n`;
            log(`准备发送时间同步命令: ${setTimeCommand}`);
            await sendCommandWithTimeout(setTimeCommand, 5000);
            log('时间同步命令已发送，等待响应...');
            
            // 等待并验证时间同步响应
            const timeResponse = await waitForResponse('#4', 10000);
            const syncedTime = parseTimeResponse(timeResponse);
            if (!isTimeValid(syncedTime, now)) {
                log(`警告：设备返回的时间不正确: ${syncedTime}`);
                // 尝试重新同步时间
                await retryTimeSync(3);
            } else {
                log(`时间同步成功，设备时间: ${syncedTime}`);
            }

            // 设置时区
            const timezoneOffset = -now.getTimezoneOffset();
            const setTimezoneCommand = `${COMMANDS.SET_TIME_ZONE} ${timezoneOffset}\n`;
            log(`准备发送时区设置命令: ${setTimezoneCommand}`);
            await sendCommandWithTimeout(setTimezoneCommand, 5000);
            log('时区设置命令已发送，等待响应...');
            await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
    
            // 再次检查时间，确保设置成功
            const checkTimeCommand = `${COMMANDS.GET_SYS_INFO}\n`;
            log(`准备发送时间检查命令: ${checkTimeCommand}`);
            await sendCommandWithTimeout(checkTimeCommand, 5000);
            log('时间检查命令已发送，等待响应...');

        } catch (error) {
            log(`同步时间失败: ${error.message || error}`);
            handleError(error);
        }
    }

    function checkBluetoothConnection() {
        if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
            log('蓝牙设备未连接');
            return false;
        }
        return true;
    }

    async function sendCommandWithTimeout(command, timeout = 5000) {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('命令执行超时'));
            }, timeout);

            try {
                if (!checkBluetoothConnection()) {
                    throw new Error('蓝牙设备未连接');
                }
                await sendBLEData(command);
                clearTimeout(timeoutId);
                resolve();
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }

    function parseTimeResponse(response) {
        const parts = response.split(' ');
        if (parts.length >= 4) {
            return `${parts[2]} ${parts[3]}`;
        }
        throw new Error('无效的时间响应格式');
    }

    function isTimeValid(syncedTime, referenceTime) {
        const synced = new Date(syncedTime);
        const reference = new Date(referenceTime);
        const diff = Math.abs(synced - reference);
        return diff < 60000; // 允许1分钟的误差
    }

    function waitForResponse(expectedCommand, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`等待响应超时: ${expectedCommand}`));
            }, timeout);
    
            let accumulatedResponse = '';
    
            const responseHandler = (event) => {
                const response = new TextDecoder().decode(event.target.value);
                accumulatedResponse += response;
                log(`累积的响应: ${accumulatedResponse}`);
    
                if (accumulatedResponse.includes(expectedCommand)) {
                    if (expectedCommand === '#1' && accumulatedResponse.endsWith('}')) {
                        // 对于系统信息响应，等待完整的 JSON
                        clearTimeout(timeoutId);
                        wifiCharacteristic.removeEventListener('characteristicvaluechanged', responseHandler);
                        resolve(accumulatedResponse.trim());
                    } else if (expectedCommand !== '#1' && (accumulatedResponse.includes('\n') || accumulatedResponse.endsWith('}'))) {
                        // 对于其他响应，等待换行符或 JSON 结束
                        clearTimeout(timeoutId);
                        wifiCharacteristic.removeEventListener('characteristicvaluechanged', responseHandler);
                        resolve(accumulatedResponse.trim());
                    }
                }
            };
    
            wifiCharacteristic.addEventListener('characteristicvaluechanged', responseHandler);
        });
    }

    async function retryTimeSync(maxRetries) {
        for (let i = 0; i < maxRetries; i++) {
            log(`尝试重新同步时间，第 ${i + 1} 次...`);
            const now = new Date();
            const setTimeCommand = `${COMMANDS.SET_TIME} 0 ${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}\n`;
            
            await sendCommandWithTimeout(setTimeCommand, 5000);
            const timeResponse = await waitForResponse('#4', 10000);
            const syncedTime = parseTimeResponse(timeResponse);
            
            if (isTimeValid(syncedTime, now)) {
                log(`重新同步成功，设备时间: ${syncedTime}`);
                return;
            }
        }
        throw new Error(`时间同步失败，已尝试 ${maxRetries} 次`);
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
});