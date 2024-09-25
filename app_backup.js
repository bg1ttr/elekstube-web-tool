// 备份Wi-Fi配置功能正常部分代码
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
    GET_WIFI_STATE: '#17',
    SET_WIFI: '#18',
    GET_WIFI_CONFIG: '#19',
    SET_TIME: '#20',
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
                    log(`收到系统信息: ${parts.slice(1).join(' ')}`);
                    break;
                case '18':
                    handleWiFiConfigResponse(parts);
                    break;
                case '17':
                    handleWiFiStatusResponse(parts);
                    break;
                case '19':
                    handleWiFiConfigInfoResponse(parts);
                    break;
                case '20':
                    handleTimeSetResponse(parts);
                    break;
                case '4':
                    log(`收到时间同步响应: ${parts.slice(1).join(' ')}`);
                    // 可以在这里添加更多的处理逻辑
                    break;
                default:
                    log(`未知响应: #${cmd}`);
            }
        });
    }

    function handleWiFiConfigResponse(parts) {
        if (parts.length >= 3) {
            const ssid = customDecode(parts[1]);
            const password = parts[2]; // 密码可能是明文
            log(`Wi-Fi 配置已接收: SSID=${ssid}, Password=****`);
            wifiStatus.textContent = 'Wi-Fi 配置已发送，等待连接结果';
        } else {
            log('收到的Wi-Fi配置响应格式不正确');
            wifiStatus.textContent = 'Wi-Fi 配置响应异常';
        }
    }

    function handleWiFiStatusResponse(parts) {
        const status = parts[1] === '1' ? '已连接' : '未连接';
        let ip = 'Unknown';
        if (parts.length > 2) {
            ip = parts[2];
        }
        log(`Wi-Fi 状态: ${status}, IP: ${ip}`);
        wifiStatus.textContent = `Wi-Fi: ${status}, IP: ${ip}`;
    }

    function handleWiFiConfigInfoResponse(parts) {
        if (parts.length < 3) {
            log('收到的Wi-Fi配置信息不完整');
            return;
        }
        const encodedSsid = parts[1];
        const encodedPassword = parts[2];
        
        const ssid = customDecode(encodedSsid);
        const password = customDecode(encodedPassword);
        
        log(`保存的Wi-Fi配置:`);
        log(`SSID: ${ssid}`);
        log(`Password: ${'*'.repeat(password.length)}`);
    }

    function handleTimeSetResponse(parts) {
        if (parts[1] === '1') {
            log('时间同步成功');
        } else {
            log('时间同步失败');
        }
    }

    async function configureWiFi(event) {
        event.preventDefault();
        const ssid = document.getElementById('ssid').value;
        const password = document.getElementById('password').value;
        
        try {
            log('开始配置 Wi-Fi...');
            await sendWiFiConfig(ssid, password);
            log('Wi-Fi 配置命令已发送');
            
            // 等待较长时间后检查 Wi-Fi 状态
            log('等待设备连接Wi-Fi...');
            await new Promise(resolve => setTimeout(resolve, 20000)); // 等待20秒
            log('正在检查 Wi-Fi 状态...');
            await sendBLEData(COMMANDS.GET_WIFI_STATE);
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
            const command = COMMANDS.SYS_HANDSHAKE;
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
    
            // 尝试多种格式
            const formats = [
                `#4 0 ${year}-${month}-${day} ${hours}:${minutes}:${seconds}\n`,
                `#4 0 ${year}${month}${day}${hours}${minutes}${seconds}\n`,
                `#4 0 ${Math.floor(now.getTime() / 1000)}\n`, // Unix timestamp
                `#4 0 ${year} ${month} ${day} ${hours} ${minutes} ${seconds}\n`
            ];
    
            for (const command of formats) {
                log(`准备发送时间同步命令: ${command}`);
                await sendCommandWithTimeout(command, 5000);
                log('时间同步命令已发送，等待响应...');
                await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
            }
    
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
                await sendBLEData(command);
                clearTimeout(timeoutId);
                resolve();
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    }
});