# Sample of how to provide resol vbus - data as Homie structure in a mqtt server
This is an example of how to read data from your resol device and transform the data
to the Homie format.

## What you need to adjust
in ```index.ts``` you need to provide information about your mqtt-server and serial port 
```
export const mqttConfig: HomieMqttServerConfig = {
    brokerUrl: 'mqtt://myServer',
    username: 'myUsername',
    password: 'myPassword',
    homieBaseTopic: 'homie' // only change this if your home-automation software
                            // doesn't listen at the default base-topic
};

const path = '/dev/ttyUSB0';
```

in ```vbus-reader.ts``` you need to whitelist the fields you are interested in
```
const pumpSpeedRelay1 = 'Pump speed relay 1';
const temperatureSensor1 = 'Temperature sensor 1';
const temperatureSensor2 = 'Temperature sensor 2';
const temperatureSensor3 = 'Temperature sensor 3';
// most of the time we only need a few paketFields, so whitelist the desired ones
const whitelist = [
    pumpSpeedRelay1,
    temperatureSensor1,
    temperatureSensor2,
    temperatureSensor3
];
```
You also need to provide the Homie structure to which the vbus-data gets converted. 
You can find a sample in ```vbus-reader.ts#initHomieDevice```  
```
this.homieDevice = HomieDevice.create('vbus', 'Solar-Info', this.mqttConfig);
const kollektorNode = {
    homieInitialized: false,
    nodeId: 'kollektor',
    nodeName: 'Kollektor',
    properties: {
        temperatur: {
            type: 'float',
            value: undefined
        }
    }
} as DeviceNode;

this.homieDevice.addNodes(kollektorNode);
```
The last thing to do is to actually wire where the vbus information should be used:
```
this.vbusInfos$$
    .pipe(
        // Only emit info every 10seconds
        throttleTime(10000)
    )
    .subscribe(infos => {
        // use the vbus-value with name "Temperature sensor 1" for the property "temperatur" of the
        // kollektorNode 
        this.updateIfPresent(infos, temperatureSensor1, kollektorNode, 'temperatur');
    });
```

To get all available fields, take a look at ```logger.ts``` and change the log level to 'silly':
```
export const myLogger = winston.createLogger({
    level: 'silly', // <== change log level here
    format: combine(splat(), simple(), timestamp(), prettyJson),
    transports: [new winston.transports.Console({})],
});

```

## Start
Setup (only once)
Install node from https://nodejs.org/de/download/ 
(use a version with an even number, because these have long term support)

Open your preferred shell (cmd on Windows, bash, zsh) and run
```
npm install
```

To start (and automatically transpile typescript to javascript)
```
npx ts-node src/index.ts
```

## MQTT Homie structure
![MQTT Structure](https://github.com/BenniG82/vbus-to-homie/doc/homie-mqtt.png)

## Openhab example
Please note that you need setup MQTT in openhab first. After you set MQTT up go to the openhab "Inbox" first and 
add the device.

Unfortunately the Homie-Plugin for openhab has an annoying bug, and will most likely tell you 
"did not receive mandatory topic XXX" after you open the newly created thing.

To overcome this, just restart this application. And wait for the thing to get "green" :)
![Openhab](https://github.com/BenniG82/vbus-to-homie/doc/openhab-homie.png)
