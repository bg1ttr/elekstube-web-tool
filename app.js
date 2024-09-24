const log = (message) => {
    const logDiv = document.getElementById('log');
    logDiv.innerHTML += `<p>${message}</p>`;
};

let clockServer = null;
let clockService = null;
let clockCharacteristic = null;
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('nav ul li a');
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            navLinks.forEach(nav => nav.classList.remove('active'));
            event.target.classList.add('active');
            const targetPage = event.target.getAttribute('href');
            loadPage(targetPage);
        });
    });

    function loadPage(page) {
        fetch(page)
            .then(response => response.text())
            .then(data => {
                document.querySelector('main').innerHTML = data;
                setLanguage(document.getElementById('language-select').value);
            })
            .catch(error => console.error('Error loading page:', error));
    }

    // Load the default page
    loadPage('index.html');
});
document.getElementById('connect').addEventListener('click', async () => {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'GuGuTube' }],
            optionalServices: ['clock_service_uuid']
        });
        clockServer = await device.gatt.connect();
        log('已连接到时钟');
        clockService = await clockServer.getPrimaryService('clock_service_uuid');
        clockCharacteristic = await clockService.getCharacteristic('time_characteristic_uuid');
        
        // 开始扫描蓝牙设备
        log('开始扫描蓝牙设备');
        const devices = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['clock_service_uuid']
        });
        log('发现设备: ' + devices.name);
        
        // 处理接收到的数据
        clockCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = new TextDecoder().decode(event.target.value);
            log('收到蓝牙数据: ' + value);
        });
        await clockCharacteristic.startNotifications();
        log('已开始接收数据');
        
    } catch (error) {
        log('连接失败: ' + error);
    }
});

const sendData = async (data) => {
    if (!clockCharacteristic) {
        alert('请先连接时钟');
        return;
    }
    try {
        const dataBuffer = new TextEncoder().encode(data);
        await clockCharacteristic.writeValue(dataBuffer);
        log('数据已发送');
    } catch (error) {
        log('发送数据失败: ' + error);
    }
};

document.getElementById('setTime').addEventListener('click', async () => {
    const currentTime = new Date();
    const timeString = `${currentTime.getHours()}:${currentTime.getMinutes()}:${currentTime.getSeconds()}`;
    await sendData(timeString);
});

document.getElementById('uploadImage').addEventListener('click', async () => {
    const imageData = '...'; // 这里应该是实际的图片数据
    await sendData(imageData);
});

navigator.bluetooth.addEventListener('advertisementreceived', (event) => {
    log('发现蓝牙设备: ' + event.device.name);
});

navigator.bluetooth.addEventListener('gattserverdisconnected', (event) => {
    log('蓝牙设备断开连接: ' + event.device.name);
    clockServer = null;
    clockService = null;
    clockCharacteristic = null;
    
    // 处理蓝牙连接状态变化
    log('蓝牙连接状态变化: ' + event.device.name);
    setTimeout(async () => {
        await sendData('GET_WIFI_STATE');
    }, 1000);
});

const receiveData = async () => {
    if (!clockCharacteristic) {
        alert('请先连接时钟');
        return;
    }
    try {
        clockCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const value = new TextDecoder().decode(event.target.value);
            log('收到数据: ' + value);
            
            // 处理接收到的WiFi状态数据
            const data = value.split(" ");
            if (data[0] === 'GET_WIFI_STATE') {
                const wifiConnected = parseInt(data[2]) === 1;
                log('WiFi连接状态: ' + wifiConnected);
                if (data[3].length === 17 && data[3].split(":").length === 6) {
                    log('MAC地址: ' + data[3]);
                }
                if (data[4].length === 6) {
                    log('设备UID: ' + data[4]);
                    log('设备版本: ' + data[5]);
                    log('设备重置状态: ' + data[6]);
                }
            }
        });
        await clockCharacteristic.startNotifications();
        log('已开始接收数据');
    } catch (error) {
        log('接收数据失败: ' + error);
    }
};