const RCCAR_SERVICE_UUID = "8922e970-329d-44cb-badb-10070ef94b1d";
// x, y, z: int16 * 3 = 6 byte: g * 1000
// Compatible with BBC micro:bit Accelerometer Characteristic
// https://lancaster-university.github.io/microbit-docs/resources/bluetooth/bluetooth_profile.html
const RCCAR_CHARACTERISTIC_UUID = "e625601e-9e55-4597-a598-76018a0d203d";
const RCDAY_CHARACTERISTIC_UUID = "b2a70845-b1d1-4420-b260-fa9551bfe361";

const deviceUUIDSet = new Set();
const connectedUUIDSet = new Set();
const connectingUUIDSet = new Set();

let logNumber = 1;

function onScreenLog(text) {
    const logbox = document.getElementById('logbox');
    logbox.value += '#' + logNumber + '> ';
    logbox.value += text;
    logbox.value += '\n';
    logbox.scrollTop = logbox.scrollHeight;
    logNumber++;
}

window.onload = () => {
    liff.init(async () => {
        onScreenLog('LIFF initialized');
        renderVersionField();

        await liff.initPlugins(['bluetooth']);
        onScreenLog('BLE plugin initialized');

        checkAvailablityAndDo(() => {
            onScreenLog('Finding devices...');
            findDevice();
        });
    }, e => {
        flashSDKError(e);
        onScreenLog(`ERROR on getAvailability: ${e}`);
    });
}

async function checkAvailablityAndDo(callbackIfAvailable) {
    const isAvailable = await liff.bluetooth.getAvailability().catch(e => {
        flashSDKError(e);
        onScreenLog(`ERROR on getAvailability: ${e}`);
        return false;
    });
    // onScreenLog("Check availablity: " + isAvailable);

    if (isAvailable) {
        document.getElementById('alert-liffble-notavailable').style.display = 'none';
        callbackIfAvailable();
    } else {
        document.getElementById('alert-liffble-notavailable').style.display = 'block';
        setTimeout(() => checkAvailablityAndDo(callbackIfAvailable), 1000);
    }
}

// Find LINE Things device using requestDevice()
async function findDevice() {
    const device = await liff.bluetooth.requestDevice().catch(e => {
        flashSDKError(e);
        onScreenLog(`ERROR on requestDevice: ${e}`);
        throw e;
    });
    // onScreenLog('detect: ' + device.id);

    try {
        if (!deviceUUIDSet.has(device.id)) {
            deviceUUIDSet.add(device.id);
            addDeviceToList(device);
        } else {
            // TODO: Maybe this is unofficial hack > device.rssi
            document.querySelector(`#${device.id} .rssi`).innerText = device.rssi;
        }

        checkAvailablityAndDo(() => setTimeout(findDevice, 100));
    } catch (e) {
        onScreenLog(`ERROR on findDevice: ${e}\n${e.stack}`);
    }
}

// Add device to found device list
function addDeviceToList(device) {
    onScreenLog('Device found: ' + device.name);

    const deviceList = document.getElementById('device-list');
    const deviceItem = document.getElementById('device-list-item').cloneNode(true);
    deviceItem.setAttribute('id', device.id);
    deviceItem.querySelector(".device-id").innerText = device.id;
    deviceItem.querySelector(".device-name").innerText = device.name;
    deviceItem.querySelector(".rssi").innerText = device.rssi;
    deviceItem.classList.add("d-flex");
    deviceItem.addEventListener('click', () => {
        deviceItem.classList.add("active");
        try {
            connectDevice(device);
        } catch (e) {
            onScreenLog('Initializing device failed. ' + e);
        }
    });
    deviceList.appendChild(deviceItem);
}

// Select target device and connect it
function connectDevice(device) {
    onScreenLog('Device selected: ' + device.name);

    if (!device) {
        onScreenLog('No devices found. You must request a device first.');
    } else if (connectingUUIDSet.has(device.id) || connectedUUIDSet.has(device.id)) {
        onScreenLog('Already connected to this device.');
    } else {
        connectingUUIDSet.add(device.id);
        initializeCardForDevice(device);

        // Wait until the requestDevice call finishes before setting up the disconnect listner
        const disconnectCallback = () => {
            updateConnectionStatus(device, 'disconnected');
            device.removeEventListener('gattserverdisconnected', disconnectCallback);
        };
        device.addEventListener('gattserverdisconnected', disconnectCallback);

        onScreenLog('Connecting ' + device.name);
        device.gatt.connect().then(() => {
            updateConnectionStatus(device, 'connected');
            connectingUUIDSet.delete(device.id);
        }).catch(e => {
            flashSDKError(e);
            onScreenLog(`ERROR on gatt.connect(${device.id}): ${e}`);
            updateConnectionStatus(device, 'error');
            connectingUUIDSet.delete(device.id);
        });
    }
}

// Setup device information card
function initializeCardForDevice(device) {
    const template = document.getElementById('device-template').cloneNode(true);
    const cardId = 'device-' + device.id;

    template.style.display = 'block';
    template.setAttribute('id', cardId);
    template.querySelector('.card > .card-header > .device-name').innerText = device.name;

    // Device disconnect button
    template.querySelector('.device-disconnect').addEventListener('click', () => {
        onScreenLog('Clicked disconnect button');
        device.gatt.disconnect();
    });

    const throttledUpdateCarState = (() => {
        const interval = 100;
        let lastTime = new Date().getTime() - interval

        return () => {
            if ((lastTime + interval) <= new Date().getTime()) {
                lastTime = new Date().getTime();
                updateCarState(device, 0).catch(e => onScreenLog(`ERROR on updateCarState(): ${e}\n${e.stack}`));
            }
        };
    })();
    template.querySelector('.range-direction').addEventListener('change', () => {
        updateCarState(device, 0).catch(e => onScreenLog(`ERROR on updateCarState(): ${e}\n${e.stack}`));
    });
    template.querySelector('.omake-submit').addEventListener('change', () => {
        updateDayState(device).catch(e => onScreenLog(`ERROR on updateDayState(): ${e}\n${e.stack}`));
    });
    template.querySelector('.range-speed').addEventListener('change', () => {
        updateCarState(device, 0).catch(e => onScreenLog(`ERROR on updateCarState(): ${e}\n${e.stack}`));
    });
    template.querySelector('.range-direction').addEventListener('input', throttledUpdateCarState);
    template.querySelector('.range-speed').addEventListener('input', throttledUpdateCarState);
    template.querySelector('.button-standby').addEventListener('click', () => {
        getDeviceDirectionInput(device).value = 0;
        getDeviceSpeedInput(device).value = 0;
//         getDeviceSpeedInput(device).value = 3;
        updateCarState(device, 0).catch(e => onScreenLog(`ERROR on updateCarState(): ${e}\n${e.stack}`));
    });
    template.querySelector('.button-brake').addEventListener('mousedown', () => {
        getDeviceDirectionInput(device).value = 0;
        getDeviceSpeedInput(device).value = 0;
//         getDeviceSpeedInput(device).value = -3;
        updateCarState(device, 1).catch(e => onScreenLog(`ERROR on updateCarState(): ${e}\n${e.stack}`));
    });

    // Remove existing same id card
    const oldCardElement = getDeviceCard(device);
    if (oldCardElement && oldCardElement.parentNode) {
        oldCardElement.parentNode.removeChild(oldCardElement);
    }

    document.getElementById('device-cards').appendChild(template);
    onScreenLog('Device card initialized: ' + device.name);
}

// Update Connection Status
function updateConnectionStatus(device, status) {
    if (status == 'connected') {
        onScreenLog('Connected to ' + device.name);
        connectedUUIDSet.add(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-primary btn-sm disabled');
        statusBtn.innerText = "Connected";
        getDeviceDisconnectButton(device).style.display = 'inline-block';
        getDeviceCardBody(device).style.display = 'block';
    } else if (status == 'disconnected') {
        onScreenLog('Disconnected from ' + device.name);
        connectedUUIDSet.delete(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-secondary btn-sm disabled');
        statusBtn.innerText = "Disconnected";
        getDeviceDisconnectButton(device).style.display = 'none';
        getDeviceCardBody(device).style.display = 'none';
        document.getElementById(device.id).classList.remove('active');
    } else {
        onScreenLog('Connection Status Unknown ' + status);
        connectedUUIDSet.delete(device.id);

        const statusBtn = getDeviceStatusButton(device);
        statusBtn.setAttribute('class', 'device-status btn btn-outline-danger btn-sm disabled');
        statusBtn.innerText = "Error";
        getDeviceDisconnectButton(device).style.display = 'none';
        getDeviceCardBody(device).style.display = 'none';
        document.getElementById(device.id).classList.remove('active');
    }
}

async function updateCarState(device, brake) {
    const rangeDirection = getDeviceDirectionInput(device);
    const rangeSpeed = getDeviceSpeedInput(device);
    rangeSpeed = 3;

    onScreenLog(`${rangeDirection.value} ${rangeSpeed.value} ${brake}`);
    onScreenLog('============');

    const characteristic = await getCharacteristic(
        device, RCCAR_SERVICE_UUID, RCCAR_CHARACTERISTIC_UUID);
    await writeCharacteristic(characteristic, [rangeSpeed.value, rangeDirection.value, brake]);
}

async function updateDayState(device){
  const day = 1;
  const characteristic = await getCharacteristic(
      device, RCCAR_SERVICE_UUID, RCDAY_CHARACTERISTIC_UUID);
  await writeCharacteristic(characteristic, [1,2,3]);
}

async function readCharacteristic(characteristic) {
    const response = await characteristic.readValue().catch(e => {
        onScreenLog(`Error reading ${characteristic.uuid}: ${e}`);
        throw e;
    });
    if (response) {
        onScreenLog(`Read ${characteristic.uuid}: ${buf2hex(response.buffer)}`);
        const values = new DataView(response.buffer);
        return values;
    } else {
        throw 'Read value is empty?';
    }
}

async function writeCharacteristic(characteristic, command) {
    await characteristic.writeValue(new Uint8Array(command)).catch(e => {
        onScreenLog(`Error writing ${characteristic.uuid}: ${e}`);
        throw e;
    });
    //onScreenLog(`Wrote ${characteristic.uuid}: ${command}`);
}

async function writeDateCharacteristic(characteristic, command) {
  // await characteristic.writeValue()
}

async function getCharacteristic(device, serviceId, characteristicId) {
    const service = await device.gatt.getPrimaryService(serviceId).catch(e => {
        flashSDKError(e);
        throw e;
    });
    const characteristic = await service.getCharacteristic(characteristicId).catch(e => {
        flashSDKError(e);
        throw e;
    });
    onScreenLog(`Got characteristic ${serviceId} ${characteristicId} ${device.id}`);
    return characteristic;
}

function getDeviceCard(device) {
    return document.getElementById('device-' + device.id);
}

function getDeviceCardBody(device) {
    return getDeviceCard(device).getElementsByClassName('card-body')[0];
}

function getDeviceStatusButton(device) {
    return getDeviceCard(device).getElementsByClassName('device-status')[0];
}

function getDeviceDisconnectButton(device) {
    return getDeviceCard(device).getElementsByClassName('device-disconnect')[0];
}

function getDeviceDirectionInput(device) {
    return getDeviceCard(device).getElementsByClassName('range-direction')[0];
}

function getDeviceSpeedInput(device) {
    return getDeviceCard(device).getElementsByClassName('range-speed')[0];
}

function getDeviceStandbyButton(device) {
    return getDeviceCard(device).getElementsByClassName('button-standby')[0];
}

function getDeviceBrakeButton(device) {
    return getDeviceCard(device).getElementsByClassName('button-brake')[0];
}

function renderVersionField() {
    const element = document.getElementById('sdkversionfield');
    const versionElement = document.createElement('p')
        .appendChild(document.createTextNode('SDK Ver: ' + liff._revision));
    element.appendChild(versionElement);
}

function flashSDKError(error){
    window.alert('SDK Error: ' + error.code);
    window.alert('Message: ' + error.message);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function buf2hex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}
