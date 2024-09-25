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
};

function customEncode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode('0x' + p1);
    })).replace(/\+/g, '.').replace(/=/g, '-').replace(/\//g, '_');
}

function customDecode(str) {
    return decodeURIComponent(atob(str.replace(/\./g, '+').replace(/-/g, '=').replace(/_/g, '/')).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

function log(message) {
    console.log(message);
    const statusDiv = document.getElementById('status');
    statusDiv.textContent += message + '\n';
    statusDiv.scrollTop = statusDiv.scrollHeight;
}

document.addEventListener('DOMContentLoaded', () => {
    const scanButton = document.getElementById('scan-button');
    const resetButton = document.getElementById('reset-button');
    const wifiForm = document.getElementById('wifi-form');
    const connectionStatus = document.getElementById('connection-status');
    const wifiStatus = document.getElementById('wifi-status');
    const readWifiConfigButton = document.getElementById('read-wifi-config');

    scanButton.addEventListener('click', scanForDevices);
    resetButton.addEventListener('click', resetApp);
    wifiForm.addEventListener('submit', configureWiFi);
    readWifiConfigButton.addEventListener('click', readWiFiConfig);

    async function scanForDevices() {
        try {
            log('开始扫描设备...');
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'EleksIPS' }],
                optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
            });
            log(`找到设备: ${device.name}`);
            log('尝试连接到设备...');
            await connectToDevice(device);
        } catch (error) {
            log(`扫描设备错误: ${error.message || error}`);
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
            log('执行握手...');
            await performHandshake();
        } catch (error) {
            log(`连接错误: ${error.message || error}`);
            handleError(error);
        }
    }

    function handleCharacteristicValueChanged(event) {
        const value = new TextDecoder().decode(event.target.value);
        log(`收到原始数据: ${value}`);
        receivedData += value;
        
        if (receivedData.includes('\n') || receivedData.length > 20) {
            log(`处理完整响应: ${receivedData}`);
            parseDeviceResponse(receivedData);
            receivedData = '';
        }
    }
    
    function parseDeviceResponse(response) {
        const commands = response.split('#').filter(cmd => cmd.trim().length > 0);
        
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
                default:
                    log(`未知响应: #${cmd}`);
            }
        });
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
    
    function handleWiFiStatusResponse(parts) {
        const status = parts[1] === '1' ? '已连接' : '未连接';
        let ip = 'Unknown';
        if (parts.length > 3) {
            ip = parts.slice(3).join(':');
        }
        log(`Wi-Fi状态: ${status}, IP: ${ip}`);
        wifiStatus.textContent = `Wi-Fi状态: ${status}, IP: ${ip}`;
    }

    function handleWiFiConfigResponse(parts) {
        if (parts[1] === '0') {
            log('Wi-Fi配置成功接收');
        } else {
            log('Wi-Fi配置接收失败');
        }
    }

    function onDisconnected() {
        log('设备已断开连接');
        reconnectDevice();
    }

    async function configureWiFi(event) {
        event.preventDefault();
        const ssid = document.getElementById('ssid').value.trim();
        const password = document.getElementById('password').value.trim();
    
        if (!checkBluetoothConnection()) {
            return;
        }
    
        try {
            const encodedSsid = customEncode(ssid);
            const encodedPassword = customEncode(password);
    
            const command = `${COMMANDS.SET_WIFI} ${encodedSsid} ${encodedPassword}`;
            log(`发送Wi-Fi配置命令: ${command}`);
            await sendCommandWithTimeout(command, 15000);
            log('Wi-Fi配置命令已发送');
    
            log('等待设备处理配置...');
            await new Promise(resolve => setTimeout(resolve, 10000));
    
            await queryWiFiStatus();
        } catch (error) {
            log(`Wi-Fi配置错误: ${error.message || error}`);
            handleError(error);
        }
    }

    async function queryWiFiStatus() {
        try {
            log('查询Wi-Fi状态...');
            await sendCommandWithTimeout(COMMANDS.GET_WIFI_STATE, 5000);
            log('Wi-Fi状态查询命令已发送');
        } catch (error) {
            log(`查询Wi-Fi状态失败: ${error.message || error}`);
            handleError(error);
        }
    }

    async function sendBLEData(data) {
        try {
            const encoder = new TextEncoder();
            const dataArray = encoder.encode(data);
            
            log(`准备发送数据: ${data}`);
            for (let i = 0; i < dataArray.length; i += 1) {
                const chunk = dataArray.slice(i, i + 1);
                log(`发送数据字节: ${chunk[0]}`);
                await wifiCharacteristic.writeValue(chunk);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            log(`数据发送完成: ${data}`);
        } catch (error) {
            log(`发送数据失败: ${error.message || error}`);
            throw error;
        }
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

    async function queueOperation(operation) {
        return new Promise((resolve, reject) => {
            operationQueue.push({ operation, resolve, reject });
            processQueue();
        });
    }

    async function processQueue() {
        if (isProcessingQueue || operationQueue.length === 0) return;
        isProcessingQueue = true;
        const { operation, resolve, reject } = operationQueue.shift();
        try {
            const result = await operation();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            isProcessingQueue = false;
            setTimeout(processQueue, 100);
        }
    }

    async function performHandshake() {
        try {
            const command = COMMANDS.SYS_HANDSHAKE;
            log(`发送握手命令: ${command}`);
            await sendCommandWithTimeout(command, 5000);
            log('握手命令已发送，等待响应...');
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
        if (bluetoothDevice && bluetoothDevice.gatt.connected) {
            bluetoothDevice.gatt.disconnect();
        }
        bluetoothDevice = null;
        gattServer = null;
        wifiCharacteristic = null;
        connectionStatus.textContent = '';
        wifiStatus.textContent = '';
        document.getElementById('status').textContent = '';
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
        // 可能的话，尝试重新连接或重置状态
    }

    async function readWiFiConfig() {
        try {
            log('正在读取系统信息...');
            if (!checkBluetoothConnection()) {
                throw new Error('蓝牙设备未连接');
            }
            await prepareDevice();
            await sendCommandWithTimeout(COMMANDS.GET_SYS_INFO, 10000);
            log('系统信息查询命令已发送，等待响应...');
        } catch (error) {
            log(`读取系统信息失败: ${error.message || error}`);
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

    async function reconnectDevice() {
        log('尝试重新连接设备...');
        try {
            if (bluetoothDevice) {
                await connectToDevice(bluetoothDevice);
            } else {
                log('没有可重连的设备');
            }
        } catch (error) {
            log(`重连失败: ${error.message || error}`);
            handleError(error);
        }
    }

    async function prepareDevice() {
        try {
            log('准备设备...');
            await sendBLEData('#');  // 发送一个空命令
            await new Promise(resolve => setTimeout(resolve, 500));  // 等待500ms
        } catch (error) {
            log(`准备设备失败: ${error.message || error}`);
            throw error;
        }
    }
});