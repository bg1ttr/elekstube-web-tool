document.addEventListener('DOMContentLoaded', () => {
    const scanButton = document.getElementById('scan-button');
    const deviceList = document.getElementById('device-list');

    scanButton.addEventListener('click', async () => {
        try {
            const devices = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['battery_service']
            });

            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span class="device-name">${devices.name}</span>
                <button class="connect-button" data-device-id="${devices.id}">连接</button>
            `;
            deviceList.appendChild(listItem);

            const connectButtons = document.querySelectorAll('.connect-button');
            connectButtons.forEach(button => {
                button.addEventListener('click', async (event) => {
                    const deviceId = event.target.getAttribute('data-device-id');
                    const device = await navigator.bluetooth.requestDevice({
                        filters: [{ id: deviceId }],
                        optionalServices: ['battery_service']
                    });
                    try {
                        wx.showLoading({
                            title: "正在连接...",
                            success: function() {
                                const timeout = setTimeout(() => {
                                    wx.hideLoading({
                                        success: function() {
                                            wx.showToast({
                                                title: "连接超时",
                                                icon: "error"
                                            });
                                        }
                                    });
                                }, 3000);
                            }
                        });

                        const server = await device.gatt.connect();
                        console.log('Connected to', device.name);
                        wx.hideLoading({
                            success: function() {
                                wx.showToast({
                                    title: "连接成功",
                                    icon: "success"
                                });
                            }
                        });
                        // 更新连接状态
                        event.target.textContent = '已连接';
                        event.target.disabled = true;
                    } catch (error) {
                        console.error('Connection failed:', error);
                        wx.hideLoading({
                            success: function() {
                                wx.showToast({
                                    title: "连接失败",
                                    icon: "error"
                                });
                            }
                        });
                    }
                });
            });
        } catch (error) {
            console.error('Error scanning for devices:', error);
        }
    });
});