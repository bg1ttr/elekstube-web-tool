const translations = {
    en: {
        title: "Nixie Clock Control Center",
        photoSettings: "Photo Settings",
        lightSettings: "Light Settings",
        customDial: "Custom Dial",
        weatherSettings: "Weather Settings",
        explore: "Explore",
        home: "Home",
        profile: "Profile",
        profileTitle: "My Device",
        currentDevice: "Current Device: EleksIPS-C47E5X",
        deviceVersion: "Device Version: 3.1",
        customization: "Corporate Gift Customization",
        wifiConnection: "WiFi Connection",
        bluetoothConnection: "Bluetooth Connection",
        precautions: "Precautions",
        syncTime: "Sync Time"
    },
    "zh-TW": {
        title: "擬輝光管控制中心",
        photoSettings: "相冊設置",
        lightSettings: "燈效設置",
        customDial: "自定表盤",
        weatherSettings: "天氣設置",
        explore: "探索",
        home: "首頁",
        profile: "我的",
        profileTitle: "我的設備",
        currentDevice: "當前設備：EleksIPS-C47E5X",
        deviceVersion: "設備版本：3.1",
        customization: "企業禮品定制",
        wifiConnection: "WiFi連接",
        bluetoothConnection: "藍牙連接",
        precautions: "注意事項",
        syncTime: "同步時間"
    },
    ja: {
        title: "ニキシー管制御センター",
        photoSettings: "写真設定",
        lightSettings: "ライト設定",
        customDial: "カスタムダイヤル",
        weatherSettings: "天気設定",
        explore: "探検",
        home: "ホーム",
        profile: "プロフィール",
        profileTitle: "私のデバイス",
        currentDevice: "現在のデバイス：EleksIPS-C47E5X",
        deviceVersion: "デバイスバージョン：3.1",
        customization: "企業ギフトカスタマイズ",
        wifiConnection: "WiFi接続",
        bluetoothConnection: "Bluetooth接続",
        precautions: "注意事項",
        syncTime: "時間を同期する"
    }
};

const i18nElements = document.querySelectorAll("[data-i18n]");

function setLanguage(language) {
    i18nElements.forEach(element => {
        const key = element.getAttribute("data-i18n");
        element.textContent = translations[language][key];
    });
}

document.getElementById("language-select").addEventListener("change", (event) => {
    setLanguage(event.target.value);
});

// 设置默认语言
setLanguage("en");