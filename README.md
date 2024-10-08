# EleksTube Web Tool

This web application provides a user-friendly interface to control and configure EleksTube IPS Clock devices using Web Bluetooth technology.

## Compatible Devices

This tool is compatible with the following EleksMaker brand EleksTube IPS clock models:

- EleksMaker EleksTube IPS Gen2
- EleksMaker EleksTube IPS PRO Gen2 
- EleksMaker EleksTube IPS PR1/2 Gen2

Note: This tool is currently not compatible with the EleksTube R model.

## Features

1. Bluetooth Connection: Scan and connect to EleksTube IPS Clock devices.
2. Wi-Fi Configuration: Set up Wi-Fi credentials for the connected device.
3. Time Synchronization: Sync the device time with your local time.
4. Timezone Synchronization: Set the device timezone to match your local timezone.

## Usage Instructions

1. Open https://elekstube.app in a Web Bluetooth compatible browser (e.g., Chrome, Edge).
2. Click "Scan Bluetooth Devices" to find and connect to your EleksTube IPS Clock.
3. Once connected, you can:
   - Configure Wi-Fi: Enter SSID and password, then click "Configure Wi-Fi".
   - Sync Time: Click "Sync Time" to update the device time to your local time.
   - Sync Timezone: Click "Sync Timezone" to set the device timezone to your local timezone.
4. Check the log window at the bottom of the page for operation status and device responses.

## Important Notes

1. Ensure your browser supports Web Bluetooth API.
2. Keep your device close to your computer during the connection process.
3. The web app is automatically deployed via Vercel when code is pushed to GitHub. It usually takes about 1 minute for changes to be reflected on https://elekstube.app.

## Current Status

As of the latest update, the following features are working correctly:
- Wi-Fi configuration
- Local time synchronization
- Local timezone synchronization

## Troubleshooting

- If you encounter connection issues, try refreshing the page or clicking the "Reset" button.
- Ensure your device's firmware is up to date.
- For persistent problems, check the browser console for error messages and report issues on our GitHub page.

## Contributing

We welcome contributions! Please feel free to submit pull requests or create issues for bugs and feature requests.
