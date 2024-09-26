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
        log('Scan button found, adding event listener');
        scanButton.addEventListener('click', scanForDevices);
    } else {
        log('Error: Scan button not found');
    }

    resetButton.addEventListener('click', resetApp);
    wifiForm.addEventListener('submit', configureWiFi);
    syncTimeButton.addEventListener('click', syncTime);

    function onDisconnected(event) {
        const device = event.target;
        log(`Device ${device.name} disconnected`);
        connectionStatus.textContent = 'Disconnected';
        document.getElementById('wifi-section').style.display = 'none';
    }

    async function scanForDevices() {
        log('Scan function called');
        try {
            log('Starting device scan...');
            if (!navigator.bluetooth) {
                throw new Error('Browser does not support Web Bluetooth API');
            }
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'EleksIPS' }],
                optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
            });
            log(`Device found: ${device.name}`);
            log('Attempting to connect to device...');
            await connectToDevice(device);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                log('No matching Bluetooth devices found');
            } else if (error.name === 'SecurityError') {
                log('User denied Bluetooth permission request');
            } else {
                log(`Error scanning for devices: ${error.name} - ${error.message}`);
            }
            handleError(error);
        }
    }

    async function connectToDevice(device) {
        try {
            bluetoothDevice = device;
            log(`Connecting to ${device.name}...`);
            
            gattServer = await device.gatt.connect();
            log('GATT server connected');

            device.addEventListener('gattserverdisconnected', onDisconnected);

            log('Attempting to get service...');
            const service = await gattServer.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
            log(`Service found: ${service.uuid}`);

            log('Attempting to get characteristic...');
            wifiCharacteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
            log(`Writable characteristic found: ${wifiCharacteristic.uuid}`);

            log('Starting to listen for characteristic value changes...');
            await wifiCharacteristic.startNotifications();
            wifiCharacteristic.addEventListener('characteristicvaluechanged', handleCharacteristicValueChanged);

            connectionStatus.textContent = `Connected to ${device.name}`;
            document.getElementById('wifi-section').style.display = 'block';
            log(`Successfully connected to device ${device.name}`);
            log('Performing handshake...');
            await performHandshake();
            log('Handshake completed');
        } catch (error) {
            log(`Connection error: ${error.message || error}`);
            handleError(error);
        }
    }

    function handleCharacteristicValueChanged(event) {
        const value = new TextDecoder().decode(event.target.value);
        log(`Received raw data: ${value}`);
        receivedData += value;
        
        log(`Current accumulated data: ${receivedData}`);
        
        if (receivedData.includes('\n') || receivedData.length > 20) {
            log(`Processing complete response: ${receivedData}`);
            parseDeviceResponse(receivedData);
            receivedData = '';
        }
    }

    function parseDeviceResponse(response) {
        log(`Starting to parse response: ${response}`);
        const commands = response.split('#').filter(cmd => cmd.trim().length > 0);
        
        if (commands.length === 0) {
            log('No valid commands found');
            return;
        }
        
        commands.forEach(cmd => {
            const parts = cmd.trim().split(' ');
            log(`Parsing command: ${cmd}`);
            switch (parts[0]) {
                case '0':
                    log('Received handshake response');
                    break;
                case '1':
                    // Handle system information
                    let sysInfo = parts.slice(1).join(' ');
                    try {
                        sysInfo = JSON.parse(sysInfo);
                        log(`Parsed system info: ${JSON.stringify(sysInfo)}`);
                        // Add parsing and validation of system time here
                    } catch (error) {
                        log(`Failed to parse system info: ${error.message}`);
                    }
                    break;
                case '4':
                    log(`Received time sync response: ${parts.slice(1).join(' ')}`);
                    if (parts[1] === '0') {
                        const syncedTime = parts.slice(2).join(' ');
                        log(`Time sync response, device time: ${syncedTime}`);
                    } else {
                        log('Time sync failed');
                    }
                    break;
                case '6':
                    log(`Received timezone setting response: ${parts.slice(1).join(' ')}`);
                    break;
                case '17':
                    log(`Received Wi-Fi status response: ${parts.slice(1).join(' ')}`);
                    if (parts[1] === '0' && parts[2] === '1') {
                        log('Wi-Fi connected successfully');
                    } else {
                        log('Wi-Fi connection failed or status unknown');
                    }
                    break;
                case '18':
                    log(`Received Wi-Fi configuration response: ${parts.slice(1).join(' ')}`);
                    if (parts[1] === '0') {
                        log('Wi-Fi configuration received successfully');
                    } else {
                        log('Wi-Fi configuration reception failed');
                    }
                    break;
                // ... other case statements ...
                default:
                    log(`Unknown response: #${cmd}`);
            }
        });
    }

    function handleWiFiConfigResponse(parts) {
        if (parts[1] === '0') {
            log('Wi-Fi configuration successful');
            wifiStatus.textContent = 'Configured';
        } else {
            log('Wi-Fi configuration failed');
            wifiStatus.textContent = 'Configuration failed';
            retryWiFiConfig();
        }
    }

    function handleWiFiStateResponse(parts) {
        if (parts[1] === '0') {
            log('Wi-Fi connected');
            wifiStatus.textContent = 'Connected';
        } else {
            log('Wi-Fi not connected');
            wifiStatus.textContent = 'Not connected';
        }
    }

    async function configureWiFi(event) {
        event.preventDefault();
        log('Starting Wi-Fi configuration...');
        const ssid = document.getElementById('ssid').value;
        const password = document.getElementById('password').value;
        
        if (!ssid || !password) {
            log('Please enter SSID and password');
            return;
        }

        try {
            await sendWiFiConfig(ssid, password);
            log('Wi-Fi configuration sent');
            
            // Wait for a while before checking Wi-Fi status
            await new Promise(resolve => setTimeout(resolve, 10000));
            log('Checking Wi-Fi status...');
            await sendCommandWithTimeout(COMMANDS.GET_WIFI_STATE + '\n', 5000);

            log('Wi-Fi configuration completed. Please restart the device manually for the new Wi-Fi settings to take effect.');
            alert('Wi-Fi configuration completed. Please restart the device manually for the new Wi-Fi settings to take effect.');

        } catch (error) {
            log(`Wi-Fi configuration error: ${error.message || error}`);
            handleError(error);
        }
    }

    async function sendWiFiConfig(ssid, password) {
        const encodedSsid = customEncode(ssid);
        const encodedPassword = password; // Password doesn't seem to be encoded
        const command = `${COMMANDS.SET_WIFI} ${encodedSsid} ${encodedPassword}\n`;
        
        log(`Preparing to send Wi-Fi configuration: SSID=${ssid}, Password=****`);
        await sendBLEData(command);
        log('Wi-Fi configuration data sent');
    }

    async function sendBLEData(data) {
        try {
            const encoder = new TextEncoder();
            const dataArray = encoder.encode(data);
            const chunkSize = 20; // Bluetooth packets are typically limited to 20 bytes
            
            for (let i = 0; i < dataArray.length; i += chunkSize) {
                const chunk = dataArray.slice(i, i + chunkSize);
                await wifiCharacteristic.writeValue(chunk);
                log(`Sent data chunk: ${i/chunkSize + 1}`);
                await new Promise(resolve => setTimeout(resolve, 100)); // Short delay to avoid sending too fast
            }
            
            log(`Data sending completed: ${data}`);
        } catch (error) {
            log(`Failed to send data: ${error.message || error}`);
            throw error;
        }
    }

    async function performHandshake() {
        try {
            const command = COMMANDS.SYS_HANDSHAKE + '\n';
            log(`Sending handshake command: ${command}`);
            await sendCommandWithTimeout(command, 10000);
            log('Handshake command sent, waiting for response...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            log('Handshake wait ended');
        } catch (error) {
            log(`Handshake failed: ${error.message || error}`);
            handleError(error);
        }
    }

    async function retryWiFiConfig() {
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            log(`Attempting to reconfigure Wi-Fi (Attempt ${retryCount})...`);
            await configureWiFi({ preventDefault: () => {} });
        } else {
            log('Wi-Fi configuration failed, please check SSID and password or try reconfiguring');
        }
    }

    function resetApp() {
        log('Resetting application...');
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
        document.getElementById('log-content').textContent = '';  // Clear log window
        document.getElementById('wifi-section').style.display = 'none';
        retryCount = 0;
        receivedData = '';
        operationQueue = [];
        isProcessingQueue = false;
        log('Application reset');
    }

    function handleError(error) {
        console.error('Error:', error);
        log(`Error: ${error.message || error}`);
    }

    function syncTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const show = '0'; // 0 for not showing UI message, 1 for showing
    
        const setTimeCommand = `${COMMANDS.SET_TIME} ${year} ${month} ${day} ${hours} ${minutes} ${seconds} ${show}\n`;
        
        return new Promise(async (resolve, reject) => {
            try {
                log(`Sending time sync command: ${setTimeCommand}`);
                await sendCommandWithTimeout(setTimeCommand, 5000);
                const response = await waitForResponse('#4', 10000);
                log(`Received time sync response: ${response}`);
                
                // Parse the response to check if time was set correctly
                const [cmd, status, ...timeParts] = response.split(' ');
                if (status === '0' && timeParts.length === 6) {
                    const syncedTime = new Date(timeParts.join(' '));
                    if (Math.abs(syncedTime - now) < 60000) { // Within 1 minute
                        log('Time sync successful');
                        resolve(syncedTime);
                    } else {
                        reject(new Error('Time sync failed: Significant time difference'));
                    }
                } else {
                    reject(new Error('Invalid time sync response'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    function checkBluetoothConnection() {
        if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
            log('Bluetooth device not connected');
            return false;
        }
        return true;
    }

    async function sendCommandWithTimeout(command, timeout = 5000) {
        return new Promise(async (resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Command execution timed out'));
            }, timeout);

            try {
                if (!checkBluetoothConnection()) {
                    throw new Error('Bluetooth device not connected');
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
        throw new Error('Invalid time response format');
    }

    function isTimeValid(syncedTime, referenceTime) {
        const synced = new Date(syncedTime);
        const reference = new Date(referenceTime);
        const diff = Math.abs(synced - reference);
        return diff < 60000; // Allow 1 minute difference
    }

    function waitForResponse(expectedCommand, timeout = 15000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Waiting for response timed out: ${expectedCommand}`));
            }, timeout);
    
            let accumulatedResponse = '';
    
            const responseHandler = (event) => {
                const response = new TextDecoder().decode(event.target.value);
                accumulatedResponse += response;
                log(`Accumulated response: ${accumulatedResponse}`);
    
                if (accumulatedResponse.includes(expectedCommand)) {
                    if (expectedCommand === '#1' && accumulatedResponse.endsWith('}')) {
                        // For system info response, wait for complete JSON
                        clearTimeout(timeoutId);
                        wifiCharacteristic.removeEventListener('characteristicvaluechanged', responseHandler);
                        resolve(accumulatedResponse.trim());
                    } else if (expectedCommand !== '#1' && (accumulatedResponse.includes('\n') || accumulatedResponse.endsWith('}'))) {
                        // For other responses, wait for newline or JSON end
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
            log(`Attempting to resync time, attempt ${i + 1}...`);
            const now = new Date();
            const setTimeCommand = `${COMMANDS.SET_TIME} 0 ${now.toISOString().replace(/T/, ' ').replace(/\..+/, '')}\n`;
            
            await sendCommandWithTimeout(setTimeCommand, 5000);
            const timeResponse = await waitForResponse('#4', 10000);
            const syncedTime = parseTimeResponse(timeResponse);
            
            if (isTimeValid(syncedTime, now)) {
                log(`Resync successful, device time: ${syncedTime}`);
                return;
            }
        }
        throw new Error(`Time sync failed after ${maxRetries} attempts`);
    }

    function syncTimezone() {
        const now = new Date();
        const timezoneOffset = -now.getTimezoneOffset(); // JavaScript uses opposite sign
    
        const setTimezoneCommand = `${COMMANDS.SET_TIME_ZONE} ${timezoneOffset}\n`;
        
        return new Promise(async (resolve, reject) => {
            try {
                log(`Sending timezone setting command: ${setTimezoneCommand}`);
                await sendCommandWithTimeout(setTimezoneCommand, 5000);
                const response = await waitForResponse('#6', 10000);
                log(`Received timezone setting response: ${response}`);
    
                const [cmd, status, setOffset] = response.split(' ');
                if (status === '0' && parseInt(setOffset) === timezoneOffset) {
                    log(`Timezone sync successful, set to UTC${timezoneOffset >= 0 ? '+' : '-'}${Math.abs(timezoneOffset / 60)}`);
                    resolve(timezoneOffset);
                } else {
                    reject(new Error('Timezone sync failed: Mismatch in set value'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }
    async function verifyTimeSetting() {
        log('Verifying time setting...');
        const checkTimeCommand = `${COMMANDS.GET_SYS_INFO}\n`;
        await sendCommandWithTimeout(checkTimeCommand, 5000);
        
        const sysInfoResponse = await waitForResponse('#1', 10000);
        log(`System info response: ${sysInfoResponse}`);
        
        const timeMatch = sysInfoResponse.match(/"time":"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"/);
        const tzMatch = sysInfoResponse.match(/"tz":(-?\d+)/);
        
        if (timeMatch && tzMatch) {
            const deviceTime = new Date(timeMatch[1]);
            const deviceTz = parseInt(tzMatch[1]);
            const now = new Date();
            const localTz = -now.getTimezoneOffset();
            
            const timeDiff = Math.abs(deviceTime - now);
            
            if (timeDiff > 60000 || deviceTz !== localTz) {
                log(`Time verification failed. Device time: ${deviceTime.toISOString()}, Local time: ${now.toISOString()}`);
                log(`Device timezone: ${deviceTz}, Local timezone: ${localTz}`);
                throw new Error('Time or timezone mismatch detected');
            } else {
                log('Time and timezone verification successful');
            }
        } else {
            throw new Error('Unable to parse time or timezone from system info');
        }
    }
    async function synchronizeDeviceTime() {
        try {
            log('Starting device time synchronization...');
            if (!checkBluetoothConnection()) {
                throw new Error('Bluetooth device not connected');
            }
    
            // First, set the timezone
            await syncTimezone();
    
            // Then, set the time
            const syncedTime = await syncTime();
    
            // Optionally, verify the time setting
            const verifiedTime = await checkDeviceTime();
            if (Math.abs(verifiedTime - syncedTime) > 5000) { // More than 5 seconds difference
                throw new Error('Time verification failed: Significant time difference after sync');
            }
    
            log('Device time synchronization completed successfully');
        } catch (error) {
            log(`Device time synchronization failed: ${error.message}`);
            handleError(error);
        }
    }
    
    // Helper function to check device time
    async function checkDeviceTime() {
        const checkTimeCommand = `${COMMANDS.GET_SYS_INFO}\n`;
        await sendCommandWithTimeout(checkTimeCommand, 5000);
        const sysInfoResponse = await waitForResponse('#1', 10000);
        const timeMatch = sysInfoResponse.match(/"time":"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"/);
        if (timeMatch) {
            return new Date(timeMatch[1]);
        }
        throw new Error('Unable to parse time from system info');
    }
});