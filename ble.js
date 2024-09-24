var e, t, n = require("../../@babel/runtime/helpers/interopRequireDefault")(require("../../@babel/runtime/regenerator")), o = require("../../@babel/runtime/helpers/asyncToGenerator"), c = getApp(), a = c.ble, s = "[ble.js]";

Page({
    data: {
        deviceName: a.data.chs.deviceName,
        deviceId: a.data.chs.deviceId,
        deviceId_old: "",
        deviceList: [],
        showBox: !1,
        scaning: !1,
        userSsid: "CMCC-333",
        userPwd: "123456",
        ssid: "",
        pwd: ""
    },
    scanBle: (t = o(n.default.mark(function e() {
        var t;
        return n.default.wrap(function(e) {
            for (;;) switch (e.prev = e.next) {
              case 0:
                if (0 != this.data.scaning) {
                    e.next = 7;
                    break;
                }
                return e.next = 3, a.startBluetoothDevicesDiscoverySync();

              case 3:
                t = e.sent, this.setData({
                    scaning: t
                }), e.next = 9;
                break;

              case 7:
                a.stopBluetoothDevicesDiscoverySync(), this.setData({
                    scaning: !1
                });

              case 9:
              case "end":
                return e.stop();
            }
        }, e, this);
    })), function() {
        return t.apply(this, arguments);
    }),
    connectDevice: (e = o(n.default.mark(function e(t) {
        var o, c, i, r;
        return n.default.wrap(function(e) {
            for (;;) switch (e.prev = e.next) {
              case 0:
                return wx.showLoading({
                    title: "正在连接...",
                    success: function(e) {
                        o = setTimeout(function() {
                            wx.hideLoading({
                                success: function(e) {
                                    wx.showToast({
                                        title: "连接超时",
                                        icon: "error"
                                    });
                                }
                            });
                        }, 3e3);
                    }
                }), c = t.currentTarget.dataset.device_id, i = t.currentTarget.dataset.device_name, 
                e.next = 5, a.createBLEConnectionSync(c, i);

              case 5:
                r = e.sent, console.log(s, "createBLEConnectionSync:", r), r && this.setData({
                    deviceName: a.data.chs.deviceName,
                    deviceId: a.data.chs.deviceId
                }), clearTimeout(o), wx.hideLoading({
                    success: function(e) {
                        wx.showToast({
                            title: r ? "连接成功" : "连接失败",
                            icon: r ? "success" : "error"
                        });
                    }
                });

              case 10:
              case "end":
                return e.stop();
            }
        }, e, this);
    })), function(t) {
        return e.apply(this, arguments);
    }),
    onLoad: function(e) {
        console.log(s, a.data.chs), this.setData({
            deviceName: a.data.chs.deviceName,
            deviceId: a.data.chs.deviceId
        });
        var t = this;
        a.sub(a.evn.startBluetoothDevicesDiscovery, function(e) {
            console.log(s, "开始扫描蓝牙设备"), t.setData({
                scaning: !0
            });
        }), a.sub(a.evn.stopBluetoothDevicesDiscovery, function(e) {
            console.log(s, "停止扫描蓝牙设备"), t.setData({
                scaning: !1
            });
        }), a.sub(a.evn.onBluetoothDeviceFound, function(e) {
            console.log(s, "发现设备", e), t.setData({
                deviceList: e.deviceList
            });
        }), this.scanBle(), c.globalData.admin ? (console.log(s, "管理员授权成功"), a.sub(a.evn.ReceivingBLEData, function(e) {
            console.log(s, "收到蓝牙数据：", e);
            var t = e.split(" ");
            if (t[0] == a.cmd.GET_UID) {
                var n = t[2], o = t[3], c = t[4], i = t[5];
                wx.cloud.callFunction({
                    name: "getToken",
                    data: {
                        uid: n,
                        mac: o,
                        dev_uid: c,
                        dev_ver: i
                    }
                }).then(function(e) {
                    if (console.log(s, e), 0 == e.result.err) {
                        var t = e.result.token;
                        a.sendBLECmdSync(a.cmd.SET_TOKEN, t, null), a.show("token已发送");
                    } else a.show("请求token失败");
                });
            } else t[0], a.cmd.TEST_TOKEN;
        })) : console.log(s, "管理员授权失败1");
    },
    getUid: function() {
        c.globalData.admin && a.sendBLECmdSync(a.cmd.GET_UID, "admin_wxapp");
    },
    hideBox: function() {
        this.setData({
            showBox: 0
        });
    },
    onReady: function() {},
    onShow: function() {},
    onHide: function() {},
    onUnload: function() {},
    onPullDownRefresh: function() {},
    onReachBottom: function() {},
    onShareAppMessage: function() {}
});